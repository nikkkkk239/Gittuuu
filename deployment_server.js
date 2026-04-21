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
const CONTAINER_PORT = 3000;
const BASE_PROJECT_DIR = "/home/ubuntu/projects";
const UPLOAD_DIR = path.join(__dirname, "uploads");
const MAX_COMMAND_BUFFER = 1024 * 1024 * 20;

const upload = multer({ dest: UPLOAD_DIR });
let portPool = START_PORT;

const runningProjects = new Map();
const deploymentArtifacts = new Map();

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

function getRequestOrigin(req) {
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || req.hostname || "localhost").split(":")[0];
  const protocol = String(req.headers["x-forwarded-proto"] || req.protocol || "http");
  return {
    host,
    protocol,
  };
}

function getLogsUrl(req, projectId) {
  const { host, protocol } = getRequestOrigin(req);
  return `${protocol}://${host}:${PORT}/logs/${projectId}`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function getImageName(projectId) {
  return `deployment-image-${projectId}`;
}

function getContainerName(projectId) {
  return `deployment-${projectId}`;
}

async function getOrRebuildArtifact(projectId) {
  const existing = deploymentArtifacts.get(projectId);
  if (existing) {
    return existing;
  }

  const projectPath = path.join(BASE_PROJECT_DIR, projectId);
  if (!(await fs.pathExists(projectPath))) {
    return null;
  }

  const artifact = {
    projectId,
    projectPath,
    projectType: "unknown",
    packageManager: "npm",
    stdoutPath: path.join(projectPath, "deploy.stdout.log"),
    stderrPath: path.join(projectPath, "deploy.stderr.log"),
    buildLogPath: path.join(projectPath, "deploy.build.log"),
    imageName: getImageName(projectId),
    containerName: getContainerName(projectId),
    status: "unknown",
    updatedAt: new Date().toISOString(),
  };

  const packageJson = await readPackageJson(projectPath);
  if (packageJson) {
    if (packageJson.dependencies?.next || packageJson.devDependencies?.next) {
      artifact.projectType = "next";
    } else if (packageJson.dependencies?.vite || packageJson.devDependencies?.vite) {
      artifact.projectType = "react-vite";
    } else if (packageJson.dependencies?.react || packageJson.devDependencies?.react) {
      artifact.projectType = "react";
    } else {
      artifact.projectType = "node";
    }

    if (await fs.pathExists(path.join(projectPath, "pnpm-lock.yaml"))) {
      artifact.packageManager = "pnpm";
    } else if (await fs.pathExists(path.join(projectPath, "yarn.lock"))) {
      artifact.packageManager = "yarn";
    } else {
      artifact.packageManager = "npm";
    }
  }

  deploymentArtifacts.set(projectId, artifact);
  return artifact;
}

function getInstallCommand(packageManager, projectType) {
  if (packageManager === "yarn") {
    return "yarn install --frozen-lockfile || yarn install";
  }

  if (packageManager === "pnpm") {
    return "pnpm install --frozen-lockfile || pnpm install";
  }

  const includeDevDeps = projectType === "react" || projectType === "react-vite" || projectType === "next";
  if (includeDevDeps) {
    return "npm install --include=dev || npm install --legacy-peer-deps --include=dev";
  }

  return "npm install || npm install --legacy-peer-deps";
}

function getCorepackCommand(packageManager) {
  if (packageManager === "yarn") {
    return "RUN corepack enable && corepack prepare yarn@stable --activate";
  }

  if (packageManager === "pnpm") {
    return "RUN corepack enable && corepack prepare pnpm@latest --activate";
  }

  return "";
}

async function readPackageJson(projectPath) {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!(await fs.pathExists(packageJsonPath))) {
    return null;
  }

  return fs.readJson(packageJsonPath);
}

async function validateProjectForDeployment(projectPath, projectType) {
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = await readPackageJson(projectPath);

  if (!packageJson) {
    throw new Error(
      `package.json not found in deploy folder: ${projectPath}. Select the correct app folder (for example, a client folder for React apps).`
    );
  }

  if (projectType === "react" || projectType === "react-vite" || projectType === "next") {
    if (!packageJson?.scripts?.build) {
      throw new Error(
        `Missing build script in ${packageJsonPath}. ${projectType} deployments require a build script.`
      );
    }
  }

  if (projectType === "node") {
    const hasStartScript = Boolean(packageJson?.scripts?.start);
    const hasIndexJs = await fs.pathExists(path.join(projectPath, "index.js"));
    if (!hasStartScript && !hasIndexJs) {
      throw new Error(
        `Node deployment requires either a start script in ${packageJsonPath} or an index.js file in ${projectPath}.`
      );
    }
  }
}

