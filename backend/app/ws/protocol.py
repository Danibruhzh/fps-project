from pydantic import BaseModel


class Landmark(BaseModel):
    x: float
    y: float

class TrackPacket(BaseModel):
    frame_id: int
    face_detected: bool
    landmarks: list[Landmark] = []
    timestamp: int

class TrackResult(BaseModel):
    frame_id: int
    gx: float
    gy: float
    confidence: float