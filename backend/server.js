/**
 * Bank Statement Analyzer - Express Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const supabase = require('./lib/supabase');
const uploadRoutes = require('./routes/upload');
const transactionRoutes = require('./routes/transactions');
const exportRoutes = require('./routes/export');
const reportRoutes = require('./routes/reports');
const credentialRoutes = require('./routes/credentials');
const recycleRoutes = require('./routes/recycle');
const tradeRoutes = require('./routes/trades');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/upload', uploadRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/credentials', credentialRoutes);
app.use('/api/recycle', recycleRoutes);
app.use('/api/trades', tradeRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── Verify Supabase + Start ───────────────────────────────────────────────────
supabase
  .from('transactions')
  .select('id', { count: 'exact', head: true })
  .then(({ error }) => {
    if (error) {
      console.error('Supabase connection failed:', error.message);
      console.log('Check SUPABASE_URL and SUPABASE_SERVICE_KEY in your .env file');
      process.exit(1);
    }
    console.log('Supabase connected');
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
