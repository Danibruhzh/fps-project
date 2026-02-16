from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from app.ws.protocol import TrackPacket, TrackResult

router = APIRouter()

@router.websocket("/ws/track")
async def ws_track(websocket: WebSocket):
    await websocket.accept()
    
    try:
        while True:
            data = await websocket.receive_json()
            packet = TrackPacket.model_validate(data)

            # xout = yout = 0

            # if packet.landmarks[0].x >= 0.5:
            #     xout = 1
            # if packet.landmarks[0].y >= 0.5:
            #     yout = 1

            # dummy gaze
            result = TrackResult(
                frame_id = packet.frame_id,
                gx = packet.landmarks[0].x,
                gy = packet.landmarks[0].y,
                confidence = 67 if packet.face_detected else 9.9
            )

            await websocket.send_json(result.model_dump())

    except WebSocketDisconnect:
        # Client disconnected normally
        return
    except Exception as e:
        # If something unexpected happens, you can close the socket
        # (Optional) send an error message first
        await websocket.close(code=1011)
        return
