# Fino

A local-only personal Financial OS for Indian banks, brokers, cards and businesses. Parses bank statements (CSV/XLSX/PDF) and broker tradebooks, tracks Amazon card purchases, calculates dashboards, P&L, charges and holdings — all stored in your own Supabase instance.

## Features

### Bank Analyzer
- Multi-bank parsing (IndusInd, Axis, Kotak, HDFC, SBI, ICICI) with auto-detection
- Supports CSV, XLSX (incl. password-protected), PDF
- Auto-categorization of transactions
- Duplicate detection on upload
- Backup + verification workflow (pending → verified)
- Inline editing, column resize, sortable tables
- Dark / Light theme
- Excel & PDF export
- Recycle bin with restore

### Share Market Analyzer
- 6 broker formats (Zerodha, Groww, Upstox, Angel One, 5Paisa, ICICI Direct) + generic Indian formats + pre-calculated P&L reports
- **FIFO P&L matching** for accurate realized P&L per symbol
- Indian tax classification: STCG (≤365 days) vs LTCG (>365 days)
- Indian charges calculator (brokerage, STT, GST, stamp duty, SEBI, exchange)
- Period analytics: Today, Month, Quarter (Indian FY), Year, All Time
- Holdings calculation from unmatched buys
- Charges breakdown with savings comparison

### Other
- **Credentials Manager** — password-protected page to store bank login info
- **Recycle Bin** — soft-delete with restore for transactions and reports

## Tech Stack

**Backend:** Node.js + Express, Supabase (PostgreSQL), multer, csv-parse, xlsx, xlsx-populate, pdf-parse, exceljs, pdfkit

**Frontend:** React 18 + Vite, axios, recharts, lucide-react, date-fns, Plus Jakarta Sans

## Setup

### Prerequisites
- Node.js 18+
- Free Supabase account: https://supabase.com

### 1. Clone the repo
```bash
git clone https://github.com/Jaydevptl/bank-analyzer.git
cd bank-analyzer
```

### 2. Create Supabase project
- Go to https://supabase.com → New Project
- Save your **Project URL** and **service_role key** (Settings → API)

### 3. Configure backend
Create `backend/.env`:
```
PORT=5000
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY
```

### 4. Run SQL migrations
In Supabase SQL Editor, run these files in order:
1. `backend/supabase_schema.sql`
2. `backend/supabase_migrate_v2.sql`
3. `backend/supabase_migrate_credentials.sql`
4. `backend/supabase_migrate_recycle.sql`
5. `backend/supabase_migrate_backup_deleted.sql`
6. `backend/supabase_migrate_trades.sql`

### 5. Install dependencies
```bash
cd backend && npm install
cd ../frontend && npm install
```

### 6. Run
**Windows:** Double-click `start.bat`

**Manual:**
```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

Open http://localhost:5173

## Documentation

See [HANDOFF.md](HANDOFF.md) for full architecture, API reference, and extension guide.

## License

Personal use. No warranty. Your data stays in your Supabase.
