from fastapi import APIRouter, HTTPException
from fastapi.logger import logger
from app.schemas.invest_idx import InvestIdxRequest, InvestIdxResponse, AnalysisRequest, AnalysisResponse
from app.service.invest_idx import InvestIdxService
from typing import Dict, List
import pandas as pd

router = APIRouter(prefix="/idx")
invest_idx_service = InvestIdxService()

@router.post("/gen-idx", response_model=InvestIdxResponse)
async def gen_invest_idx(invest_idx_request: InvestIdxRequest):
    try:
        # stock_range_info, fileId = await invest_idx_service.get_stock_range_info(
        #     invest_idx_request.start_date, 
        #     invest_idx_request.end_date
        # )

        stock_range_info = invest_idx_service.get_stock_file(invest_idx_request.start_date)  
        
        if stock_range_info.empty:
            logger.error("수집된 주가 데이터가 없습니다.")
            raise HTTPException(status_code=400, detail="주가 데이터를 수집할 수 없습니다.")
            
        candidates_range_info = invest_idx_service.get_candidates_range_info(
            invest_idx_request.data, 
            stock_range_info
        )
        
        if candidates_range_info.empty:
            logger.error("후보 종목들의 주가 정보가 없습니다.")
            raise HTTPException(status_code=400, detail="후보 종목들의 주가 정보를 찾을 수 없습니다.")
        
        company_analysis_dataframe = invest_idx_service.create_company_analysis_dataframe(
            candidates_range_info,
            invest_idx_request.financial_statements
        )
        
        return InvestIdxResponse(data=company_analysis_dataframe.to_dict(orient='records'))

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"투자 지표 생성 중 오류 발생: {str(e)}")
        logger.exception("상세 에러:")  # 스택 트레이스 출력
        raise HTTPException(status_code=500, detail="투자 지표 생성 중 오류가 발생했습니다.")

@router.post("/analysis", response_model=AnalysisResponse)
async def analysis_invest_idx(analysis_request: AnalysisRequest):
    try:
        analysis_data = invest_idx_service.analysis_invest_idx(analysis_request.data)
        
        # 응답 데이터 구조화
        response = AnalysisResponse(
            metrics=analysis_data['metrics'],
            monthly_stats={
                metric: {
                    'original': stats['original'],
                    'cleaned': stats['cleaned']
                }
                for metric, stats in analysis_data['monthly_stats'].items()
            },
            investment_zones={
                metric: {
                    'lower_bound': zones['lower_bound'],
                    'q1': zones['q1'],
                    'median': zones['median'],
                    'mean': zones['mean'],
                    'q3': zones['q3'],
                    'upper_bound': zones['upper_bound'],
                    'data_count': zones['data_count']
                }
                for metric, zones in analysis_data['investment_zones'].items()
            }
        )
        
        return response
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"투자 지표 분석 중 오류 발생: {str(e)}")
        logger.exception("상세 에러:")  # 스택 트레이스 출력
        raise HTTPException(status_code=500, detail="투자 지표 분석 중 오류가 발생했습니다.")