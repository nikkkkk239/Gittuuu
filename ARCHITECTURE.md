# 🏗️ Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR ELECTRON APP (Gittuuu)                 │
│                                                                 │
│  ┌──────────────┐        ┌──────────────┐                      │
│  │   Select     │   →    │   Validate   │                      │
│  │   Project    │        │   Project    │                      │
│  └──────────────┘        └──────────────┘                      │
│         │                        │                              │
│         ▼                        ▼                              │
│  ┌──────────────┐        ┌──────────────┐                      │
│  │    Build     │   →    │     Zip      │                      │
│  │   Project    │        │   Project    │                      │
│  └──────────────┘        └──────────────┘                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ HTTP POST
                              │ (multipart/form-data)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              DEPLOYMENT SERVER (Express on :3000)               │
│                                                                 │
│  ┌──────────────┐        ┌──────────────┐                      │
│  │   Receive    │   →    │   Extract    │                      │
│  │   ZIP File   │        │    Files     │                      │
│  └──────────────┘        └──────────────┘                      │
│         │                        │                              │
│         ▼                        ▼                              │
│  ┌──────────────────────────────────────┐                      │
│  │      Route by Project Type           │                      │
│  │  • Frontend → Vercel                 │                      │
│  │  • Backend  → Railway                │                      │
│  │  • Test     → Local                  │                      │
│  └──────────────────────────────────────┘                      │
│         │                │                │                     │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          │                │                │
┌─────────▼──────┐  ┌──────▼─────┐  ┌──────▼──────┐
│                │  │            │  │             │
│  VERCEL API    │  │  RAILWAY   │  │  LOCAL      │
│  (Frontend)    │  │  (Backend) │  │  (Testing)  │
│                │  │            │  │             │
└────────┬───────┘  └─────┬──────┘  └──────┬──────┘
         │                │                 │
         │                │                 │
         ▼                ▼                 ▼
┌────────────────┐ ┌─────────────┐  ┌──────────────┐
│   Vercel CDN   │ │  Railway    │  │  localhost   │
│   *.vercel.app │ │  *.railway  │  │  :3000       │
└────────────────┘ └─────────────┘  └──────────────┘
         │                │                 │
         │                │                 │
         ▼                ▼                 ▼
   ┌──────────────────────────────────────────┐
   │         🌍 LIVE ON THE INTERNET          │
   │     Users can access your deployed apps  │
   └──────────────────────────────────────────┘
```

---

## Deployment Flow - Frontend (React/Vite)

```
┌──────────────┐
│   User       │
│   Opens      │
│   React App  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Gittuuu    │
│   Detects:   │
│   - React    │
│   - Vite     │
│   Category:  │
│   Frontend   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   npm        │
│   install    │
│   npm build  │
│   → dist/    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Create     │
│   ZIP file   │
│   project.   │
│   zip        │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   POST to    │
│   Server     │
│   :3000      │
│   /deploy    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Server     │
│   Extracts   │
│   Files      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Calls      │
│   Vercel API │
│   with files │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Vercel     │
│   Builds &   │
│   Deploys    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Returns    │
│   Live URL   │
│   https://   │
│   app.vercel │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   User gets  │
│   URL in     │
│   Gittuuu    │
│   ✅ DONE    │
└──────────────┘
```

**Time:** ~2-5 minutes  
**Cost:** FREE

---

## Deployment Flow - Backend (Node.js)

```
┌──────────────┐
│   User       │
│   Opens      │
│   Node App   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Gittuuu    │
│   Detects:   │
│   - Express  │
│   - Node.js  │
│   Category:  │
│   Backend    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Create     │
│   ZIP file   │
│   (no build) │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   POST to    │
│   Server     │
│   :3000      │
│   /deploy    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Server     │
│   Extracts   │
│   Files      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Copies     │
│   Dockerfile │
│   .nodejs    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Creates    │
│   railway.   │
│   json       │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Returns    │
│   CLI        │
│   Commands   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   User runs: │
│   railway    │
│   login      │
│   railway up │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Railway    │
│   Builds     │
│   Docker     │
│   Image      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Deploys    │
│   Container  │
│   to Cloud   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Returns    │
│   Live URL   │
│   https://   │
│   .railway   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   API Live   │
│   ✅ DONE    │
└──────────────┘
```

**Time:** ~3-7 minutes  
**Cost:** FREE ($5 credit)

---

## Docker Build Process

```
┌─────────────────────────────────────────┐
│      Dockerfile (Multi-stage)           │
└─────────────────────────────────────────┘

Stage 1: BUILDER
┌─────────────────────────────────────────┐
│  FROM node:18-alpine AS builder         │
│                                         │
│  WORKDIR /app                           │
│  COPY package*.json ./                  │
│  RUN npm ci                             │
│  COPY . .                               │
│  RUN npm run build                      │
│  → Creates /app/dist or /app/build      │
└─────────────────┬───────────────────────┘
                  │
                  │ Only build artifacts
                  │ copied to next stage
                  ▼
