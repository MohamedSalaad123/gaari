# HaulLedger — Online Daily Truck Management System

HaulLedger is a full-stack, **online** Daily Truck Operations & Financial Management System built with **React**, **TypeScript**, **Tailwind CSS**, **Node.js**, **Express.js**, **MongoDB Atlas (Mongoose)**, and **JWT Authentication**.

It is designed for managing cargo and goods trucks every day—tracking daily trips, transportation income, vehicle expenses, rented-truck daily obligations (calculated once per working day), rental payments, and financial reports across mobile phones and computers anywhere with internet access.

---

## Key Features

- **Centralized Online MongoDB Atlas Database**: All users access the same persistent cloud database via Mongoose ODM—no SQLite, IndexedDB, or browser-local primary storage.
- **Complete JWT + bcrypt Security**:
  - First-time administrator setup screen that redirects to Sign In once created and permanently disables public registration afterwards.
  - Easy-to-remember password rules (**minimum 8 characters**, allowing uppercase, lowercase, and numbers without forcing complicated symbols).
  - Passwords hashed with `bcryptjs`; JWT Bearer tokens signed with `JWT_SECRET` and invalidated automatically via `tokenVersion` on password changes.
  - MongoDB-backed login rate limiting (5 failed attempts triggers a 15-minute lockout).
- **Bilingual Somali & English Interface**:
  - Default language: **Somali (`so`)**, switchable anytime to **English (`en`)** from the top bar and login screen.
  - Selected language persists across page refreshes.
- **Mobile-First Responsive Design**:
  - Built for smartphone and desktop use: sticky bottom navigation bar on mobile, large `44px+` touch targets, desktop tables transformed into clean mobile cards, and zero horizontal scrolling.
- **Accurate Truck & Rental Accounting**:
  - **Vehicles**: Company-owned or Rented trucks with plate, type, driver details, daily rental amount, and status (`Active`, `Inactive`, `Maintenance`).
  - **Daily Work**: Multiple cargo trips per truck on the same day.
  - **Expenses**: 7 categories (`Fuel`, `Food`, `Maintenance`, `Road fees`, `Loading and unloading`, `Driver allowance`, `Other expenses`) in USD.
  - **Vehicle Rental**: Only rented vehicles accrue rental obligations, billed **once per distinct working date** regardless of trip count. Rental payments are tracked separately from obligations.
  - **Financial Formulas**:
    - `Total Income = Sum of transportation income`
    - `Total Expenses = Sum of all recorded expenses`
    - `Total Rental = Sum of daily rental obligations for rented vehicles that worked`
    - `Net Balance = Total Income - Total Expenses - Total Rental`
- **Reports & Exports**: Daily, Weekly, Monthly, Vehicle, Expense, and Rental reports with date/vehicle filters, **PDF**, **Excel (`.xlsx`)**, and **Print** exports in both Somali and English.
- **Cloud Database Backup & Restore**: Trigger an authenticated JSON dump of all operational collections (`POST /api/backup/dump` / `GET /api/backup/download`) with SHA-256 checksum verification for manual local archival download in **Settings**, or run `npm run backup` from the CLI; restore snapshots without overwriting admin credentials.

---

## Environment Variables

Create a `.env` file (or configure environment variables in your cloud host) based on `.env.example`:

```env
PORT=3000
NODE_ENV=production
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/haulledger?retryWrites=true&w=majority
JWT_SECRET=replace-with-a-long-random-64-char-secret
CORS_ORIGIN=https://your-frontend-domain.com
VITE_API_URL=
APP_URL=https://your-app-domain.com
```

### Variable Reference
| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string (`mongodb+srv://...`) |
| `JWT_SECRET` | Cryptographically random secret used to sign JWT auth tokens |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins (e.g. `https://app.example.com`) |
| `VITE_API_URL` | Leave empty if frontend & backend are served from the same host; set to backend URL (e.g. `https://api.example.com`) if deployed separately |
| `PORT` | HTTP server port (`3000` by default) |

---

## MongoDB Atlas Setup

1. Create a free or dedicated cluster at [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Create a Database User with Read and Write permissions (`Database Access`).
3. Allow connections from your hosting provider in `Network Access` (`0.0.0.0/0` for dynamic cloud hosts like Render/Railway, or your server's static outbound IPs).
4. Copy the Node.js connection string (`mongodb+srv://...`), include the database name (`/haulledger`), and set it as `MONGODB_URI`.

---

## Local Development

```bash
npm install
cp .env.example .env
# Edit .env with your MONGODB_URI and JWT_SECRET
npm run dev
```

Open `http://localhost:3000`.

---

## Online Deployment Instructions

### Option A: Single-Service Deployment (Recommended — Render, Railway, Fly.io, VPS)
Express serves both the `/api/*` backend and the compiled Vite React frontend over HTTPS from one domain.

1. Push the repository to GitHub.
2. Create a new **Web Service** on **Render** or **Railway**.
3. Set Build & Start commands:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start` *(runs `node server.ts` on `NODE_ENV=production`)*
4. Add environment variables in your host dashboard:
   - `NODE_ENV=production`
   - `PORT=3000` (or let the platform inject `PORT`)
   - `MONGODB_URI=<your MongoDB Atlas URI>`
   - `JWT_SECRET=<strong random secret>`
   - `CORS_ORIGIN=https://your-service-url.onrender.com`
5. Deploy. HTTPS is terminated automatically by Render/Railway (`app.set('trust proxy', 1)` is already configured).

### Option B: Split Deployment (Vercel Frontend + Render/Railway Backend)
1. Deploy the backend Web Service on Render/Railway using `npm install` and `npm start`, setting `MONGODB_URI`, `JWT_SECRET`, and `CORS_ORIGIN=https://your-vercel-app.vercel.app`.
2. Deploy the frontend on **Vercel**:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Environment Variable**: `VITE_API_URL=https://your-backend.onrender.com`
3. All authenticated requests send `Authorization: Bearer <token>` headers automatically, ensuring mobile Safari, Chrome, and cross-origin HTTPS deployments work reliably.
