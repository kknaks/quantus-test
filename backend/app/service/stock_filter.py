import pandas as pd
import re
from typing import List
from app.schemas.stock import StockData
from app.schemas.stock import VolumeFilterType, StrategyType, CandidatesType
import numpy as np

class StockFilterService:
    # ETF 관련 키워드
    FILTER_ETF = [
        "TIGER", "KODEX", "HANARO", "ARIRANG", 
        "KBSTAR", "KOSEF", "SOL", "BNK", 
        "PLUS", "WON", "FOCUS", "KIWOOM", "ACE",
        "KoAct", "액티브", "S&P", "TREX", "ITF", "나스닥",
        "밸류업", "(H)", "마이티", "코스피"
    ]

    # 인버스/레버리지 관련 키워드
    FILTER_INVERSE_LEVERAGE = [
        "인버스", "레버리지", "선물", "ETN", "RISE"
    ]

    # 우선주/전환사채 관련 키워드
    FILTER_PREFERRED = [
        "우선주", "우B", "전환사채"
    ]

    # 기타 제외할 키워드
    FILTER_ETC = [
        "스팩", "리츠", "배당"
    ]

    # 제외할 섹터
    FILTER_SECTOR = [
        '관리종목(소속부없음)', '투자주의환기종목(소속부없음)', '외국기업(소속부없음)'
    ]

    def __init__(self):
        pass

    def apply_filters(self, stock_data: pd.DataFrame, *, 
                     etf: bool = False, 
                     inverse: bool = False, 
                     sector: bool = False, 
                     preferred: bool = False, 
                     etc: bool = False,
                     top_percent:int,
                     bottom_percent:int) -> pd.DataFrame:
        filtered_data = stock_data.copy()
        filter_keywords = self._get_filter_keywords(etf, inverse, preferred, etc)
        
        if filter_keywords:
            filtered_data = self._apply_keyword_filters(filtered_data, filter_keywords)
        
        if sector:
            filtered_data = self._apply_sector_filter(filtered_data)
        
        filtered_data = filtered_data.sort_values(by='marketCap', ascending=False)
        return filtered_data.iloc[int(len(filtered_data)*top_percent/100):int(len(filtered_data)*bottom_percent/100)]
    
    def _get_filter_keywords(self, etf: bool, inverse: bool, preferred: bool, etc: bool) -> List[str]:
        keywords = []
        if etf:
            keywords.extend(self.FILTER_ETF)
        if inverse:
            keywords.extend(self.FILTER_INVERSE_LEVERAGE)
        if preferred:
            keywords.extend(self.FILTER_PREFERRED)
        if etc:
            keywords.extend(self.FILTER_ETC)
        return list(set(keywords))
    
    def _apply_keyword_filters(self, data: pd.DataFrame, keywords: List[str]) -> pd.DataFrame:
        return data[~data['stockName'].apply(lambda x: 
            any(keyword in x for keyword in keywords) or 
            bool(re.search(r'우$', x)) or
            bool(re.search(r'^HK', x))
        )]
    
    def _apply_sector_filter(self, data: pd.DataFrame) -> pd.DataFrame:
        return data[~data['sectorType'].isin(self.FILTER_SECTOR)]
    
    def analyze_volume(self, data: List[StockData]) -> dict:
        if data is None or len(data) == 0:
            raise ValueError("데이터가 비어있습니다.")
            
        try:
            filtered_data = pd.DataFrame([stock.model_dump() for stock in data])
                
            if 'tradingVolume' not in filtered_data.columns:
                raise ValueError("거래량(tradingVolume) 컬럼이 존재하지 않습니다.")
            
            if not pd.to_numeric(filtered_data['tradingVolume'], errors='coerce').notnull().all():
                raise ValueError("거래량 데이터에 숫자가 아닌 값이 포함되어 있습니다.")
                
            filtered_data = filtered_data[filtered_data['tradingVolume'].apply(lambda x : x != 0)]
            
            if len(filtered_data) == 0:
                raise ValueError("유효한 거래량 데이터가 없습니다.")

            result = filtered_data.describe()
            return result.to_dict()
        except Exception as e:
            if isinstance(e, ValueError):
                raise e
            raise ValueError(f"데이터 처리 중 오류가 발생했습니다: {str(e)}")
        
    def apply_volume_filters(self, data: List[StockData], filter_type: VolumeFilterType) -> pd.DataFrame:
        try:
            filtered_data = pd.DataFrame([stock.model_dump() for stock in data])
            
            if filter_type == VolumeFilterType.IQR:
                Q1 = filtered_data['tradingVolume'].quantile(0.25)
                Q3 = filtered_data['tradingVolume'].quantile(0.75)
                IQR = Q3 - Q1
                lower_bound = Q1 - 1.5 * IQR
                upper_bound = Q3 + 1.5 * IQR
                
                return filtered_data[
                    (filtered_data['tradingVolume'] >= lower_bound) &
                    (filtered_data['tradingVolume'] <= upper_bound)
                ]
            elif filter_type == VolumeFilterType.PERCENT:
                start_quantile = 0.25
                end_quantile = 0.75
                
                return filtered_data[
                    (filtered_data['tradingVolume'] >= filtered_data['tradingVolume'].quantile(start_quantile)) &
                    (filtered_data['tradingVolume'] <= filtered_data['tradingVolume'].quantile(end_quantile))
                ]
            elif filter_type == VolumeFilterType.ALL:
                return filtered_data.sort_values(by='tradingVolume', ascending=False)
            else:
                raise ValueError("유효하지 않은 필터 타입입니다.")
        except Exception as e:
            raise ValueError(f"데이터 처리 중 오류가 발생했습니다: {str(e)}")
        
    def calculate_cmp_data(self, data: List[StockData], end_data: pd.DataFrame) -> pd.DataFrame:
        try:
            filtered_data = pd.DataFrame([stock.model_dump() for stock in data])
            
            cmp_data = filtered_data.merge(end_data, on='stockCode', how='left', suffixes=('_start', '_end'))
            
            # 상장 폐지된 종목의 경우 0으로 처리
            cmp_data['closingPrice_end'] = cmp_data['closingPrice_end'].fillna(0)
            cmp_data['marketCap_end'] = cmp_data['marketCap_end'].fillna(0)
            cmp_data['listedShares_end'] = cmp_data['listedShares_end'].fillna(0)
            
            cmp_data["annual_return"] = cmp_data.apply(
                lambda row: (row["closingPrice_end"] - row["closingPrice_start"]) / row["closingPrice_start"] 
                if row["closingPrice_start"] != 0 else None, 
                axis=1
            )
            
            cmp_data["market_cap_change"] = cmp_data.apply(
                lambda row: (row["marketCap_end"] - row["marketCap_start"]) / row["marketCap_start"]
                if row["marketCap_start"] != 0 else None,
                axis=1
            )
            
            cmp_data = cmp_data.dropna(subset=['annual_return', 'market_cap_change'])
            cmp_data = cmp_data.filter(
                items=['stockCode', 'stockName_start', 'marketType_start', 'sectorType_start', 'closingPrice_start', 'closingPrice_end', 'annual_return', 'marketCap_start', 'marketCap_end', 'market_cap_change','listedShares_start', 'listedShares_end']
                ).rename(columns={
                    'stockName_start': 'stockName',
                    'marketType_start': 'marketType',
                    'sectorType_start': 'sectorType',
                    'closingPrice_start': 'start_closingPrice',
                    'closingPrice_end': 'end_closingPrice',
                    'marketCap_start': 'start_marketCap',
                    'marketCap_end': 'end_marketCap',
                    'listedShares_start': 'start_listedShares',
                    'listedShares_end': 'end_listedShares'
                })

            annual_return_analysis = self._calculate_histogram(cmp_data['annual_return'])
            market_cap_change_analysis = self._calculate_histogram(cmp_data['market_cap_change'])

            return cmp_data, annual_return_analysis, market_cap_change_analysis
        except Exception as e:
            raise ValueError(f"데이터 처리 중 오류가 발생했습니다: {str(e)}")

    def select_candidates(self, data: List[StockData], candidates_type: CandidatesType, strategy_type: StrategyType) -> List[StockData]:
        if not data:
            raise ValueError("데이터가 비어있습니다.")

        try:
            candidates = pd.DataFrame([stock.model_dump() for stock in data])

            start_percent = None
            end_percent = None

            if strategy_type == StrategyType.HIGH_RETURN:
                start_percent = 0.75
                end_percent = 1
            elif strategy_type == StrategyType.RISK_AVERSE:
                start_percent = 0.25
                end_percent = 1
            elif strategy_type == StrategyType.STABLE:
                start_percent = 0.25
                end_percent = 0.75
            else:
                raise ValueError(f"지원하지 않는 전략 유형입니다: {strategy_type}")

            if candidates_type == CandidatesType.ANNUAL_RETURN:
                filtered = candidates[
                    (candidates['annual_return'] > candidates['annual_return'].quantile(start_percent)) &
                    (candidates['annual_return'] < candidates['annual_return'].quantile(end_percent))
                ]
            elif candidates_type == CandidatesType.MARKET_CAP_CHANGE:
                filtered = candidates[
                    (candidates['market_cap_change'] > candidates['market_cap_change'].quantile(start_percent)) &
                    (candidates['market_cap_change'] < candidates['market_cap_change'].quantile(end_percent))
                ]
            else:
                raise ValueError(f"지원하지 않는 후보 유형입니다: {candidates_type}")

            if filtered.empty:
                raise ValueError("필터링 결과가 비어있습니다.")

            return filtered

        except (KeyError, TypeError) as e:
            raise ValueError(f"데이터 처리 중 오류가 발생했습니다: {str(e)}")
        except Exception as e:
            raise ValueError(f"예상치 못한 오류가 발생했습니다: {str(e)}")


    def _calculate_histogram(self, series: pd.Series) -> dict:
            stats = series.describe()
            hist, bin_edges = np.histogram(series, bins=20, density=True)
            
            x = np.linspace(series.min(), series.max(), 100)
            pdf = (1 / (stats['std'] * np.sqrt(2 * np.pi))) * np.exp(-((x - stats['mean'])**2) / (2 * stats['std']**2))
            
            return {
                'stats': stats.to_dict(),
                'histogram': {
                    'counts': hist.tolist(),
                    'bin_edges': bin_edges.tolist(),
                    'normal_curve': {
                        'x': x.tolist(),
                        'y': pdf.tolist()
                    }
                }
            }