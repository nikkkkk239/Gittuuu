import { app, shell, BrowserWindow, ipcMain, dialog, session, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import simpleGit from "simple-git";
import fs from "fs";
import FormData from "form-data"
import { spawn,execSync } from "child_process";
import archiver from 'archiver';
import axios from 'axios';
import sodium from "libsodium-wrappers-sumo";

// Removed screen recording permission request as it's not needed

// Store active terminal processes
const terminalProcesses = new Map();
// Store active running processes per terminal (for stdin input)
const runningProcesses = new Map();

// Store file system watchers
const fsWatchers = new Map();
const fsWatcherDebounceTimers = new Map();
let mainWindow = null;



function isGitRepository(projectPath) {
  try {
    const rootEntries = fs.readdirSync(projectPath);
    return rootEntries.includes(".git");
  } catch {
    return false;
  }
}

function normalizeDeploySubPath(deploySubPath) {
  const rawSubPath = (deploySubPath || ".").trim();
  return rawSubPath === "." || rawSubPath === "" ? "." : rawSubPath.replace(/^[\\/]+/, "");
}

function getWorkflowJobName(subPath) {
  if (subPath === ".") {
    return "root";
  }

  return subPath
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "job";
}

function buildWorkflowJob(jobName, normalizedWorkflowPath, normalizedProjectType) {
  const buildStepsByType = {
    node: [
      "      - name: Install dependencies",
      "        run: npm ci",
      "      - name: Build project",
      "        run: npm run build --if-present",
      "      - name: Start app smoke check",
      "        run: npm run start --if-present"
    ],
    react: [
      "      - name: Install dependencies",
      "        run: npm ci",
      "      - name: Build React app",
      "        run: npm run build",
      "      - name: Archive build output",
      "        uses: actions/upload-artifact@v4",
      "        with:",
      "          name: react-build",
      "          path: build"
    ],
    next: [
      "      - name: Install dependencies",
      "        run: npm ci",
      "      - name: Build Next.js app",
      "        run: npm run build",
      "      - name: Upload Next.js build",
      "        uses: actions/upload-artifact@v4",
      "        with:",
      "          name: next-build",
      "          path: .next"
    ]
  };

  const workingDirectory = normalizedWorkflowPath === "." ? "." : normalizedWorkflowPath;

  return [
    `  ${jobName}:`,
    "    runs-on: ubuntu-latest",
    "    defaults:",
    "      run:",
    `        working-directory: ${workingDirectory}`,
    "    steps:",
    "      - name: Checkout",
    "        uses: actions/checkout@v4",
    "      - name: Setup Node",
    "        uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 20",
    "          cache: npm",
    ...buildStepsByType[normalizedProjectType],
    "      - name: Mark subrepo deployment complete",
    "        run: echo 'Subrepo deployment workflow executed successfully.'"
  ].join("\n");
}

function updateWorkflowContent(existingContent, workflowPathFilter, jobBlock) {
  if (!existingContent || !existingContent.trim()) {
    return [
      "name: Subrepo Deploy",
      "",
      "on:",
      "  push:",
      "    branches:",
      "      - main",
      "    paths:",
      `      - '${workflowPathFilter}'`,
      "      - '.github/workflows/deploy.yml'",
      "  workflow_dispatch:",
      "",
      "jobs:",
      jobBlock,
      ""
    ].join("\n");
  }

  let updatedContent = existingContent;

  if (!updatedContent.includes(workflowPathFilter)) {
    updatedContent = updatedContent.replace(
      /(^\s+paths:\n(?:\s+- .+\n)*)/m,
      `$1      - '${workflowPathFilter}'\n`
    );
  }

  const jobNameMatch = jobBlock.match(/^  ([a-zA-Z0-9_-]+):/m);
  const jobName = jobNameMatch ? jobNameMatch[1] : null;
  if (jobName && updatedContent.includes(`  ${jobName}:`)) {
    return updatedContent;
  }

  if (updatedContent.includes("jobs:\n")) {
    return updatedContent.replace(/\n?$/, "\n") + `\n${jobBlock}\n`;
  }

  return `${updatedContent}\n\njobs:\n${jobBlock}\n`;
}

const CLOUDFLARE_ACCOUNT_ID = "dabe5e4f6f8bc8aad260688346ee8999";
const CLOUDFLARE_API_TOKEN = "cfut_zrEJoFFr6h7Ro4nCPjD7QqsCVuI3HqYE2hLaeCGK9bc698f3";

function parseGitHubRemoteUrl(remoteUrl) {
  if (!remoteUrl) {
    return null;
  }

  const normalizedUrl = remoteUrl.replace(/\.git$/, "");
  const sshMatch = normalizedUrl.match(/^git@github\.com:([^/]+)\/([^/]+)$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  const httpsMatch = normalizedUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  return null;
}

async function getGitHubRepoInfo(projectPath) {
  const git = simpleGit(projectPath);
  const remotes = await git.getRemotes(true);
  const origin = remotes.find((remote) => remote.name === "origin");
  return parseGitHubRemoteUrl(origin?.refs?.push || origin?.refs?.fetch || origin?.refs?.url);
}

async function getGitHubActionsPublicKey(owner, repo, githubAccessToken) {
  const response = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/actions/secrets/public-key`,
    {
      headers: {
        Authorization: `Bearer ${githubAccessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    }
  );

  return {
    keyId: response.data?.key_id,
    key: response.data?.key
  };
}

async function encryptForGitHubSecret(secretValue, githubPublicKey) {
  await sodium.ready;
  const publicKeyBytes = sodium.from_base64(githubPublicKey, sodium.base64_variants.ORIGINAL);
  const messageBytes = sodium.from_string(secretValue);
  const encryptedBytes = sodium.crypto_box_seal(messageBytes, publicKeyBytes);
  return sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);
}

