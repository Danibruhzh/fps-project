from fastapi import FastAPI
from app.routes import router as rest_router
from app.ws.track import router as ws_router

app = FastAPI()
app.include_router(rest_router)

app.include_router(ws_router)