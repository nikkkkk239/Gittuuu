# Quick Start

This guide helps you run the deployment backend and Electron client locally.

## Prerequisites

- Node.js 20+
- npm (or yarn/pnpm)
- Docker installed and running
- (Optional) Firebase project variables for auth/history

## AWS EC2 Setup (Deployment Server)

1. Log in to AWS Console and open your EC2 instance details.
2. Click Connect and copy the SSH command shown by AWS.
3. Download your .pem key file.
4. Move the key into your Downloads folder (if needed):

```bash
mv /path/to/your-key.pem ~/Downloads/
```

5. Fix key permissions:

```bash
chmod 400 ~/Downloads/your-key.pem
```

6. Run the SSH connect command (example):

```bash
ssh -i ~/Downloads/your-key.pem ubuntu@<your-ec2-public-ip>
```

7. Move into your deployment server folder:

```bash
cd deploy-server
```

8. Start the server:

```bash
node server.js
```

If your backend file is named deployment_server.js in this repo, use:

```bash
node deployment_server.js
```

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
