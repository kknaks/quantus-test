from fastapi import APIRouter, HTTPException
from app.service.dart_api import DartApi
from fastapi.logger import logger

from app.schemas.financial import FinancialStatementRequest, FinancialStatementResponse
from app.service.back_test import BackTestService
from app.schemas.backtest import BackTestRequest, TestDataResponse, TestDataRequest, BackTestAnalysis
from app.schemas.invest_idx import RatioRow

router = APIRouter(prefix="/backtest")
backtest_service = BackTestService()

@router.post("/generate", response_model=TestDataResponse)
async def generate_test_data(testdata_request : TestDataRequest):
  test_data = backtest_service.generate_test_data(testdata_request.data, testdata_request.start_date, testdata_request.end_date, testdata_request.test_case)
  
  ratio_rows = []
  for _, row in test_data.iterrows():
    corp_name = row['corp_name']
    type_name = row['type']
    date_values = {col: row[col] for col in test_data.columns if col not in ['corp_name', 'type']}
    ratio_rows.append(RatioRow(corp_name=corp_name, type=type_name, **date_values))
  
  return TestDataResponse(data=ratio_rows)

@router.post("/start")
async def start_backtest(backtest_request : BackTestRequest):
  print(backtest_request)
  
  # RatioRow 리스트를 DataFrame으로 변환
  import pandas as pd
  
  # 테스트 데이터를 DataFrame으로 변환
  test_data_records = []
  for ratio_row in backtest_request.test_data:
    row_dict = {
      '종목명': ratio_row.corp_name,  # 백테스트 서비스에서 기대하는 컬럼명
      '구분': ratio_row.type          # 백테스트 서비스에서 기대하는 컬럼명
    }
    # 날짜 필드들 추가 (RatioRow의 모든 필드 확인)
    ratio_row_dict = ratio_row.model_dump()  # Pydantic 모델을 딕셔너리로 변환
    for key, value in ratio_row_dict.items():
      if key not in ['corp_name', 'type']:
        row_dict[key] = value
    test_data_records.append(row_dict)
  
  test_data_df = pd.DataFrame(test_data_records)
  
  # 디버깅: 변환된 데이터 확인
  print(f"🔍 변환된 데이터 정보:")
  print(f"   - shape: {test_data_df.shape}")
  print(f"   - 컬럼명: {test_data_df.columns.tolist()}")
  if not test_data_df.empty:
    print(f"   - 첫 번째 행: {test_data_df.iloc[0].to_dict()}")
  else:
    print("   - 데이터가 비어있습니다!")
  
  # ScreeningCriteria 객체를 딕셔너리로 변환
  screening_criteria_dict = backtest_request.screening_criteria.model_dump()
  
  result = backtest_service.run_monthly_rebalancing_backtest(
    test_data_df, 
    backtest_request.initial_capital, 
    backtest_request.top_n, 
    screening_criteria_dict
  )
  return result