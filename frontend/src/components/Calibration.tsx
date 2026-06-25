import { useState, useEffect, useRef } from "react";
import { useCalibrationContext } from "../context/context";
import "./Calibration.css";

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

const M = 20; // margin in px from each edge
const W = window.innerWidth;
const H = window.innerHeight;
const mx = M / W; // normalized x margin
const my = M / H; // normalized y margin

const DOT_POSITIONS = [
    { x: mx,      y: my      },
    { x: 0.5,     y: my      },
    { x: 1 - mx,  y: my      },
    { x: mx,      y: 0.5     },
    { x: 0.5,     y: 0.5     },
    { x: 1 - mx,  y: 0.5     },
    { x: mx,      y: 1 - my  },
    { x: 0.5,     y: 1 - my  },
    { x: 1 - mx,  y: 1 - my  },
];

const COLLECT_MS = 200;
const SAMPLE_INTERVAL_MS = 33;

type Props = {
    gaze: React.RefObject<Gaze | null>;
};

function Calibration({ gaze }: Props) {
    const calibrationContext = useCalibrationContext();
    const { setCaliButton, setDotCalibrationData } = calibrationContext!;

    const [currentDot, setCurrentDot] = useState(0);
    const [calibrationData, setCalibrationData] = useState<CalibrationPoint[]>([]);
    const [errorMessage, setErrorMessage] = useState("");
    const [isCollecting, setIsCollecting] = useState(false);
    const samplesRef = useRef<{ x: number; y: number; eyeCenterY: number; eyeOpenness: number }[]>([]);

    const dot = DOT_POSITIONS[currentDot];
    const isLastDot = currentDot === DOT_POSITIONS.length - 1;

    function handleConfirm() {
        if (isCollecting) return;

        const currentGaze = gaze.current;
        if (!currentGaze) {
            setErrorMessage("No gaze data available yet.");
            return;
        }
        if (!currentGaze.hasFace) {
            setErrorMessage("Face not detected. Look at the camera and try again.");
            return;
        }

        setErrorMessage("");
        setIsCollecting(true);
    }

    useEffect(() => {
        if (!isCollecting) return;

        samplesRef.current = [];

        const intervalId = setInterval(() => {
            const g = gaze.current;
            if (g && g.hasFace) {
                samplesRef.current.push({
                    x: g.x, y: g.y,
                    eyeCenterY: g.eyeCenterY, eyeOpenness: g.eyeOpenness,
                });
            }
        }, SAMPLE_INTERVAL_MS);

        const timeoutId = setTimeout(() => {
            clearInterval(intervalId);
            setIsCollecting(false);

            const samples = samplesRef.current;
            if (samples.length === 0) {
                setErrorMessage("No valid samples collected. Try again.");
                return;
            }

            const n = samples.length;
            const point: CalibrationPoint = {
                targetX: dot.x,
                targetY: dot.y,
                gazeX: samples.reduce((s, p) => s + p.x, 0) / n,
                gazeY: samples.reduce((s, p) => s + p.y, 0) / n,
                eyeCenterY: samples.reduce((s, p) => s + p.eyeCenterY, 0) / n,
                eyeOpenness: samples.reduce((s, p) => s + p.eyeOpenness, 0) / n,
            };

            console.log(`Dot ${currentDot}: averaged ${n} samples`);

            const updated = [...calibrationData, point];
            setCalibrationData(updated);

            if (isLastDot) {
                setDotCalibrationData((prev) => [...prev, ...updated]);
                setCaliButton(false);
            } else {
                setCurrentDot((d) => d + 1);
            }
        }, COLLECT_MS);

        return () => {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
        };
    }, [isCollecting]);

    return (
        <div className="calibration-overlay">
            <div
                className="calibration-dot"
                style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }}
            />

            <div className="calibration-controls">
                <button className="calibration-btn" onClick={handleConfirm} disabled={isCollecting}>
                    {isCollecting ? "Collecting..." : isLastDot ? "Finish" : "Confirm"}
                </button>

                {errorMessage && <p className="calibration-error">{errorMessage}</p>}

                <p className="calibration-count">
                    Collected {calibrationData.length} / {DOT_POSITIONS.length}
                </p>
            </div>
        </div>
    );
}

export default Calibration;