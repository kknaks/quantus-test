from fastapi import APIRouter

api_router = APIRouter()

# Import and include other routers
# from .routes.v1 import some_router
# api_router.include_router(some_router, prefix="/v1", tags=["v1"])

@api_router.get("/health", tags=["health"])
async def health_check():
    return {"status": "ok"}
