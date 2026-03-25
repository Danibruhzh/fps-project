import { createContext, useContext, useState } from "react";

type CalibrationContextType = {
    caliButton: boolean;
    setCaliButton: React.Dispatch<React.SetStateAction<boolean>>;
};

const CalibrationContext = createContext<CalibrationContextType | undefined>(undefined);

export function CalibrationProvider({ children }: { children: React.ReactNode }) {
    const [caliButton, setCaliButton] = useState<boolean>(true);

    return (
        <CalibrationContext.Provider value={{ caliButton, setCaliButton }}>
            {children}
        </CalibrationContext.Provider>
    );
}

export function useCalibration() {
    const context = useContext(CalibrationContext);

    if (!context) {
        throw new Error("useCalibration must be used inside a CalibrationProvider");
    }

    return context;
}