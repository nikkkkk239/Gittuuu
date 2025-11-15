# 🚀 Quick Deployment Reference

## Setup (One-time)
```bash
# 1. Install dependencies
cd server && npm install

# 2. Get API tokens
Vercel: https://vercel.com/account/tokens
Railway: https://railway.app/account/tokens

# 3. Add to server/.env
VERCEL_TOKEN=your_token
RAILWAY_TOKEN=your_token

# 4. Install Railway CLI
npm i -g @railway/cli

# 5. Start server
npm start
```

## Deploy Frontend (Vercel)
- **Supported**: React, Vite, Next.js
- **Platform**: Vercel
- **Result**: Live URL in ~2 minutes
- **Cost**: FREE

## Deploy Backend (Railway)
- **Supported**: Node.js, Express, any Docker app
- **Platform**: Railway
- **Result**: Live URL + Docker deployment
- **Cost**: FREE ($5 credit/month)

## Docker Commands
```bash
# Build
docker build -t myapp .

# Run frontend
docker run -p 8080:80 myapp

# Run backend
docker run -p 3000:3000 myapp

# View logs
docker logs <container-id>
```

## AWS Migration (Future)
1. Same Dockerfile works!
2. Push to AWS ECR
3. Deploy to ECS/EC2/App Runner
4. No code changes needed

## Troubleshooting
- Server not running? `cd server && npm start`
- Docker error? Make sure Docker Desktop is open
- Token error? Check `.env` file
- Port in use? Change PORT in `.env`

---
**Full Guide**: See DEPLOYMENT_GUIDE.md
