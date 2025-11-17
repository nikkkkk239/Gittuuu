import express from "express";
import multer from "multer";
import unzipper from "unzipper";
import path from "path";
import fs from "fs";
import cors from "cors";
import { fileURLToPath } from "url";
import axios from "axios";
import FormData from "form-data";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Limit uploads to 200MB by default to avoid out-of-memory or truncated streams
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || String(200 * 1024 * 1024), 10);
const upload = multer({ dest: "uploads/", limits: { fileSize: MAX_UPLOAD_BYTES } });

// Vercel API endpoint
const VERCEL_API = "https://api.vercel.com";
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

// Railway API endpoint
const RAILWAY_API = "https://backboard.railway.app/graphql/v2";
const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN;

// Helper function to copy Dockerfile template to project
function copyDockerfile(projectPath, projectType) {
  const templatePath = path.join(__dirname, "templates", `Dockerfile.${projectType}`);
  const destPath = path.join(projectPath, "Dockerfile");
  
  if (fs.existsSync(templatePath)) {
    fs.copyFileSync(templatePath, destPath);
    
    // Copy nginx.conf for React/Vite projects
    if (projectType === "react" || projectType === "vite") {
      const nginxTemplate = path.join(__dirname, "templates", "nginx.conf");
      const nginxDest = path.join(projectPath, "nginx.conf");
      fs.copyFileSync(nginxTemplate, nginxDest);
    }
    
    // Copy .dockerignore
    const dockerignoreTemplate = path.join(__dirname, "templates", ".dockerignore");
    const dockerignoreDest = path.join(projectPath, ".dockerignore");
    fs.copyFileSync(dockerignoreTemplate, dockerignoreDest);
    
    return true;
  }
  return false;
}

