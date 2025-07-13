from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.v1 import stock_collector, stock_filter, financial_statement, invest_idx, back_test
import os

app = FastAPI(
    title="Quantus API",
    description="Stock data analysis API",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 환경 변수에서 프론트엔드 호스트 가져오기
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(stock_collector.router, prefix="/api/v1")
app.include_router(stock_filter.router, prefix="/api/v1")
app.include_router(financial_statement.router, prefix="/api/v1")
app.include_router(invest_idx.router, prefix="/api/v1")
app.include_router(back_test.router, prefix="/api/v1")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
