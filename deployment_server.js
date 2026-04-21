const express = require("express");
const multer = require("multer");
const { exec, spawn } = require("child_process");
const { promisify } = require("util");
const fs = require("fs-extra");
const path = require("path");
const AdmZip = require("adm-zip");

const execAsync = promisify(exec);

const app = express();
const PORT = 5000;
const START_PORT = 4000;
const BASE_PROJECT_DIR = "/home/ubuntu/projects";
const UPLOAD_DIR = path.join(__dirname, "uploads");

const upload = multer({ dest: UPLOAD_DIR });
let portPool = START_PORT;

const runningProjects = new Map();

function log(message, meta = {}) {
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      message,
      ...meta,
    })
  );
}

function allocatePort() {
  const port = portPool;
  portPool += 1;
  return port;
}

function getInstallCommand(packageManager) {
  if (packageManager === "yarn") {
    return "yarn install";
  }

  if (packageManager === "pnpm") {
    return "pnpm install";
  }

  return "npm install";
}

function getBuildCommand(packageManager) {
  return "npm run build";
}

async function readPackageJson(projectPath) {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!(await fs.pathExists(packageJsonPath))) {
    return null;
  }

  return fs.readJson(packageJsonPath);
}

async function getStartCommand(projectType, packageManager, projectPath, port) {
  if (projectType === "react") {
    return `PORT=${port} npx serve -s dist -l ${port}`;
  }

  if (projectType === "next") {
    return `${packageManager} start`;
  }

  const packageJson = await readPackageJson(projectPath);
  if (packageJson?.scripts?.start) {
    return `${packageManager} start`;
  }

  const indexJsPath = path.join(projectPath, "index.js");
  if (await fs.pathExists(indexJsPath)) {
    return `PORT=${port} node index.js`;
  }

  return `${packageManager} start`;
}

async function prepareProject(projectPath, projectType, packageManager) {
  log("Installing dependencies", { projectPath, projectType, packageManager });
  await execAsync(getInstallCommand(packageManager), {
    cwd: projectPath,
    maxBuffer: 1024 * 1024 * 20,
  });

  if (projectType === "react" || projectType === "next") {
    log("Building project", { projectPath, projectType, packageManager });
    const buildCommand =
      projectType === "react"
        ? "node ./node_modules/vite/bin/vite.js build"
        : "node ./node_modules/next/dist/bin/next build";

    await execAsync(buildCommand, {
      cwd: projectPath,
      maxBuffer: 1024 * 1024 * 20,
    });
  }
}

async function unzipProject(zipPath, projectPath) {
  log("Unzipping uploaded project", { zipPath, projectPath });

  const archive = new AdmZip(zipPath);
  const entries = archive.getEntries();

  for (const entry of entries) {
    const entryName = entry.entryName || "";
    const resolvedEntryPath = path.resolve(projectPath, entryName);
    const pathBoundary = `${path.resolve(projectPath)}${path.sep}`;

    if (resolvedEntryPath !== path.resolve(projectPath) && !resolvedEntryPath.startsWith(pathBoundary)) {
      throw new Error(`Unsafe zip entry blocked: ${entryName}`);
    }
  }

  archive.extractAllTo(projectPath, true);
}

async function startProjectProcess(projectId, projectPath, projectType, packageManager, port) {
  const stdoutPath = path.join(projectPath, "deploy.stdout.log");
  const stderrPath = path.join(projectPath, "deploy.stderr.log");
  const stdoutFd = fs.openSync(stdoutPath, "a");
  const stderrFd = fs.openSync(stderrPath, "a");

  const startCommand = await getStartCommand(projectType, packageManager, projectPath, port);
  log("Starting deployed app", {
    projectId,
    projectType,
    packageManager,
    port,
    startCommand,
  });

  const child = spawn("bash", ["-lc", startCommand], {
    cwd: projectPath,
    env: { ...process.env, PORT: String(port) },
    detached: true,
    stdio: ["ignore", stdoutFd, stderrFd],
  });

  child.unref();

  runningProjects.set(projectId, {
    pid: child.pid,
    projectPath,
    projectType,
    packageManager,
    port,
    startedAt: new Date().toISOString(),
    stdoutPath,
    stderrPath,
  });

  return { pid: child.pid, stdoutPath, stderrPath };
}

