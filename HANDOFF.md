# BankLens - Project Handoff Document

**Project Name:** BankLens v2.0
**Type:** Personal Bank Statement & Share Market Analyzer
**Location:** `C:\Users\jayde\OneDrive\Desktop\bank app\bank-analyzer`

---

## 1. Overview

BankLens is a local-only web application that:

1. **Bank Analyzer** - Parses bank statements (CSV/XLSX/PDF) from multiple Indian banks, categorizes transactions, generates dashboards/reports, detects duplicates, allows verification workflow.
2. **Share Market Analyzer** - Parses broker tradebooks (Zerodha, Groww, Upstox, Angel One, 5Paisa, ICICI Direct + generic Indian formats), calculates FIFO P&L, charges breakdown, holdings.
3. **Credentials Manager** - Password-protected page to store bank login credentials securely.
4. **Recycle Bin** - Soft-delete with restore for transactions and reports.

It runs entirely on the user's machine and uses **Supabase (PostgreSQL)** as the database.

---

## 2. Tech Stack

### Backend
- **Node.js** + **Express 4**
- **Supabase JS SDK** (`@supabase/supabase-js`)
- **multer** - file uploads
- **csv-parse**, **xlsx**, **xlsx-populate** (password-protected Excel), **pdf-parse**
- **exceljs**, **pdfkit** - export
- **date-fns** - date parsing

### Frontend
- **React 18** + **Vite**
- **axios** - HTTP
- **recharts** - charts
- **lucide-react** - icons
- **date-fns** - dates
- Font: **Plus Jakarta Sans**

### Database
- **Supabase** (PostgreSQL hosted)

---

## 3. Folder Structure

```
bank-analyzer/
├── start.bat                              # Launches both backend + frontend
├── HANDOFF.md                             # This file
│
├── backend/
│   ├── server.js                          # Express entry point
│   ├── package.json
│   ├── .env                               # SUPABASE_URL, SUPABASE_SERVICE_KEY
│   ├── supabase_schema.sql                # Initial schema
│   ├── supabase_migrate_v2.sql            # status, account_holder, upload_reports
│   ├── supabase_migrate_credentials.sql   # credentials + app_settings
│   ├── supabase_migrate_recycle.sql       # recycle_bin
│   ├── supabase_migrate_backup_deleted.sql# backup-deleted status
│   ├── supabase_migrate_trades.sql        # trades + trade_upload_reports
│   │
│   ├── lib/
│   │   ├── supabase.js                    # Supabase client singleton
│   │   ├── mapper.js                      # transaction snake_case ↔ camelCase
│   │   └── tradeMapper.js                 # trade snake_case ↔ camelCase
│   │
│   ├── models/
│   │   ├── Transaction.js                 # CATEGORIES, STATUSES constants
│   │   └── Trade.js                       # SEGMENTS, TRADE_TYPES, BROKERS
│   │
│   ├── services/
│   │   ├── bankDetector.js                # Detects bank from file content
│   │   ├── normalizer.js                  # Normalizes bank rows
│   │   ├── categorizer.js                 # Auto-categorizes transactions
│   │   ├── brokerDetector.js              # Detects broker from file content
│   │   ├── brokerNormalizer.js            # Normalizes trade rows + charges calc
│   │   ├── pnlCalculator.js               # FIFO P&L engine
│   │   └── parsers/
│   │       ├── csvParser.js               # Bank CSV parser
│   │       ├── xlsxParser.js              # Bank XLSX parser (with password support)
│   │       ├── pdfParser.js               # Bank PDF parser (with password support)
│   │       ├── tradeCsvParser.js          # Trade CSV parser
│   │       └── tradeXlsxParser.js         # Trade XLSX parser
│   │
│   ├── routes/
│   │   ├── upload.js                      # POST /api/upload (bank)
│   │   ├── transactions.js                # CRUD for bank transactions
│   │   ├── export.js                      # Excel/PDF export
│   │   ├── reports.js                     # Bank upload reports + file download
│   │   ├── credentials.js                 # Password-protected credentials CRUD
│   │   ├── recycle.js                     # Recycle bin restore/delete
│   │   └── trades.js                      # Trades CRUD + P&L + charges + holdings
│   │
│   ├── uploads/                           # Temp upload folder (auto-cleaned)
│   ├── saved-files/                       # Permanent saved upload copies
│   └── sampleData/                        # Sample broker CSVs for testing
│
└── frontend/
    ├── package.json
    ├── vite.config.js                     # Port 5173, /api proxy
    ├── index.html                         # Plus Jakarta Sans font
    │
    └── src/
        ├── main.jsx
        ├── App.jsx                        # Main shell + sidebar nav
        ├── index.css                      # Global theme (light + dark)
        │
        ├── services/
        │   └── api.js                     # All axios API calls
        │
        └── components/
            ├── Dashboard.jsx              # Bank dashboard
            ├── FileUpload.jsx             # Bank upload
            ├── MainTable.jsx              # Pending transactions
            ├── VerifiedTable.jsx          # Verified transactions
            ├── DuplicatesTable.jsx        # Duplicate transactions
            ├── BackupTable.jsx            # Backup (master) transactions
            ├── ReportsPage.jsx            # Bank upload reports
            ├── CredentialsPage.jsx        # Password-protected credentials
            ├── RecycleBin.jsx             # Recycle bin
            │
            └── ShareMarket/
                ├── index.jsx              # Container with sub-nav
                ├── SMDashboard.jsx        # Trade dashboard with KPIs
                ├── TradesList.jsx         # All trades table
                ├── PnLReport.jsx          # FIFO P&L (monthly/quarterly/symbol)
                ├── ChargesReport.jsx      # Charges breakdown
                ├── Holdings.jsx           # Current holdings
                ├── SMUpload.jsx           # Trade upload
                └── SMReports.jsx          # Trade upload reports
```

