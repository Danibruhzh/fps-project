import { createContext, useState, useContext } from "react";

type CalibrationContextType = {
  caliButton: boolean;
  setCaliButton: React.Dispatch<React.SetStateAction<boolean>>;
};

type CalibrationProviderProps = {
  children: React.ReactNode;
};

const CalibrationContext = createContext<CalibrationContextType | undefined>(undefined);

export const CalibrationProvider = ({ children }: CalibrationProviderProps) => {
  const [caliButton, setCaliButton] = useState(false);

  return (
    <CalibrationContext.Provider value={{ caliButton, setCaliButton }}>
      {children}
    </CalibrationContext.Provider>
  );
};

export const useCalibrationContext = () => {
  return useContext(CalibrationContext);
};