async function uploadGitHubSecret(owner, repo, secretName, encryptedValue, keyId, githubAccessToken) {
  await axios.put(
    `https://api.github.com/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(secretName)}`,
    {
      encrypted_value: encryptedValue,
      key_id: keyId
    },
    {
      headers: {
        Authorization: `Bearer ${githubAccessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    }
  );
}

async function saveCloudflareTunnelTokenSecret(projectPath, githubAccessToken, tunnelToken) {
  if (!githubAccessToken) {
    return {
      success: false,
      error: "GitHub access token is required to upload encrypted repository secrets."
    };
  }

  if (!tunnelToken) {
    return {
      success: false,
      error: "Cloudflare tunnel token not found in API response."
    };
  }

  const repoInfo = await getGitHubRepoInfo(projectPath);
  if (!repoInfo) {
    return {
      success: false,
      error: "Could not determine GitHub repository from origin remote."
    };
  }

  const publicKey = await getGitHubActionsPublicKey(repoInfo.owner, repoInfo.repo, githubAccessToken);
  if (!publicKey?.key || !publicKey?.keyId) {
    return {
      success: false,
      error: "Failed to fetch GitHub repository public key for Actions secrets."
    };
  }

  const encryptedValue = await encryptForGitHubSecret(tunnelToken, publicKey.key);
  await uploadGitHubSecret(
    repoInfo.owner,
    repoInfo.repo,
    "CLOUDFLARE_TUNNEL_TOKEN",
    encryptedValue,
    publicKey.keyId,
    githubAccessToken
  );

  return {
    success: true,
    secretName: "CLOUDFLARE_TUNNEL_TOKEN",
    keyId: publicKey.keyId
  };
}

async function commitWorkflowWithGit(projectPath, workflowFilePath) {
  const git = simpleGit(projectPath);
  const repoFilePath = path.relative(projectPath, workflowFilePath).replace(/\\/g, "/");

  const remotes = await git.getRemotes(true);
  const hasOrigin = remotes.some((remote) => remote.name === "origin");
  if (!hasOrigin) {
    return {
      success: false,
      error: "Git remote 'origin' is not configured. Please add origin before deploying."
    };
  }

  await git.add(repoFilePath);

  const status = await git.status();
  const hasStagedChanges = Array.isArray(status.staged) && status.staged.length > 0;

  let branchName = "main";
  try {
    const currentBranch = await git.revparse(["--abbrev-ref", "HEAD"]);
    if (currentBranch && currentBranch.trim() && currentBranch.trim() !== "HEAD") {
      branchName = currentBranch.trim();
    }
  } catch {
    // Keep fallback branch name when HEAD is detached or cannot be resolved.
  }

  if (!hasStagedChanges) {
    return {
      success: true,
      skipped: true,
      message: "No workflow changes to commit.",
      branch: branchName
    };
  }

  const commitSummary = await git.commit(`Add deployment workflow for ${repoFilePath}`);
  try {
    await git.raw(["push", "-u", "origin", branchName]);
  } catch (pushError) {
    return {
      success: false,
      error: pushError.message || "Failed to push workflow commit to origin.",
      commitHash: commitSummary.commit,
      branch: branchName
    };
  }

  return {
    success: true,
    commitHash: commitSummary.commit,
    branch: branchName,
    skipped: false
  };
}

async function createCloudflareTunnel(tunnelName) {
  const response = await axios.post(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel`,
    {
      name: tunnelName
    },
    {
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    }
  );

  console.log("Cloudflare tunnel create response:", response.data);

  return {
    success: true,
    response: response.data
  };
}


ipcMain.handle("deploy:project", async (_, projectPath, deploymentOptions = {}) => {
  try {
    const {
      createRepoIfMissing = false,
      githubAccessToken = "",
      configureExistingRepo = false,
      deploySubPath = ".",
      projectType = "node"
    } = deploymentOptions;

    if (!isGitRepository(projectPath)) {
      if (createRepoIfMissing) {
        if (!githubAccessToken) {
          return {
            success: false,
            error: "GitHub session token missing. Please login again.",
            canCreateRepo: true
          };
        }

        const repoName = path.basename(projectPath);
        const createRepoResponse = await axios.post(
          "https://api.github.com/user/repos",
          {
            name: repoName,
            private: false
          },
          {
            headers: {
              Authorization: `Bearer ${githubAccessToken}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28"
            }
          }
        );

        const cloneUrl = createRepoResponse.data?.clone_url;
        if (!cloneUrl) {
          return {
            success: false,
            error: "GitHub repo created but clone_url was not returned.",
            canCreateRepo: true
          };
        }

        const git = simpleGit(projectPath);
        await git.init();

        const remotes = await git.getRemotes(true);
        const hasOrigin = remotes.some((remote) => remote.name === "origin");
        if (hasOrigin) {
          await git.removeRemote("origin");
        }

        await git.addRemote("origin", cloneUrl);
        await git.add(".");

        const status = await git.status();
        if (status.files.length > 0) {
          await git.commit("Initial commit");
        }

        await git.raw(["branch", "-M", "main"]);
        await git.push("origin", "main");

        return {
          success: true,
          createdRepo: true,
          clone_url: cloneUrl
        };
      }

      return {
        success: false,
        error: "Current folder is not a git repo. Please initialize one before deploying.",
        canCreateRepo: true
      };
    }

    if (!configureExistingRepo) {
      return {
        success: false,
        canConfigureDeploy: true,
        error: "Repository found. Please choose deploy path and project type."
      };
    }

    const normalizedProjectType = String(projectType).toLowerCase();
    const allowedProjectTypes = new Set(["node", "react", "next"]);

    if (!allowedProjectTypes.has(normalizedProjectType)) {
      return {
        success: false,
        error: "Invalid project type. Choose Node, React, or Next."
      };
    }

    const rootPath = path.resolve(projectPath);
    const normalizedInputSubPath = normalizeDeploySubPath(deploySubPath);
    const resolvedDeployPath = path.resolve(rootPath, normalizedInputSubPath);

    if (resolvedDeployPath !== rootPath && !resolvedDeployPath.startsWith(`${rootPath}${path.sep}`)) {
      return {
        success: false,
        error: "Deploy path must be inside the current opened folder."
      };
    }

    if (!fs.existsSync(resolvedDeployPath) || !fs.statSync(resolvedDeployPath).isDirectory()) {
      return {
        success: false,
        error: "Deploy path does not exist or is not a folder."
      };
    }

    const workflowsDir = path.join(rootPath, ".github", "workflows");
    fs.mkdirSync(workflowsDir, { recursive: true });

    const workflowFilePath = path.join(workflowsDir, "deploy.yml");

    const normalizedWorkflowPath = normalizedInputSubPath === "." ? "." : normalizedInputSubPath.replace(/\\/g, "/");
    const workflowPathFilter = normalizedWorkflowPath === "." ? "**" : `${normalizedWorkflowPath}/**`;
    const jobName = getWorkflowJobName(normalizedInputSubPath);
    const jobBlock = buildWorkflowJob(jobName, normalizedWorkflowPath, normalizedProjectType);
    const existingWorkflowContent = fs.existsSync(workflowFilePath)
      ? fs.readFileSync(workflowFilePath, "utf-8")
      : "";
    const workflowContent = updateWorkflowContent(existingWorkflowContent, workflowPathFilter, jobBlock);

    fs.writeFileSync(workflowFilePath, workflowContent.trimEnd() + "\n", "utf-8");

    const commitResult = await commitWorkflowWithGit(rootPath, workflowFilePath);

    if (!commitResult.success) {
      return {
        success: false,
        error: commitResult.error,
        workflowPath: workflowFilePath,
        configuredDeploy: true,
        deployPath: resolvedDeployPath,
        projectType: normalizedProjectType
      };
    }

    const tunnelName = `${path.basename(rootPath)}-${jobName}`;
    const tunnelResult = await createCloudflareTunnel(tunnelName);
    const tunnelToken =
      tunnelResult?.response?.result?.tunnel_token ||
      tunnelResult?.response?.result?.token ||
      tunnelResult?.response?.result?.credentials?.tunnel_token ||
      "";

    const secretUploadResult = await saveCloudflareTunnelTokenSecret(
      rootPath,
      githubAccessToken,
      tunnelToken
    );

    if (!secretUploadResult.success) {
      return {
        success: false,
        error: secretUploadResult.error,
        workflowPath: workflowFilePath,
        configuredDeploy: true,
        deployPath: resolvedDeployPath,
        projectType: normalizedProjectType,
        cloudflareTunnel: tunnelResult.response
      };
    }

    return {
      success: true,
      configuredDeploy: true,
      deployPath: resolvedDeployPath,
      projectType: normalizedProjectType,
      workflowPath: workflowFilePath,
      commitHash: commitResult.commitHash,
      commitBranch: commitResult.branch,
      commitSkipped: commitResult.skipped,
      commitMessage: commitResult.message,
      cloudflareTunnel: tunnelResult.response,
      githubSecretConfigured: true,
      githubSecretName: secretUploadResult.secretName
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

ipcMain.handle("run:openExternal", async (_, targetUrl) => {
  try {
    await shell.openExternal(targetUrl);
    return { success: true };
  } catch (err) {
    console.error("Error opening external URL:", err);
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


