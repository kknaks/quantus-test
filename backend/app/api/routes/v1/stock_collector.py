from fastapi import APIRouter, HTTPException
from app.service.krx_api import KrxApi
from app.service.stock_filter import StockFilterService
from fastapi.logger import logger
from app.schemas.stock import DateRequest, StockRequest, StockResponse

router = APIRouter(prefix="/collect")
krx_api = KrxApi()
stock_filter_service = StockFilterService()

@router.post("/stocks", response_model=StockResponse)
async def collect_stock_data(stock_request: StockRequest):
    try:
        date_request = DateRequest(input_date=stock_request.startDd)
        stock_data = krx_api.get_stock_list_with_next_day(date_request.input_date)
        
        filtered_stock_data = stock_filter_service.apply_filters(
            stock_data,
            etf=stock_request.etf_filter,
            inverse=stock_request.inverse_filter,
            sector=stock_request.sector_filter,
            preferred=stock_request.preferred_filter, 
            etc=stock_request.etc_filter,
            top_percent=stock_request.top_percent,
            bottom_percent=stock_request.bottom_percent
        )
        
        return StockResponse(data=filtered_stock_data.to_dict(orient='records'))
    except ValueError as e:
        logger.error(f"날짜 검증 실패: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"예상치 못한 오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail="서버 오류가 발생했습니다.")