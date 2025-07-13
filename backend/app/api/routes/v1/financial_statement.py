from fastapi import APIRouter, HTTPException
from app.service.dart_api import DartApi
from fastapi.logger import logger

from app.schemas.financial import FinancialStatementRequest, FinancialStatementResponse

router = APIRouter(prefix="/financial")

@router.get("/corp-code")
async def get_corp_code():
    try:
        dart_api = DartApi()
        corp_code_df = dart_api._get_corp_code()
        return {
            "message": "회사 코드 호출에 성공했습니다.",
            "data": corp_code_df.to_dict(orient='records')
        }
    except HTTPException as he:
        raise he 
    except Exception as e:
        logger.error(f"회사 코드 조회 중 오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail="회사 코드 조회 중 오류가 발생했습니다.")

@router.post("/statements", response_model=FinancialStatementResponse)
async def get_corp_statement(selected_data: FinancialStatementRequest):
    try:
        dart_api = DartApi()
        filtered_data = dart_api.filter_by_cnt(selected_data.data, selected_data.analysis_cnt)
        result = dart_api.get_corp_statement(filtered_data, selected_data.start_date, selected_data.end_date)
        return FinancialStatementResponse(data=result)
    except HTTPException as he:
        raise he 
    except Exception as e:
        logger.error(f"회사 재무제표 조회 중 오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail="회사 재무제표 조회 중 오류가 발생했습니다.")
