import { app, shell, BrowserWindow, ipcMain, dialog, session, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import simpleGit from "simple-git";
import fs from "fs";
import FormData from "form-data"
import { spawn,execSync } from "child_process";
import archiver from 'archiver';
import axios from 'axios';

// Removed screen recording permission request as it's not needed

// Store active terminal processes
const terminalProcesses = new Map();
// Store active running processes per terminal (for stdin input)
const runningProcesses = new Map();

// Store file system watchers
const fsWatchers = new Map();
const fsWatcherDebounceTimers = new Map();
let mainWindow = null;

function validateProject(projectPath) {
  const pkgPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(pkgPath))
    return { valid: false, message: "No package.json found. Not a deployable project." };

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  const isCRA = !!deps["react-scripts"];
  const isVite = !!deps["vite"];
  const isNext = !!deps["next"];
  const isExpress = !!deps["express"];
  const isNodeBackend = isExpress || (!isCRA && !isVite && !isNext);

  // Determine project category
  const isFrontend = isCRA || isVite || isNext;
  const isBackend = isNodeBackend;

  if (!isFrontend && !isBackend)
    return { valid: false, message: "Unsupported project type." };

  const hasClient = fs.existsSync(path.join(projectPath, "client"));
  const hasServer = fs.existsSync(path.join(projectPath, "server"));
  if (hasClient && hasServer)
    return { valid: false, message: "Fullstack folder detected. Open either /client or /server and deploy separately." };

  return {
    valid: true,
    type: isCRA ? "react" : isVite ? "vite" : isNext ? "nextjs" : "nodejs",
    category: isFrontend ? "frontend" : "backend",
    deploymentPlatform: isFrontend ? "vercel" : "railway"
  };
}

async function zipProject(projectPath ){
  const zipPath = path.join(projectPath, "../project.zip");
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip" , {zlib:{level:9}});

  return new Promise((resolve , reject)=>{
    archive.directory( projectPath , false).pipe(output);
    output.on("close" , ()=>{ resolve(zipPath);  });
    archive.on("error" , (err)=>{ reject(err); });
    archive.finalize();
  });
}



