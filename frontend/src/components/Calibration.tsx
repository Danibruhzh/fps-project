import { useState } from "react";
import { useCalibrationContext } from "../context/context";
import "./Calibration.css";

type Gaze = {
    x: number;
    y: number;
    hasFace: boolean;
};

type CalibrationPoint = {
    targetX: number;
    targetY: number;
    gazeX: number;
    gazeY: number;
};

const DOT_POSITIONS = [
    { x: 0.05, y: 0.05 },
    { x: 0.5, y: 0.05 },
    { x: 0.95, y: 0.05 },
    { x: 0.05, y: 0.5 },
    { x: 0.5, y: 0.5 },
    { x: 0.95, y: 0.5 },
    { x: 0.05, y: 0.95 },
    { x: 0.5, y: 0.95 },
    { x: 0.95, y: 0.95 },
] as const;

type Props = {
    gaze: React.RefObject<Gaze | null>;
};

function Calibration({ gaze }: Props) {
    const calibrationContext = useCalibrationContext();

    if (!calibrationContext) {
        throw new Error("Calibration must be used inside CalibrationProvider");
    }

    const { setCaliButton } = calibrationContext;

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
        };
    }

    function handleConfirm() {
        console.log("click!");
        const point = buildCalibrationPoint();

        if (!point) return;

        setCalibrationData((prevData) => {
            const updatedData = [...prevData, point];
            
            
            console.log("updatedData");
            console.log(updatedData);
            return updatedData;
        });

        if (isLastDot) {
            console.log("Calibration complete");
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