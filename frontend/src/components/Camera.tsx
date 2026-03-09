import Webcam from "react-webcam";
import { useRef, useEffect, useState } from "react";
import { useIrisGaze } from "./useIrisGaze";
import "./Camera.css"

type Point = { x: number; y: number };
const camWidth = 250;
const camHeight = 180;
const windowWidth = 1535;
const windowHeight = 728;
// const widthRatio = camWidth / windowWidth;
// const heightRatio = camHeight / windowHeight;

function toPixel(p: Point, w: number, h: number) {
    return { x: p.x * w, y: p.y * h };
}

function drawRing(ctx: CanvasRenderingContext2D, points: Point[]) {
    if (points.length < 2) return;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    const p0 = toPixel(points[0], w, h);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);

    for (let i = 1; i < points.length; i++) {
        const p = toPixel(points[i], w, h);
        ctx.lineTo(p.x, p.y);
    }

    ctx.closePath();
    ctx.lineWidth = 2;
    ctx.stroke();

    console.log(p0);
}

function drawIrisDot(ctx: CanvasRenderingContext2D, nx: number, ny: number) {
    const x = nx * ctx.canvas.width;
    const y = ny * ctx.canvas.height;

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawDot(ctx: CanvasRenderingContext2D, nx: number, ny: number) {
    // converts normalized points into pixels
    const x = nx * windowWidth;
    const y = ny * windowHeight;
    console.log(x, y);

    ctx.clearRect(0, 0, windowWidth, windowHeight);
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
}

function Camera() {
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    // video element stored in state so updates trigger rerender
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
    const gaze = useIrisGaze(videoEl);
    console.log(gaze);

    const handleUserMedia = () => {
        const v = webcamRef.current?.video ?? null;
        if (v) {
            if (v.readyState >= 1) { // when video metadata is ready
                setVideoEl(v);
            } else {
                v.onloadeddata = () => setVideoEl(v); // calls once video metadata finishes loading
            }
        }
    }

    useEffect(() => {
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!canvas) return;
        if (!overlay) return;

        canvas.width = windowWidth;
        canvas.height = windowHeight;
        overlay.width = camWidth;
        overlay.height = camWidth;

        const ctx = canvas.getContext("2d");
        const ctx2 = overlay.getContext("2d");

        if (!ctx) return;
        if (!ctx2) return;

        ctx2.clearRect(0, 0, camWidth, camHeight);

        if (!gaze.hasFace) {
            ctx.clearRect(0, 0, windowWidth, windowHeight);
            return;
        }

        if (gaze.leftIris) {
            drawRing(ctx2, gaze.leftIris);
        }
        if (gaze.rightIris) {
            drawRing(ctx2, gaze.rightIris);
        }

        drawDot(ctx, gaze.x, gaze.y);
        drawIrisDot(ctx2, gaze.x, gaze.y);
    }, [gaze]);

    // This is for the mouse stuff. I don't need this.
    // useEffect(() => {
    //     const handleMouseMove = (event: MouseEvent) => {
    //         // Update the ref with current cursor position
    //         cursorRef.current = {
    //             x: event.clientX,
    //             y: event.clientY,
    //         };
    //         // pointsRef.current.push({ x: event.clientX*widthRatio, y: event.clientY*heightRatio});  // THIS IS USING THE MOUSE MOVEMENT
    //     };

    //     // Attach event listener to window
    //     window.addEventListener("mousemove", handleMouseMove);

    //     // Cleanup when component unmounts
    //     return () => {
    //         window.removeEventListener("mousemove", handleMouseMove);
    //     };
    // }, []);

    // useEffect(() => {
    //     const ws = new WebSocket("ws://localhost:8000/ws/track");

    //     let interval: number;

    //     ws.onopen = () => {
    //         interval = window.setInterval(() => {
    //             ws.send(JSON.stringify({
    //                 frame_id: Date.now(),
    //                 face_detected: true,
    //                 landmarks: [cursorRef.current],
    //                 timestamp: Date.now()
    //             }));
    //         }, 25); // FPS
    //     };

    //     ws.onmessage = (e) => {
    //         console.log("Raw:", e.data);
    //         const parsed = JSON.parse(e.data);
    //         setTest([parsed.gx, parsed.gy]);
    //         pointsRef.current.push({ x: parsed.gx*widthRatio, y: parsed.gy*heightRatio}); // THIS IS WITH THE BACKEND
    //         console.log(pointsRef.current);
    //     };

    //     return () => {
    //         clearInterval(interval);
    //         ws.close();
    //     };
    // }, []);

    // useEffect(() => {
    //     const canvas = canvasRef.current;
    //     if (canvas) {
    //         canvas.width = canvasWidth;
    //         canvas.height = canvasHeight;
    //     }
    //     if (!canvas) return; // safety check

    //     const ctx = canvas.getContext("2d");
    //     if (!ctx) return; // safety check

    //     let rafId = 0;

    //     const render = () => {
    //         ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    //         drawOutline(ctx, pointsRef.current);
    //         rafId = requestAnimationFrame(render);
    //     }
    //     rafId = requestAnimationFrame(render);

    //     return () => cancelAnimationFrame(rafId);
    // }, [pointsRef]);

    return (
        <div>
            <div className="camera-container">
                <Webcam className="webcam" ref={webcamRef} audio={false} mirrored onUserMedia={handleUserMedia}
                    videoConstraints={{ width: camWidth, height: camHeight, facingMode: "user", }} />
                <canvas className="overlay" ref={overlayRef} />
            </div>
            <canvas className="page" ref={canvasRef} />
            <div> gaze: {gaze.x.toFixed(3)} {gaze.y.toFixed(3)} face: {String(gaze.hasFace)} </div>
        </div>);
}

export default Camera