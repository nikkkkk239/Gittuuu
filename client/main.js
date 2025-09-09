import { app, BrowserWindow ,systemPreferences,ipcMain, dialog,session ,Menu} from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import simpleGit from "simple-git";
import fs from "fs";
import { spawn } from "child_process";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);


if (process.platform === "darwin") {
  systemPreferences.askForMediaAccess("screen"); 
}

// Run a single file inside Docker and return combined stdout+stderr
ipcMain.handle("run-file", async (_, filePath) => {
  if (!filePath) throw new Error("No file path supplied");

  // quick docker availability check
  try {
    await execPromise("docker --version");
  } catch (err) {
    throw new Error("Docker not found or not running. Install & start Docker Desktop.");
  }

  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  let dockerCmd = "";

  if (ext === ".cpp" || ext === ".cc" || ext === ".c") {
    // compile inside container to /tmp/app (so host dir doesn't get a binary)
    dockerCmd = `docker run --rm -v "${dir}:/workspace" -w /workspace gcc:latest bash -lc "g++ \\"${base}\\" -o /tmp/app && /tmp/app"`;
  } else if (ext === ".py") {
    dockerCmd = `docker run --rm -v "${dir}:/workspace" -w /workspace python:3.10 python3 "${base}"`;
  } else if (ext === ".js") {
    dockerCmd = `docker run --rm -v "${dir}:/workspace" -w /workspace node:18 node "${base}"`;
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  try {
    // increase buffer in case the output is large
    const { stdout, stderr } = await execPromise(dockerCmd, { maxBuffer: 10 * 1024 * 1024 });
    // prefer stdout then stderr
    return (stdout || "") + (stderr || "");
  } catch (err) {
    // execPromise errors often contain stdout/stderr — return that to the renderer for debugging
    const stdout = err.stdout || "";
    const stderr = err.stderr || err.message || "";
    // provide useful message
    return stdout + stderr + `\n--- command failed: ${err.message || "error"} ---`;
  }
});


ipcMain.handle("dialog:openFolder", async () => {
  console.log("Opening folder dialog...");
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  console.log("Folder selected:", result.filePaths[0]);
  return result.filePaths[0];
});

ipcMain.handle("dialog:openFile", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openFile"] });
  return result.filePaths[0];
});

ipcMain.handle("git:clone", async (_, repoUrl) => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.filePaths.length > 0) {
    const git = simpleGit();
    await git.clone(repoUrl, result.filePaths[0]);
    return "Cloned successfully";
  }
});
ipcMain.handle("logout",async()=>{
  await session.defaultSession.clearStorageData({
    storages: ["cookies", "localstorage", "cachestorage"]
  });
})

ipcMain.handle("fs:delete", async (_, targetPath) => {
  console.log("Deleting:", targetPath);

  fs.rmSync(targetPath, { recursive: true, force: true });
  return true;
});

ipcMain.handle("write-file", async (event, filePath, content) => {
  try {
    await fs.promises.writeFile(filePath, content, "utf-8");
    return { success: true };
  } catch (error) {
    console.error("Error writing file:", error);
    throw error;
  }
});

ipcMain.handle("fs:rename", async (_, oldPath, newPath) => {
  fs.renameSync(oldPath, newPath);
  return true;
});


ipcMain.handle("fs:saveFile", async (_, filePath, content) => {
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
});


ipcMain.handle("fs:readDirectory", async (event, dirPath) => {
  try {
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return files
      .filter(f => !f.name.startsWith(".")) // skip hidden
      .map(f => ({
        name: f.name,
        path: path.join(dirPath, f.name),
        isDirectory: f.isDirectory()
      }));
  } catch (err) {
    console.error("readDirectory failed:", err);
    throw err;
  }
});





ipcMain.handle("add-file", async (_, filePath, content) => {
  fs.writeFileSync(filePath, content || "");
  return true;
});

ipcMain.handle("add-folder", async (_,folderPath) => {
  fs.mkdirSync(folderPath, { recursive: true });
  return true;
});

ipcMain.handle("fs:readFile", async (_, filePath) => {
  return fs.readFileSync(filePath, "utf-8");
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const startURL =
    process.env.VITE_DEV_SERVER_URL ||
    `file://${path.join(__dirname, 'dist', 'index.html')}`;

  win.loadURL(startURL);
  console.log("START URL - ",startURL);
  const menuTemplate = [
  {
    label: "File",
    submenu: [
      {
        label: "Open Folder",
        click: async () => {
          const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            properties: ["openDirectory"],
          });
          if (!canceled && filePaths.length > 0) {
            win.webContents.send("folder-selected", filePaths[0]);
          }
        },
      },
      {
        label: "Open File",
        click: async () => {
          const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            properties: ["openFile"],
          });
          if (!canceled && filePaths.length > 0) {
            win.webContents.send("file-selected", filePaths[0]);
          }
        },
      },
      { type: "separator" },
      { role: "quit" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
    ],
  },
  {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" }, // <- This adds the Developer Tools toggle
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  },
];


  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);



}

app.whenReady().then(createWindow);