app.post("/deploy", upload.single("project"), async (req, res) => {
  const requestId = Date.now().toString();
  const projectType = String(req.body?.projectType || "").trim().toLowerCase();
  const packageManager = String(req.body?.packageManager || "npm").trim().toLowerCase();
  const allowedTypes = new Set(["node", "react", "next"]);
  const allowedPackageManagers = new Set(["npm", "yarn", "pnpm"]);

  log("Deployment request received", {
    requestId,
    hasFile: Boolean(req.file?.path),
    projectType,
    packageManager,
  });

  if (!req.file?.path) {
    return res.status(400).json({
      success: false,
      error: "Missing uploaded project zip in form field 'project'.",
    });
  }

  if (!allowedTypes.has(projectType)) {
    return res.status(400).json({
      success: false,
      error: "Invalid projectType. Allowed values: node, react, next.",
    });
  }

  if (!allowedPackageManagers.has(packageManager)) {
    return res.status(400).json({
      success: false,
      error: "Invalid packageManager. Allowed values: npm, yarn, pnpm.",
    });
  }

  const projectId = Date.now().toString();
  const projectPath = path.join(BASE_PROJECT_DIR, projectId);

  try {
    await fs.ensureDir(BASE_PROJECT_DIR);
    await fs.ensureDir(projectPath);

    await unzipProject(req.file.path, projectPath);
    await prepareProject(projectPath, projectType, packageManager);

    const port = allocatePort();
    const processInfo = await startProjectProcess(projectId, projectPath, projectType, packageManager, port);

    const host = String(req.headers["x-forwarded-host"] || req.get("host") || req.hostname || "localhost").split(":")[0];
    const protocol = String(req.headers["x-forwarded-proto"] || req.protocol || "http");
    const deployedUrl = `${protocol}://${host}:${port}`;

    log("Deployment completed", {
      requestId,
      projectId,
      projectType,
      packageManager,
      port,
      pid: processInfo.pid,
      deployedUrl,
    });

    return res.json({
      success: true,
      projectId,
      projectType,
      packageManager,
      port,
      url: deployedUrl,
      pid: processInfo.pid,
      logs: {
        stdout: processInfo.stdoutPath,
        stderr: processInfo.stderrPath,
      },
    });
  } catch (error) {
    log("Deployment failed", {
      requestId,
      projectId,
      projectType,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      projectId,
      projectType,
      error: error.message || "Deployment failed",
    });
  } finally {
    if (req.file?.path && (await fs.pathExists(req.file.path))) {
      await fs.remove(req.file.path);
      log("Cleaned uploaded zip", { requestId, zipPath: req.file.path });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    runningProjects: runningProjects.size,
    nextPort: portPool,
  });
});

app.get("/projects", (_req, res) => {
  res.json({
    success: true,
    projects: Array.from(runningProjects.entries()).map(([projectId, meta]) => ({
      projectId,
      ...meta,
    })),
  });
});

app.post("/stop/:projectId", (req, res) => {
  const { projectId } = req.params;
  const project = runningProjects.get(projectId);

  if (!project) {
    return res.status(404).json({ success: false, error: "Project not found." });
  }

  try {
    process.kill(-project.pid, "SIGTERM");
    runningProjects.delete(projectId);

    log("Stopped project", {
      projectId,
      pid: project.pid,
    });

    return res.json({ success: true, projectId });
  } catch (error) {
    log("Failed to stop project", {
      projectId,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      projectId,
      error: error.message || "Failed to stop project",
    });
  }
});

app.listen(PORT, () => {
  log("Deploy server running", { port: PORT, uploadDir: UPLOAD_DIR, baseProjectDir: BASE_PROJECT_DIR });
});
