
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
      renameItem : (oldPath : string , newPath : string)=>Promise<boolean>;
      writeFile: (path: string, content: string) => Promise<void>;
      runFile: (filePath: string) => Promise<string>;
      runHtml: (filePath: string) => Promise<string>;
      openInBrowser: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      openExternal: (targetUrl: string) => Promise<{ success: boolean; error?: string }>;
      watchDirectory: (dirPath: string) => Promise<{ success: boolean; error?: string }>;
      stopWatching: (dirPath: string) => Promise<{ success: boolean }>;
      onDirectoryChanged: (callback: (dirPath: string) => void) => () => void;
      deployProject: (
        projectPath: string,
        deploymentOptions?: {
          createRepoIfMissing?: boolean;
          githubAccessToken?: string;
          configureExistingRepo?: boolean;
          deploySubPath?: string;
          projectType?: "node" | "react" | "next";
        }
      ) => Promise<{
        success: boolean;
        url?: string;
        error?: string;
        canCreateRepo?: boolean;
        createdRepo?: boolean;
        clone_url?: string;
        canConfigureDeploy?: boolean;
        configuredDeploy?: boolean;
        deployPath?: string;
        projectType?: string;
        workflowPath?: string;
        commitHash?: string;
        commitBranch?: string;
        commitSkipped?: boolean;
        commitMessage?: string;
        cloudflareTunnel?: unknown;
        githubSecretConfigured?: boolean;
        githubSecretName?: string;
      }>;
    };
  }
}
