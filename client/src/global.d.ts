
export {};

declare global {
  interface Window {
    electronAPI: {
      openFolder: () => Promise<void>;
      openFile: () => Promise<void>;
      cloneRepo: (repoUrl: string) => Promise<void>;
    };
  }
}
