import { useState, useEffect } from "react";
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

type Props = {
    gaze: React.RefObject<Gaze | null>;
};

function Calibration({ gaze }: Props) {
    const calibrationContext = useCalibrationContext();
    const { setCaliButton, setDotCalibrationData, dotCalibrationData } = calibrationContext!;

    const [currentDot, setCurrentDot] = useState<number>(0);
    const [calibrationData, setCalibrationData] = useState<CalibrationPoint[]>([]);
    const [errorMessage, setErrorMessage] = useState<string>("");

    const dot = DOT_POSITIONS[currentDot];
    const isLastDot = currentDot === DOT_POSITIONS.length - 1;

    function buildCalibrationPoint(): CalibrationPoint | null {
        const currentGaze = gaze.current;

        if (!currentGaze) {
            setErrorMessage("No gaze data available yet.");
            return null;
        }

        if (!currentGaze.hasFace) {
            setErrorMessage("Face not detected. Look at the camera and try again.");
            return null;
        }

        setErrorMessage("");

        return {
            targetX: dot.x,
            targetY: dot.y,
            gazeX: currentGaze.x,
            gazeY: currentGaze.y,
            eyeCenterY: currentGaze.eyeCenterY,
            eyeOpenness: currentGaze.eyeOpenness,
        };
    }


    function handleConfirm() {
        console.log("click!");
        const point = buildCalibrationPoint();

        if (!point) return;
        const updatedData = [...calibrationData, point];
        console.log("updatedData");
        console.log(updatedData);


        setCalibrationData(updatedData); // technically we dont really need calibrationData
        // but it is a buffer

        if (isLastDot) {
            console.log("Calibration complete");
            setDotCalibrationData((prev) => [...prev, ...updatedData]);
            setCaliButton(false);
            return;
        }

        setCurrentDot((prevDot) => prevDot + 1);

        console.log("calibrationData");
        console.log(calibrationData);
    }

    return (
        <div className="calibration-overlay">
            <div
                className="calibration-dot"
                style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }}
            />

            <div className="calibration-controls">
                <button className="calibration-btn" onClick={handleConfirm}>
                    {isLastDot ? "Finish" : "Confirm"}
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