---

## 4. Setup From Scratch

### Prerequisites
- Node.js 18+ (tested with v24.14.1)
- A free Supabase account: https://supabase.com

### Steps

**1. Create Supabase project**
- Go to https://supabase.com → New Project
- Save the **Project URL** and **service_role key** (Settings → API)

**2. Configure backend**
Create `backend/.env`:
```
PORT=5000
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY
```

**3. Run all SQL migrations** in Supabase SQL Editor (in this order):
1. `supabase_schema.sql` - base transactions table + RPC function
2. `supabase_migrate_v2.sql` - status, account_holder, upload_reports
3. `supabase_migrate_credentials.sql` - credentials + app_settings
4. `supabase_migrate_recycle.sql` - recycle_bin
5. `supabase_migrate_backup_deleted.sql` - allow backup-deleted status
6. `supabase_migrate_trades.sql` - trades + trade_upload_reports

**4. Install dependencies**
```bash
cd backend && npm install
cd ../frontend && npm install
```

**5. Run the app**
Double-click `start.bat` (Windows) or run manually:
```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

Opens at http://localhost:5173

---

## 5. Database Schema

### Table: `transactions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| date | timestamptz | |
| description | text | |
| debit, credit, balance | numeric | |
| bank_name, account_number, account_name, account_holder | text | |
| reference_no | text | |
| status | text | `pending`, `verified`, `duplicate`, `backup`, `backup-deleted` |
| duplicate_of | UUID FK → transactions.id | for duplicates |
| upload_id | text | links to upload_reports |
| upload_session_id, source_file | text | |
| category | text | |
| raw_data | jsonb | original row |
| created_at, updated_at | timestamptz | |

### Table: `upload_reports`
| Column | Type |
|---|---|
| id | UUID PK |
| upload_id | text UNIQUE |
| uploaded_at | timestamptz |
| total_files, total_entries, total_unique, total_duplicates, total_errors | int |
| files | jsonb |

### Table: `trades`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| trade_date, settle_date | timestamptz | |
| broker, account_id, account_holder | text | |
| segment | text | `Equity`, `F&O`, `Commodity`, `Currency`, `MF`, `Unknown` |
| type | text | `BUY` or `SELL` |
| symbol, isin, exchange | text | |
| quantity, price, amount | numeric | |
| brokerage, stt, gst, sebi_charges, stamp_duty, exchange_charges, other_charges, total_charges, net_amount | numeric | |
| upload_id, source_file | text | |
| raw_data | jsonb | |

### Table: `trade_upload_reports`
| Column | Type |
|---|---|
| id, upload_id (UNIQUE), uploaded_at | |
| files (jsonb), summary (jsonb) | |

