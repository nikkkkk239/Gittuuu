# Example: How to Use the Deployment System

## Scenario 1: Deploy a React App to Vercel

### From your Electron App:
1. Open your React project folder
2. Click "Deploy" button
3. The system will:
   - Detect it's a React/Vite project ✅
   - Run `npm install` and `npm run build` ✅
   - Create a ZIP of your project ✅
   - Send to deployment server ✅
   - Deploy to Vercel via API ✅
   - Return live URL: `https://my-app-xyz.vercel.app` 🎉

### What happens behind the scenes:
```javascript
// Client automatically calls:
await window.electron.deployProject(projectPath, {
  platform: 'vercel',  // auto-detected
  projectName: 'my-react-app'
})

// Server receives and:
// 1. Extracts project files
// 2. Sends to Vercel API
// 3. Returns deployment URL
```

---

## Scenario 2: Deploy a Node.js Backend to Railway

### From your Electron App:
1. Open your Express/Node.js project folder
2. Click "Deploy" button
3. The system will:
   - Detect it's a backend project ✅
   - Create appropriate Dockerfile ✅
   - Add railway.json configuration ✅
   - Prepare for Railway deployment ✅
   - Show Railway CLI commands ✅

### What you'll see:
```
✅ Project prepared for Railway deployment

Next steps:
1. Install Railway CLI: npm i -g @railway/cli
2. Login to Railway: railway login
3. Initialize project: railway init
4. Deploy: railway up

Your app will run in a Docker container on Railway!
```

### The Dockerfile created for you:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

---

## Scenario 3: Test Locally Before Deploying

### From your Electron App:
1. Open any project
2. Click "Deploy" → Select "Local"
3. The system will:
   - Build your project ✅
   - Deploy to `localhost:3000/deployed/...` ✅
   - You can test before pushing to cloud ✅

### Local testing:
```
Deployment successful!
URL: http://localhost:3000/deployed/1234567890
Platform: local

Open this URL to test your app locally.
```

---

## Scenario 4: Docker + AWS (Future)

### When you're ready for AWS:

Your Dockerfile is already AWS-ready! Just:

```bash
# 1. Build Docker image (same as always)
docker build -t my-app .

# 2. Push to AWS ECR
aws ecr get-login-password | docker login --username AWS ...
docker tag my-app:latest <aws-account>.dkr.ecr.us-east-1.amazonaws.com/my-app
docker push <aws-account>.dkr.ecr.us-east-1.amazonaws.com/my-app

# 3. Deploy to ECS/Fargate
# Use AWS Console or CLI to create ECS service
```

**Zero code changes needed!** Your Dockerfile works everywhere.

---

## Example Projects You Can Deploy

### ✅ Frontend Projects (→ Vercel)
- Create React App
- Vite + React/Vue/Svelte
- Next.js
- Static HTML/CSS/JS

### ✅ Backend Projects (→ Railway)
- Express.js API
- Node.js server
- REST API
- GraphQL server
- WebSocket server

### ✅ Fullstack Projects
- Deploy `/client` folder to Vercel
- Deploy `/server` folder to Railway
- Connect them with environment variables

---

## Configuration Examples

### Frontend (Vercel)
```javascript
// Automatic deployment - no config needed!
// But you can customize:

{
  platform: 'vercel',
  projectName: 'my-awesome-app',
  buildCommand: 'npm run build',
  outputDir: 'dist'
}
```

### Backend (Railway)
```javascript
// Deployment with custom settings:

{
  platform: 'railway',
  projectName: 'my-api',
  dockerFile: true,  // Auto-created
  envVars: {
    PORT: 3000,
    NODE_ENV: 'production'
  }
}
```

---

## Environment Variables

### For Vercel Deployments
Add in Vercel dashboard or use CLI:
```bash
vercel env add API_URL production
```

### For Railway Deployments
Add in Railway dashboard or use CLI:
```bash
railway variables set DATABASE_URL=postgresql://...
```

---

## Real-World Example

Let's say you built a todo app:

```
my-todo-app/
├── client/          (React + Vite)
├── server/          (Express + MongoDB)
└── README.md
```

### Deploy it:

1. **Deploy Backend:**
   - Open `my-todo-app/server` in Gittuuu
   - Click Deploy → Railway
   - Get URL: `https://todo-api.railway.app`
   - Note the URL for frontend

2. **Update Frontend:**
   ```javascript
   // In client/.env
   VITE_API_URL=https://todo-api.railway.app
   ```

3. **Deploy Frontend:**
   - Open `my-todo-app/client` in Gittuuu
   - Click Deploy → Vercel
   - Get URL: `https://my-todo-app.vercel.app`

4. **Done!** 🎉
   - Frontend: `https://my-todo-app.vercel.app`
   - Backend: `https://todo-api.railway.app`
   - Both running in production
   - Both using Docker (backend)
   - Total cost: $0 (free tiers)

---

## Cost Calculator

### Free Tier Limits

**Vercel:**
- Deployments: Unlimited
- Bandwidth: 100GB/month
- Build time: 6,000 minutes/month
- **Good for:** ~10,000 visitors/month

**Railway:**
- Compute: $5 credit/month
- ~500 hours (always-on: 730h/month)
- **Good for:** Small to medium APIs

### When you exceed free tier:

**Vercel Pro:** $20/month
- 1TB bandwidth
- Unlimited builds
- Advanced features

**Railway:** Pay-as-you-go
- $0.000463/GB-s (memory)
- $0.000231/vCPU-s (CPU)
- ~$5-20/month for small apps

---

## Tips for Success

### 1. Keep Dependencies Updated
```bash
npm outdated
npm update
```

### 2. Use Environment Variables
Never hardcode:
- API keys
- Database URLs
- Secret tokens

### 3. Test Locally First
```bash
# Use local deployment
platform: 'local'
# Test thoroughly before cloud deploy
```

### 4. Monitor Your Apps
- Vercel: Analytics built-in
- Railway: Metrics dashboard
- Set up error tracking (Sentry)

### 5. Enable CORS for APIs
```javascript
// In your Express app
app.use(cors({
  origin: ['https://my-frontend.vercel.app']
}))
```

---

## Next Steps

1. ✅ Complete setup (see DEPLOYMENT_GUIDE.md)
2. ✅ Get API tokens
3. ✅ Deploy a test project
4. ✅ Share your live URL!
5. ⏭️ Learn Docker optimization
6. ⏭️ Explore AWS when ready

**Happy deploying!** 🚀
