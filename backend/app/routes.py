from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

@router.get("/health")
def health(
    p1: int,
    p2: bool,
    p3: str,
):
    if p1>100 and p2:
        return p3
    else:
        return {"test": True}
    
class Landmark(BaseModel):
    x: float
    y: float

class TrackRequest(BaseModel):
    frame_id: int
    face_detected: bool
    landmarks: list[Landmark] = []

class TrackResponse(BaseModel):
    frame_id: int
    gx: float
    gy: float
    confidence: float


@router.post("/track", response_model=TrackResponse)
def create_track(request: TrackRequest):
    return TrackResponse(
        frame_id = request.frame_id,
        gx = 1.1,
        gy = 1.2,
        confidence = 67.67
    )