### Table: `credentials`
Stores bank login info: name, bank, account_type, account_no, crn_no, ifsc, debit_card_no, expiry, cvv, username, password, phone_no, used, pan, card_pin, mpin, dob, link

### Table: `app_settings`
Key-value store. Used for:
- `credentials_password` - SHA256 hash of credentials page password
- `file_passwords` - JSON array of passwords for protected Excel files

### Table: `recycle_bin`
| Column | Type |
|---|---|
| id, original_id (UUID) | |
| item_type | `transaction` or `report` |
| data | jsonb (full row backup) |
| deleted_at | timestamptz |

### RPC Function: `get_transaction_stats(p_start_date, p_end_date, p_bank_name)`
Returns aggregated stats (overall, daily, monthly, byCategory, byBank). Filters to status IN ('pending', 'verified') only.

---

## 6. Features

### Bank Analyzer
- **Multi-bank parsing**: IndusInd, Axis (2 formats), Kotak, HDFC, SBI, ICICI - auto-detected from file content
- **Multi-format**: CSV, XLSX (incl. password-protected), PDF
- **Auto-categorization**: 16 categories via keyword rules
- **Duplicate detection**: Same date + amount + description prefix
- **Backup pattern**: Each unique entry creates 2 copies - immutable `backup` + working `pending`
- **Verification workflow**: Pending → Verified (manual review)
- **Inline editing**: Click description/category to edit
- **Column resize + sort + filter**
- **Excel/PDF export** with applied filters
- **Dark/Light theme toggle**
- **Recycle bin**: Deleted items can be restored
- **Backup status tracking**: When a transaction is deleted, the matching backup gets `backup-deleted` flag and can be restored back to pending
- **Upload reports**: Per-file breakdown with download original file
- **Undo last action** in transactions table

### Share Market Analyzer
- **6 brokers + Generic + P&L Report format** auto-detected
- **FIFO P&L matching** for accurate realized P&L per symbol
- **Indian tax classification**: STCG (≤365 days) vs LTCG (>365 days)
- **Indian charges calculator**: brokerage, STT, GST, stamp duty, SEBI, exchange
- **Period analytics**: Today, Month, Quarter (Indian FY: Apr-Mar), Year, All Time
- **Top gainers / losers** per period
- **By broker / by segment** breakdown
- **Holdings calculation** from unmatched buys
- **Charges breakdown** with savings comparison vs 0% broker

### Credentials Page
- **Password-protected** (set on first visit, SHA256 hashed)
- **18 columns**: Name, Bank, Account Type, Account No, CRN, IFSC, Debit Card, Expiry, CVV, Username, Password, Phone, Used, PAN, Card Pin, Mpin, DOB, Link
- **Sensitive fields masked** by default (CVV, Password, Card Pin, Mpin)
- **Excel bulk import** with flexible column matching
- **Add/Edit modal** + delete + sort + search

### Recycle Bin
- Lists deleted transactions and reports
- **Restore** (single or all)
- **Permanent delete** + Empty bin
- Filter by type

---

## 7. Key API Endpoints

### Bank
- `POST /api/upload` - upload bank statements
- `GET /api/transactions?status=pending|verified|duplicate|backup` - list
- `GET /api/transactions/stats` - dashboard stats (filters out backup/duplicate)
- `GET /api/transactions/banks` - distinct bank names
- `PATCH /api/transactions/:id` - update category/description
- `PATCH /api/transactions/:id/verify` - verify single
- `PATCH /api/transactions/:id/unverify` - unverify single
- `PATCH /api/transactions/verify-all` - bulk verify
- `POST /api/transactions/:id/restore-from-backup` - restore deleted backup
- `POST /api/transactions/:id/undo` - undo last edit
- `DELETE /api/transactions/clear` - move all to recycle bin (preserves reports)
- `DELETE /api/transactions/clear-duplicates` - permanent delete duplicates
- `DELETE /api/transactions/:id` - delete single (to recycle bin)
- `GET /api/export/excel?status=...` - export filtered
- `GET /api/export/pdf?status=...`

