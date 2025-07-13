from app.core.config import settings
import requests
from fastapi.logger import logger
import pandas as pd
from requests.exceptions import RequestException
from datetime import datetime, timedelta

class KrxApi:
    def __init__(self):
        self.base_url = settings.KRX_API_URL
        self.headers = {
            "AUTH_KEY": settings.KRX_API_KEY
        }

    def get_next_business_day_data(self, start_date: str, max_attempts: int = 10):
        current_date = datetime.strptime(start_date, "%Y%m%d")
        today = datetime.now()
        
        # 미래 날짜 체크
        if current_date.date() > today.date():
            logger.error(f"미래 날짜({start_date})는 조회할 수 없습니다.")
            raise ValueError(f"미래 날짜({start_date})는 조회할 수 없습니다.")
            
        attempts = 0
        
        while attempts < max_attempts:
            # 미래 날짜 도달 시 중단
            if current_date.date() > today.date():
                logger.error("다음 영업일 검색 중 미래 날짜에 도달했습니다.")
                raise ValueError("다음 영업일 검색 중 미래 날짜에 도달했습니다.")
                
            date_str = current_date.strftime("%Y%m%d")
            stock_data = self.get_stock_list(date_str)
            
            if stock_data is not None and not stock_data.empty:
                logger.info(f"{date_str} 데이터 조회 성공")
                return stock_data, date_str
                
            current_date += timedelta(days=1)
            attempts += 1
            if stock_data is None:
                logger.error(f"{date_str} API 호출 실패")
            else:
                logger.info(f"{date_str}은 휴장일이어서 다음 날짜 {current_date.strftime('%Y%m%d')}로 시도합니다.")
        
        logger.error(f"{max_attempts}회 시도 후에도 유효한 거래일을 찾지 못했습니다.")
        return None, start_date

    def get_stock_list_with_next_day(self, startDd: str):
        stock_data, actual_start_date = self.get_next_business_day_data(startDd)
        if stock_data is None:
            raise ValueError(f"시작일({startDd}) 데이터 조회 실패")
        
        return stock_data

    def get_stock_list(self, basDd: str):
        kospi_list = self.get_kospi_list(basDd)
        kosdaq_list = self.get_kosdaq_list(basDd)
        
        if kospi_list is None and kosdaq_list is None:
            logger.error("KOSPI와 KOSDAQ 모두 데이터 조회 실패")
            return None
            
        if kospi_list is None:
            kospi_list = pd.DataFrame()
        if kosdaq_list is None:
            kosdaq_list = pd.DataFrame()
            
        if kospi_list.empty and kosdaq_list.empty:
            logger.info(f"{basDd} 은 휴장일입니다.")
            return pd.DataFrame()
            
        return pd.concat([kospi_list, kosdaq_list], ignore_index=True)

    def get_kospi_list(self, basDd: str):   
        url = f"{self.base_url}/stk_bydd_trd"
        params = {
            "basDd": basDd
        }
        try:
            response = requests.get(url, params=params, headers=self.headers)
            if response.status_code == 200:
                data = response.json()
                parsed_data = self._parse_stock_data(data)
                return parsed_data
            else:
                logger.error(f"KOSPI API 호출 실패: {response.status_code}")
                return None
        except RequestException as e:
            logger.error(f"KOSPI API 연결 실패: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"KOSPI API 처리 중 예상치 못한 오류 발생: {str(e)}")
            return None
    
    def get_kosdaq_list(self, basDd: str):   
        url = f"{self.base_url}/ksq_bydd_trd"
        params = {
            "basDd": basDd
        }
        try:
            response = requests.get(url, params=params, headers=self.headers)
            if response.status_code == 200:
                data = response.json()
                parsed_data = self._parse_stock_data(data)
                return parsed_data
            else:
                logger.error(f"KOSDAQ API 호출 실패: {response.status_code}")
                return None
        except RequestException as e:
            logger.error(f"KOSDAQ API 연결 실패: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"KOSDAQ API 처리 중 예상치 못한 오류 발생: {str(e)}")
            return None
    
    def _parse_stock_data(self, data):
        if 'OutBlock_1' in data:
            if not data['OutBlock_1']:
                logger.info("휴장일 데이터입니다.")
                return pd.DataFrame()  

            krx_stock_info = pd.DataFrame(data['OutBlock_1'])

            column_map = {
                'BAS_DD': 'baseDate',
                'ISU_CD': 'stockCode',
                'ISU_NM': 'stockName',
                'MKT_NM': 'marketType',
                'SECT_TP_NM': 'sectorType',
                'TDD_CLSPRC': 'closingPrice',
                'CMPPREVDD_PRC': 'priceChange',
                'FLUC_RT': 'fluctuationRate',
                'TDD_OPNPRC': 'openingPrice',
                'TDD_HGPRC': 'highPrice',
                'TDD_LWPRC': 'lowPrice',
                'ACC_TRDVOL': 'tradingVolume',
                'ACC_TRDVAL': 'tradingValue',
                'MKTCAP': 'marketCap',
                'LIST_SHRS': 'listedShares'
            }

            krx_stock_info = krx_stock_info.rename(columns=column_map)

            numeric_columns = [
                'closingPrice', 'priceChange', 'fluctuationRate', 
                'openingPrice', 'highPrice', 'lowPrice', 
                'tradingVolume', 'tradingValue', 'marketCap', 'listedShares'
            ]
            
            for col in numeric_columns:
                if col in krx_stock_info.columns:
                    krx_stock_info[col] = pd.to_numeric(krx_stock_info[col].str.replace(',', ''), errors='coerce')
            
            return krx_stock_info
        else:
            logger.error(f"API 응답에 'OutBlock_1'이 없습니다: {data}")
            return None