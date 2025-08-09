import React, { createContext, useContext, useEffect, useState } from "react";

interface FolderContextType {
  folderPath: string | null;
  setFolderPath: (path: string | null) => void;
}

const FolderContext = createContext<FolderContextType | undefined>(undefined);

export const FolderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [folderPath, setFolderPathState] = useState<string | null>(null);

  useEffect(() => {
    const savedPath = localStorage.getItem("selectedFolder");
    if (savedPath) {
      setFolderPathState(savedPath);
    }
  }, []);

  const setFolderPath = (path: string | null) => {
    setFolderPathState(path);
    if (path) {
      localStorage.setItem("selectedFolder", path);
    } else {
      localStorage.removeItem("selectedFolder");
    }
  };

  return (
    <FolderContext.Provider value={{ folderPath, setFolderPath }}>
      {children}
    </FolderContext.Provider>
  );
};

export const useFolder = (): FolderContextType => {
  const context = useContext(FolderContext);
  if (!context) {
    throw new Error("useFolder must be used within a FolderProvider");
  }
  return context;
};