### Reports
- `GET /api/reports` - list all upload reports
- `GET /api/reports/:uploadId` - single report
- `GET /api/reports/download/:fileName` - download original uploaded file
- `DELETE /api/reports/:uploadId` - delete report (to recycle bin)

### Credentials (password-protected)
- `GET /api/credentials/has-password` - check if password is set
- `POST /api/credentials/set-password` - first-time password set
- `POST /api/credentials/verify-password` - verify entry
- `GET /api/credentials` - list with search
- `POST /api/credentials` - add
- `POST /api/credentials/bulk` - Excel import
- `PATCH /api/credentials/:id` - update
- `DELETE /api/credentials/:id` - delete

### Recycle Bin
- `GET /api/recycle?type=transaction|report` - list
- `POST /api/recycle/:id/restore` - restore single
- `POST /api/recycle/restore-all` - restore all
- `DELETE /api/recycle/:id` - permanent delete single
- `DELETE /api/recycle` - empty bin

### Trades (Share Market)
- `POST /api/trades/upload` - upload broker statements
- `GET /api/trades` - list with filters (broker, symbol, segment, type, dates)
- `GET /api/trades/summary?period=day|month|quarter|year|all` - dashboard KPIs
- `GET /api/trades/pnl` - FIFO P&L (symbol-wise, monthly, quarterly)
- `GET /api/trades/charges` - charges breakdown
- `GET /api/trades/holdings` - current holdings
- `GET /api/trades/reports` - upload reports
- `GET /api/trades/brokers` - distinct broker names
- `DELETE /api/trades/clear` - clear all

---

## 8. Frontend Architecture

### Theme System
- **Light theme** (default): warm cream/yellow `#F7F6F2` background, `#F0C93A` accent, `#1A1A2E` text
- **Dark theme**: navy `#0E0F14` background, same yellow accent
- Toggle in sidebar footer
- Persisted in `localStorage` (`banklens-theme`)
- All colors use CSS variables (`--bg-page`, `--accent`, `--text-primary`, etc.)
- Smooth transitions on theme switch

### Sidebar Navigation
- **Collapsed by default** (60px wide, icons only)
- **Expands on hover** (230px) with smooth animation
- Logo + 10 nav items:
  1. Dashboard
  2. Transactions (openable in new tab)
  3. Verified (openable)
  4. Duplicates
  5. Backup
  6. Share Market (openable)
  7. Reports
  8. Credentials
  9. Recycle Bin
  10. Upload
- URL param `?view=transactions` opens specific view (used by "open in new tab")
- Theme toggle at bottom

### Main Layout
- Greeting header: "Good Morning/Afternoon/Evening" + current date
- Plus Jakarta Sans font globally
- Cards: white with `0 2px 12px rgba(0,0,0,0.06)` shadow, rounded-2xl (16px)
- KPI cards: white with colored 4px left border
- Tables: white with hover highlight `#FFFBEC`, sortable headers, resizable columns

---

## 9. Important Patterns

### Duplicate Detection (bank)
On upload, for each new transaction:
1. Query existing transactions with same date + same amount (debit OR credit)
2. Match if first 20 chars of description match OR reference number matches
3. If match found → save as `status=duplicate`, set `duplicate_of`
4. If unique → save **2 copies**: `status=backup` (immutable) + `status=pending` (working)

### FIFO P&L (trades)
For each symbol:
1. Sort trades by date
2. Maintain queue of buy lots: `{ qty, price, date, chargesPerUnit }`
3. On SELL, dequeue from oldest BUY first, calculate P&L for matched qty
4. Holding period > 365 days → LTCG, else STCG
5. Unmatched BUYs at the end = current holdings

### Backup-Delete Linking
When a `pending`/`verified` transaction is deleted:
1. Move to recycle bin
2. Find matching `backup` (same date, amount, description prefix)
3. Update backup status to `backup-deleted`
4. From Backup page, deleted entries show "Restore" button to recreate as `pending`

### Password-Protected Files
The `xlsxParser.js` tries:
1. Regular `xlsx` library first (no password)
2. If that fails, falls back to `xlsx-populate` with each password from `app_settings.file_passwords`
3. To add passwords, insert them into Supabase `app_settings` (see Common Tasks below)

---

## 10. Known Limitations

