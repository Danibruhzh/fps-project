import Webcam from "react-webcam";
import { useRef, useEffect, useState } from "react";
import "./Camera.css"

type Point = { x: number; y: number };
const canvasWidth = 250;
const canvasHeight = 180;
const widthRatio = 250/1535;
const heightRatio = 180/728;

function drawOutline(ctx: CanvasRenderingContext2D, points: Point[]) {
    if (points.length < 2) return;

    ctx.lineWidth = 2;
    ctx.strokeStyle = "lime";

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }

    //ctx.closePath();
    ctx.stroke();
}


function Camera() {
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pointsRef = useRef<Point[]>([]);
    const cursorRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
    const [test, setTest] = useState([0, 0]);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            // Update the ref with current cursor position
            cursorRef.current = {
                x: event.clientX,
                y: event.clientY,
            };
            // pointsRef.current.push({ x: event.clientX*widthRatio, y: event.clientY*heightRatio}); THIS IS USING THE MOUSE MOVEMENT
        };

        // Attach event listener to window
        window.addEventListener("mousemove", handleMouseMove);

        // Cleanup when component unmounts
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
        };
    }, []);

    useEffect(() => {
        const ws = new WebSocket("ws://localhost:8000/ws/track");

        let interval: number;

        ws.onopen = () => {
            interval = window.setInterval(() => {
                ws.send(JSON.stringify({
                    frame_id: Date.now(),
                    face_detected: true,
                    landmarks: [cursorRef.current],
                    timestamp: Date.now()
                }));
            }, 25); // FPS
        };

        ws.onmessage = (e) => {
            console.log("Raw:", e.data);
            const parsed = JSON.parse(e.data);
            setTest([parsed.gx, parsed.gy]);
            pointsRef.current.push({ x: parsed.gx*widthRatio, y: parsed.gy*heightRatio}); // THIS IS WITH THE BACKEND
            console.log(pointsRef.current);
        };

        return () => {
            clearInterval(interval);
            ws.close();
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
        }
        if (!canvas) return; // safety check

        const ctx = canvas.getContext("2d");
        if (!ctx) return; // safety check

        let rafId = 0;

        const render = () => {
            ctx.clearRect(0, 0, canvasWidth, canvasHeight);
            drawOutline(ctx, pointsRef.current);
            rafId = requestAnimationFrame(render);
        }
        rafId = requestAnimationFrame(render);

        return () => cancelAnimationFrame(rafId);
    }, [pointsRef]);

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
            <div>{test[0]} {test[1]}</div>
        </div >
    )
}

export default Camera