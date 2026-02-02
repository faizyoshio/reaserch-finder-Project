# ResearchFinder - Terminal Commands

Complete reference untuk semua commands yang diperlukan untuk menjalankan ResearchFinder dari awal hingga production.

## Installation

### Using pnpm (Recommended - Fastest)

```bash
pnpm install
```

### Using npm

```bash
npm install
```

### Using yarn

```bash
yarn install
```

### Using bun

```bash
bun install
```

---

## Development

### Start Dev Server (Hot Reload)

**pnpm:**
```bash
pnpm dev
```

**npm:**
```bash
npm run dev
```

**yarn:**
```bash
yarn dev
```

**bun:**
```bash
bun dev
```

Server berjalan di: `http://localhost:3000`

### Linting

**pnpm:**
```bash
pnpm lint
```

**npm:**
```bash
npm run lint
```

**yarn:**
```bash
yarn lint
```

**bun:**
```bash
bun run lint
```

---

## Building

### Build for Production

**pnpm:**
```bash
pnpm build
```

**npm:**
```bash
npm run build
```

**yarn:**
```bash
yarn build
```

**bun:**
```bash
bun run build
```

### Start Production Server

**After Building - pnpm:**
```bash
pnpm build
pnpm start
```

**After Building - npm:**
```bash
npm run build
npm start
```

**After Building - yarn:**
```bash
yarn build
yarn start
```

**After Building - bun:**
```bash
bun run build
bun start
```

Production server berjalan di: `http://localhost:3000`

---

## Complete Development Workflow

### 1. Windows PowerShell

```powershell
# Install dependencies
npm install

# Start development
npm run dev

# Open browser
start http://localhost:3000

# Stop (Ctrl+C)

# Build for production
npm run build

# Start production server
npm start
```

### 2. Windows Command Prompt (cmd)

```cmd
# Install dependencies
npm install

# Start development
npm run dev

# Open browser
start http://localhost:3000

# Stop (Ctrl+C)

# Build for production
npm run build

# Start production server
npm start
```

### 3. macOS/Linux (bash/zsh)

```bash
# Install dependencies
npm install

# Start development
npm run dev

# Open browser
open http://localhost:3000

# Stop (Ctrl+C)

# Build for production
npm run build

# Start production server
npm start
```

---

## Docker Commands

### Build Docker Image

```bash
docker build -t researchfinder:latest .
```

### Run Docker Container

```bash
docker run -p 3000:3000 researchfinder:latest
```

### Run with Environment Variables

```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  researchfinder:latest
```

### Stop Container

```bash
docker stop <container_id>
```

### Remove Image

```bash
docker rmi researchfinder:latest
```

---

## Vercel Deployment

### Install Vercel CLI

```bash
npm install -g vercel
```

### Deploy to Vercel

```bash
# First time deployment
vercel

# Subsequent deployments
vercel --prod
```

### Connect to GitHub & Auto-Deploy

```bash
vercel --link
```

---

## Git Commands

### Initialize Git Repository

```bash
git init
git add .
git commit -m "Initial commit: ResearchFinder setup"
```

### Push to GitHub

```bash
git remote add origin https://github.com/yourusername/researchfinder.git
git branch -M main
git push -u origin main
```

---

## Environment Setup (if needed)

### Create .env.local (Not required for ResearchFinder)

```bash
# Create file
echo "" > .env.local

# Add environment variables if any
```

### Load Environment Variables

```bash
# On Windows (PowerShell)
Get-Content .env.local | ForEach-Object {
  $name, $value = $_.split("=")
  [Environment]::SetEnvironmentVariable($name, $value)
}

# On macOS/Linux
set -a
source .env.local
set +a
```

---

## Troubleshooting Commands

### Clear Node Modules & Cache

```bash
# Remove node_modules
rm -rf node_modules

# Clear npm cache
npm cache clean --force

# Reinstall
npm install
```

### Check Node & npm Versions

```bash
node --version
npm --version
```

### Test Port 3000 Availability

**Windows PowerShell:**
```powershell
Test-NetConnection -ComputerName localhost -Port 3000
```

**macOS/Linux:**
```bash
lsof -i :3000
```

### Kill Process on Port 3000

**Windows PowerShell:**
```powershell
Get-Process node | Stop-Process -Force
```

**macOS/Linux:**
```bash
lsof -ti:3000 | xargs kill -9
```

---

## Performance Monitoring

### Check Build Size

```bash
# After building
du -sh .next
```

### Analyze Bundle

```bash
npm install -D @next/bundle-analyzer

# Add to next.config.mjs and run
npm run build
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Install | `npm install` |
| Dev | `npm run dev` |
| Build | `npm run build` |
| Start Prod | `npm start` |
| Lint | `npm run lint` |
| Docker Build | `docker build -t researchfinder:latest .` |
| Docker Run | `docker run -p 3000:3000 researchfinder:latest` |
| Vercel Deploy | `vercel --prod` |

---

## Common Issues & Solutions

### "Port 3000 is already in use"

```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Windows PowerShell
Get-Process node | Stop-Process -Force
```

### "Module not found" error

```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install
```

### "Build fails with TypeScript errors"

```bash
# Check TypeScript
npx tsc --noEmit

# Fix types
npm install --save-dev @types/node @types/react
```

### "Slow build time"

```bash
# Use faster builder
npm install -D @swc/core swc-loader

# Or use Turbopack (included in Next.js 15+)
```

---

**All commands tested on:**
- Node.js 20.9+
- npm 10.0+
- macOS 12+
- Windows 10/11
- Ubuntu 20.04+

Happy coding! 🚀
