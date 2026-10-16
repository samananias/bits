# Virtual ZKTeco Terminal — Cloud Deployment Guide

> **Target Architecture:** Vercel (Next.js Frontend) + Neon (PostgreSQL Database) + Container Host (Railway / Render / VPS for Virtual ZKTeco Terminal & Backend API).

---

## 1. Architectural Overview

```
                      LIVE PRODUCTION / DEMO TOPOLOGY
                      
 ┌──────────────────────┐         HTTPS / WSS          ┌──────────────────────┐
 │       VERCEL         │ ───────────────────────────> │   RAILWAY / RENDER   │
 │   (BITS Frontend)    │                              │  (BITS Express API)  │
 └──────────────────────┘                              └──────────┬───────────┘
            │                                                     │
            │ Opens Face (:3030)                                  │ Connects to (:4370)
            ▼                                                     ▼
 ┌──────────────────────┐                              ┌──────────────────────┐
 │   RAILWAY / RENDER   │ <─────────────────────────── │         NEON         │
 │ (Virtual Simulator)  │         Stores Data          │  (Postgres Database) │
 └──────────────────────┘                              └──────────────────────┘
```

### Why Does the Simulator Need a Dedicated Container Host?
- **Vercel is Serverless HTTP:** It executes short-lived stateless functions (Next.js SSR/API). It cannot bind raw persistent TCP listening sockets (port `4370`), nor can it hold stateful background client connections.
- **Neon is Managed SQL Storage:** Neon hosts serverless PostgreSQL databases. It stores data tables, not Node.js processes or network sockets.
- **The Simulator Requires Persistent Daemons:** It runs a persistent raw TCP binary protocol engine on port `4370` and an HTTP/WebSocket device face server on port `3030`.

---

## 2. Source Repositories & Docker Definitions

The simulator is maintained both as a submodule inside BITS and as an independent standalone repository:
- **Standalone Repo:** `https://github.com/samananias/zkteco-simulator-app` (branch `main`)
- **BITS Submodule Path:** `simulator/`
- **Container Buildfile:** `simulator/Dockerfile`
- **Production Compose File:** `docker-compose.prod.yml`

### Container Build Specification (`simulator/Dockerfile`)
The simulator utilizes an optimized multi-stage Node.js 20 Alpine container:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV ZK_TCP_HOST=0.0.0.0
ENV ZK_HTTP_HOST=0.0.0.0
ENV ZK_TCP_PORT=4370
ENV ZK_HTTP_PORT=3030
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 4370
EXPOSE 3030
CMD ["node", "dist/index.js"]
```

---

## 3. Deployment Options

### Option A: Railway (Fastest & Recommended for Vercel + Neon)

Railway natively supports GitHub Docker builds and custom TCP port proxies.

#### Step 1: Deploy Simulator on Railway
1. Sign in to [Railway.app](https://railway.app).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select the repository: **`samananias/zkteco-simulator-app`** (or `samananias/bits` with Root Directory set to `simulator`).
4. Railway will automatically detect `Dockerfile` and build the container.
5. In **Service Settings**:
   - **Networking** → Click **Generate Domain** to get a public HTTPS address for the web UI (e.g. `https://zkteco-simulator-production.up.railway.app`).
   - Under **TCP Proxies**, add port `4370` (allows your backend to connect to the ZKTeco binary protocol remotely).
