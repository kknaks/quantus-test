from pydantic import BaseModel, Field
from typing import List, Tuple, Optional, Dict
from app.schemas.stock import StockData
from app.schemas.invest_idx import RatioRow

class ScreeningCriteria(BaseModel):
    PER: Tuple[float, float] = Field(..., description="PER 범위 (최소값, 최대값)")
    PBR: Tuple[float, float] = Field(..., description="PBR 범위 (최소값, 최대값)")
    ROE: Tuple[float, float] = Field(..., description="ROE 범위 (최소값, 최대값)")
    ROA: Optional[Tuple[float, float]] = Field(None, description="ROA 범위 (최소값, 최대값)")
    영업이익률: Optional[Tuple[float, float]] = Field(None, description="영업이익률 범위 (최소값, 최대값)")
    부채비율: Optional[Tuple[float, float]] = Field(None, description="부채비율 범위 (최소값, 최대값)")

class BackTestRequest(BaseModel):
    test_data: List[RatioRow] = Field(..., description="백테스트에 사용할 테스트 데이터")
    screening_criteria: ScreeningCriteria
    top_n: int = Field(..., gt=0, le=50, description="포트폴리오에 포함할 종목 수 (1-50)")
    initial_capital: int = Field(default=10000000, ge=1000000, description="초기자본금 (최소 100만원)")

class PortfolioItem(BaseModel):
    종목명: str
    비중: float = Field(..., ge=0, le=1)

class MonthlyResult(BaseModel):
    date: str
    portfolio: List[PortfolioItem]
    return_pct: float
    cumulative_return_pct: float
    capital: int

class RiskMetrics(BaseModel):
    volatility: float = Field(..., description="연간 변동성")
    sharpe_ratio: float = Field(..., description="샤프 비율")
    max_drawdown: float = Field(..., description="최대 낙폭")
    win_rate: float = Field(..., ge=0, le=1, description="승률")

class TestDataRequest(BaseModel):
    data: List[StockData]
    start_date: str
    end_date: str
    test_case: int

class TestDataResponse(BaseModel):
    data: List[RatioRow]

class TestResultResponse(BaseModel):
    monthly_results: List[MonthlyResult]
    risk_metrics: RiskMetrics
    total_return: float
    final_capital: int
    summary: Dict[str, float] = Field(..., description="백테스트 요약 정보")

    class Config:
        schema_extra = {
            "example": {
                "monthly_results": [
                    {
                        "date": "20240101",
                        "portfolio": [
                            {"종목명": "삼성전자", "비중": 0.2},
                            {"종목명": "SK하이닉스", "비중": 0.2}
                        ],
                        "return_pct": 2.5,
                        "cumulative_return_pct": 2.5,
                        "capital": 10250000
                    }
                ],
                "risk_metrics": {
                    "volatility": 15.5,
                    "sharpe_ratio": 1.2,
                    "max_drawdown": 20.5,
                    "win_rate": 0.6
                },
                "total_return": 25.5,
                "final_capital": 12550000,
                "summary": {
                    "annual_return": 12.5,
                    "monthly_avg_return": 1.8,
                    "best_month_return": 5.5,
                    "worst_month_return": -3.2
                }
            }
        }

class BackTestResult(BaseModel):
    monthly_returns: List[float] = Field(..., description="월별 수익률 목록")
    monthly_portfolios: List[Dict[str, float]] = Field(..., description="월별 포트폴리오 구성 (종목명: 비중)")
    cumulative_returns: List[float] = Field(..., description="누적 수익률 목록")
    total_capital: List[float] = Field(..., description="월별 총 자본금 변화")
    initial_capital: float = Field(..., description="초기 자본금")
    final_capital: float = Field(..., description="최종 자본금")
    total_return: float = Field(..., description="총 수익률 (%)")
    rebalancing_dates: List[str] = Field(..., description="리밸런싱 날짜 목록")
    
    class Config:
        schema_extra = {
            "example": {
                "monthly_returns": [2.5, 1.8, -0.5, 3.2],
                "monthly_portfolios": [
                    {"삼성전자": 0.3, "SK하이닉스": 0.2, "NAVER": 0.5},
                    {"카카오": 0.4, "현대차": 0.3, "LG화학": 0.3}
                ],
                "cumulative_returns": [2.5, 4.3, 3.8, 7.1],
                "total_capital": [10000000, 10250000, 10430000, 10378150, 10710250],
                "initial_capital": 10000000,
                "final_capital": 10710250,
                "total_return": 7.1,
                "rebalancing_dates": ["20240101", "20240201", "20240301", "20240401"]
            }
        }

class BackTestAnalysis(BaseModel):
    result: BackTestResult
    metrics: Dict[str, float] = Field(..., description="성과 지표 (평균 월간수익률, 변동성, 최고/최저 월간수익률 등)")
    screening_summary: Dict[str, Dict[str, int]] = Field(..., description="스크리닝 결과 요약")
    
    class Config:
        schema_extra = {
            "example": {
                "result": {
                    "monthly_returns": [2.5, 1.8, -0.5, 3.2],
                    "monthly_portfolios": [
                        {"삼성전자": 0.3, "SK하이닉스": 0.2, "NAVER": 0.5},
                        {"카카오": 0.4, "현대차": 0.3, "LG화학": 0.3}
                    ],
                    "cumulative_returns": [2.5, 4.3, 3.8, 7.1],
                    "total_capital": [10000000, 10250000, 10430000, 10378150, 10710250],
                    "initial_capital": 10000000,
                    "final_capital": 10710250,
                    "total_return": 7.1,
                    "rebalancing_dates": ["20240101", "20240201", "20240301", "20240401"]
                },
                "metrics": {
                    "avg_monthly_return": 1.75,
                    "volatility": 1.58,
                    "best_month": 3.2,
                    "worst_month": -0.5,
                    "win_rate": 0.75
                },
                "screening_summary": {
                    "total_stocks": {"initial": 100, "passed": 45},
                    "rejection_reasons": {
                        "PER": 25,
                        "PBR": 15,
                        "ROE": 10,
                        "missing_data": 5
                    }
                }
            }
        }