1. **No live stock prices** - Holdings show last buy price, not current market value
2. **PDF parsing is generic** - works for most text-based bank PDFs but may fail on scanned/image PDFs (no OCR)
3. **Bank ledger files** (e.g., voucher-style files) are not supported as trades - only proper tradebooks
4. **Local-only** - no authentication/multi-user support, designed for single-user local use
5. **Charges calculation is estimated** for trades when not in source file (uses Indian equity defaults)
6. **No realtime updates** - need to refresh after operations

---

## 11. How to Add a New Bank

1. Open `backend/services/bankDetector.js`
2. Add a new entry to `BANK_SIGNATURES`:
```js
{
  key: 'YOUR_BANK',
  name: 'Your Bank Name',
  markers: ['unique strings to identify'],
  columnMap: {
    date: 'Date Column Name',
    description: 'Description Column',
    debit: 'Debit Column' | null,
    credit: 'Credit Column' | null,
    balance: 'Balance Column',
    referenceNo: 'Ref Column',
    drCrIndicator: 'DR/CR Column' | null,  // for combined formats
    amountColumn: 'Amount Column' | null,   // for combined formats
  },
  amountType: 'separate' | 'combined_drcr' | 'combined_signed',
}
```

That's it. The normalizer uses the columnMap dynamically.

---

## 12. How to Add a New Broker

1. Open `backend/services/brokerDetector.js`
2. Add to `BROKER_SIGNATURES` similar pattern as banks
3. The `brokerNormalizer.js` will automatically use the columnMap
4. For special formats (like P&L pre-calculated), add custom logic in `normalizeWithMap()`

---

## 13. Files You Should Never Modify Without Understanding

- `lib/mapper.js`, `lib/tradeMapper.js` - column name mapping
- `services/normalizer.js`, `services/brokerNormalizer.js` - data normalization
- `services/pnlCalculator.js` - FIFO algorithm
- `routes/transactions.js` line ordering matters - `/clear` MUST come before `/:id`

---

## 14. Common Tasks

### Reset everything
```sql
TRUNCATE transactions, upload_reports, trades, trade_upload_reports, recycle_bin, credentials CASCADE;
DELETE FROM app_settings;
```

### Add a new file password
```sql
-- Replace with your actual passwords (JSON array of strings)
INSERT INTO app_settings (key, value)
VALUES ('file_passwords', '["yourpassword1","yourpassword2"]')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### Reset credentials password
```sql
DELETE FROM app_settings WHERE key = 'credentials_password';
```

### Restart backend after code changes
The backend uses `nodemon` which auto-restarts. If it doesn't, kill the terminal and run `npm run dev` again.

---

## 15. Running the App

**Quick start:** Double-click `start.bat` in the project root.

**Manual:**
```bash
# Backend (terminal 1)
cd "C:\Users\jayde\OneDrive\Desktop\bank app\bank-analyzer\backend"
npm run dev

# Frontend (terminal 2)
cd "C:\Users\jayde\OneDrive\Desktop\bank app\bank-analyzer\frontend"
npm run dev
```

Opens browser at: http://localhost:5173

Backend API at: http://localhost:5000

---

## 16. Credits & Tech Notes

- **No telemetry, no external services** except Supabase (your own instance)
- **All data stays in your Supabase** - you own everything
- **Supabase free tier** is sufficient for personal use (500MB database)
- **CSS uses CSS variables** for theming - easy to customize colors

---

---

## 17. Build History / Chat Context

This section captures the complete journey of how this project was built, key decisions, issues encountered, and user preferences observed during development. Useful for anyone taking over to understand "why" decisions were made.

### Phase 1 - Initial Bank Analyzer (MongoDB → Supabase migration)
- Project started as a Node + React app with **MongoDB/Mongoose**
- User requested migration to **Supabase (PostgreSQL)** because of better hosting/management
- All Mongoose models replaced with Supabase queries
- Created `lib/mapper.js` to handle snake_case (DB) ↔ camelCase (API) conversion
- Implemented `get_transaction_stats` RPC function in PostgreSQL for aggregations (instead of fetching all rows to Node)
- Added `account_name` extraction from bank statement headers (user wanted to see account holder name in UI)

### Phase 2 - Table UX Features
- User requested: column resize, drag-to-reorder, inline description editing, filters
- Added all these to TransactionTable using `useRef` (to avoid stale closure during drag)
- Created "Checked Transactions" page with checkbox per row
- Created `start.bat` for one-click launch (Windows)

### Phase 3 - Major Rebuild (UI redesign + features)
- User requested complete UI overhaul from dark theme → warm cream/yellow light theme
- Background `#F7F6F2`, accent `#F0C93A`, font Plus Jakarta Sans
- Required new features:
  - **Status workflow**: pending → verified → duplicate → backup
  - **Backup pattern**: each unique entry creates 2 copies (immutable backup + working pending)
  - **Duplicate detection** during upload
  - **Upload reports** with per-file breakdown
