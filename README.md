# Price Ghost (`@price-tracker`)

> **Multi-Platform E-Commerce Price Tracker for Amazon, Flipkart, and Myntra.**  
> Silent automatic in-page product detection, scheduled price polling engine, interactive price history charts, and instant email alerts.

[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.x-61dafb.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-38bdf8.svg)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)

---

## 📖 Table of Contents

1. [System Architecture](#system-architecture)
2. [Key Capabilities](#key-capabilities)
3. [Repository Structure](#repository-structure)
4. [Prerequisites](#prerequisites)
5. [Quick Start Guide](#quick-start-guide)
6. [Loading the Chrome Extension](#loading-the-chrome-extension)
7. [Demo Data Seeding](#demo-data-seeding)
8. [API Reference Summary](#api-reference-summary)
9. [Environment Configuration](#environment-configuration)
10. [Docker Deployment](#docker-deployment)

---

## 🏗️ System Architecture

Price Ghost decouples silent in-browser discovery from server-side price monitoring:

```
                                  [ User Browsing ]
                                          │
                     ┌────────────────────┴────────────────────┐
                     ▼                                         ▼
            [ Amazon / Flipkart / Myntra ]              [ Web Dashboard ]
                     │                                         │
        (Silent Content Scripts - MV3)                         │
                     │                                         │
                     └────────────────────┬────────────────────┘
                                          │
                               (REST API / JWT Auth)
                                          │
                                          ▼
                             ┌─────────────────────────┐
                             │   Express API Server    │
                             │  (Port 5000 / Node.js)  │
                             └────────────┬────────────┘
                                          │
                      ┌───────────────────┴───────────────────┐
                      ▼                                       ▼
             [ MongoDB Database ]                    [ Cron Poller Engine ]
        (Canonical Items & User Alerts)             (Runs Every 1-2 Hours)
                                                              │
                                                              ▼
                                                   [ Multi-Platform Scrapers ]
                                                    (JSON-LD & DOM Fallbacks)
                                                              │
                                                              ▼
                                                   [ Price Drop Engine ]
                                                   (Drop % & Quiet Hours)
                                                              │
                                                              ▼
                                                  [ Nodemailer / SendGrid ]
                                                  (Price Drop Email Alerts)
```

---

## ✨ Key Capabilities

* **1-Click Manual Price Tracking**: Floating "👻 Track Price" widget rendered via encapsulated Shadow DOM on Amazon, Flipkart, and Myntra product pages. Select custom drop thresholds (5%, 10%, 15%, 20%) before tracking, or paste product links directly into the dashboard or extension.
* **SPA Navigation Support**: Automatically detects client-side route changes on Flipkart and Myntra using `history.pushState` wrappers and `MutationObserver`.
* **Toolbar Popup UI**: Built with React and Tailwind CSS. Features manual URL tracking, live title search, platform filter tabs, price drop indicators, inline threshold sliders, direct store links, and one-click untracking.
* **Autonomous Poller Engine**: Scheduled price polling with polite 2.5s request pacing, User-Agent rotation, and automatic price history logging (capped at 365 days).
* **Smart Drop Math & Quiet Hours**: Calculates discounts against initial price or original MRP. Suppresses non-urgent alert emails during sleep hours (e.g. 22:00 to 08:00).
* **Interactive Analytics**: Web portal powered by Recharts with dynamic target buy price bands and baseline reference curves.

---

## 📁 Repository Structure

```
Price_Ghost/
├── shared/                      # Single-source-of-truth TypeScript definitions
│   └── types.ts                 # Interfaces (Item, User, ExtractedProduct, etc.)
├── server/                      # Express.js REST API & Poller engine
│   ├── src/
│   │   ├── config/              # MongoDB connection & ENV loader
│   │   ├── middleware/          # JWT auth & sliding-window rate limiter
│   │   ├── models/              # Mongoose schemas (ItemModel, UserModel)
│   │   ├── routes/              # Express routers (auth, items, user, dashboard)
│   │   ├── services/            # Poller, email templates, price math, scrapers
│   │   ├── scripts/             # Mock database seeder (seed.js)
│   │   └── app.js               # Express application entry point
│   ├── Dockerfile
│   └── package.json
├── extension/                   # Chrome Extension (Manifest V3)
│   ├── src/
│   │   ├── background/          # Service worker & extension badge updates
│   │   ├── content/             # In-page extractors & auto-tracker
│   │   └── popup/               # React + Tailwind toolbar popup UI
│   ├── icons/                   # Extension icons (16x16, 48x48, 128x128)
│   ├── manifest.json
│   └── vite.config.ts
├── website/                     # React 18 Web Dashboard
│   ├── src/
│   │   ├── components/          # Navbar, PriceChart (Recharts)
│   │   ├── context/             # AuthContext (Google OAuth + Dev login)
│   │   ├── pages/               # Landing, Login, Dashboard, Preferences, Install
│   │   └── services/            # Axios API client
│   └── vite.config.ts
├── docker-compose.yml           # Production Docker orchestration
├── PROJECT_DETAILS.md           # Comprehensive design document & roadmap
└── package.json                 # Monorepo workspaces manifest
```

---

## ⚙️ Prerequisites

* **Node.js**: v18.x or v20.x LTS
* **MongoDB**: Local MongoDB instance running on port `27017` (or MongoDB Atlas connection string)
* **Google Chrome**: For running the extension

---

## 🚀 Quick Start Guide

### 1. Clone & Install Dependencies
```bash
git clone <repo-url>
cd Price_Ghost

# Install all monorepo workspaces in one command
npm install
```

### 2. Configure Environment Variables
Copy and adjust the default settings in `server/.env` (pre-configured for local dev):
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/price-tracker
JWT_SECRET=dev_secret_key_change_in_production_123456789
CLIENT_URL=http://localhost:5173
```

### 3. Start the Backend API Server
```bash
cd server
npm run dev
```
*The API will be available at `http://localhost:5000`.* Verify via `http://localhost:5000/api/health`.

#### 🩺 Health & Upstream Monitor Endpoints

| Endpoint | Method | Purpose | Use Case |
|---|---|---|---|
| `/api/health` (or `/health`, `/healthz`) | `GET`, `HEAD` | Primary heartbeat & liveness | Uptime monitors (Render, UptimeRobot, Netlify proxy) |
| `/api/health/upstream` (or `/health/upstream`) | `GET`, `HEAD` | Deep upstream dependency health check | Checks MongoDB latency, Poller status, Amazon/Flipkart/Myntra reachability, SMTP, & memory |
| `/api/health/ready` (or `/health/ready`) | `GET`, `HEAD` | Cloud / K8s readiness probe | Returns 200 if DB connected, 503 if DB down |
| `/api/health/live` (or `/health/live`) | `GET`, `HEAD` | Cloud / K8s liveness probe | Returns 200 if Node process is alive |
| `/ping` (or `/api/health/ping`) | `GET`, `HEAD` | Ultra-lightweight ping | High-frequency ping (`{"pong": true}`) |

> **Note:** Health routes bypass sliding-window rate limiters, emit strict anti-cache headers (`Cache-Control: no-cache`), and proactively trigger background MongoDB reconnect attempts when disconnected.

### 4. Start the Web Dashboard
In a new terminal window:
```bash
cd website
npm run dev
```
*Access the dashboard at `http://localhost:5173`.*

---

## 🧩 Loading the Chrome Extension

1. Build the extension bundle:
   ```bash
   cd extension
   npm run build
   ```
2. Open Google Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** via the toggle in the top-right corner.
4. Click **Load unpacked** (top-left).
5. Select the `extension/dist` folder inside `Price_Ghost`.
6. Pin **Price Ghost** to your browser toolbar!

---

## 🧪 Demo Data Seeding

To immediately preview realistic products, price history graphs, and triggered drop alerts without manual scraping:

```bash
cd server
npm run seed
```
This populates MongoDB with:
* **Sony WH-1000XM5 Headphones** (Amazon) — *Target Met! Dropped from ₹27,990 to ₹22,990 (-17.8%)*
* **Apple iPhone 15 128GB** (Flipkart) — *Watching price changes*
* **Nike Air Zoom Pegasus 40** (Myntra) — *Target Met! Dropped from ₹10,495 to ₹8,495 (-19.1%)*
* **Demo User** account (`demo@pricetracker.local`)

---

## 📡 API Reference Summary

| Method | Endpoint | Access | Description |
|:---|:---|:---|:---|
| `POST` | `/api/auth/google` | Public | Exchange Google ID token for JWT session |
| `POST` | `/api/auth/dev-login` | Public | Instant passwordless dev sign-in |
| `GET` | `/api/auth/me` | Bearer JWT | Fetch current user profile |
| `GET` | `/api/items/tracked` | Bearer JWT | Retrieve all items tracked by user |
| `POST` | `/api/items/track` | Bearer JWT | Upsert canonical item & link to user |
| `POST` | `/api/items/track-url` | Bearer JWT | Manually scrape & track item from URL |
| `DELETE` | `/api/items/untrack/:id` | Bearer JWT | Remove item from tracking |
| `PUT` | `/api/items/:id/threshold` | Bearer JWT | Update target percentage drop |
| `GET` | `/api/items/:id/history` | Bearer JWT | Price history array for charts |
| `GET` | `/api/dashboard/summary` | Bearer JWT | Dashboard metrics (savings, alerts) |
| `GET` | `/api/dashboard/alerts` | Bearer JWT | Active price drop alerts feed |
| `POST` | `/api/user/unsubscribe` | Public | One-click email unsubscribe |

---

## 🐳 Docker Deployment

Run the complete stack (MongoDB 6.0 + Server API) in containers:

```bash
docker compose up -d --build
```
* To view server logs: `docker compose logs -f server`
* To stop: `docker compose down`

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
