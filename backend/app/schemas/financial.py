from enum import Enum
from pydantic import BaseModel
from typing import List, Dict, Optional
from app.schemas.stock import StockCmpData

class QuarterCode(str, Enum):
    Q1 = "11013"
    Q2 = "11012"
    Q3 = "11014"
    Q4 = "11011"

class FinancialCategory(str, Enum):
    CIS = "CIS"
    BS_ASSET = "BS_자산"
    BS_LIABILITY = "BS_부채"
    BS_EQUITY = "BS_자본"
    REPORT_INFO = "report_info"

class FinancialData(BaseModel):
    category: str
    subject: str
    find: str
    quarters: Dict[str, Optional[float]]  # e.g., {"2023_Q1": 1000000.0}

class StatementResult(BaseModel):
    corp_name: str
    data: List[FinancialData]

class FinancialStatementRequest(BaseModel):
    data: List[StockCmpData]
    filter_type: Optional[str] = None
    analysis_cnt: int
    start_date: str
    end_date: str

class FinancialStatementResponse(BaseModel):
    data: List[StatementResult]