async function getStartCommand(projectType, packageManager, projectPath, port) {
  if (projectType === "react") {
    return `npx serve -s build -l ${port}`;
  }

  if (projectType === "react-vite") {
    return `npx serve -s dist -l ${port}`;
  }

  if (projectType === "next") {
    return `node ./node_modules/next/dist/bin/next start -p ${port}`;
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
  await validateProjectForDeployment(projectPath, projectType);

  const startCommand = await getStartCommand(projectType, packageManager, projectPath, CONTAINER_PORT);
  const installCommand = getInstallCommand(packageManager, projectType);
  const corepackCommand = getCorepackCommand(packageManager);
  const buildCommand =
    projectType === "react-vite"
      ? "RUN node ./node_modules/vite/bin/vite.js build || npx vite build"
      : projectType === "react" || projectType === "next"
        ? `RUN ${packageManager} run build`
        : "";

  const dockerfileContent = [
    "FROM node:20-bookworm-slim",
    "WORKDIR /app",
    corepackCommand,
    "COPY . .",
    `RUN ${installCommand}`,
    buildCommand,
    `ENV PORT=${CONTAINER_PORT}`,
    `EXPOSE ${CONTAINER_PORT}`,
    `CMD [\"sh\", \"-lc\", ${JSON.stringify(startCommand.replace(String(CONTAINER_PORT), "$PORT"))}]`,
    "",
  ]
    .filter(Boolean)
    .join("\n");

  const dockerfilePath = path.join(projectPath, "Dockerfile.deploy");
  await fs.writeFile(dockerfilePath, dockerfileContent, "utf8");

  log("Generated deployment Dockerfile", { projectPath, dockerfilePath, projectType, packageManager });

  return {
    dockerfilePath,
  };
}

function startContainerLogCapture(containerName, stdoutPath, stderrPath) {
  const command = `docker logs --timestamps -f ${containerName} >> ${shellQuote(stdoutPath)} 2>> ${shellQuote(stderrPath)}`;
  const child = spawn("bash", ["-lc", command], {
    detached: true,
    stdio: "ignore",
  });

  child.unref();

  return child.pid;
}

async function runDockerDeployment(projectId, projectPath, projectType, packageManager, port) {
  const stdoutPath = path.join(projectPath, "deploy.stdout.log");
  const stderrPath = path.join(projectPath, "deploy.stderr.log");
  const buildLogPath = path.join(projectPath, "deploy.build.log");
  const imageName = getImageName(projectId);
  const containerName = getContainerName(projectId);

  await fs.ensureFile(stdoutPath);
  await fs.ensureFile(stderrPath);
  await fs.ensureFile(buildLogPath);

  deploymentArtifacts.set(projectId, {
    projectId,
    projectPath,
    projectType,
    packageManager,
    stdoutPath,
    stderrPath,
    buildLogPath,
    status: "building",
    updatedAt: new Date().toISOString(),
  });

  const { dockerfilePath } = await prepareProject(projectPath, projectType, packageManager);

  log("Building Docker image", {
    projectId,
    projectType,
    packageManager,
    imageName,
    dockerfilePath,
  });

  try {
    let buildStdout = "";
    let buildStderr = "";

    try {
      const buildResult = await execAsync(
        `docker build --progress=plain -t ${imageName} -f ${shellQuote(dockerfilePath)} ${shellQuote(projectPath)}`,
        {
          maxBuffer: MAX_COMMAND_BUFFER,
        }
      );
      buildStdout = String(buildResult.stdout || "");
      buildStderr = String(buildResult.stderr || "");
    } catch (error) {
      const primaryStdout = String(error?.stdout || "");
      const primaryStderr = String(error?.stderr || "");
      const primaryOutput = `${primaryStdout}\n${primaryStderr}`;
      const progressFlagUnsupported = /unknown flag:\s*--progress/i.test(primaryOutput);

      if (!progressFlagUnsupported) {
        throw error;
      }

      log("Docker build does not support --progress flag, retrying without it", {
        projectId,
        imageName,
      });

      const fallbackBuildResult = await execAsync(
        `docker build -t ${imageName} -f ${shellQuote(dockerfilePath)} ${shellQuote(projectPath)}`,
        {
          maxBuffer: MAX_COMMAND_BUFFER,
        }
      );

      buildStdout = String(fallbackBuildResult.stdout || "");
      buildStderr = `Retry note: docker build --progress=plain is unsupported on this Docker version; built without --progress.\n${String(
        fallbackBuildResult.stderr || ""
      )}`;
    }

    await fs.writeFile(buildLogPath, `${buildStdout}\n${buildStderr}`.trim(), "utf8");
  } catch (error) {
    const buildStdout = String(error?.stdout || "");
    const buildStderr = String(error?.stderr || "");
    const combinedBuildOutput = `${buildStdout}\n${buildStderr}`.trim();

    await fs.writeFile(
      buildLogPath,
      combinedBuildOutput || String(error?.message || "Docker build failed"),
      "utf8"
    );

    const buildTail = combinedBuildOutput
      .split(/\r?\n/)
      .slice(-80)
      .join("\n");

    const buildError = new Error(
      `Docker build failed. Build logs saved to ${buildLogPath}. ${buildTail ? `Recent build output:\n${buildTail}` : String(error?.message || "Unknown docker build error")}`
    );
    buildError.buildLogPath = buildLogPath;
    buildError.projectId = projectId;
    throw buildError;
  }

  await execAsync(`docker rm -f ${containerName} >/dev/null 2>&1 || true`, {
    maxBuffer: MAX_COMMAND_BUFFER,
  });

  log("Starting Docker container", {
    projectId,
    containerName,
    imageName,
    port,
  });

  const { stdout } = await execAsync(
    `docker run -d --name ${containerName} --restart unless-stopped -p ${port}:${CONTAINER_PORT} ${imageName}`,
    { maxBuffer: MAX_COMMAND_BUFFER }
  );

  const containerId = String(stdout || "").trim();
  const logCapturePid = startContainerLogCapture(containerName, stdoutPath, stderrPath);

  runningProjects.set(projectId, {
    containerId,
    containerName,
    imageName,
    projectPath,
    projectType,
    packageManager,
    port,
    startedAt: new Date().toISOString(),
    stdoutPath,
    stderrPath,
    buildLogPath,
    logCapturePid,
  });

  deploymentArtifacts.set(projectId, {
    projectId,
    projectPath,
    projectType,
    packageManager,
    stdoutPath,
    stderrPath,
    buildLogPath,
    containerId,
    containerName,
    port,
    status: "running",
    updatedAt: new Date().toISOString(),
  });

  return {
    containerId,
    containerName,
    imageName,
    stdoutPath,
    stderrPath,
    buildLogPath,
    logCapturePid,
  };
}

async function readTailLogs(filePath, maxLines) {
  if (!(await fs.pathExists(filePath))) {
    return "";
  }

  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  return lines.slice(-maxLines).join("\n");
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

app.post("/deploy", upload.single("project"), async (req, res) => {
  const requestId = Date.now().toString();
  const projectType = String(req.body?.projectType || "").trim().toLowerCase();
  const packageManager = String(req.body?.packageManager || "npm").trim().toLowerCase();
  const allowedTypes = new Set(["node", "react", "react-vite", "next"]);
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
      error: "Invalid projectType. Allowed values: node, react, react-vite, next.",
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

    const port = allocatePort();
    await unzipProject(req.file.path, projectPath);
    const processInfo = await runDockerDeployment(projectId, projectPath, projectType, packageManager, port);

    const { host, protocol } = getRequestOrigin(req);
    const deployedUrl = `${protocol}://${host}:${port}`;
    const logsUrl = getLogsUrl(req, projectId);

    log("Deployment completed", {
      requestId,
      projectId,
      projectType,
      packageManager,
      port,
      containerId: processInfo.containerId,
      containerName: processInfo.containerName,
      logsUrl,
      deployedUrl,
    });

    return res.json({
      success: true,
      projectId,
      projectType,
      packageManager,
      port,
      url: deployedUrl,
      containerId: processInfo.containerId,
      containerName: processInfo.containerName,
      logsUrl,
      logs: {
        stdout: processInfo.stdoutPath,
        stderr: processInfo.stderrPath,
        build: processInfo.buildLogPath,
      },
    });
  } catch (error) {
    log("Deployment failed", {
      requestId,
      projectId,
      projectType,
      error: error.message,
    });

    deploymentArtifacts.set(projectId, {
      ...(deploymentArtifacts.get(projectId) || {}),
      projectId,
      projectPath,
      projectType,
      packageManager,
      status: "failed",
      error: error.message,
      updatedAt: new Date().toISOString(),
    });

    const logsUrl = getLogsUrl(req, projectId);

    return res.status(500).json({
      success: false,
      projectId,
      projectType,
      logsUrl,
      buildLogPath: path.join(projectPath, "deploy.build.log"),
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

app.get("/logs/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const maxLines = Math.min(Math.max(Number(req.query?.tail || 200), 1), 2000);
  const project = runningProjects.get(projectId);
  const artifact = deploymentArtifacts.get(projectId) || (await getOrRebuildArtifact(projectId));

  if (!project && !artifact) {
    return res.status(404).json({ success: false, error: "Project not found." });
  }

  try {
    const buildLogPath = project?.buildLogPath || artifact?.buildLogPath;
    const [stdout, stderr] = await Promise.all([
      readTailLogs(project?.stdoutPath || artifact?.stdoutPath || "", maxLines),
      readTailLogs(project?.stderrPath || artifact?.stderrPath || "", maxLines),
    ]);
    const build = buildLogPath ? await readTailLogs(buildLogPath, maxLines) : "";

    return res.json({
      success: true,
      projectId,
      containerId: project?.containerId || artifact?.containerId || null,
      containerName: project?.containerName || artifact?.containerName || null,
      status: project ? "running" : (artifact?.status || "unknown"),
      stdout,
      stderr,
      build,
      logPaths: {
        stdout: project?.stdoutPath || artifact?.stdoutPath || null,
        stderr: project?.stderrPath || artifact?.stderrPath || null,
        build: buildLogPath || null,
      },
    });
  } catch (error) {
    log("Failed to read project logs", { projectId, error: error.message });
    return res.status(500).json({
      success: false,
      projectId,
      error: error.message || "Failed to read logs",
    });
  }
});

app.post("/stop/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const project = runningProjects.get(projectId);
  const artifact = deploymentArtifacts.get(projectId) || (await getOrRebuildArtifact(projectId));

  if (!project && !artifact) {
    return res.status(404).json({ success: false, error: "Project not found." });
  }

  const targetProject = project || artifact;
  const logsUrl = getLogsUrl(req, projectId);

  try {
    await execAsync(`docker stop ${targetProject.containerName} >/dev/null 2>&1 || true`, {
      maxBuffer: MAX_COMMAND_BUFFER,
    });
    await execAsync(`docker rm ${targetProject.containerName} >/dev/null 2>&1 || true`, {
      maxBuffer: MAX_COMMAND_BUFFER,
    });

    if (targetProject.logCapturePid) {
      try {
        process.kill(targetProject.logCapturePid, "SIGTERM");
      } catch (_error) {
        // Best effort cleanup for detached docker logs process.
      }
    }

    runningProjects.delete(projectId);

    deploymentArtifacts.set(projectId, {
      ...(deploymentArtifacts.get(projectId) || {}),
      projectId,
      status: "stopped",
      updatedAt: new Date().toISOString(),
      logCapturePid: null,
    });

    log("Stopped project", {
      projectId,
      containerId: targetProject.containerId,
      containerName: targetProject.containerName,
    });

    return res.json({
      success: true,
      projectId,
      status: "stopped",
      logsUrl,
    });
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

app.post("/start/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const artifact = deploymentArtifacts.get(projectId) || (await getOrRebuildArtifact(projectId));

  if (!artifact) {
    return res.status(404).json({ success: false, error: "Project not found." });
  }

  if (runningProjects.has(projectId)) {
    return res.json({
      success: true,
      projectId,
      status: "running",
      logsUrl: getLogsUrl(req, projectId),
      url: (() => {
        const running = runningProjects.get(projectId);
        if (!running?.port) {
          return null;
        }
        const { host, protocol } = getRequestOrigin(req);
        return `${protocol}://${host}:${running.port}`;
      })(),
    });
  }

  const imageName = artifact.imageName || getImageName(projectId);
  const containerName = artifact.containerName || getContainerName(projectId);
  const projectPath = artifact.projectPath || path.join(BASE_PROJECT_DIR, projectId);
  const stdoutPath = artifact.stdoutPath || path.join(projectPath, "deploy.stdout.log");
  const stderrPath = artifact.stderrPath || path.join(projectPath, "deploy.stderr.log");
  const buildLogPath = artifact.buildLogPath || path.join(projectPath, "deploy.build.log");
  const port = Number(artifact.port || allocatePort());

  try {
    await fs.ensureFile(stdoutPath);
    await fs.ensureFile(stderrPath);
    await fs.ensureFile(buildLogPath);

    await execAsync(`docker rm -f ${containerName} >/dev/null 2>&1 || true`, {
      maxBuffer: MAX_COMMAND_BUFFER,
    });

    const { stdout } = await execAsync(
      `docker run -d --name ${containerName} --restart unless-stopped -p ${port}:${CONTAINER_PORT} ${imageName}`,
      { maxBuffer: MAX_COMMAND_BUFFER }
    );

    const containerId = String(stdout || "").trim();
    const logCapturePid = startContainerLogCapture(containerName, stdoutPath, stderrPath);

    runningProjects.set(projectId, {
      containerId,
      containerName,
      imageName,
      projectPath,
      projectType: artifact.projectType,
      packageManager: artifact.packageManager,
      port,
      startedAt: new Date().toISOString(),
      stdoutPath,
      stderrPath,
      buildLogPath,
      logCapturePid,
    });

    deploymentArtifacts.set(projectId, {
      ...artifact,
      imageName,
      containerName,
      containerId,
      projectPath,
      stdoutPath,
      stderrPath,
      buildLogPath,
      port,
      status: "running",
      updatedAt: new Date().toISOString(),
      logCapturePid,
    });

    const { host, protocol } = getRequestOrigin(req);
    const deployedUrl = `${protocol}://${host}:${port}`;

    log("Started project", {
      projectId,
      containerId,
      containerName,
      imageName,
      port,
    });

    return res.json({
      success: true,
      projectId,
      status: "running",
      url: deployedUrl,
      logsUrl: getLogsUrl(req, projectId),
    });
  } catch (error) {
    deploymentArtifacts.set(projectId, {
      ...artifact,
      status: "failed",
      error: error.message,
      updatedAt: new Date().toISOString(),
    });

    log("Failed to start project", {
      projectId,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      projectId,
      error: error.message || "Failed to start project",
      logsUrl: getLogsUrl(req, projectId),
    });
  }
});

app.delete("/deployments/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const running = runningProjects.get(projectId);
  const artifact = deploymentArtifacts.get(projectId) || (await getOrRebuildArtifact(projectId));

  if (!running && !artifact) {
    return res.status(404).json({ success: false, error: "Project not found." });
  }

  const target = running || artifact;
  const containerName = target.containerName || getContainerName(projectId);
  const imageName = target.imageName || getImageName(projectId);
  const projectPath = target.projectPath || path.join(BASE_PROJECT_DIR, projectId);

  try {
    await execAsync(`docker stop ${containerName} >/dev/null 2>&1 || true`, {
      maxBuffer: MAX_COMMAND_BUFFER,
    });
    await execAsync(`docker rm ${containerName} >/dev/null 2>&1 || true`, {
      maxBuffer: MAX_COMMAND_BUFFER,
    });
    await execAsync(`docker rmi ${imageName} >/dev/null 2>&1 || true`, {
      maxBuffer: MAX_COMMAND_BUFFER,
    });

    if (target.logCapturePid) {
      try {
        process.kill(target.logCapturePid, "SIGTERM");
      } catch (_error) {
        // Best effort cleanup for detached docker logs process.
      }
    }

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }

    runningProjects.delete(projectId);
    deploymentArtifacts.delete(projectId);

    log("Deleted deployment", {
      projectId,
      containerName,
      imageName,
      projectPath,
    });

    return res.json({
      success: true,
      projectId,
      status: "deleted",
    });
  } catch (error) {
    log("Failed to delete deployment", {
      projectId,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      projectId,
      error: error.message || "Failed to delete deployment",
    });
  }
});

app.listen(PORT, () => {
  log("Deploy server running", { port: PORT, uploadDir: UPLOAD_DIR, baseProjectDir: BASE_PROJECT_DIR });
});
