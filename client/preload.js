
const {contextBridge , ipcRenderer} = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  cloneRepo: (url) => ipcRenderer.invoke("git:clone", url),
  signUserOut : ()=>ipcRenderer.invoke("logout"),
  readDirectory: (path) => ipcRenderer.invoke("fs:readDirectory", path),
  readFile: (path) => ipcRenderer.invoke("fs:readFile", path),
  onFolderSelected: (callback) => ipcRenderer.on("folder-selected", (_, folderPath) => callback(folderPath)),
  onFileSelected: (callback) => ipcRenderer.on("file-selected", (_, filePath) => callback(filePath)),
  addFile: (path, content) => ipcRenderer.invoke("add-file", path, content),
  addFolder: (path) => ipcRenderer.invoke("add-folder", path),
  saveFile: (path, content) => ipcRenderer.invoke("fs:saveFile", path, content),
  deleteItem : (path) =>ipcRenderer.invoke("fs:delete" , path),
  renameItem : ( oldPath,newPath)=>ipcRenderer.invoke("fs:rename" , oldPath , newPath),
  writeFile: (path, content) => ipcRenderer.invoke("write-file", path, content),
  
  // Run/Execute files
  openInBrowser: (filePath) => ipcRenderer.invoke("run:openInBrowser", filePath),
  openExternal: (targetUrl) => ipcRenderer.invoke("run:openExternal", targetUrl),
  
  // File system watching
  watchDirectory: (dirPath) => ipcRenderer.invoke("fs:watchDirectory", dirPath),
  stopWatching: (dirPath) => ipcRenderer.invoke("fs:stopWatching", dirPath),
  onDirectoryChanged: (callback) => {
    ipcRenderer.on("fs:directory-changed", (_, dirPath) => callback(dirPath));
    return () => ipcRenderer.removeAllListeners("fs:directory-changed");
  },
  deployProject: (projectPath, deploymentOptions = {}) => ipcRenderer.invoke("deploy:project", projectPath, deploymentOptions),
  deployGetLogs: (logsUrl, tail = 200) => ipcRenderer.invoke("deploy:getLogs", logsUrl, tail),
  
  // Terminal APIs
  terminal: {
    create: () => ipcRenderer.invoke("terminal:create"),
    execute: (terminalId, command, cwd) => ipcRenderer.invoke("terminal:execute", terminalId, command, cwd),
    chdir: (terminalId, newDir) => ipcRenderer.invoke("terminal:chdir", terminalId, newDir),
    getCwd: (terminalId) => ipcRenderer.invoke("terminal:getcwd", terminalId),
    close: (terminalId) => ipcRenderer.invoke("terminal:close", terminalId),
    write: (terminalId, data) => ipcRenderer.invoke("terminal:write", terminalId, data),
    isRunning: (terminalId) => ipcRenderer.invoke("terminal:isRunning", terminalId),
    onOutput: (callback) => {
      const subscription = (_, terminalId, data) => callback(terminalId, data);
      ipcRenderer.on("terminal:output", subscription);
      return () => ipcRenderer.removeListener("terminal:output", subscription);
    },
    onProcessEnded: (callback) => {
      const subscription = (_, terminalId) => callback(terminalId);
      ipcRenderer.on("terminal:process-ended", subscription);
      return () => ipcRenderer.removeListener("terminal:process-ended", subscription);
    },
    // Deployment
    

  }
});