- Created new components: MainTable, VerifiedTable, DuplicatesTable, BackupTable, ReportsPage, FileUpload, Dashboard

### Phase 4 - Dark Mode + Column Resize for All Tables
- User wanted dark mode toggle with persistence
- Added `[data-theme="dark"]` CSS variant with smooth transitions
- All tables got column resize handles (drag column edge to widen)

### Phase 5 - Credentials Manager (Password-Protected)
- User wanted a private page to store bank login credentials
- 18 columns: Name, Bank, Account Type, Account No, CRN, IFSC, Debit Card, Expiry, CVV, Username, Password, Phone, Used, PAN, Card Pin, Mpin, DOB, Link
- First visit: user sets a page password (SHA256 hashed in `app_settings`)
- Subsequent visits: must enter password to unlock
- Sensitive fields (CVV, Password, Card Pin, Mpin) masked by default with toggle
- Excel bulk import for migrating from spreadsheet
- User initially asked for 4-char minimum password, then changed to 1-char minimum

### Phase 6 - Sidebar Collapse + Bank Detection Fixes
- User wanted sidebar collapsed by default, expand on hover
- Implemented with cubic-bezier transitions, icons stay visible when collapsed
- Fixed multiple bank detection issues:
  - **XLSX files** had empty `rawContent` → bank detection failed → fixed by joining metadata rows
  - **IndusInd XLSX** uses different column headers than CSV → added markers
  - **Axis Bank** has 2 different CSV formats (`Tran Date,CHQNO,PARTICULARS,DR,CR,BAL` vs `Tran Date,Value Date,CHQNO,Transaction Particulars,Amount(INR),DR|CR,Balance(INR)`) → added AXIS2 signature
  - Account holder extraction was capturing "Joint Holder" line → fixed to scan only the first valid Name line

### Phase 7 - Recycle Bin + Undo + Per-Row Delete
- User: "delete button is also clearing reports - it shouldn't"
- Refactored: clearing transactions only clears pending/verified, NOT reports
- Created `recycle_bin` table with `item_type` + full row backup
- Added per-row delete (red trash icon) and bulk verify
- Added **Undo** button in MainTable header - reverts last verify/edit/delete
- For deleted items, undo finds the recycle bin entry and restores it
- **Critical bug fix**: Express route order - `DELETE /:id` was catching `clear` as ID parameter. Fixed by putting `DELETE /clear` BEFORE `DELETE /:id`

### Phase 8 - Backup-Delete Linking
- User: "when transaction deleted, backup should get a 'deleted' tag, and from backup I should be able to restore it"
- Added new status `backup-deleted`
- When user deletes a pending/verified transaction, the matching backup (same date + amount + description prefix) gets tagged
- Added `POST /api/transactions/:id/restore-from-backup` endpoint
- BackupTable shows "Active" / "Deleted" badge column + restore button on deleted ones
- Bulk delete with checkboxes added to BackupTable

### Phase 9 - File Storage + Download
- User wanted to download original uploaded files from Reports page
- Files were being deleted after processing - changed to copy to `saved-files/` permanent folder
- Added `GET /api/reports/download/:fileName` endpoint
- Download button (cloud download icon) added to per-file rows in Reports + FileUpload result

### Phase 10 - Open in New Tab
- User wanted to open Transactions and Verified pages in separate browser tabs
- App.jsx reads `?view=...` URL parameter on mount
- Small ExternalLink icon shown next to active "openable" nav items
- Click opens `window.location.origin + ?view=transactions` in new tab