ipcMain.handle("deploy:project", async (_, projectPath, deploymentOptions = {}) => {
  try {
    const check = validateProject(projectPath);
    if (!check.valid) return { success: false, error: check.message };

    const {
      platform = check.deploymentPlatform, // 'vercel', 'railway', or 'local'
      projectName = path.basename(projectPath),
      buildBeforeDeploy = true
    } = deploymentOptions;

    // For frontend projects, build first
    if (check.category === "frontend" && buildBeforeDeploy) {
      console.log("Installing dependencies...");
      execSync("npm install", { cwd: projectPath, stdio: "inherit" });
      
      console.log("Building project...");
      execSync("npm run build", { cwd: projectPath, stdio: "inherit" });

      // Detect build output folder
      let buildDir = {
        react: "build",
        vite: "dist",
        nextjs: ".next"
      }[check.type];

      const buildPath = path.join(projectPath, buildDir);
      if (!fs.existsSync(buildPath))
        return { success: false, error: "Build failed, output folder not found." };
    }

    // Zip the entire project (not just build folder for Docker support)
    const zipPath = await zipProject(projectPath);

    // Send ZIP to server with deployment platform info
    const formData = new FormData();
    formData.append("file", fs.createReadStream(zipPath));
    formData.append("deploymentType", platform);
    formData.append("projectType", check.category);
    formData.append("projectName", projectName);
    formData.append("frameworkType", check.type);

    const endpoint = platform === "local" 
      ? "http://localhost:3000/deploy/local"
      : "http://localhost:3000/deploy";

    console.log(`Deploying to ${platform}...`);
    const response = await axios.post(endpoint, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    // Cleanup zip file
    fs.unlinkSync(zipPath);

    return {
      ...response.data,
      projectType: check.type,
      deploymentPlatform: platform
    };
  } catch (error) {
    console.error("Error deploying project:", error);
    return {
      success: false,
      error: error.message,
      details: error.response?.data
    };
  }
});

// New handler to check deployment service health
ipcMain.handle("deploy:checkHealth", async () => {
  try {
    const response = await axios.get("http://localhost:3000/health");
    return response.data;
  } catch (error) {
    return {
      status: "error",
      message: "Deployment server not running",
      error: error.message
    };
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

// Open file in external application (browser for HTML, etc.)
ipcMain.handle("run:openInBrowser", async (_, filePath) => {
  try {
    // Use Electron's shell to open HTML files in default browser
    // shell.openExternal opens URLs/files in the default application
    await shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    console.error("Error opening file in browser:", err);
    return { success: false, error: err.message };
  }
});

// -------------------- Terminal Handlers --------------------
let terminalIdCounter = 0;

// Execute a single command
ipcMain.handle("terminal:execute", async (event, terminalId, command, cwd) => {
  return new Promise((resolve) => {
    // Get the terminal's current working directory
    const terminal = terminalProcesses.get(terminalId);
    const actualCwd = terminal ? terminal.cwd : (cwd || process.cwd());
    
    console.log(`[Terminal ${terminalId}] Executing command: "${command}" in directory: ${actualCwd}`);
    
    // Kill any existing process for this terminal
    if (runningProcesses.has(terminalId)) {
      const oldProc = runningProcesses.get(terminalId);
      if (oldProc && !oldProc.killed) {
        oldProc.kill();
      }
      runningProcesses.delete(terminalId);
    }
    
    // Use user's default shell on Unix systems for better compatibility
    // On macOS, default is zsh, but fallback to bash if SHELL is not set
    const shell = process.platform === "win32" 
      ? "powershell.exe" 
      : (process.env.SHELL || "/bin/zsh");
    const shellArgs = process.platform === "win32" ? ["-Command", command] : ["-c", command];
    
    // Use shell: false when explicitly providing shell and args
    // This ensures the command is properly parsed by bash, supporting pipes, redirects, etc.
    const proc = spawn(shell, shellArgs, {
      cwd: actualCwd,
      env: process.env,
      shell: false,  // Explicit shell handling, no wrapper needed
      stdio: ['pipe', 'pipe', 'pipe']  // Explicitly set stdin, stdout, stderr to pipes
    });
    
    // Store the process for stdin input
    runningProcesses.set(terminalId, proc);
    
    // Keep stdin open and handle errors
    proc.stdin.on('error', (err) => {
      console.error(`[Terminal ${terminalId}] Stdin error:`, err);
    });
    
    let output = "";
    
    proc.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      event.sender.send("terminal:output", terminalId, text);
    });
    
    proc.stderr.on("data", (data) => {
      const text = data.toString();
      output += text;
      event.sender.send("terminal:output", terminalId, text);
    });
    
    proc.on("close", (code) => {
      runningProcesses.delete(terminalId);
      event.sender.send("terminal:process-ended", terminalId);
      resolve({ output, exitCode: code });
    });
    
    proc.on("error", (err) => {
      runningProcesses.delete(terminalId);
      event.sender.send("terminal:process-ended", terminalId);
      const errorMsg = `Error: ${err.message}\n`;
      event.sender.send("terminal:output", terminalId, errorMsg);
      resolve({ output: output + errorMsg, exitCode: 1 });
    });
  });
});

// Create a new terminal session
ipcMain.handle("terminal:create", () => {
  const id = terminalIdCounter++;
  terminalProcesses.set(id, {
    cwd: process.cwd(),
    history: []
  });
  return { id, cwd: process.cwd() };
});

// Change directory for a terminal session
ipcMain.handle("terminal:chdir", (_, terminalId, newDir) => {
  console.log(`[Terminal ${terminalId}] Attempting to change directory to:`, newDir);
  const terminal = terminalProcesses.get(terminalId);
  if (terminal) {
    try {
      console.log(`[Terminal ${terminalId}] Current cwd:`, terminal.cwd);
      
      // Resolve the path relative to current directory
      let targetDir = newDir.trim();
      const currentCwd = terminal.cwd;
      
      // Handle empty string or "~" (home directory)
      if (!targetDir || targetDir === "~") {
        targetDir = process.env.HOME || process.env.USERPROFILE || currentCwd;
      }
      // Handle home directory with path (e.g., "~/Documents")
      else if (targetDir.startsWith("~/")) {
        const home = process.env.HOME || process.env.USERPROFILE || "";
        if (home) {
          targetDir = path.join(home, targetDir.slice(2));
        }
      }
      // Use path.resolve to handle relative paths, .., ., etc.
      else {
        // Resolve relative to current working directory
        targetDir = path.resolve(currentCwd, targetDir);
      }
      
      // Normalize the path (resolve .. and . components)
      targetDir = path.normalize(targetDir);
      
      console.log(`[Terminal ${terminalId}] Resolved path:`, targetDir);
      
      // Verify directory exists
      const exists = fs.existsSync(targetDir);
      const isDir = exists ? fs.statSync(targetDir).isDirectory() : false;
      console.log(`[Terminal ${terminalId}] Path exists:`, exists, "Is directory:", isDir);
      
      if (exists && isDir) {
        terminal.cwd = targetDir;
        console.log(`[Terminal ${terminalId}] Successfully changed to:`, targetDir);
        return { success: true, cwd: targetDir };
      } else {
        console.log(`[Terminal ${terminalId}] Failed: Directory not found`);
        return { success: false, error: "Directory not found" };
      }
    } catch (err) {
      console.log(`[Terminal ${terminalId}] Error:`, err.message);
      return { success: false, error: err.message };
    }
  }
  console.log(`[Terminal ${terminalId}] Terminal session not found`);
  return { success: false, error: "Terminal not found" };
});

// Get current working directory for a terminal
ipcMain.handle("terminal:getcwd", (_, terminalId) => {
  const terminal = terminalProcesses.get(terminalId);
  return terminal ? terminal.cwd : process.cwd();
});

// Close terminal session
ipcMain.handle("terminal:close", (_, terminalId) => {
  // Kill any running process
  if (runningProcesses.has(terminalId)) {
    const proc = runningProcesses.get(terminalId);
    if (proc && !proc.killed) {
      proc.kill();
    }
      runningProcesses.delete(terminalId);
  }
  terminalProcesses.delete(terminalId);
  return true;
});

// Send input to running process
ipcMain.handle("terminal:write", (_, terminalId, data) => {
  const proc = runningProcesses.get(terminalId);
  console.log(`[Terminal ${terminalId}] Writing to stdin:`, JSON.stringify(data), "Process:", proc ? "exists" : "null", proc && !proc.killed ? "alive" : "dead");
  
  if (proc && !proc.killed) {
    try {
      // Check if stdin is writable before writing
      if (proc.stdin && proc.stdin.writable && !proc.stdin.destroyed) {
        const success = proc.stdin.write(data);
        if (!success) {
          // Wait for drain if buffer is full
          proc.stdin.once('drain', () => {
            console.log(`[Terminal ${terminalId}] Stdin drained`);
          });
        }
        console.log(`[Terminal ${terminalId}] Successfully wrote to stdin`);
        return { success: true };
      } else {
        console.log(`[Terminal ${terminalId}] Stdin not writable`);
        return { success: false, error: "Stdin not writable" };
      }
    } catch (err) {
      console.error(`[Terminal ${terminalId}] Write error:`, err);
      return { success: false, error: err.message };
    }
  }
  console.log(`[Terminal ${terminalId}] No active process`);
  return { success: false, error: "No active process" };
});

// Check if process is running
ipcMain.handle("terminal:isRunning", (_, terminalId) => {
  const proc = runningProcesses.get(terminalId);
  return { isRunning: !!(proc && !proc.killed) };
});

// File system watching
ipcMain.handle("fs:watchDirectory", (_, dirPath) => {
  // Stop existing watcher for this directory if any
  if (fsWatchers.has(dirPath)) {
    fsWatchers.get(dirPath).close();
    fsWatchers.delete(dirPath);
  }
  
  // Skip if directory doesn't exist
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return { success: false, error: "Directory not found" };
  }
  
  try {
    // Watch directory for changes (recursive watching on macOS/Linux)
    const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      // Only process if we have a window and filename exists
      if (mainWindow && filename) {
        // Clear existing debounce timer for this directory
        if (fsWatcherDebounceTimers.has(dirPath)) {
          clearTimeout(fsWatcherDebounceTimers.get(dirPath));
        }
        
        // Debounce: wait 300ms after last change before sending event
        const timer = setTimeout(() => {
          mainWindow.webContents.send("fs:directory-changed", dirPath);
          fsWatcherDebounceTimers.delete(dirPath);
        }, 300);
        
        fsWatcherDebounceTimers.set(dirPath, timer);
      }
    });
    
    fsWatchers.set(dirPath, watcher);
    return { success: true };
  } catch (err) {
    console.error("Error watching directory:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("fs:stopWatching", (_, dirPath) => {
  if (fsWatchers.has(dirPath)) {
    fsWatchers.get(dirPath).close();
    fsWatchers.delete(dirPath);
    
    // Clear debounce timer if exists
    if (fsWatcherDebounceTimers.has(dirPath)) {
      clearTimeout(fsWatcherDebounceTimers.get(dirPath));
      fsWatcherDebounceTimers.delete(dirPath);
    }
    
    return { success: true };
  }
  return { success: false };
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
  
  mainWindow = win;

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


