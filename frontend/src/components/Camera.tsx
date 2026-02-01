import Webcam from "react-webcam";
import { useRef, useEffect } from "react";
import "./Camera.css"

type Point = { x: number; y: number };
const canvasWidth = 250;
const canvasHeight = 180;

function drawOutline( ctx: CanvasRenderingContext2D, points: Point[] ){
    if (points.length < 2) return;

    ctx.lineWidth = 2;
    ctx.strokeStyle = "lime";

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i=1; i<points.length; i++){
        ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.closePath();
    ctx.stroke();
}


function Camera() {
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pointsRef = useRef<Point[]>([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas){
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
        }
        if (!canvas) return; // safety check

        const ctx = canvas.getContext("2d");
        if (!ctx) return; // safety check

        drawOutline(ctx, pointsRef.current);
    }, [])
    
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