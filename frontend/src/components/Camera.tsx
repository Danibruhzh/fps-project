import Webcam from "react-webcam";
import { useRef, useEffect } from "react";
import { FaceLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";
import { useCalibrationContext } from "../context/context";
import Calibration from "./Calibration";
import "./Camera.css"

type Point = {
    x: number;
    y: number
};
type Gaze = {
    x: number;
    y: number;
    hasFace: boolean;
};
const camWidth = 250;
const camHeight = 180;
const windowWidth = 1535;
const windowHeight = 728;

const LEFT_IRIS = [468, 469, 470, 471, 472];
const RIGHT_IRIS = [473, 474, 475, 476, 477];
// const widthRatio = camWidth / windowWidth;
// const heightRatio = camHeight / windowHeight;

function drawDot(ctx: CanvasRenderingContext2D, nx: number, ny: number) {
    // converts normalized points into pixels
    const x = nx * windowWidth;
    const y = ny * windowHeight;

    ctx.clearRect(0, 0, windowWidth, windowHeight);
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
}

function avg(points: Point[]): Point {
    let sx = 0;
    let sy = 0;
    for (const p of points) {
        sx += p.x;
        sy += p.y;
    }
    return { x: sx / points.length, y: sy / points.length };
}

function Camera() {
    const calibrationContext = useCalibrationContext();
    const { caliButton, setCaliButton, dotCalibrationData } = calibrationContext!;

    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const lipsRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);

    // video element stored in state so updates trigger rerender
    const facelandmarkerRef = useRef<FaceLandmarker | null>(null);
    const rafIdRef = useRef<number>(0);
    const lastVideoTimeRef = useRef<number>(-1);

    const gaze = useRef<Gaze>({ x: 0.5, y: 0.5, hasFace: false });

    // smoothQueueRef stores the recent gaze points for moving-average smoothing
    const smoothQueueRef = useRef<Point[]>([]);

    // Smoothing amount:
    // 1 = fastest but jittery
    // 3 = good balance
    // 5 = smoother but more lag
    const SMOOTH_N = 1;

    useEffect(() => {
        let cancelled = false;

        async function init() {
            const filesetResolver = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm"
            );

            const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath:
                        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                    delegate: "GPU",
                },
                runningMode: "VIDEO",
                numFaces: 1,
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: false,
            });

            if (cancelled) {
                if (landmarker?.close) landmarker.close();
                return;
            }

            facelandmarkerRef.current = landmarker;
            //setReady(true);
        }
        init();

        return () => {
            cancelled = true;
            if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current);
            }
            facelandmarkerRef.current?.close();
            facelandmarkerRef.current = null;
        }
    }, []);

    const startPredictLoop = () => {
        if (rafIdRef.current) return;

        const video = webcamRef.current?.video ?? null;
        const overlay = overlayRef.current;
        const landmarker = facelandmarkerRef.current;
        const canvas = canvasRef.current;
        const lips = lipsRef.current;
        if (!video || !overlay || !landmarker || !canvas || !lips) return;

        overlay.width = camWidth;
        overlay.height = camHeight;
        canvas.width = windowWidth;
        canvas.height = windowHeight;
        lips.width = windowWidth;
        lips.height = windowHeight;

        const overlayCtx = overlay.getContext("2d");
        const pageCtx = canvas.getContext("2d");
        const lipsCtx = lips.getContext("2d");
        if (!overlayCtx || !pageCtx || !lipsCtx) return;

        const drawingUtils = new DrawingUtils(overlayCtx);

        const predictWebcam = () => {
            const v = webcamRef.current?.video ?? null;
            const lm = facelandmarkerRef.current;

            if (!v || !lm) {
                rafIdRef.current = 0;
                return;
            }

            if (v.currentTime !== lastVideoTimeRef.current) {
                lastVideoTimeRef.current = v.currentTime;

                const nowMs = performance.now();
                const results = lm.detectForVideo(v, nowMs);

                overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

                if (!results.faceLandmarks?.length) {
                    gaze.current = { ...gaze.current, hasFace: false };
                    pageCtx.clearRect(0, 0, canvas.width, canvas.height);
                    lipsCtx.clearRect(0, 0, lips.width, lips.height);
                } else {
                    const landmarks = results.faceLandmarks[0];

                    drawingUtils.drawConnectors(
                        landmarks,
                        FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
                        { color: "blue", lineWidth: 1 }
                    );
                    drawingUtils.drawConnectors(
                        landmarks,
                        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
                        { color: "blue", lineWidth: 1 }
                    );
                    drawingUtils.drawConnectors(
                        landmarks,
                        FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
                        { color: "blue", lineWidth: 1 }
                    );
                    drawingUtils.drawConnectors(
                        landmarks,
                        FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
                        { color: "blue", lineWidth: 1 }
                    );
                    drawingUtils.drawConnectors(
                        landmarks,
                        FaceLandmarker.FACE_LANDMARKS_LIPS,
                        { color: "green", lineWidth: 1 }
                    );
                    drawingUtils.drawConnectors(
                        landmarks,
                        FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
                        { color: "red", lineWidth: 1 }
                    );

                    const leftPoints: Point[] = LEFT_IRIS.map((i) => ({
                        x: landmarks[i].x,
                        y: landmarks[i].y,
                    }));

                    const rightPoints: Point[] = RIGHT_IRIS.map((i) => ({
                        x: landmarks[i].x,
                        y: landmarks[i].y,
                    }));

                    const leftCenter = avg(leftPoints);
                    const rightCenter = avg(rightPoints);

                    const raw: Point = {
                        x: (leftCenter.x + rightCenter.x) / 2,
                        y: (leftCenter.y + rightCenter.y) / 2,
                    };

                    const q = smoothQueueRef.current;
                    q.push(raw);
                    if (q.length > SMOOTH_N) q.shift();

                    const smoothed = avg(q);

                    gaze.current = {
                        x: smoothed.x,
                        y: smoothed.y,
                        hasFace: true,
                    };

                    drawDot(pageCtx, gaze.current.x, gaze.current.y);
                }
            }

            rafIdRef.current = requestAnimationFrame(predictWebcam);
        };

        rafIdRef.current = requestAnimationFrame(predictWebcam);
    };



    // useEffect(() => {
    //     const canvas = canvasRef.current;
    //     if (!canvas) return;

    //     canvas.width = windowWidth;
    //     canvas.height = windowHeight;

    //     const ctx = canvas.getContext("2d");

    //     if (!ctx) return;

    //     if (!gaze.hasFace) {
    //         ctx.clearRect(0, 0, windowWidth, windowHeight);
    //         return;
    //     }

    //     drawDot(ctx, gaze.x, gaze.y);
    // }, [gaze]);

    // This is for the mouse stuff. I don't need this. *********************************
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


    // ******************************* WEBSOCKET *****************************
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
            <div>
                <div>
                    <div className={!caliButton? "camera-container" : "hide"}>
                        <Webcam
                            className={!caliButton ? "webcam" : "hide"}
                            ref={webcamRef}
                            audio={false}
                            mirrored
                            onUserMedia={() => {
                                const v = webcamRef.current?.video ?? null;
                                if (!v) return;

                                if (v.readyState >= 1) {
                                    startPredictLoop();
                                    console.log("HI");
                                } else {
                                    v.onloadedmetadata = () => {
                                        startPredictLoop();
                                        console.log("BYE");
                                    };
                                }
                            }}
                            videoConstraints={{
                                width: camWidth,
                                height: camHeight,
                                facingMode: "user",
                            }}
                        />
                        <canvas className={!caliButton? "overlay": "hide"} ref={overlayRef} />
                    </div>

                    <canvas className="page" ref={canvasRef} />
                    <canvas className="page" ref={lipsRef} />
                </div>
            </div>

            {caliButton && <Calibration gaze={gaze} />}

            <div
                className={!caliButton ? "calibrateShow" : "calibrateHide"}
                onClick={() => {
                    setCaliButton(true);
                }}
            >
                Calibrate
            </div>
        </div>
    );
}

export default Camera