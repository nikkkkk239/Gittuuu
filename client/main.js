import { app, BrowserWindow ,systemPreferences,ipcMain, dialog,session ,Menu} from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import simpleGit from "simple-git";
import fs from "fs";
import { spawn } from "child_process";

if (process.platform === "darwin") {
  systemPreferences.askForMediaAccess("screen"); 
}


ipcMain.handle("run-file", async (_event, filePath) => {
  return new Promise((resolve, reject) => {
    const ext = path.extname(filePath).toLowerCase();
    let cmd;
    let args= [];

    switch (ext) {
      case ".js":
        cmd = "node";
        args = [filePath];
        break;
      case ".ts":
        cmd = "ts-node"; // make sure ts-node installed globally or in project
        args = [filePath];
        break;
      case ".py":
        cmd = "python";
        args = [filePath];
        break;
      case ".java":
        cmd = "javac";
        args = [filePath];
        break;
      case ".cpp":
      case ".c":
        cmd = "g++";
        args = [filePath, "-o", `${filePath}.out`];
        break;
      default:
        return reject(new Error("Unsupported file type"));
    }

    const process = spawn(cmd, args, { shell: true });

    let output = "";
    process.stdout.on("data", (data) => {
      output += data.toString();
    });

    process.stderr.on("data", (data) => {
      output += data.toString();
    });

    process.on("close", (code) => {
      if (ext === ".cpp" || ext === ".c") {
        // run compiled output
        const runProcess = spawn(`${filePath}.out`, { shell: true });
        let runOutput = "";
        runProcess.stdout.on("data", (d) => (runOutput += d.toString()));
        runProcess.stderr.on("data", (d) => (runOutput += d.toString()));
        runProcess.on("close", () => resolve(runOutput));
      } else if (ext === ".java") {
        // run Java class
        const className = path.basename(filePath, ".java");
        const runProcess = spawn("java", [className], { cwd: path.dirname(filePath), shell: true });
        let runOutput = "";
        runProcess.stdout.on("data", (d) => (runOutput += d.toString()));
        runProcess.stderr.on("data", (d) => (runOutput += d.toString()));
        runProcess.on("close", () => resolve(runOutput));
      } else {
        resolve(output);
      }
    });

    process.on("error", (err) => reject(err));
  });
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


