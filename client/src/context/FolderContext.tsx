import React, { createContext, useContext, useEffect, useState } from "react";

interface FolderContextType {
  folderPath: string | null;
  filePath: string | null;
  setFilePath: (path: string | null) => void;
  setFolderPath: (path: string | null) => void;
}

const FolderContext = createContext<FolderContextType | undefined>(undefined);

export const FolderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [folderPath, setFolderPathState] = useState<string | null>(null);
  const [filePath, setFilePathState] = useState<string | null>(null);

  useEffect(() => {
    const savedFolderPath = localStorage.getItem("selectedFolder");
    const savedFilePath = localStorage.getItem("selectedFile");
    if (savedFolderPath) {
      setFolderPathState(savedFolderPath);
    }
    if(savedFilePath){
      setFilePathState(savedFilePath);
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
  const setFilePath = (path: string | null) => {
    setFilePathState(path);
    if (path) {
      localStorage.setItem("selectedFile", path);
    } else {
      localStorage.removeItem("selectedFile");
    }
  };

  return (
    <FolderContext.Provider value={{ folderPath, setFolderPath ,filePath , setFilePath}}>
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
