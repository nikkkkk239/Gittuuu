
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
});
