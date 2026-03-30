# Bolivia Intelligence Platform — Setup Guide

## Prerequisites
- Node.js 18+
- Python 3.8+ (for data conversion only)
- A free Vercel account

---

## Step 1 — Convert your data

```bash
# Copy your parquet file into the /data/ directory
cp path/to/bolivia_processed_data.parquet data/

# Run the conversion script
python scripts/convert_parquet.py

# This creates data/bolivia_data.json (the web app reads this)
```

---

## Step 2 — Local development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local
# Then edit .env.local with your usernames/passwords

# Start dev server
npm run dev
# Visit http://localhost:3000
```

---

## Step 3 — Deploy to Vercel (free)

1. Push this project to a GitHub repository
2. Go to vercel.com → "New Project" → import your repo
3. Add these environment variables in Vercel dashboard:
   - `NEXTAUTH_SECRET` — run `openssl rand -base64 32` to generate
   - `NEXTAUTH_URL` — your Vercel URL (e.g., `https://yourproject.vercel.app`)
   - `AUTH_USER_1_NAME` — e.g., `admin`
   - `AUTH_USER_1_PASSWORD` — a strong password
   - `AUTH_USER_1_EMAIL` — your email
   - (Add more users as needed: `AUTH_USER_2_*`, etc.)
4. Click Deploy — done!

---

## Updating data

When you have new PowerBI exports:

```bash
# 1. Overwrite the parquet file
cp new_export.parquet data/bolivia_processed_data.parquet

# 2. Regenerate JSON
python scripts/convert_parquet.py

# 3. Commit and push — Vercel auto-deploys in ~30 seconds
git add data/
git commit -m "Update market data $(date +%Y-%m-%d)"
git push
```

---

## User management

Users are defined in environment variables. No database needed.

```bash
# .env.local — add as many users as needed
AUTH_USER_1_NAME=carlos
AUTH_USER_1_PASSWORD=SecurePassword123
AUTH_USER_1_EMAIL=carlos@company.com

AUTH_USER_2_NAME=analyst
AUTH_USER_2_PASSWORD=AnotherPassword456
AUTH_USER_2_EMAIL=analyst@company.com
```

Change passwords by updating the env vars in Vercel and redeploying.

---

## Dashboard sections

| Route | Description |
|-------|-------------|
| `/dashboard` | KPI Overview — market health, top movers, rolling windows |
| `/dashboard/predator` | Predator Engine v4 — vulnerability scoring |
| `/dashboard/poach` | Poach Index — supplier poachability with tiers A/B/C |
| `/dashboard/loyalty` | Loyalty Analysis — trajectory, at-risk, cohort |
| `/dashboard/suppliers` | Supplier Deep Dive — 360° profile |
| `/dashboard/buyers` | Trader Analysis — share of wallet, pricing power |
| `/dashboard/compare` | Trader vs Trader Comparison |
| `/dashboard/market` | Market Evolution — price forecast, seasonal patterns |
| `/dashboard/logistics` | Logistics — customs posts, shipment sizes |
| `/dashboard/matrix` | Supplier × Buyer Matrix |
| `/dashboard/new-suppliers` | New Supplier Tracker — velocity, survival |
| `/dashboard/minerals` | Mineral Hit List — commercial leads |
| `/dashboard/forensic` | Forensic Detective — hidden buyer locator |
| `/dashboard/raw` | Raw Data — paginated, sortable, exportable |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Auth | NextAuth.js (credentials) |
| Data | JSON converted from Parquet |
| State | Zustand (filters) + TanStack Query (API) |
| Export | ExcelJS |
| Hosting | Vercel (free tier) |
