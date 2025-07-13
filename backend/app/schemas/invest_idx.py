from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from app.schemas.stock import StockCmpData

class RatioRow(BaseModel):
    corp_name: str
    type: str
    
    # 동적 날짜 컬럼을 위한 설정
    class Config:
        extra = "allow"  # 추가 필드 허용

class InvestIdxRequest(BaseModel):
    start_date: str
    end_date: str
    data: List[StockCmpData]
    financial_statements: List[Dict]

class InvestIdxResponse(BaseModel):
    data: List[RatioRow]

class AnalysisRequest(BaseModel):
    data: List[RatioRow]

class InvestmentZone(BaseModel):
    lower_bound: Optional[float]
    q1: Optional[float]
    median: Optional[float]
    mean: Optional[float]
    q3: Optional[float]
    upper_bound: Optional[float]
    data_count: int

class MonthlyStats(BaseModel):
    original: Dict[str, List[float]]
    cleaned: Dict[str, List[float]]

class AnalysisResponse(BaseModel):
    metrics: List[str]
    monthly_stats: Dict[str, MonthlyStats]
    investment_zones: Dict[str, InvestmentZone]