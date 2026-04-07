/**
 * Credentials Route
 * Password-protected CRUD for bank credentials
 * POST   /api/credentials/verify-password
 * POST   /api/credentials/set-password
 * GET    /api/credentials
 * POST   /api/credentials
 * POST   /api/credentials/bulk
 * PATCH  /api/credentials/:id
 * DELETE /api/credentials/:id
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const XLSX = require('xlsx');
const supabase = require('../lib/supabase');

const upload = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => cb(null, `cred_${Date.now()}${path.extname(file.originalname)}`),
}), limits: { fileSize: 10 * 1024 * 1024 } });

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function fromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || '',
    bank: row.bank || '',
    accountType: row.account_type || '',
    accountNo: row.account_no || '',
    crnNo: row.crn_no || '',
    ifsc: row.ifsc || '',
    debitCardNo: row.debit_card_no || '',
    expiry: row.expiry || '',
    cvv: row.cvv || '',
    username: row.username || '',
    password: row.password || '',
    phoneNo: row.phone_no || '',
    used: row.used || '',
    pan: row.pan || '',
    cardPin: row.card_pin || '',
    mpin: row.mpin || '',
    dob: row.dob || '',
    link: row.link || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDb(row) {
  return {
    name: row.name || '',
    bank: row.bank || '',
    account_type: row.accountType || row.account_type || '',
    account_no: row.accountNo || row.account_no || '',
    crn_no: row.crnNo || row.crn_no || '',
    ifsc: row.ifsc || '',
    debit_card_no: row.debitCardNo || row.debit_card_no || '',
    expiry: row.expiry || '',
    cvv: row.cvv || '',
    username: row.username || '',
    password: row.password || '',
    phone_no: row.phoneNo || row.phone_no || '',
    used: row.used || '',
    pan: row.pan || '',
    card_pin: row.cardPin || row.card_pin || '',
    mpin: row.mpin || '',
    dob: row.dob || '',
    link: row.link || '',
  };
}

// ─── Set Password ─────────────────────────────────────────────────────────────

router.post('/set-password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 1) {
      return res.status(400).json({ error: 'Password is required' });
    }
    const hashed = hashPassword(password);

    const { data: existing } = await supabase
      .from('app_settings')
      .select('key')
      .eq('key', 'credentials_password')
      .single();

    if (existing) {
      await supabase.from('app_settings').update({ value: hashed }).eq('key', 'credentials_password');
    } else {
      await supabase.from('app_settings').insert({ key: 'credentials_password', value: hashed });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Verify Password ──────────────────────────────────────────────────────────

router.post('/verify-password', async (req, res) => {
  try {
    const { password } = req.body;
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'credentials_password')
      .single();

    if (error || !data) {
      // No password set yet
      return res.json({ verified: false, noPassword: true });
    }

    const hashed = hashPassword(password);
    res.json({ verified: hashed === data.value, noPassword: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Check if password exists ─────────────────────────────────────────────────

router.get('/has-password', async (req, res) => {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('key')
      .eq('key', 'credentials_password')
      .single();

    res.json({ hasPassword: !!data });
  } catch (err) {
    res.json({ hasPassword: false });
  }
});

// ─── List Credentials ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { search, bank } = req.query;
    let query = supabase.from('credentials').select('*').order('created_at', { ascending: false });

    if (search) {
      query = query.or(`name.ilike.%${search}%,bank.ilike.%${search}%,account_no.ilike.%${search}%,username.ilike.%${search}%`);
    }
    if (bank && bank !== 'all') {
      query = query.eq('bank', bank);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ credentials: (data || []).map(fromDb) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Add Single Credential ───────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('credentials')
      .insert(toDb(req.body))
      .select()
      .single();

    if (error) throw error;
    res.json({ credential: fromDb(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Bulk Import from Excel ───────────────────────────────────────────────────

router.post('/bulk', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const fs = require('fs');
    try { fs.unlinkSync(req.file.path); } catch {}

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No data found in file' });
    }

    // Map Excel columns to DB columns (flexible matching)
    const mapped = rows.map(row => {
      const find = (...keys) => {
        for (const k of keys) {
          const found = Object.keys(row).find(rk => rk.toLowerCase().trim().replace(/[^a-z0-9]/g, '') === k.toLowerCase().replace(/[^a-z0-9]/g, ''));
          if (found && row[found] !== undefined) return String(row[found]);
        }
        return '';
      };

      return {
        name: find('name', 'accountholder', 'holdername'),
        bank: find('bank', 'bankname'),
        account_type: find('accounttype', 'actype', 'type'),
        account_no: find('accountno', 'accountnumber', 'acno', 'accno'),
        crn_no: find('crnno', 'crn', 'customerno', 'customerid', 'custid'),
        ifsc: find('ifsc', 'ifsccode'),
        debit_card_no: find('debitcardno', 'cardno', 'cardnumber', 'debitcard'),
        expiry: find('expiry', 'expirydate', 'exp', 'validthru'),
        cvv: find('cvv', 'cvvno'),
        username: find('username', 'userid', 'loginid', 'user'),
        password: find('password', 'pwd', 'pass', 'loginpassword'),
        phone_no: find('phoneno', 'phone', 'mobile', 'mobileno', 'contactno'),
        used: find('used', 'usedfor', 'purpose'),
        pan: find('pan', 'panno', 'pannumber', 'pancard'),
        card_pin: find('cardpin', 'pin', 'atmpin'),
        mpin: find('mpin', 'upipin'),
        dob: find('dob', 'dateofbirth', 'birthdate'),
        link: find('link', 'url', 'website', 'bankurl'),
      };
    });

    const { data, error } = await supabase
      .from('credentials')
      .insert(mapped)
      .select('id');

    if (error) throw error;

    res.json({ success: true, imported: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Update Credential ────────────────────────────────────────────────────────

router.patch('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('credentials')
      .update(toDb(req.body))
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });

    res.json({ credential: fromDb(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete Credential ────────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('credentials')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