// Deploy to Vercel (for frontend projects)
async function deployToVercel(projectPath, projectName) {
  if (!VERCEL_TOKEN) {
    throw new Error("VERCEL_TOKEN not configured. Please add it to .env file");
  }

  try {
    // Create deployment
    const files = [];
    
    // Read all files from project (recursively)
    function readDir(dir, baseDir = dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      entries.forEach(entry => {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);
        
        // Skip node_modules, .git, etc.
        if (entry.name === 'node_modules' || entry.name === '.git' || 
            entry.name === 'dist' || entry.name === 'build') {
          return;
        }
        
        if (entry.isDirectory()) {
          readDir(fullPath, baseDir);
        } else {
          const content = fs.readFileSync(fullPath);
          files.push({
            file: relativePath,
            data: content.toString('base64')
          });
        }
      });
    }
    
    readDir(projectPath);

    const deploymentData = {
      name: projectName,
      files: files,
      projectSettings: {
        framework: null,
        buildCommand: "npm run build",
        outputDirectory: "dist"
      }
    };

    const response = await axios.post(
      `${VERCEL_API}/v13/deployments`,
      deploymentData,
      {
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    return {
      success: true,
      url: `https://${response.data.url}`,
      platform: "vercel",
      inspectorUrl: response.data.inspectorUrl
    };
  } catch (error) {
    console.error("Vercel deployment error:", error.response?.data || error.message);
    throw error;
  }
}

// Deploy to Railway (for backend or Dockerized projects)
async function deployToRailway(projectPath, projectName, projectType) {
  if (!RAILWAY_TOKEN) {
    throw new Error("RAILWAY_TOKEN not configured. Please add it to .env file");
  }

  try {
    // Copy appropriate Dockerfile
    copyDockerfile(projectPath, projectType);
    
    // Copy railway.json
    const railwayTemplate = path.join(__dirname, "templates", "railway.json");
    const railwayDest = path.join(projectPath, "railway.json");
    fs.copyFileSync(railwayTemplate, railwayDest);

    // Note: Railway deployment typically requires GitHub integration or CLI
    // For now, we'll prepare the project with Dockerfile and railway.json
    // User will need to connect via Railway dashboard or CLI
    
    return {
      success: true,
      message: "Project prepared for Railway deployment",
      instructions: [
        "1. Install Railway CLI: npm i -g @railway/cli",
        "2. Login to Railway: railway login",
        "3. Initialize project: railway init",
        `4. Deploy: railway up`,
        "5. Your app will be deployed with the Dockerfile"
      ],
      dockerfileCreated: true,
      platform: "railway"
    };
  } catch (error) {
    console.error("Railway deployment error:", error);
    throw error;
  }
}

// Main deployment endpoint
app.post("/deploy", upload.single("file"), async (req, res) => {
  try {
    const { deploymentType, projectType, projectName } = req.body;
    const filePath = req.file.path;
    const extractPath = path.join(__dirname, "temp", uuidv4());

    // Extract uploaded project with validation and robust stream/error handling
    fs.mkdirSync(extractPath, { recursive: true });

    // Log uploaded file details for debugging
    console.log("Uploaded file info:", {
      savedPath: filePath,
      originalName: req.file?.originalname,
      mimetype: req.file?.mimetype,
      sizeBytes: req.file?.size
    });

    // Quick sanity check: ensure file exists and has expected size
    const stats = fs.statSync(filePath);
    console.log(`Saved file size: ${stats.size} bytes`);
    if (stats.size === 0) throw new Error("Uploaded file is empty");

    // Try to open the zip first to verify integrity (gives clearer errors)
    try {
      // unzipper.Open.file will validate the central directory
      await unzipper.Open.file(filePath);
    } catch (err) {
      // Provide a clearer message for the client
      console.error("Zip validation failed:", err.message || err);
      throw new Error("Uploaded ZIP appears to be corrupted or incomplete");
    }

    // Safer extraction: open archive and extract entries one by one to avoid streaming truncation issues
    try {
      const directory = await unzipper.Open.file(filePath);
      for (const entry of directory.files) {
        const entryPath = path.join(extractPath, entry.path);
        // Ensure parent dir exists
        fs.mkdirSync(path.dirname(entryPath), { recursive: true });

        // directories in zip have a trailing slash
        if (entry.type === 'Directory') continue;

        await new Promise((resolve, reject) => {
          entry.stream()
            .on('error', (err) => {
              console.error('Error streaming zip entry', entry.path, err.message || err);
              reject(new Error('Error extracting entry: ' + entry.path));
            })
            .pipe(fs.createWriteStream(entryPath))
            .on('error', (err) => reject(err))
            .on('finish', resolve);
        });
      }
    } catch (err) {
      console.error('Primary extraction via unzipper failed:', err.message || err);
      console.log('Attempting fallback extraction using system unzip command...');
      // Fallback: use system `unzip` command which is often more tolerant/robust
      await new Promise((resolve, reject) => {
        const unzip = spawn('unzip', ['-o', filePath, '-d', extractPath]);

        unzip.stdout.on('data', (d) => console.log('[unzip stdout]', d.toString()));
        unzip.stderr.on('data', (d) => console.error('[unzip stderr]', d.toString()));

        unzip.on('error', (e) => {
          console.error('Failed to start unzip process:', e.message || e);
          reject(new Error('System unzip not available or failed to start'));
        });

        unzip.on('close', (code) => {
          if (code === 0) return resolve();
          return reject(new Error('unzip exited with code ' + code));
        });
      });
      console.log('Fallback system unzip completed successfully');
    }

    let result;

    // Route to appropriate deployment platform
    if (deploymentType === "vercel" || projectType === "frontend") {
      result = await deployToVercel(extractPath, projectName || "my-app");
    } else if (deploymentType === "railway" || projectType === "backend") {
      result = await deployToRailway(
        extractPath,
        projectName || "my-backend",
        "nodejs"
      );
    } else {
      // Auto-detect: frontend -> Vercel, backend -> Railway
      result = await deployToVercel(extractPath, projectName || "my-app");
    }

    // Cleanup
    fs.rmSync(filePath, { force: true });
    // Keep temp folder for Railway CLI deployment
    if (deploymentType !== "railway") {
      fs.rmSync(extractPath, { recursive: true, force: true });
    } else {
      result.projectPath = extractPath;
    }

    res.json(result);
  } catch (error) {
    console.log("Deployment error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

// Local deployment endpoint (for testing)
app.post("/deploy/local", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    console.log("[local deploy] Uploaded file:", { savedPath: filePath, originalName: req.file?.originalname, size: req.file?.size });
    const deployPath = path.join(__dirname, "deployed", Date.now().toString());

    fs.mkdirSync(deployPath, { recursive: true });
    // Extract with the same robust extractor used above
    try {
      await unzipper.Open.file(filePath);
      await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(filePath);
        const extractor = unzipper.Extract({ path: deployPath });

        let finished = false;
        const cleanup = (err) => {
          if (finished) return;
          finished = true;
          readStream.destroy();
          extractor.removeAllListeners();
          if (err) return reject(err);
          return resolve();
        };

        readStream.on("error", (err) => {
          console.error("Read stream error while extracting uploaded zip (local):", err.message || err);
          cleanup(new Error("Error reading uploaded file"));
        });

        extractor.on("error", (err) => {
          console.error("Unzipper extractor error (local):", err.message || err);
          cleanup(new Error("Error extracting uploaded ZIP"));
        });

        extractor.on("close", () => {
          cleanup();
        });

        readStream.pipe(extractor);
      });
    } catch (err) {
      console.error("Local deploy extraction failed:", err.message || err);
      throw err;
    }

    const url = `http://localhost:3000/deployed/${path.basename(deployPath)}`;

    res.json({ success: true, url, platform: "local" });
  } catch (error) {
    console.log("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve deployed files locally
app.use("/deployed", express.static(path.join(__dirname, "deployed")));

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    vercelConfigured: !!VERCEL_TOKEN,
    railwayConfigured: !!RAILWAY_TOKEN
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Deployment Server running on port ${PORT}`);
  console.log(`📦 Vercel: ${VERCEL_TOKEN ? "✅ Configured" : "❌ Not configured"}`);
  console.log(`🚂 Railway: ${RAILWAY_TOKEN ? "✅ Configured" : "❌ Not configured"}`);
});