Stage 2: PRODUCTION (Frontend)
┌─────────────────────────────────────────┐
│  FROM nginx:alpine                      │
│                                         │
│  COPY --from=builder /app/dist /usr/.. │
│  COPY nginx.conf /etc/nginx/...        │
│  EXPOSE 80                              │
│  CMD ["nginx", "-g", "daemon off;"]    │
└─────────────────┬───────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │  Final Image   │
         │  Size: ~50MB   │
         │  (vs 500MB+)   │
         └────────────────┘

Benefits:
✅ Small image size (only production files)
✅ No source code in production image
✅ Fast deployment
✅ Security best practices
✅ Works on AWS/GCP/Azure
```

---

## File Structure After Deployment

```
server/
├── deployed/              ← Local deployments
│   └── 1731600000000/     ← Timestamp folder
│       └── (project files)
├── temp/                  ← Temporary extraction
│   └── (auto-cleaned)
├── templates/             ← Docker & config templates
│   ├── Dockerfile.react
│   ├── Dockerfile.vite
│   ├── Dockerfile.nextjs
│   ├── Dockerfile.nodejs
│   ├── nginx.conf
│   ├── .dockerignore
│   ├── vercel.json
│   └── railway.json
├── uploads/               ← Uploaded ZIP files
│   └── (auto-cleaned)
├── .env                   ← Your API tokens
├── index.js               ← Server code
└── package.json
```

---

## Network Flow

```
Internet
   │
   ▼
┌──────────────────────────────────────┐
│          User's Browser              │
└──────────────────────────────────────┘
   │                          │
   │ Frontend                 │ API Requests
   ▼                          ▼
┌─────────────┐        ┌──────────────┐
│   Vercel    │        │   Railway    │
│   CDN       │        │   Container  │
│             │        │              │
│  React App  │   →    │  Express API │
│  (Static)   │        │  (Dynamic)   │
└─────────────┘        └──────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │   Database   │
                       │  (Optional)  │
                       └──────────────┘
```

---

## Technology Stack

```
┌─────────────────────────────────────────────┐
│              Frontend Layer                 │
├─────────────────────────────────────────────┤
│  • React / Vite / Next.js                   │
│  • Deployed to: Vercel                      │
│  • Served via: CDN                          │
│  • SSL: Automatic                           │
└─────────────────────────────────────────────┘
                    │
                    │ API Calls
                    ▼
┌─────────────────────────────────────────────┐
│              Backend Layer                  │
├─────────────────────────────────────────────┤
│  • Node.js / Express                        │
│  • Containerized: Docker                    │
│  • Deployed to: Railway                     │
│  • Process Manager: PM2 (optional)          │
└─────────────────────────────────────────────┘
                    │
                    │ Queries
                    ▼
┌─────────────────────────────────────────────┐
│              Database Layer                 │
├─────────────────────────────────────────────┤
│  • PostgreSQL (Railway)                     │
│  • MongoDB (Atlas)                          │
│  • Redis (Upstash)                          │
└─────────────────────────────────────────────┘
```

---

## Deployment Comparison

```
┌────────────┬──────────┬──────────┬──────────┐
│  Feature   │  Local   │  Vercel  │ Railway  │
├────────────┼──────────┼──────────┼──────────┤
│  Access    │  Local   │  Global  │  Global  │
│  Speed     │  Instant │  2-5 min │  3-7 min │
│  SSL       │  No      │  Yes     │  Yes     │
│  CDN       │  No      │  Yes     │  No      │
│  Docker    │  No      │  No      │  Yes     │
│  Cost      │  Free    │  Free    │  Free    │
│  Use Case  │  Testing │ Frontend │ Backend  │
└────────────┴──────────┴──────────┴──────────┘
```

---

## AWS Migration Path

```
Current Setup              AWS Equivalent
──────────────            ────────────────

Vercel (Frontend)    →    S3 + CloudFront
                          or Amplify Hosting

Railway (Backend)    →    ECS/Fargate
                          with same Dockerfile

Deployment Server    →    CodePipeline
                          or GitHub Actions

Docker Images        →    ECR (Elastic Container Registry)

Environment Vars     →    Systems Manager
                          Parameter Store

Database             →    RDS (PostgreSQL)
                          or DynamoDB
```

**Migration Steps:**
1. Push Docker images to ECR
2. Create ECS task definitions
3. Deploy to Fargate/EC2
4. Setup ALB (Application Load Balancer)
5. Configure CloudFront for frontend
6. Done! Same app, AWS infrastructure

---

This architecture gives you:
✅ Professional deployment pipeline
✅ Free hosting to start
✅ Easy AWS migration when ready
✅ Industry-standard practices
✅ Scalable infrastructure

Happy deploying! 🚀
