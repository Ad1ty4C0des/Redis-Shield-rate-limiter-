# 🚀 Live Deployment Guide: Redis Shield on Render with Keep-Alive

This guide walks you through deploying **Redis Shield** 100% free forever with **zero cold starts**, persistent WebSockets, and cloud Redis.

---

## 🏗️ Deployment Architecture

```
                    ┌─────────────────────────────────────────┐
                    │      UptimeRobot / Cron-Job.org         │
                    │   (GET /api/ping every 10 minutes)      │
                    └────────────────────┬────────────────────┘
                                         │ (Keeps service awake 24/7)
                                         ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                       Render Free Web Service                               │
 │                                                                             │
 │   ┌─────────────────────────────┐         ┌─────────────────────────────┐   │
 │   │      React Dashboard        │         │     Express API Gateway     │   │
 │   │  (Served from client/dist)  │ ◄─────► │   + WebSocket Hub (Port)    │   │
 │   └─────────────────────────────┘         └──────────────┬──────────────┘   │
 └──────────────────────────────────────────────────────────┼──────────────────┘
                                                            │ (TLS: rediss://)
                                                            ▼
                                             ┌─────────────────────────────┐
                                             │     Upstash Cloud Redis     │
                                             │  (Free 10K commands/day)    │
                                             └─────────────────────────────┘
```

---

## Step 1: Create Free Upstash Redis Database (2 Minutes)

1. Navigate to **[console.upstash.com](https://console.upstash.com/)** and sign in with your GitHub account.
2. Click **Create Database**:
   - **Name**: `redis-shield`
   - **Type**: Regional
   - **Region**: Choose a region close to your Render deployment (e.g. `us-east-1` for Virginia/Ohio, or `eu-central-1` for Frankfurt).
   - **TLS (SSL)**: Enabled (checked).
3. Click **Create**.
4. In the database overview, scroll down to the **Connect to your database** section:
   - Select the **ioredis** or **Redis URL** tab.
   - Copy the connection URL. It looks like:
     ```
     rediss://default:your_password_here@us1-example-38492.upstash.io:6379
     ```
   *(Keep this string handy for Step 3).*

---

## Step 2: Push Code to GitHub

All cloud-ready configurations have been prepared in your codebase:
- Cloud TLS support for `rediss://` in [redis.js](file:///c:/Users/adips/Downloads/Redis%20project/server/src/config/redis.js).
- Full-stack production build and static asset serving in [server.js](file:///c:/Users/adips/Downloads/Redis%20project/server/src/server.js).
- Dynamic auto-detecting WebSocket and API URLs in [useWebSocket.js](file:///c:/Users/adips/Downloads/Redis%20project/client/src/hooks/useWebSocket.js).

Open PowerShell in your project folder (`c:\Users\adips\Downloads\Redis project`):

```bash
# 1. Initialize git
git init

# 2. Stage all files (.env and node_modules are safely ignored by .gitignore)
git add .

# 3. Commit
git commit -m "feat: production cloud deployment ready with Upstash and Render keep-alive"

# 4. Set branch to main
git branch -M main

# 5. Link to your GitHub repository (replace with your repo URL from github.com/new)
git remote add origin https://github.com/<YOUR-USERNAME>/redis-shield.git

# 6. Push
git push -u origin main
```

---

## Step 3: Deploy on Render (Unified Single Service)

Because we configured Express to serve the compiled React dashboard directly from `client/dist`, you only need **one single free Render web service** for both the backend, WebSocket engine, and frontend!

1. Go to **[dashboard.render.com](https://dashboard.render.com/)** and sign in with GitHub.
2. Click **New +** -> **Web Service**.
3. Select your `redis-shield` repository.
4. Fill in the service configuration:
   - **Name**: `redis-shield`
   - **Region**: Same region as Upstash (e.g. `Ohio (US East)` or `Frankfurt (EU Central)`).
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**:
     ```bash
     npm run build
     ```
     *(This automatically runs `npm install`, builds the Vite dashboard to `client/dist`, and installs dependencies).*
   - **Start Command**:
     ```bash
     npm start
     ```
   - **Instance Type**: **Free**
5. Scroll down to **Environment Variables** and add:
   - `REDIS_URL`: Paste your Upstash connection string from Step 1 (`rediss://default:...@...upstash.io:6379`).
   - `ADMIN_KEY`: `shield_admin_master_key`
   - `NODE_ENV`: `production`
6. Click **Deploy Web Service**.

Render will now build the project and launch the server. Once the build completes, you will receive a public HTTPS URL:
`https://redis-shield-xxxx.onrender.com`

---

## Step 4: Set Up the Free Keep-Alive Ping (Zero Cold Starts)

To prevent Render from ever spinning down into 15-minute inactivity sleep:

1. Go to **[cron-job.org](https://cron-job.org/)** (100% free forever) or **[UptimeRobot](https://uptimerobot.com/)**.
2. Create a new cron job / monitor:
   - **Title**: `Redis Shield Health Ping`
   - **URL**: `https://your-service-name.onrender.com/api/ping`
   - **Execution Schedule**: **Every 10 minutes** (e.g. `*/10 * * * *`).
3. Save the job.

### Why this works:
- Render's sleep timer is **15 minutes**.
- By sending a lightweight HTTP request to `/api/ping` every **10 minutes**, Render detects active incoming traffic and **never spins down**.
- The Express server, Redis subscriber, background worker daemon, and WebSocket hub stay alive **24/7/365** with **0ms cold start delay**.
