# Workflow and Features

## Typical Workflow

1. Sign in from the IDE (GitHub auth).
2. Choose Deploy option from the deployment modal.
3. Configure project type and package manager.
4. Upload a zipped project folder.
5. Wait for Docker image build + container startup.
6. Open deployed app URL.
7. Monitor build/runtime logs in the IDE.
8. Use deployment actions to start, stop, or delete.
9. Reopen Deployments view to revisit recent deployments.

## Core Features

## Docker-Based Deployments
- No local node process spawning for deployed apps.
- Dynamic Dockerfile generation per project.
- Supports node, react, react-vite, and next.

## Deployment Controls
- Start deployment
- Stop deployment
- Delete deployment (container, image, and project files)

## Log Visibility
- Build logs captured during docker build.
- Runtime logs captured from container stdout/stderr.
- Logs served from backend and shown in IDE.

## Deployment History UX
- Deployment action modal (Create New Deployment / View Deployments).
- Deployment cards with iframe preview support.
- Status-aware action buttons.
- Optional user-scoped history persistence (Firestore).

## Validation and Safety
- Uploaded zip path traversal checks.
- Project type/script validation before build.
- Package manager-aware install command generation.
- Docker build fallback for older Docker versions without --progress.

## Operational Notes

- Backend runtime maps are in-memory and process-local.
- Deployment artifacts/log files on disk are the durable source for recovery.
- For production robustness, keep backend process managed by systemd/pm2 and monitor disk usage under /home/ubuntu/projects.
