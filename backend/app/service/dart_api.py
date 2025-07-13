from fastapi import HTTPException
import logging
import requests
import zipfile
import io
import xml.etree.ElementTree as ET
import pandas as pd
from typing import List
from datetime import datetime
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm
import time

from app.core.config import settings
from app.schemas.financial import QuarterCode
from app.schemas.stock import StockCmpData

# 로거 설정
logger = logging.getLogger(__name__)

class DartApi:
  _instance = None
  
  def __new__(cls):
    if cls._instance is None:
      cls._instance = super().__new__(cls)
      cls._instance.base_url = settings.DART_API_URL
      cls._instance.params = {
        "crtfc_key": settings.DART_API_KEY
      }
      cls._instance.corp_code = None
    return cls._instance

  def __init__(self):
    pass

  def filter_by_cnt(self, data :List[StockCmpData], analysis_cnt :int):
     try:
         if not data:
             logger.warning("입력 데이터가 비어있습니다.")
             return pd.DataFrame()
         
         selected_data = pd.DataFrame([stock.model_dump() for stock in data])
         
         selected_data['score'] = selected_data['annual_return']
         
         if selected_data['score'].isnull().any():
             logger.warning("일부 데이터의 annual_return이 누락되어 있습니다. 누락된 데이터는 제외됩니다.")
             selected_data = selected_data.dropna(subset=['score'])
         
         if len(selected_data) == 0:
             logger.warning("유효한 annual_return 데이터가 없습니다.")
             return pd.DataFrame()
         
         num_bins = max(3, min(analysis_cnt // 2, 10))
         
         try:
             selected_data['bin'] = pd.qcut(selected_data['score'], q=num_bins, labels=False)
         except ValueError as e:
             logger.warning(f"구간 분할 중 오류 발생: {str(e)}. 전체 데이터에서 무작위 샘플링을 수행합니다.")
             return selected_data.sample(n=min(analysis_cnt, len(selected_data)), random_state=42)
         
         samples_per_bin = analysis_cnt // num_bins
         remaining_samples = analysis_cnt % num_bins
         
         sampled_data = []
         for bin_idx in range(num_bins):
             bin_data = selected_data[selected_data['bin'] == bin_idx]
             n_samples = samples_per_bin + (remaining_samples if bin_idx == num_bins-1 else 0)
             if len(bin_data) > 0:
                 try:
                     bin_samples = bin_data.sample(n=min(n_samples, len(bin_data)), random_state=42+bin_idx)
                     sampled_data.append(bin_samples)
                 except ValueError as e:
                     logger.warning(f"구간 {bin_idx} 샘플링 중 오류 발생: {str(e)}")
                     continue
         
         if sampled_data:
             final_data = pd.concat(sampled_data)
             final_data = final_data.drop(['bin', 'score'], axis=1)
             return final_data
         else:
             logger.warning("샘플링된 데이터가 없습니다.")
             return pd.DataFrame()
             
     except Exception as e:
         logger.error(f"데이터 샘플링 중 예상치 못한 오류 발생: {str(e)}")
         raise HTTPException(status_code=500, detail="데이터 샘플링 중 오류가 발생했습니다.")

  def get_corp_statement(self, data :pd.DataFrame, start_date :str, end_date :str):
    selected_data = pd.merge(data, self._get_corp_code(), left_on='stockCode', right_on='stock_code', how='left')
    
    quarters = [QuarterCode.Q1, QuarterCode.Q2, QuarterCode.Q3, QuarterCode.Q4]
    start_year, start_quarter = self._find_last_quarter(start_date)
    end_year, end_quarter = self._find_last_quarter(end_date)
    
    logger.info(f"재무제표 조회 시작 - 시작일: {start_date}({start_year}년 {start_quarter}분기), 종료일: {end_date}({end_year}년 {end_quarter}분기)")
    
    quarter_info = []
    current_year = start_year
    current_quarter = start_quarter
    
    while True:
        if current_quarter == QuarterCode.Q1:
            report_code = "11013"
        elif current_quarter == QuarterCode.Q2:
            report_code = "11012"
        elif current_quarter == QuarterCode.Q3:
            report_code = "11014"
        else:  # Q4
            report_code = "11011"
        
        quarter_info.append({
            'year': current_year,
            'quarter': current_quarter,
            'report_code': report_code,
            'period': f"{current_year}_{report_code}"
        })
        
        if current_year == end_year and current_quarter == end_quarter:
            break
            
        quarter_idx = quarters.index(current_quarter)
        if quarter_idx == len(quarters) - 1:  
            current_quarter = quarters[0]  
            current_year += 1 
        else:
            current_quarter = quarters[quarter_idx + 1]
    
    logger.info(f"조회할 분기 정보: {quarter_info}")
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [
            executor.submit(
                self._background_task, 
                row['corp_code'], 
                row['corp_name'], 
                quarter_info
            ) 
            for _, row in selected_data.iterrows()
        ]
        
        results = []
        for future in tqdm(as_completed(futures), total=len(futures), desc="Processing"):
            results.append(future.result())

    statement_results = []
    for corp_name, df in results:
        if corp_name is None or df is None:
            continue
        if df is not None and not df.empty:
            logger.info(f"{corp_name} 데이터 처리 시작")
            
            financial_data_list = []
            
            quarter_values = {info['period']: [] for info in quarter_info}
            
            for _, row in df.iterrows():
                for info in quarter_info:
                    period = info['period']
                    if period in row.index:
                        value = row[period]
                        if pd.notna(value) and value != 'N/A':
                            try:
                                value = float(value)
                                if value != 0:  
                                    quarter_values[period].append(value)
                            except (ValueError, TypeError):
                                continue
            
            valid_quarters = {period: True for period, values in quarter_values.items() if values}
            
            for _, row in df.iterrows():
                try:
                    quarters = {}
                    for info in quarter_info:
                        period = info['period']
                        if period in valid_quarters:
                            if period in row.index:
                                value = row[period]
                                quarters[period] = None if pd.isna(value) or value == 'N/A' else float(value)
                    
                    if quarters: 
                        find_value = row.get("find")
                        if isinstance(find_value, bool):
                            find_value = "O" if find_value else "X"
                        elif find_value not in ["O", "X"]:
                            find_value = "O" 
                        
                        financial_data = {
                            "category": row["category"],
                            "subject": row["subject"],
                            "find": find_value,
                            "quarters": quarters
                        }
                        financial_data_list.append(financial_data)
                except Exception as e:
                    logger.error(f"데이터 처리 중 오류 발생: {str(e)}")
                    logger.error(f"문제가 발생한 데이터: {row.to_dict()}")
                    continue
            
            if financial_data_list:
                statement_results.append({
                    "corp_name": corp_name,
                    "data": financial_data_list
                })
                logger.info(f"{corp_name}: {len(financial_data_list)}개 항목 처리 완료")
            else:
                logger.warning(f"{corp_name}: 처리된 데이터가 없습니다")
    
    if not statement_results:
        logger.error("모든 기업의 공시 정보가 없습니다")
        raise HTTPException(status_code=404, detail="공시된 정보가 없습니다")
        
    logger.info(f"최종 처리된 회사 수: {len(statement_results)}")
    return statement_results

  def _get_corp_code(self):
    try:
      if self.corp_code is not None:
        return self.corp_code

      url = f"{self.base_url}/corpCode.xml"
      response = requests.get(url, params=self.params)
      
      if response.status_code != 200:
        logger.error(f"DART API 호출 실패: status_code={response.status_code}")
        raise HTTPException(status_code=response.status_code, detail="DART API 호출에 실패했습니다.")
      
      try:
        with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
          xml_data = zf.read('CORPCODE.xml')
      except zipfile.BadZipFile:
        logger.error("ZIP 파일 처리 실패")
        raise HTTPException(status_code=500, detail="회사 코드 데이터 압축 해제에 실패했습니다.")
      
      try:
        root = ET.fromstring(xml_data)
      except ET.ParseError:
        logger.error("XML 파싱 실패")
        raise HTTPException(status_code=500, detail="회사 코드 XML 데이터 파싱에 실패했습니다.")
      
      data = []
      for company in root.findall('list'):
          stock_code = company.findtext('stock_code')
          corp_name = company.findtext('corp_name')
          if stock_code and stock_code.strip() and corp_name and corp_name.strip():
              data.append({
                  'corp_code': company.findtext('corp_code'),
                  'corp_name': corp_name,
                  'stock_code': stock_code,
              })

      if not data:
        logger.warning("회사 코드 데이터가 비어있습니다.")
        raise HTTPException(status_code=500, detail="회사 코드 데이터를 찾을 수 없습니다.")

      self.corp_code = pd.DataFrame(data)
      return self.corp_code
      
    except requests.RequestException as e:
      logger.error(f"네트워크 오류: {str(e)}")
      raise HTTPException(status_code=500, detail="DART API 서버 연결에 실패했습니다.")
    except Exception as e:
      logger.error(f"예상치 못한 오류 발생: {str(e)}")
      raise HTTPException(status_code=500, detail="회사 코드 처리 중 오류가 발생했습니다.")
    
  def _get_corp_financial(self, corp_code :str, quarter_info :list):
    quarter_data = {}
    for info in quarter_info:
      logger.info(f"분기 데이터 조회 시작 - 기업: {corp_code}, 연도: {info['year']}, 분기: {info['quarter']}, 보고서코드: {info['report_code']}")
      response = self._api_call(corp_code, str(info['year']), info['report_code'])
      
      if response.status_code == 200:
        data, disclosure_date = self._get_one_quarter(response)
        quarter_data[info['period']] = {
          "data": data,
          "disclosure_date": disclosure_date if disclosure_date else 'N/A'
        }
        logger.info(f"분기 데이터 조회 성공 - 기간: {info['period']}, 공시일자: {disclosure_date}")
      else:
        logger.warning(f"분기 데이터 조회 실패 - {info['period']}: status_code={response.status_code}")
        quarter_data[info['period']] = {
          "data": {},
          "disclosure_date": 'N/A'
        }
    
    results = []
    
    disclosure_row = {
      'category': 'report_info',
      'subject': 'report_date',
      'find': 'O'
    }
    for info in quarter_info:
      disclosure_row[info['period']] = quarter_data[info['period']]["disclosure_date"]
    results.append(disclosure_row)
    
    account_list = {
      'CIS': ['매출액', '매출총이익', '매출원가', '영업이익', '당기순이익', '금융원가', '금융수익'],
      'BS_자산': ['자산총계', '유동자산', '현금및현금성자산'],
      'BS_부채': ['부채총계', '유동부채'],
      'BS_자본': ['자본총계', '자본금']
    }
    
    for category, accounts in account_list.items():
      for account in accounts:
        key = f"{category}_{account}"
        row = {
          'category': category,
          'subject': account
        }
        for info in quarter_info:
          row[info['period']] = quarter_data[info['period']]["data"].get(key, 0)
        
        first_quarter = quarter_info[0]['period']
        row['find'] = 'O' if quarter_data[first_quarter]["data"].get(key, 0) != 0 else 'X'
        results.append(row)
      
      result_df = pd.DataFrame(results)
    
    logger.info(f"재무제표 데이터 처리 완료 - 결과 행 수: {len(result_df)}")
    return result_df

  def _api_call(self, corp_code :str, bsns_year :str, reprt_code :str):
    url = f"{self.base_url}/fnlttSinglAcntAll.json"
    params = {
      "crtfc_key": self.params["crtfc_key"],
      "corp_code": corp_code,
      "bsns_year": bsns_year,
      "reprt_code": reprt_code,
      "fs_div": "OFS"
    }
    try:
      # logger.info(f"DART API 호출 시작 - URL: {url}, Parameters: {params}")
      response = requests.get(url, params=params)
      # logger.info(f"DART API 응답 - Status: {response.status_code}, Response: {response.text[:1000]}")  # 응답이 너무 길 수 있으므로 앞부분만 로깅
      return response
    except requests.RequestException as e:
      logger.error(f"네트워크 오류: {str(e)}")
      raise HTTPException(status_code=500, detail="DART API 서버 연결에 실패했습니다.")
    except Exception as e:
      logger.error(f"예상치 못한 오류 발생: {str(e)}")
      raise HTTPException(status_code=500, detail="코드 처리 중 오류가 발생했습니다.")

  def _find_account_by_keywords(self, df :pd.DataFrame, keyword_list :list[str]):
    for keyword in keyword_list:
      found = df[df['account_nm'] == keyword]
      if not found.empty:
        return found.iloc[0]
    return None

  def _get_one_quarter(self, response :requests.Response):
    try:
      try:
        data = response.json()
      except ValueError as e:
        logger.error(f"JSON 파싱 실패: {str(e)}")
        raise HTTPException(status_code=500, detail="재무제표 데이터 형식이 올바르지 않습니다.")

      if 'status' in data and data['status'] != '000':
        logger.warning(f"DART API 응답: {data.get('message', '')}")
        return {}, None 
      
      if 'list' not in data or not data['list']:
        logger.warning("재무제표 데이터가 비어있습니다.")
        return {}, None

      df = pd.DataFrame(data['list'])

      try:
        disclosure_date = df.iloc[0]['rcept_no'][:8] if not df.empty else None
        if not disclosure_date:
          logger.warning("공시일자 정보가 없습니다.")
      except (KeyError, IndexError) as e:
        logger.error(f"공시일자 추출 실패: {str(e)}")
        disclosure_date = None
    
      account_keywords = {
          'CIS': {
            '매출액': ['매출액', '수익(매출액)', 'I. 영업수익','영업수익','수익 합계','Ⅰ. 매출액'],
            '매출총이익': ['매출총이익', 'III. 영업이익(손실)','Ⅲ. 매출총이익(손실)'],  # 영업수익-영업비용
            '매출원가': ['매출원가', 'Ⅱ. 영업비용'],
            '영업이익': ['영업이익(손실)', '영업이익', 'III. 영업이익(손실)','Ⅳ. 영업이익(손실)','영업손익'],
            '당기순이익': ['당기순이익(손실)', 'VIII. 분기순이익(손실)',
                      'VIII. 당기순이익(손실)','당기순이익',
                      '분기순이익','반기순이익','분기순이익(손실)','반기순이익(손실)','연결분기순이익','연결반기순이익','연결당기순이익',
                      '1. 당기순이익(손실)','당기연결순손익', '반기순손익','연결반기순이익(손실)','연결분기순이익(손실)','연결분기순이익'],
            '금융원가': ['금융원가', '금융비용', '이자비용'],
            '금융수익': ['금융수익', '금융수입', '이자수익']
        },
          'BS_자산': {
              '자산총계': ['자산총계','기말자산','자산'],
              '유동자산': ['유동자산'],
              '현금및현금성자산': ['현금및현금성자산', '현금성자산']
          },
          'BS_부채': {
              '부채총계': ['부채총계','기말부채','부채'],
              '유동부채': ['유동부채']
          },
          'BS_자본': {
              '자본총계': ['자본총계','기말자본','자본'],
              '자본금': ['자본금']
          }
      }
    
      quarter_data = {}
      
      critical_accounts = []
    
      for category, account_dict in account_keywords.items():
          for account_key, keyword_list in account_dict.items():
              try:
                  item = self._find_account_by_keywords(df, keyword_list)
                  if item is not None:
                      key = f"{category}_{account_key}"
                      amount = item['thstrm_amount']
                      if pd.notna(amount) and amount != '':
                          try:
                              value = int(amount)
                              quarter_data[key] = value
                              # 주요 계정과목인 경우 값을 저장
                              if account_key in ['매출액', '당기순이익', '자산총계', '자본총계']:
                                  critical_accounts.append(value)
                          except ValueError:
                              logger.warning(f"금액 변환 실패 - {key}: {amount}")
                              quarter_data[key] = 0
                      else:
                          quarter_data[key] = 0
                  else:
                      key = f"{category}_{account_key}"
                      quarter_data[key] = 0
              except Exception as e:
                  logger.error(f"계정 처리 중 오류 발생 - {category}_{account_key}: {str(e)}")
                  quarter_data[f"{category}_{account_key}"] = 0
      
      if all(value == 0 for value in critical_accounts):
          logger.warning("모든 주요 계정과목이 0입니다. 해당 분기 데이터를 제외합니다.")
          return {}, None
    
      return quarter_data, disclosure_date

    except Exception as e:
      logger.error(f"재무제표 데이터 처리 중 오류 발생: {str(e)}")
      raise HTTPException(status_code=500, detail="재무제표 데이터 처리 중 오류가 발생했습니다.")

  def _find_last_quarter(self, input_date: str):
    date = datetime.strptime(input_date, "%Y%m%d")
    
    month = date.month
    year = date.year
    
    if month in [1, 2, 3]: 
        quarter = QuarterCode.Q4
        year -= 1
    elif month in [4, 5, 6]:  
        quarter = QuarterCode.Q1
    elif month in [7, 8, 9]:  
        quarter = QuarterCode.Q2
    else: 
        quarter = QuarterCode.Q3
    
    return year, quarter
    
  def _create_session_with_retry():
      session = requests.Session()
      retry_strategy = Retry(
          total=3,  
          backoff_factor=1,  
          status_forcelist=[429, 500, 502, 503, 504], 
      )
      adapter = HTTPAdapter(max_retries=retry_strategy)
      session.mount("http://", adapter)
      session.mount("https://", adapter)
      return session
  
  def _background_task(self, corp_code, corp_name, quarter_info, max_retries=3):
    if pd.isna(corp_name) or corp_name == 'nan':
        logger.warning(f"유효하지 않은 회사명이 입력되었습니다: {corp_name}")
        return None, None

    for attempt in range(max_retries):
        try:
            # time.sleep(0.2)  # 요청 간 대기시간 증가
            data = self._get_corp_financial(corp_code, quarter_info)
            return corp_name, data
        except (requests.exceptions.ConnectionError, 
                requests.exceptions.Timeout,
                Exception) as e:
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 0.5  # 지수 백오프
                print(f"재시도 {attempt + 1}/{max_retries} for {corp_name}, 대기: {wait_time}초")
                time.sleep(wait_time)
            else:
                print(f"최종 실패: {corp_name} - {str(e)}")
                return None, None