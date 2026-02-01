import Webcam from "react-webcam";
import { useRef } from "react";
import "./Camera.css"

function Camera() {
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    return (
        <div>
            <div className="camera-container">
                <Webcam className="webcam" ref={webcamRef} audio={false} mirrored
                    videoConstraints={{
                        width: 500,
                        height: 360,
                        facingMode: "user",
                    }}
                />
                <canvas className="overlay" ref={canvasRef}></canvas>
            </div>
            
        </div >
    )
}

export default Camera