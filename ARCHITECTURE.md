# Architecture

This project is an Electron + React IDE client with a Node.js deployment backend that builds and runs uploaded projects in Docker containers.

## High-Level Components

1. Desktop Client (Electron)
- Main process: handles IPC and forwards deployment requests to backend APIs.
- Preload bridge: exposes safe APIs to renderer.
- Renderer (React): shows deployment UI, logs, and deployment controls.

2. Deployment Backend (Node.js + Express)
- Entry point: deployment_server.js.
- Accepts zip uploads and deployment metadata.
- Dynamically generates a Dockerfile per deployment.
- Builds Docker image and runs container on allocated host port.
- Persists build/runtime logs on server filesystem.
- Exposes lifecycle APIs: deploy, logs, start, stop, delete.

3. Persistence and History
- Runtime state cache in memory (maps for running projects and deployment artifacts).
- Deployment project artifacts/logs on disk under /home/ubuntu/projects/{projectId}.
- Client-side deployment history can be saved in Firestore per authenticated user.

## Request/Deploy Flow

1. User selects project + deployment options in the IDE.
2. Renderer calls preload API.
3. Electron main process forwards request to deployment backend.
4. Backend unzips project, validates project type/scripts.
5. Backend writes Dockerfile.deploy dynamically.
6. Backend builds Docker image and stores build logs.
7. Backend starts container and begins docker logs capture.
8. Backend returns deployment URL and logs URL.
9. IDE polls logs endpoint for build/runtime visibility.

## Logging Model

Per deployment, backend stores:
- deploy.build.log (image build output)
- deploy.stdout.log (container stdout)
- deploy.stderr.log (container stderr)

These logs remain on the EC2 host and are streamed to UI via GET /logs/:projectId.

## Key Backend Endpoints

- POST /deploy
- GET /logs/:projectId
- POST /start/:projectId
- POST /stop/:projectId
- DELETE /deployments/:projectId
- GET /projects
- GET /health

## Deployment Isolation

- Image name: deployment-image-{projectId}
- Container name: deployment-{projectId}
- Dedicated host port per deployment

This naming keeps each deployment isolated and traceable by projectId.
