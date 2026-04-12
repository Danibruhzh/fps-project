import { createContext, useState, useContext } from "react";

type CalibrationPoint = {
    targetX: number;
    targetY: number;
    gazeX: number;
    gazeY: number;
};

type CalibrationContextType = {
  caliButton: boolean;
  setCaliButton: React.Dispatch<React.SetStateAction<boolean>>;
  dotCalibrationData: CalibrationPoint[];
  setDotCalibrationData: React.Dispatch<React.SetStateAction<CalibrationPoint[]>>;
};

type CalibrationProviderProps = {
  children: React.ReactNode;
};

const CalibrationContext = createContext<CalibrationContextType | undefined>(undefined);

export const CalibrationProvider = ({ children }: CalibrationProviderProps) => {
  const [caliButton, setCaliButton] = useState(false);
  const [dotCalibrationData, setDotCalibrationData] = useState<CalibrationPoint[]>([]);

  return (
    <CalibrationContext.Provider value={{ caliButton, setCaliButton, dotCalibrationData, setDotCalibrationData }}>
      {children}
    </CalibrationContext.Provider>
  );
};

export const useCalibrationContext = () => {
  return useContext(CalibrationContext);
};