6. In **Variables**, add:
   ```env
   FRONTEND_URL=https://your-bits-app.vercel.app
   ```
   *(This whitelists your Vercel domain in the simulator's CORS/CSRF security guard).*

#### Step 2: Configure Frontend in Vercel
1. Go to your **Vercel Dashboard** → select your BITS project.
2. Go to **Settings** → **Environment Variables**.
3. Add or update:
   ```env
   NEXT_PUBLIC_ZK_SIMULATOR_URL=https://zkteco-simulator-production.up.railway.app
   ```
4. Trigger a **Redeploy**.

---

### Option B: Cloud VPS / Dedicated Server (DigitalOcean, AWS EC2, Linode, Hetzner)

If hosting the backend and simulator together on an Ubuntu VPS:

1. Clone the repository and navigate to the project root:
   ```bash
   git clone https://github.com/samananias/bits.git
   cd bits
   ```
2. Copy the production environment template:
   ```bash
   cp .env.docker.example .env
   ```
3. Configure your production `.env`:
   ```env
   DATABASE_URL=postgresql://user:password@ep-xyz.neon.tech/db_bits?sslmode=require
   FRONTEND_URL=https://your-bits-app.vercel.app
   NEXT_PUBLIC_ZK_SIMULATOR_URL=http://<YOUR_VPS_PUBLIC_IP>:3030
   ZK_HOST=simulator
   ZK_PORT=4370
   ```
4. Start the stack with Docker Compose:
   ```bash
   docker compose -f docker-compose.prod.yml up --build -d
   ```
5. Ensure VPS firewall (UFW / Security Group) allows ports:
   - `3030` (HTTP Web Face for the browser)
   - `4370` (TCP ZKTeco protocol if accessed from an external backend)

---

### Option C: Local Developer / Offline Demo Mode (Zero Cost)

If cloud deployment is not required (e.g., local QA, client presentation on a laptop):

1. **Terminal 1 (Simulator):**
   ```bash
   cd simulator
   npm start
   ```
2. **Terminal 2 (Backend):**
   ```bash
   cd backend
   npm run dev
   ```
3. **Terminal 3 (Frontend):**
   ```bash
   cd frontend
   npm run dev
   ```
4. Frontend connects to `http://localhost:3000`, simulator face opens at `http://localhost:3030`.

---

## 4. Environment Variables Reference

| Variable | Target Component | Purpose & Example Value |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_ZK_SIMULATOR_URL` | **Frontend** (`frontend/.env` or Vercel) | Public URL opened when clicking *Open Virtual Terminal*.<br>Default: `http://localhost:3030`<br>Cloud: `https://simulator.yourdomain.com` |
| `FRONTEND_URL` | **Simulator** (`simulator/.env` or Container) | Origin whitelisted to prevent drive-by CSRF attacks.<br>Default: `http://localhost:3000`<br>Cloud: `https://bits.vercel.app` |
| `ZK_HOST` | **Backend** (`backend/.env` or Container) | IP or container hostname of the ZKTeco terminal.<br>Default: `127.0.0.1`<br>Docker: `simulator` |
| `ZK_PORT` | **Backend** (`backend/.env` or Container) | ZKTeco binary protocol port.<br>Default: `4370` |
| `SIMULATOR_HTTP_PORT` | **Simulator** (`simulator/.env`) | Internal port for the HTTP device face.<br>Default: `3030` |

---

## 5. Security Guardrails in Cloud Environments

The simulator includes built-in defenses against attacks when accessible over the web:

1. **CORS & CSRF Origin Whitelist:**
   - Any HTTP request with an untrusted `Origin` header is rejected with `403 Forbidden`.
   - Authorized origins: `localhost:3030`, `localhost:3000`, and the domain configured in `FRONTEND_URL`.
2. **Rate Limiting:**
   - Sliding-window rate limiting on `/api/punch` and `/api/reset` (max 40 requests per 5s per IP) to prevent denial-of-service flooding.
3. **Payload & Buffer Bounds:**
   - Maximum 64 KB JSON body size.
   - Maximum 1 MB streaming buffer ceiling for TCP packet framing.
4. **Input Sanitization:**
   - `userId` format enforced via regex (`/^[a-zA-Z0-9_-]{1,24}$/`).
   - Timestamps bounded (cannot be in the distant past or >24h into the future).
5. **Inactive Employee Ingestion Rejection:**
   - Backend discards punches from non-`ACTIVE` employees and logs a `SECURITY_ALERT` entry.

---

## 6. Verification Checklist

After deploying the simulator and updating Vercel environment variables:

- [ ] **Web Face Accessible:** Navigate to `https://<YOUR_SIMULATOR_URL>` in your browser. The ZKTeco K14 LCD face and interactive keypad render cleanly.
- [ ] **CORS Check:** Verify that punching from the web face does not trigger console CORS errors.
- [ ] **Device Page Integration:**
  1. Open your Vercel deployment (`https://bits.vercel.app/devices`).
  2. Verify the **Virtual ZKTeco Terminal** card displays **Online** and **Sync On**.
  3. Click **Open Virtual Terminal ↗** — confirm it opens the cloud simulator in a new tab.
  4. Perform a punch in the terminal tab.
  5. Return to BITS and verify the punch is logged in the attendance records within 1–2 seconds.
