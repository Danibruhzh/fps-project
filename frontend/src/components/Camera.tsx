import Webcam from "react-webcam";
import { useRef, useEffect } from "react";
import { FaceLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";
import { useCalibrationContext } from "../context/context";
import Calibration from "./Calibration";
import "./Camera.css"


// ******** NEXT FIX **********
// 1. I think the dot is still wobbly when you stare at some dot because the eyelids 
//      move by themselves even when resting.
//   -> fix the wobbly problem
// 2. fix the issue that makes the gaze dot not reach the corners
// 3. fix the issue of head position moving

type Point = {
    x: number;
    y: number
};
type Gaze = {
    x: number;
    y: number;
    hasFace: boolean;
    eyeCenterY: number;
    eyeOpenness: number;
};

type CalibrationPoint = {
    targetX: number;
    targetY: number;
    gazeX: number;
    gazeY: number;
    eyeCenterY: number;
    eyeOpenness: number;
};

type CalibrationModel = {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
    baselineEyeCenterY: number;
    baselineEyeOpenness: number;
};

const camWidth = 250;
const camHeight = 180;
const windowWidth = 1535;
const windowHeight = 728;


const LEFT_IRIS = [473, 474, 475, 476, 477];
const RIGHT_IRIS = [468, 469, 470, 471, 472];
const RIGHT_EYE_RIGHT_CORNER = 33;
const RIGHT_EYE_LEFT_CORNER = 133;
const RIGHT_EYE_TOP = 159;
const RIGHT_EYE_BOTTOM = 145;

const LEFT_EYE_RIGHT_CORNER = 362;
const LEFT_EYE_LEFT_CORNER = 263;
const LEFT_EYE_TOP = 386;
const LEFT_EYE_BOTTOM = 374;

// const widthRatio = camWidth / windowWidth;
// const heightRatio = camHeight / windowHeight;

// clamp(value, min, max) keeps value between min and max (will be 0 and 1)
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

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

function getEyeOpenness(eyeTop: Point, eyeBottom: Point, eyeLeftCorner: Point, eyeRightCorner: Point): number {
    const eyeHeight = eyeBottom.y - eyeTop.y;
    const eyeWidth = eyeLeftCorner.x - eyeRightCorner.x;

    if (Math.abs(eyeWidth) < 0.000001) {
        return 0;
    }

    return eyeHeight / eyeWidth;
}

function getEyeCenterY(eyeLeftCorner: Point, eyeRightCorner: Point): number {
    return (eyeLeftCorner.y + eyeRightCorner.y) / 2;
}

function getBaselineCalibrationPoint(data: CalibrationPoint[]): CalibrationPoint {
    let closest = data[0];
    let closestDistance = Infinity;

    for (const point of data) {
        // change this constant (0.5)
        const dx = point.targetX - 0.5;
        const dy = point.targetY - 0.5;
        const distance = dx * dx + dy * dy;

        if (distance < closestDistance) {
            closestDistance = distance;
            closest = point;
        }
    }

    return closest;
}

function correctGazeWithEyeShape(gaze: Point, _eyeCenterY: number, _eyeOpenness: number, _baselineEyeCenterY: number, _baselineEyeOpenness: number): Point {
    // The corner-anchored Y normalization in getRelativeIrisPosition
    // already cancels eyelid drift and head-pitch offset:
    //   relativeY = (iris.y - cornerCenterY) / eyeWidth
    // Both terms shift equally on head pitch, so the difference is invariant.
    // Adding an eyeCenterY correction here would apply raw landmark-coordinate
    // deltas (~0.001–0.05) onto eye-width-normalized gaze values (±0.15 range),
    // which is a unit mismatch that over-corrects. Pass through unchanged.
    return { x: gaze.x, y: gaze.y };
}

function solve3x3(matrix: number[][], values: number[]): [number, number, number] | null {
    const a = matrix.map((row, i) => [...row, values[i]]);

    for (let col = 0; col < 3; col++) {
        let bestRow = col;

        for (let row = col + 1; row < 3; row++) {
            if (Math.abs(a[row][col]) > Math.abs(a[bestRow][col])) {
                bestRow = row;
            }
        }

        if (Math.abs(a[bestRow][col]) < 0.000001) {
            return null;
        }

        [a[col], a[bestRow]] = [a[bestRow], a[col]];

        const pivot = a[col][col];

        for (let j = col; j < 4; j++) {
            a[col][j] /= pivot;
        }

        for (let row = 0; row < 3; row++) {
            if (row === col) continue;

            const factor = a[row][col];

            for (let j = col; j < 4; j++) {
                a[row][j] -= factor * a[col][j];
            }
        }
    }

    return [a[0][3], a[1][3], a[2][3]];
}

function fitAffineCoefficients(data: CalibrationPoint[], targetKey: "targetX" | "targetY"): [number, number, number] | null {
    let sumGXGX = 0;
    let sumGXGY = 0;
    let sumGX = 0;
    let sumGYGY = 0;
    let sumGY = 0;
    let sumOne = data.length;

    let sumGXT = 0;
    let sumGYT = 0;
    let sumT = 0;

    for (const point of data) {
        const gx = point.gazeX;
        const gy = point.gazeY;
        const target = point[targetKey];

        sumGXGX += gx * gx;
        sumGXGY += gx * gy;
        sumGX += gx;

        sumGYGY += gy * gy;
        sumGY += gy;

        sumGXT += gx * target;
        sumGYT += gy * target;
        sumT += target;
    }

    const matrix = [
        [sumGXGX, sumGXGY, sumGX],
        [sumGXGY, sumGYGY, sumGY],
        [sumGX, sumGY, sumOne],
    ];

    const values = [sumGXT, sumGYT, sumT];

    return solve3x3(matrix, values);
}

function buildCalibrationModel(data: CalibrationPoint[]): CalibrationModel | null {
    if (data.length < 9) {
        return null;
    }

    const baselinePoint = getBaselineCalibrationPoint(data);
    const baselineEyeCenterY = baselinePoint.eyeCenterY;
    const baselineEyeOpenness = baselinePoint.eyeOpenness;

    const correctedData = data.map((point) => {
        const correctedGaze = correctGazeWithEyeShape(
            { x: point.gazeX, y: point.gazeY }, 
            point.eyeCenterY,
            point.eyeOpenness,
            baselineEyeCenterY, 
            baselineEyeOpenness
        );

        return {...point, gazeX: correctedGaze.x, gazeY: correctedGaze.y};
    });


    const xCoefficients = fitAffineCoefficients(correctedData, "targetX");
    const yCoefficients = fitAffineCoefficients(correctedData, "targetY");

    if (!xCoefficients || !yCoefficients) {
        return null;
    }

    return {
        a: xCoefficients[0],
        b: xCoefficients[1],
        c: xCoefficients[2],
        d: yCoefficients[0],
        e: yCoefficients[1],
        f: yCoefficients[2],
        baselineEyeCenterY,
        baselineEyeOpenness,
    };
}

function mapGazeRelative(gaze: Point, model: CalibrationModel): Point {
    const mappedX = model.a * gaze.x + model.b * gaze.y + model.c;
    const mappedY = model.d * gaze.x + model.e * gaze.y + model.f;

    return {
        x: 1 - clamp(mappedX, 0, 1),
        y: clamp(mappedY, 0, 1),
    };
}

function getRelativeIrisPosition(irisCenter: Point, eyeLeftCorner: Point, eyeRightCorner: Point, _eyeTop: Point, _eyeBottom: Point): Point | null {
    const eyeWidth = eyeLeftCorner.x - eyeRightCorner.x;

    if (Math.abs(eyeWidth) < 0.000001) {
        return null;
    }

    const relativeX = (irisCenter.x - eyeRightCorner.x) / eyeWidth;

    // Anchor Y to the eye-corner midpoint instead of the upper eyelid.
    // Eye corners sit on the orbital bone and don't move with blinks or
    // eyebrow raises, so this removes eyelid-induced vertical drift.
    // Normalise by eyeWidth (stable) rather than eyeHeight (varies with lids).
    // Raw output is roughly ±0.15; +0.5 shifts it into the [0, 1] range.
    const cornerCenterY = (eyeLeftCorner.y + eyeRightCorner.y) / 2;
    const relativeY = (irisCenter.y - cornerCenterY) / eyeWidth + 0.5;

    return {
        x: clamp(relativeX, 0, 1),
        y: clamp(relativeY, 0, 1),
    };
}

// kNN model
// function mapGazeToScreen(gaze: Point, calibrationData: CalibrationPoint[], k: number): Point | null {
//     if (calibrationData.length === 0) {
//         return null;
//     }

//     const distances = calibrationData.map((point) => {
//         const dx = gaze.x - point.gazeX;
//         const dy = gaze.y - point.gazeY;
//         const distance = Math.sqrt(dx * dx + dy * dy);

//         return {
//             targetX: point.targetX,
//             targetY: point.targetY,
//             distance,
//         };
//     });

//     distances.sort((a, b) => a.distance - b.distance);

//     const nearest = distances.slice(0, Math.min(k, distances.length));

//     let weightedX = 0;
//     let weightedY = 0;
//     let totalWeight = 0;

//     for (const point of nearest) {
//         const weight = 1 / (point.distance + 0.02);

//         weightedX += point.targetX * weight;
//         weightedY += point.targetY * weight;
//         totalWeight += weight;
//     }

//     if (totalWeight === 0) {
//         return null;
//     }

//     return {
//         x: 1 - clamp(weightedX / totalWeight, 0, 1),
//         y: clamp(weightedY / totalWeight, 0, 1),
//     };
// }

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

    const gaze = useRef<Gaze | null>(null);

    // smoothQueueRef stores the recent gaze points for moving-average smoothing
    const smoothQueueRef = useRef<Point[]>([]);

    // Smoothing amount:
    // 1 = fastest but jittery
    // 3 = good balance
    // 5 = smoother but more lag
    const SMOOTH_N = 4;

    const calibrationModelRef = useRef<CalibrationModel | null>(null);

    const lastGoodMappedRef = useRef<Point | null>(null);

    useEffect(() => {
        //console.log("context dotCalibrationData:", dotCalibrationData);
        calibrationModelRef.current = buildCalibrationModel(dotCalibrationData);
    }, [dotCalibrationData]);

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
                    if (gaze.current) {
                        gaze.current = { ...gaze.current, hasFace: false };
                        pageCtx.clearRect(0, 0, canvas.width, canvas.height);
                        lipsCtx.clearRect(0, 0, lips.width, lips.height);
                    }
                } else {
                    const landmarks = results.faceLandmarks[0];

                    drawingUtils.drawConnectors(
                        landmarks,
                        FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
                        { color: "blue", lineWidth: 0.3 }
                    );
                    drawingUtils.drawConnectors(
                        landmarks,
                        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
                        { color: "blue", lineWidth: 0.3 }
                    );
                    drawingUtils.drawConnectors(
                        landmarks,
                        FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
                        { color: "blue", lineWidth: 0.3 }
                    );
                    drawingUtils.drawConnectors(
                        landmarks,
                        FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
                        { color: "blue", lineWidth: 0.3 }
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

                    //console.log(leftPoints);

                    const rightPoints: Point[] = RIGHT_IRIS.map((i) => ({
                        x: landmarks[i].x,
                        y: landmarks[i].y,
                    }));

                    //console.log(rightPoints);

                    const leftCenter = avg(leftPoints);
                    const rightCenter = avg(rightPoints);

                    const leftEyeLeftCorner: Point = {
                        x: landmarks[LEFT_EYE_LEFT_CORNER].x,
                        y: landmarks[LEFT_EYE_LEFT_CORNER].y,
                    };

                    const leftEyeRightCorner: Point = {
                        x: landmarks[LEFT_EYE_RIGHT_CORNER].x,
                        y: landmarks[LEFT_EYE_RIGHT_CORNER].y,
                    };

                    const leftEyeTop: Point = {
                        x: landmarks[LEFT_EYE_TOP].x,
                        y: landmarks[LEFT_EYE_TOP].y,
                    };

                    const leftEyeBottom: Point = {
                        x: landmarks[LEFT_EYE_BOTTOM].x,
                        y: landmarks[LEFT_EYE_BOTTOM].y,
                    };

                    const rightEyeLeftCorner: Point = {
                        x: landmarks[RIGHT_EYE_LEFT_CORNER].x,
                        y: landmarks[RIGHT_EYE_LEFT_CORNER].y,
                    };

                    const rightEyeRightCorner: Point = {
                        x: landmarks[RIGHT_EYE_RIGHT_CORNER].x,
                        y: landmarks[RIGHT_EYE_RIGHT_CORNER].y,
                    };

                    const rightEyeTop: Point = {
                        x: landmarks[RIGHT_EYE_TOP].x,
                        y: landmarks[RIGHT_EYE_TOP].y,
                    };

                    const rightEyeBottom: Point = {
                        x: landmarks[RIGHT_EYE_BOTTOM].x,
                        y: landmarks[RIGHT_EYE_BOTTOM].y,
                    };

                    // console.log("right eye top", rightEyeTop);
                    // console.log("right eye bottom", rightEyeBottom);
                    // console.log("right eye right", rightEyeRightCorner);
                    // console.log("right eye left", rightEyeLeftCorner);
                    // console.log("left eye top", leftEyeTop);
                    // console.log("left eye bottom", leftEyeBottom);
                    // console.log("left eye right", leftEyeRightCorner);
                    // console.log("left eye left", leftEyeLeftCorner);

                    const leftRelative = getRelativeIrisPosition(
                        leftCenter,
                        leftEyeLeftCorner,
                        leftEyeRightCorner,
                        leftEyeTop,
                        leftEyeBottom
                    );

                    const rightRelative = getRelativeIrisPosition(
                        rightCenter,
                        rightEyeLeftCorner,
                        rightEyeRightCorner,
                        rightEyeTop,
                        rightEyeBottom
                    );

                    //console.log("left relative", leftRelative);
                    //console.log("right relative", rightRelative);

                    if (leftRelative && rightRelative) {
                        const raw: Point = {
                            x: (leftRelative.x + rightRelative.x) / 2,
                            y: (leftRelative.y + rightRelative.y) / 2,
                        };

                        const leftOpenness = getEyeOpenness(
                            leftEyeTop,
                            leftEyeBottom,
                            leftEyeLeftCorner,
                            leftEyeRightCorner,
                        )

                        const rightOpenness = getEyeOpenness(
                            rightEyeTop,
                            rightEyeBottom,
                            rightEyeLeftCorner,
                            rightEyeRightCorner,
                        )

                        const leftEyeCenterY = getEyeCenterY(
                            leftEyeLeftCorner,
                            leftEyeRightCorner,
                        )

                        const rightEyeCenterY = getEyeCenterY(
                            rightEyeLeftCorner,
                            rightEyeRightCorner,
                        )

                        const eyeCenterY = (leftEyeCenterY + rightEyeCenterY) / 2;
                        const eyeOpenness = (leftOpenness + rightOpenness) / 2;

                        const isBlinking = leftOpenness < 0.2 || rightOpenness < 0.2;
                        const model = calibrationModelRef.current;

                        const gazeForMapping = model ? correctGazeWithEyeShape(
                            raw,
                            eyeCenterY,
                            eyeOpenness,
                            model.baselineEyeCenterY,
                            model.baselineEyeOpenness,
                        ) : raw;

                        const q = smoothQueueRef.current;
                        q.push(gazeForMapping);

                        if (q.length > SMOOTH_N) {
                            q.shift();
                        }

                        const smoothed = avg(q);

                        gaze.current = {
                            x: smoothed.x,
                            y: smoothed.y,
                            hasFace: true,
                            eyeCenterY,
                            eyeOpenness,
                        };

                        if (!caliButton && model) {
                            if (!isBlinking) {
                                const mapped = mapGazeRelative(smoothed, model);
                                lastGoodMappedRef.current = mapped;
                            }

                            if (lastGoodMappedRef.current) {
                                drawDot(pageCtx, lastGoodMappedRef.current.x, lastGoodMappedRef.current.y);
                            }
                        }

                        //console.log("didnt work");
                        //console.log(dotCalibrationData);
                    } else {
                        gaze.current = {
                            x: 0.5,
                            y: 0.5,
                            hasFace: false,
                            eyeCenterY: 0.5,
                            eyeOpenness: 0,
                        }
                    }
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
                    <div className={!caliButton ? "camera-container" : "hide"}>
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
                        <canvas className={!caliButton ? "overlay" : "hide"} ref={overlayRef} />
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