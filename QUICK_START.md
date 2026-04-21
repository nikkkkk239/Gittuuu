# Quick Start

This guide helps you run the deployment backend and Electron client locally.

## Prerequisites

- Node.js 20+
- npm (or yarn/pnpm)
- Docker installed and running
- (Optional) Firebase project variables for auth/history

## 1) Start Deployment Backend

From project root:

```bash
node deployment_server.js
```

Backend defaults:
- API port: 5000
- Deployment base directory: /home/ubuntu/projects

If running locally on macOS, ensure this directory exists and is writable, or update BASE_PROJECT_DIR in deployment_server.js.

## 2) Start IDE Client

In a second terminal:

```bash
cd client
npm install
npm start
```

## 3) Deploy a Project

1. Open deployment modal in the IDE.
2. Select Create New Deployment.
3. Choose project type: node, react, react-vite, or next.
4. Choose package manager: npm, yarn, or pnpm.
5. Upload project zip.
6. Wait for deployment success response.

## 4) View Logs and Manage Deployment

- Open logs view to monitor build/runtime output.
- Use actions from deployment cards:
  - Start
  - Stop
  - Delete

## 5) Verify Backend Health

```bash
curl http://localhost:5000/health
```

## Troubleshooting

## Docker build fails
- Open build logs from the logs endpoint/UI.
- Verify package.json scripts (build/start) for selected project type.

## Stop/start says project not found
- Ensure backend is running updated code.
- Confirm projectId exists under /home/ubuntu/projects.

## Client cannot talk to backend
- Check API URL used by Electron main process.
- Ensure port 5000 is reachable from client runtime.
