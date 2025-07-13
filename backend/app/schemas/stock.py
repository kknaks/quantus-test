from datetime import datetime
from typing import List, Optional
from enum import Enum
from pydantic import BaseModel, field_validator

class VolumeFilterType(str, Enum):
    IQR = "IQR"
    PERCENT = "PERCENT"
    ALL = "ALL"

class CandidatesType(str, Enum):
    ANNUAL_RETURN = "ANNUAL_RETURN"
    MARKET_CAP_CHANGE = "MARKET_CAP_CHANGE"

class StrategyType(str, Enum):
    HIGH_RETURN = "HIGH_RETURN"
    RISK_AVERSE = "RISK_AVERSE"
    STABLE = "STABLE"

class DateRequest(BaseModel):
    input_date: str

    @field_validator('input_date')
    @classmethod
    def validate_date(cls, v):
        try:
            date = datetime.strptime(v, "%Y%m%d")
            today = datetime.now()
            
            if date.date() > today.date():
                raise ValueError(f"미래 날짜({v})는 조회할 수 없습니다.")
                
            return v
        except ValueError as e:
            if "미래 날짜" in str(e):
                raise e
            raise ValueError("날짜는 'YYYYMMDD' 형식이어야 합니다.") 
        
class StockRequest(BaseModel):
    startDd: str
    etf_filter: bool = False
    inverse_filter: bool = False
    sector_filter: bool = False
    preferred_filter: bool = False
    etc_filter: bool = False
    top_percent: float = 40
    bottom_percent: float = 80

class StockData(BaseModel):
    stockCode: str
    stockName: str
    marketType: str
    sectorType: str
    closingPrice: float
    priceChange: float
    fluctuationRate: float
    openingPrice: float
    highPrice: float
    lowPrice: float
    tradingVolume: int
    tradingValue: float
    marketCap: float
    listedShares: int
    
    class Config:
        from_attributes = True

class StockCmpData(BaseModel):
    stockCode: str
    stockName: str
    marketType: str
    sectorType: str
    start_closingPrice: float
    end_closingPrice: float
    annual_return: float
    start_marketCap: float
    end_marketCap: float
    market_cap_change: float
    start_listedShares: int
    end_listedShares: int


class StockResponse(BaseModel):
    data: List[StockData]

class VolumeRequest(BaseModel):
    data: List[StockData]

class VolumeResponse(BaseModel):
    data: dict

class VolumeFilterRequest(BaseModel):
    data: List[StockData]
    filter_type: Optional[VolumeFilterType] = None

class VolumeFilterResponse(BaseModel):
    data: List[StockData]

class StockEndRequest(BaseModel):
    endDd: str
    data: List[StockData]

class NormalCurve(BaseModel):
    x: List[float]
    y: List[float]

class Histogram(BaseModel):
    counts: List[float]
    bin_edges: List[float]
    normal_curve: NormalCurve

class AnalysisResult(BaseModel):
    stats: dict
    histogram: Histogram

class StockEndResponse(BaseModel):
    data: List[StockCmpData]
    annual_return_analysis: AnalysisResult
    market_cap_change_analysis: AnalysisResult

class StockCandidatesRequest(BaseModel):
    data: List[StockCmpData]
    candidates_type: Optional[CandidatesType] = None
    strategy_type: Optional[StrategyType] = None
    start_range: int = 0
    end_range: int = 100

class StockCandidatesResponse(BaseModel):
    data: List[StockCmpData]