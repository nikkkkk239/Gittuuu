
const {contextBridge , ipcRenderer} = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  cloneRepo: (url) => ipcRenderer.invoke("git:clone", url),
});
