import numpy as np
from fastapi.logger import logger

import pandas as pd
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm
from typing import List, Dict, Any
import re
import asyncio

from app.service.krx_api import KrxApi
from app.schemas.stock import StockCmpData
from app.schemas.invest_idx import RatioRow

class InvestIdxService:
    krx_api = KrxApi()

    def __init__(self):
        pass

    def remove_outliers_iqr(self, data: List[float], factor: float = 1.5) -> List[float]:
        if len(data) == 0:
            return data
        
        data_array = np.array(data)
        Q1 = np.percentile(data_array, 25)
        Q3 = np.percentile(data_array, 75)
        IQR = Q3 - Q1
        
        lower_bound = Q1 - factor * IQR
        upper_bound = Q3 + factor * IQR
        
        filtered_data = [x for x in data_array if lower_bound <= x <= upper_bound]
        return filtered_data

    def collect_monthly_statistics(self, analysis_df: pd.DataFrame, metric: str) -> Dict[str, Dict[str, Any]]:
        metric_data = analysis_df[analysis_df['type'] == metric]
        date_cols = [col for col in metric_data.columns if col.isdigit() and len(col) == 8]
        
        monthly_stats = {
            'original': {},
            'cleaned': {}
        }
        
        for date in date_cols:
            month = date[:6]
            data = metric_data[date].dropna().tolist()
            
            if len(data) > 0:
                if month not in monthly_stats['original']:
                    monthly_stats['original'][month] = []
                monthly_stats['original'][month].extend(data)
                
                if month not in monthly_stats['cleaned']:
                    monthly_stats['cleaned'][month] = []
                clean_data = self.remove_outliers_iqr(data)
                monthly_stats['cleaned'][month].extend(clean_data)
        
        # 월별로 한 번 더 이상치 제거
        for month in monthly_stats['cleaned']:
            if len(monthly_stats['cleaned'][month]) > 0:
                monthly_stats['cleaned'][month] = self.remove_outliers_iqr(monthly_stats['cleaned'][month])
        
        return monthly_stats

    def analyze_investment_zones(self, analysis_df: pd.DataFrame, metric: str) -> Dict[str, Any]:
        metric_data = analysis_df[analysis_df['type'] == metric]
        date_cols = [col for col in metric_data.columns if col.isdigit() and len(col) == 8]
        
        all_data = []
        for date in date_cols:
            data = metric_data[date].dropna().tolist()
            if len(data) > 0:
                clean_data = self.remove_outliers_iqr(data)
                all_data.extend(clean_data)
        
        if len(all_data) > 0:
            data_array = np.array(all_data)
            Q1 = np.percentile(data_array, 25)
            Q3 = np.percentile(data_array, 75)
            IQR = Q3 - Q1
            
            return {
                'lower_bound': round(Q1 - 1.5 * IQR, 2),
                'q1': round(Q1, 2),
                'median': round(np.median(data_array), 2),
                'mean': round(np.mean(data_array), 2),
                'q3': round(Q3, 2),
                'upper_bound': round(Q3 + 1.5 * IQR, 2),
                'data_count': len(all_data)
            }
        
        return {
            'lower_bound': None,
            'q1': None,
            'median': None,
            'mean': None,
            'q3': None,
            'upper_bound': None,
            'data_count': 0
        }

    async def get_stock_range_info(self, start_date: str, end_date: str, max_workers: int = 5):
        start_date = datetime.strptime(start_date, "%Y%m%d")
        end_date = datetime.strptime(end_date, "%Y%m%d")
        
        date_list = []
        current_date = start_date

        while current_date <= end_date:
            date_list.append(current_date)
            current_date += timedelta(days=1)

        results = []
        batch_size = 50
        
        for i in range(0, len(date_list), batch_size):
            batch_dates = date_list[i:i + batch_size]
            
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(self._get_stock, date): date for date in batch_dates}
                
                for future in tqdm(as_completed(futures), total=len(futures), desc=f"데이터 수집 배치 {i//batch_size + 1}"):
                    result = future.result()
                    if result is not None:
                        results.append(result)
                    else:
                        logger.warning("데이터 수집 실패")
            
            # 배치 사이에 잠시 대기
            await asyncio.sleep(1)
        
        if not results:
            logger.error("수집된 데이터가 없습니다.")
            return pd.DataFrame()
            
        all_data = pd.DataFrame()
        for temp_data in results:
            if all_data.empty:
                all_data = temp_data
            else:
                logger.info(f"all_data columns: {all_data.columns.tolist()}")
                logger.info(f"temp_data columns: {temp_data.columns.tolist()}")
                # 빈 데이터프레임이 아닐 때만 merge 수행
                if not temp_data.empty and 'stockCode' in temp_data.columns:
                    all_data = pd.merge(all_data, temp_data, on=['stockCode', 'stockName'], how='outer')
        try:
            fileName = str(fileName.uuid4())
            all_data.to_csv(f"data/{fileName}.csv", index=False)
            return all_data, fileName
        except Exception as e:
            logger.error(f"데이터 저장 중 오류 발생: {str(e)}")
            return pd.DataFrame()

    def get_candidates_range_info(self, data: List[StockCmpData], stock_range_info: pd.DataFrame):
        
        candidates_data = pd.DataFrame([stock.model_dump() for stock in data])
        candidates_range_info = pd.merge(candidates_data, stock_range_info, on=['stockCode', 'stockName'], how='inner')
        
        return candidates_range_info

    def create_company_analysis_dataframe(self, data, financial_statements, max_workers:int=5):
        try:
            logger.info(f"데이터 입력 - 기업 수: {len(data)}, 재무제표 수: {len(financial_statements)}")
            
            financial_dict = self.filter_zero_accounts(financial_statements)
            logger.info(f"재무제표 필터링 후 기업 수: {len(financial_dict)}")
            
            all_analysis_rows = []
            
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = []
                for idx, row in data.iterrows():
                    future = executor.submit(self._process_company_analysis, row, financial_dict)
                    futures.append(future)
                
                for future in tqdm(futures, desc="기업별 분석 데이터 생성"):
                    company_rows = future.result()
                    if not company_rows:  # 빈 결과 체크
                        logger.warning(f"기업 분석 결과 없음: {row.get('stockName', 'Unknown')}")
                    all_analysis_rows.extend(company_rows)
            
            logger.info(f"전체 분석 행 수: {len(all_analysis_rows)}")
            
            analysis_df = pd.DataFrame(all_analysis_rows)
            
            if not analysis_df.empty:
                date_cols = [col for col in analysis_df.columns if re.match(r'^202\d{5}$', str(col))]
                date_cols.sort()
                
                column_order = ['corp_name', 'type'] + date_cols
                analysis_df = analysis_df[column_order]
                logger.info(f"최종 데이터프레임 크기: {analysis_df.shape}")
            else:
                logger.warning("최종 데이터프레임이 비어있습니다.")
            
            return analysis_df
        except Exception as e:
            logger.error(f"데이터프레임 생성 중 오류 발생: {str(e)}")
            return pd.DataFrame()

    def analysis_invest_idx(self, data: List[RatioRow]) -> Dict[str, Any]:
        analysis_df = pd.DataFrame([row.model_dump() for row in data])
        
        metrics = ['PER', 'PBR', 'ROE', 'ROA', '영업이익률', '부채비율']
        
        result = {
            'metrics': metrics,
            'monthly_stats': {},
            'investment_zones': {}
        }
        
        for metric in metrics:
            result['monthly_stats'][metric] = self.collect_monthly_statistics(analysis_df, metric)
            result['investment_zones'][metric] = self.analyze_investment_zones(analysis_df, metric)
        
        return result

    def get_stock_file(self, start_date: str):
        fileName = f"stock_data_{start_date[:4]}.csv"
        return pd.read_csv(f"data/{fileName}")

    def _get_account_value_by_name(self, financial_data, account_name, quarter_column):    
        account_data = next((item for item in financial_data if item['subject'] == account_name), None)
        if account_data and 'quarters' in account_data:
            return account_data['quarters'].get(quarter_column, 0)
        return 0

    def _select_quarter_column(self, financial_data, date):
        date_int = int(date)
        
        report_date = next((item for item in financial_data if item['subject'] == 'report_date'), None)
        if not report_date:
            sample_data = financial_data[0] if financial_data else None
            if sample_data and 'quarters' in sample_data:
                quarters = list(sample_data['quarters'].keys())
                return quarters[-1] if quarters else None
            return None
        
        quarters = list(report_date['quarters'].keys()) if report_date.get('quarters') else []
        if not quarters:
            return None
        
        for quarter in reversed(quarters):
            try:
                disclosure_date = int(report_date['quarters'][quarter])
                if date_int >= disclosure_date:
                    return quarter
            except:
                continue

        return quarters[0] if quarters else None

    def _calculate_ratios(self, financial_data, quarter, shares_outstanding, stock_price):
        if not quarter:
            return {key: None for key in ['PER', 'PBR', 'ROE', 'ROA', '영업이익률', '부채비율']}
        
        annualization_factors = {
            '1Q': 4, '2Q': 4, '3Q': 4, '4Q': 1
        }
        factor = annualization_factors.get(quarter[-2:], 1)
        
        try:
            net_income_raw = self._get_account_value_by_name(financial_data, '당기순이익', quarter)
            total_assets = self._get_account_value_by_name(financial_data, '자산총계', quarter)
            total_equity = self._get_account_value_by_name(financial_data, '자본총계', quarter)
            total_debt = self._get_account_value_by_name(financial_data, '부채총계', quarter)
            revenue_raw = self._get_account_value_by_name(financial_data, '매출액', quarter)
            operating_income_raw = self._get_account_value_by_name(financial_data, '영업이익', quarter)
            
            logger.info(f"net_income_raw: {net_income_raw}, factor: {factor}")
            
            net_income = net_income_raw * factor
            revenue = revenue_raw * factor
            operating_income = operating_income_raw * factor
            
            eps = net_income / shares_outstanding if shares_outstanding > 0 else 0
            bps = total_equity / shares_outstanding if shares_outstanding > 0 else 0
            
            ratios = {
                'PER': stock_price / eps if eps > 0 else None,
                'PBR': stock_price / bps if bps > 0 else None,
                'ROE': (net_income / total_equity * 100) if total_equity > 0 else None,
                'ROA': (net_income / total_assets * 100) if total_assets > 0 else None,
                '영업이익률': (operating_income_raw / revenue_raw * 100) if revenue_raw > 0 else None,
                '부채비율': (total_debt / total_equity * 100) if total_equity > 0 else None
            }
            
            return ratios
            
        except Exception as e:
            print(f"비율 계산 오류: {e}")
            return {key: None for key in ['PER', 'PBR', 'ROE', 'ROA', '영업이익률', '부채비율']}

    def _process_company_analysis(self, row_data, financial_dict):
        try:
            stock_name = row_data['stockName']
            shares_outstanding = row_data['start_listedShares']
            
            financial_data = financial_dict.get(stock_name)
            if financial_data is None:
                return []
                
            date_columns = [col for col in row_data.index if re.match(r'^202\d{5}$', str(col))]
            
            analysis_rows = []
            
            # 종가 데이터 추가
            stock_price_row = {'corp_name': stock_name, 'type': 'closingPrice'}
            for date_col in date_columns:
                stock_price = row_data[date_col]
                stock_price_row[date_col] = stock_price if pd.notna(stock_price) else None
            analysis_rows.append(stock_price_row)
            
            ratio_names = ['PER', 'PBR', 'ROE', 'ROA', 'operating_margin', 'debt_ratio']
            ratio_display = {'operating_margin': '영업이익률', 'debt_ratio': '부채비율'}
            

            daily_ratios = {}
            for date_col in date_columns:
                stock_price = row_data[date_col]
                if pd.notna(stock_price) and stock_price > 0:
                    quarter = self._select_quarter_column(financial_data, date_col)
                    if quarter:
                        ratios = self._calculate_ratios(financial_data, quarter, shares_outstanding, stock_price)
                        daily_ratios[date_col] = ratios
            
            for ratio_name in ratio_names:
                display_name = ratio_display.get(ratio_name, ratio_name)
                ratio_row = {'corp_name': stock_name, 'type': display_name}
                for date_col in date_columns:
                    if date_col in daily_ratios:
                        ratio_row[date_col] = daily_ratios[date_col].get(display_name)
                    else:
                        ratio_row[date_col] = None
                analysis_rows.append(ratio_row)
            
            return analysis_rows
            
        except Exception as e:
            print(f"기업 {row_data.get('stockName', 'Unknown')} 처리 오류: {str(e)}")
            return []

    def _get_stock(self, date: datetime):
        basDd = date.strftime("%Y%m%d")
        stock_list = self.krx_api.get_stock_list(basDd)
        if stock_list is not None:
            temp = stock_list.filter(items=['stockCode', 'stockName', 'closingPrice'])
            temp = temp.rename(columns={'closingPrice': basDd})
            return temp
        logger.warning(f"{basDd} 데이터 수집 실패")
        return None

    def filter_zero_accounts(self, financial_statements):
        filtered_dict = {}
        
        accounts_to_check = ['당기순이익', '자산총계', '자본총계', '부채총계', '매출액', '영업이익']
        
        for statement in financial_statements:
            try:
                corp_name = statement['corp_name']
                data = statement['data']
                
                if not data:
                    continue
                
                has_zero = False
                for account in accounts_to_check:
                    account_data = next((item for item in data if item['subject'] == account), None)
                    if not account_data:
                        has_zero = True
                        break
                    
                    quarters_data = account_data.get('quarters', {})
                    if not quarters_data or all(value == 0 for value in quarters_data.values()):
                        has_zero = True
                        break
                
                if not has_zero:
                    filtered_dict[corp_name] = data
                    
            except Exception as e:
                continue
        
        return filtered_dict