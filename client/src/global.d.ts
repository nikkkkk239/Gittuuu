
export {};

declare global {
  interface Window {
    electronAPI: {
      openFolder: () => Promise<string|null>;
      openFile: () => Promise<string|null>;
      cloneRepo: (repoUrl: string) => Promise<string|null>;
      signUserOut : ()=>void;
      readDirectory: (dirPath: string) => Promise<
        { name: string; path: string; isDirectory: boolean }[]
      >;
      readFile: (filePath: string) => Promise<string>;
      onFolderSelected: (callback: (folderPath: string) => void) => void;
      onFileSelected: (callback: (filePath: string) => void) => void;
      addFile : (newFilePath : string , content: string)=>Promise<boolean>;
      addFolder : (newFolderPath : string)=>Promise<boolean>;
      deleteItem : (itemPath : string)=>Promise<boolean>;
    };
  }
}
