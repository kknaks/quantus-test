from fastapi import APIRouter, HTTPException
from app.service.krx_api import KrxApi
from app.service.stock_filter import StockFilterService
from fastapi.logger import logger
from app.schemas.stock import VolumeRequest, VolumeResponse, VolumeFilterRequest, VolumeFilterResponse
from app.schemas.stock import DateRequest, StockEndRequest, StockEndResponse, StockCandidatesRequest, StockCandidatesResponse


router = APIRouter(prefix="/filter")
krx_api = KrxApi()
stock_filter_service = StockFilterService()
    
@router.post("/volumes", response_model=VolumeResponse)
async def collect_volume_data(volume_request: VolumeRequest):
    try:
        volume_data = stock_filter_service.analyze_volume(volume_request.data)
        return VolumeResponse(data=volume_data)
    except Exception as e:
        logger.error(f"예상치 못한 오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail="서버 오류가 발생했습니다.")

@router.post("/volumes/filter")
async def filter_volume_data(volume_request: VolumeFilterRequest):
    try:
        filtered_data = stock_filter_service.apply_volume_filters(volume_request.data, volume_request.filter_type)
        return VolumeFilterResponse(data=filtered_data.to_dict(orient='records'))
    except Exception as e:
        logger.error(f"예상치 못한 오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail="서버 오류가 발생했습니다.")
    
@router.post("/stocks/end", response_model=StockEndResponse)
async def collect_stock_end_data(stock_request: StockEndRequest):
    try:
        date_request = DateRequest(input_date=stock_request.endDd)
        stock_data = krx_api.get_stock_list_with_next_day(date_request.input_date)
        cmp_data, annual_return_analysis, market_cap_change_analysis = stock_filter_service.calculate_cmp_data(stock_request.data, stock_data)
        return StockEndResponse(data=cmp_data.to_dict(orient='records'),
                                 annual_return_analysis=annual_return_analysis,
                                 market_cap_change_analysis=market_cap_change_analysis)
    except Exception as e:
        logger.error(f"예상치 못한 오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail="서버 오류가 발생했습니다.")
    
@router.post("/stocks/candidates", response_model=StockCandidatesResponse)
async def collect_stock_candidates(stock_request: StockCandidatesRequest):
    try:
        candidates = stock_filter_service.select_candidates(
                                            stock_request.data, 
                                            stock_request.candidates_type, 
                                            stock_request.strategy_type)
        return StockCandidatesResponse(data=candidates.to_dict(orient='records'))
    except Exception as e:
        logger.error(f"예상치 못한 오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail="서버 오류가 발생했습니다.")