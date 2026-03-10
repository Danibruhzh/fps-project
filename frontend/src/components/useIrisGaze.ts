import { useEffect, useRef, useState } from "react";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

type Point = { x: number; y: number };

type Gaze = {
    x: number;
    y: number;
    hasFace: boolean;
};

const LEFT_IRIS = [468, 469, 470, 471, 472];
const RIGHT_IRIS = [473, 474, 475, 476, 477];

function avg(points: Point[]): Point {
    let sx = 0;
    let sy = 0;
    for (const p of points) {
        sx += p.x;
        sy += p.y;
    }
    return { x: sx / points.length, y: sy / points.length };
}

export function useIrisGaze(video: HTMLVideoElement | null) {
    const gaze = useRef<Gaze>({ x: 0.5, y: 0.5, hasFace: false });

    // holds landmarker instance across renders
    const landmarkerRef = useRef<any>(null);

    // prevent doing inference multiple times on the same frame
    const lastVideoTimeRef = useRef<number>(-1);

    // smoothing queue: takes last N points for moving average
    const smoothQueueRef = useRef<Point[]>([]);
    const SMOOTH_N = 5;

    useEffect(() => {
        if (!video) return;

        let cancelled = false;
        let rafId = 0;

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

            if (cancelled){
                if (landmarker?.close) landmarker.close();
                return;
            }

            landmarkerRef.current = landmarker;

            const loop = () => {
                if (cancelled) return;
                if (!video) return;

                const lm = landmarkerRef.current;
                if (!lm){
                    rafId = requestAnimationFrame(loop);
                    return;
                }

                if (video.currentTime === lastVideoTimeRef.current){
                    rafId = requestAnimationFrame(loop);
                    return;
                }
                lastVideoTimeRef.current = video.currentTime;

                const nowMs = performance.now();
                const result = lm.detectForVideo(video, nowMs);

                if (!result?.faceLandmarks?.length){
                    gaze.current = { ...gaze.current, hasFace: false };
                    rafId = requestAnimationFrame(loop);
                    return;
                }

                const pts = result.faceLandmarks[0] as Point[];

                const left = LEFT_IRIS.map((i) => ({ x: pts[i].x, y: pts[i].y }));
                const right = RIGHT_IRIS.map((i) => ({ x: pts[i].x, y: pts[i].y }));

                const left_avg = avg(left);
                const right_avg = avg(right);

                // raw pupil proxy (average of both iris centers)
                const raw: Point = { x: (left_avg.x + right_avg.x) / 2, y: (left_avg.y + right_avg.y) / 2 };
                //console.log(raw);

                // moving average smoothing
                const q = smoothQueueRef.current;
                q.push(raw);
                if (q.length > SMOOTH_N) q.shift();
                const sm = avg(q);

                gaze.current = { x: sm.x, y: sm.y, hasFace: true};
                console.log(gaze.current);

                rafId = requestAnimationFrame(loop);
            };

            rafId = requestAnimationFrame(loop);
        }

        init();

        return () => {
            cancelled = true;
            cancelAnimationFrame(rafId);
            const lm = landmarkerRef.current;
            if (lm?.close) {
                lm.close();
            }
            landmarkerRef.current = null;
        };
    }, [video]);

    return gaze.current;
}