### Phase 11 - Password-Protected Excel Files
- User had bank statements protected with passwords (one password per family member's account)
- The default `xlsx` library couldn't decrypt these files (newer encryption format)
- Installed `xlsx-populate` which supports password-protected Excel
- Updated parser to:
  1. Try opening without password first
  2. If fails, try each password from `app_settings.file_passwords` table (managed via Supabase)
- Same approach added to PDF parser
- Passwords are NOT hardcoded - users must add them to their own Supabase instance

### Phase 12 - Share Market Analyzer (Major Module)
- User wanted a complete second module for stock trading P&L
- Built in single conversation:
  - 6 broker parsers (Zerodha, Groww, Upstox, Angel One, 5Paisa, ICICI Direct)
  - **FIFO P&L engine** for accurate realized P&L per symbol
  - Indian tax classification (STCG ≤365 days, LTCG >365 days)
  - Indian charges calculator (brokerage, STT, GST, stamp duty, SEBI, exchange)
  - Period analytics: Today / Month / Quarter (Indian FY) / Year / All Time
  - Holdings calculation from unmatched buys
  - Charges report with savings note vs 0% broker
  - 7 sub-pages: Dashboard, Trades, P&L Report, Charges, Holdings, Upload, Reports
- Sub-navigation tabs inside ShareMarket container
- Same warm theme + dark mode + Plus Jakarta Sans

### Phase 13 - Trade Format Extensions
- User uploaded **Manthan** files which are a non-standard Indian broker format
- Files had columns like `trandate, scriptname, transtype, delivqty, transrate, amount` (lowercase, no spaces)
- Also had a separate **PNL file** with pre-calculated buy/sell pairs (`fullname, qty, sellrate, buyrate, gainloss, buydate, selldate`)
- Added 2 new broker formats:
  - `GENERIC_TRADE` - for tradebook with lowercase columns
  - `PNL_REPORT` - for pre-calculated P&L (each row generates 2 trades: 1 buy + 1 sell)
- Created dedicated `tradeXlsxParser.js` and `tradeCsvParser.js` (separate from bank parsers because trade headers are completely different)

### Phase 14 - Misc UX
- User: "remove Upload Statement button from header - keep only in sidebar"
- Removed the global upload button from top header
- User: "add bulk delete to duplicates page"
- Added "Delete All Duplicates" red button to DuplicatesTable header

### Key User Preferences Observed
- **Bilingual**: User communicates in Hinglish (mix of Hindi + English) - prefer concise responses
- **No emojis** in code or UI unless explicitly asked
- **Light theme preferred** for warm yellow look, but dark mode toggle wanted
- **Compact UI** with sidebar collapsed by default
- **Practical features over polish** - user values working functionality over animations
- **Direct fixes** - when something doesn't work, user wants it fixed immediately, not workarounds
- **Indian financial context** - Indian banks, INR, Indian fiscal year (Apr-Mar), STCG/LTCG, Indian brokers

### Key Decisions Made
1. **Supabase over MongoDB** - simpler hosting, built-in dashboard
2. **Backup pattern** - 2 copies per upload (immutable + working) gives audit trail without complexity
3. **FIFO P&L** - matches Indian tax law for capital gains
4. **Local-only** - no auth, single-user, runs on user's machine
5. **xlsx-populate for protected files** - the only Node library that handles modern Excel encryption
6. **CSS variables for theming** - easy to swap colors, no rebuild needed
7. **Sidebar route param** - allows opening views in new browser tabs

### Common Pitfalls to Avoid
- **Don't reorder Express routes** - `/clear` MUST come before `/:id` or it gets caught as `:id=clear`
- **Don't drop the `get_transaction_stats` constraint check** when adding new statuses - add status to the CHECK constraint instead
- **Don't use `xlsx` library for password-protected files** - use `xlsx-populate` instead
- **Trade parsers ≠ Bank parsers** - they look for different headers, must use the dedicated parsers
- **Bank detection from XLSX needs `rawContent`** - the parser must build it from the matrix rows, not return empty string
- **PNL Report format generates 2 trades per row** - normalizer must return an array, not single object

---

**End of Handoff Document**

Last updated: April 2026
Version: 2.0
Total development sessions: ~14 phases
Total backend routes: 7 modules, ~40 endpoints
Total frontend components: 17

