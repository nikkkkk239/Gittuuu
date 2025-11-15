# 🚀 Real Deployment Setup Guide

This guide will help you set up **real production deployments** using Docker, Vercel, and Railway.

## 📋 Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Setup Instructions](#setup-instructions)
4. [Deployment Platforms](#deployment-platforms)
5. [Docker Setup](#docker-setup)
6. [AWS Migration Path](#aws-migration-path)

---

## 🎯 Overview

Your deployment system now supports:
- **Vercel** - For frontend projects (React, Vite, Next.js) - FREE
- **Railway** - For backend projects (Node.js, Express) - FREE $5/month credit
- **Docker** - Containerization ready for AWS migration
- **Local** - Testing deployments on localhost

### Architecture
```
Your Electron App (Client)
    ↓ (uploads project)
Deployment Server (Express)
    ↓
├─→ Vercel API (Frontend)
├─→ Railway CLI (Backend with Docker)
└─→ Local (Testing)
```

---

## ✅ Prerequisites

### 1. Install Node.js and npm
Already installed ✅

### 2. Install Docker Desktop
**For macOS:**
```bash
brew install --cask docker
# OR download from: https://www.docker.com/products/docker-desktop
```

After installation, start Docker Desktop from Applications.

### 3. Install Railway CLI (for backend deployments)
```bash
npm install -g @railway/cli
```

---

## 🔧 Setup Instructions

### Step 1: Install Server Dependencies
```bash
cd /Users/nikhil/Documents/Gittuuu/server
npm install
```

### Step 2: Create Vercel Account & Get API Token

1. Go to [https://vercel.com/signup](https://vercel.com/signup)
2. Sign up with GitHub (free account)
3. Go to [https://vercel.com/account/tokens](https://vercel.com/account/tokens)
4. Click "Create Token"
5. Name it: "Gittuuu Deployment"
6. Copy the token

### Step 3: Create Railway Account & Get API Token

1. Go to [https://railway.app](https://railway.app)
2. Sign up with GitHub (free account - $5 credit/month)
3. Go to [https://railway.app/account/tokens](https://railway.app/account/tokens)
4. Click "Create Token"
5. Name it: "Gittuuu Deployment"
6. Copy the token

### Step 4: Configure Environment Variables

Edit `/Users/nikhil/Documents/Gittuuu/server/.env`:

```env
VERCEL_TOKEN=your_vercel_token_here
RAILWAY_TOKEN=your_railway_token_here
PORT=3000
```

### Step 5: Start the Deployment Server
```bash
cd /Users/nikhil/Documents/Gittuuu/server
npm start
```

You should see:
```
🚀 Deployment Server running on port 3000
📦 Vercel: ✅ Configured
🚂 Railway: ✅ Configured
```

---

## 🌐 Deployment Platforms

### 🔷 Vercel (Frontend Projects)

**Best for:**
- React (Create React App)
- Vite projects
- Next.js applications

**Features:**
- ✅ Automatic builds
- ✅ Global CDN
- ✅ Free SSL certificates
- ✅ Custom domains
- ✅ Serverless functions
- ✅ 100GB bandwidth/month (free tier)

**How to Deploy:**
1. Open your React/Vite/Next.js project in Gittuuu
2. Click "Deploy"
3. Select "Vercel" platform
4. Get instant production URL!

**Example URL:** `https://my-app-abc123.vercel.app`

---

### 🚂 Railway (Backend Projects)

**Best for:**
- Node.js/Express APIs
- Databases
- Dockerized applications
- Any backend service

**Features:**
- ✅ Automatic Docker builds
- ✅ Free $5/month credit (enough for small apps)
- ✅ Environment variables
- ✅ Custom domains
- ✅ PostgreSQL/MySQL/Redis included
- ✅ Auto-sleep when inactive (saves credits)

**How to Deploy:**

#### Option A: Via Gittuuu (Recommended)
1. Open your Node.js project
2. Click "Deploy" → Select "Railway"
3. Gittuuu will:
   - Create Dockerfile automatically
   - Add railway.json configuration
   - Prepare project for deployment
4. Follow the CLI instructions shown

#### Option B: Manual Railway CLI
```bash
# Login to Railway
railway login

# Link your project
railway link

# Deploy
railway up
```

**Example URL:** `https://my-backend.railway.app`

---

## 🐳 Docker Setup

### Docker Templates Included

Gittuuu automatically creates Dockerfiles for:

1. **React (CRA)** - `Dockerfile.react`
   - Multi-stage build
   - Nginx for serving
   - Production optimized

2. **Vite** - `Dockerfile.vite`
   - Multi-stage build
   - Nginx for serving
   - Asset compression

3. **Next.js** - `Dockerfile.nextjs`
   - Standalone output
   - Node.js server
   - Optimized for SSR

4. **Node.js Backend** - `Dockerfile.nodejs`
   - Production dependencies only
   - Health checks ready
   - PM2 support (optional)

### Testing Docker Locally

For any project:

```bash
# 1. Gittuuu creates Dockerfile for you
# 2. Test locally:

cd /path/to/your/project

# Build image
docker build -t my-app .

# Run container
docker run -p 8080:80 my-app  # For frontend
# OR
docker run -p 3000:3000 my-app  # For backend

# Open browser: http://localhost:8080
```

### Docker Commands Reference

```bash
# List running containers
docker ps

# Stop container
docker stop <container-id>

# Remove container
docker rm <container-id>

# List images
docker images

# Remove image
docker rmi <image-id>

# View logs
docker logs <container-id>
```

---

## ☁️ AWS Migration Path

Your Docker setup is **100% AWS-ready**. When you're ready to migrate:

### Option 1: AWS ECS (Recommended)

```bash
# 1. Install AWS CLI
brew install awscli

# 2. Configure AWS credentials
aws configure

# 3. Create ECR repository
aws ecr create-repository --repository-name my-app

# 4. Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <your-aws-account-id>.dkr.ecr.us-east-1.amazonaws.com

# 5. Tag your image
docker tag my-app:latest <your-aws-account-id>.dkr.ecr.us-east-1.amazonaws.com/my-app:latest

# 6. Push to ECR
docker push <your-aws-account-id>.dkr.ecr.us-east-1.amazonaws.com/my-app:latest

# 7. Deploy to ECS via AWS Console or CLI
```

### Option 2: AWS EC2 (Manual)

```bash
# 1. Launch EC2 instance (t2.micro for free tier)
# 2. SSH into instance
ssh -i your-key.pem ec2-user@your-ec2-ip

# 3. Install Docker on EC2
sudo yum update -y
sudo yum install docker -y
sudo service docker start

# 4. Pull and run your Docker image
docker pull <your-aws-account-id>.dkr.ecr.us-east-1.amazonaws.com/my-app:latest
docker run -d -p 80:80 <image-name>
```

### Option 3: AWS App Runner (Easiest)

- Connect your GitHub repo
- App Runner auto-detects Dockerfile
- Automatic scaling and deployments
- Pay only for what you use

### AWS Services Comparison

| Service | Best For | Complexity | Cost |
|---------|----------|------------|------|
| **App Runner** | Quick deployments | Low | ~$5-20/month |
| **ECS Fargate** | Production apps | Medium | ~$10-50/month |
| **ECS EC2** | Cost optimization | High | ~$5-30/month |
| **Elastic Beanstalk** | Managed platform | Low | ~$10-40/month |

---

## 🎓 Learning Resources

### Docker
- [Docker Tutorial](https://docs.docker.com/get-started/)
- [Docker for Beginners](https://docker-curriculum.com/)

### Vercel
- [Vercel Documentation](https://vercel.com/docs)
- [Deploy with Vercel](https://vercel.com/docs/deployments/overview)

### Railway
- [Railway Documentation](https://docs.railway.app/)
- [Railway Docker Guide](https://docs.railway.app/deploy/dockerfiles)

### AWS
- [AWS Free Tier](https://aws.amazon.com/free/)
- [ECS Tutorial](https://aws.amazon.com/ecs/getting-started/)
- [ECR Documentation](https://docs.aws.amazon.com/ecr/)

---

## 🐛 Troubleshooting

### "VERCEL_TOKEN not configured"
- Make sure you added the token to `.env` file
- Restart the deployment server

### "Railway deployment failed"
- Install Railway CLI: `npm i -g @railway/cli`
- Login: `railway login`
- Make sure Docker is running

### "Docker build failed"
- Check if Docker Desktop is running
- Make sure Dockerfile exists in project root
- Check build logs for errors

### "Port already in use"
- Change PORT in `.env` file
- Or kill process: `lsof -ti:3000 | xargs kill`

---

## 📊 Cost Breakdown

### FREE Tier Limits

**Vercel (Forever Free):**
- ✅ Unlimited deployments
- ✅ 100GB bandwidth
- ✅ Serverless functions
- ✅ Custom domains

**Railway (Free $5/month):**
- ✅ ~500 hours of compute
- ✅ 1GB RAM usage
- ✅ 1GB storage
- ⚠️ Auto-sleep saves credits

**Total Cost: $0/month** for small projects! 🎉

---

## 🚀 Quick Start Checklist

- [ ] Install Docker Desktop
- [ ] Install Railway CLI
- [ ] Create Vercel account
- [ ] Create Railway account  
- [ ] Get Vercel API token
- [ ] Get Railway API token
- [ ] Update `.env` file
- [ ] Install server dependencies
- [ ] Start deployment server
- [ ] Deploy your first project!

---

## 📞 Support

Need help? Check:
1. This README
2. Platform documentation (links above)
3. GitHub Issues
4. Community Discord/Slack

Happy deploying! 🚀
