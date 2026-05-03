/**
 * Fino · Dev Tools route
 *  POST /api/dev/reset-test-data
 *  Body: { confirmation: 'DELETE' }
 *
 * Hard-deletes Phase 3 transaction data. Keeps companies, parties, items,
 * system COA rows. Existing BankLens tables are NOT touched.
 */

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

const TABLES_FK_ORDER = [
  'fino_reversals',
  'fino_loan_interest_accruals',
  'fino_loan_repayments',
  'fino_loans_given',
  'fino_fixed_asset_adjustments',
  'fino_fixed_assets',
  'fino_cash_adjustments',
  'fino_bank_accounts',
  'fino_business_tags',
  'fino_attachments',
  'fino_ledger_entries',
];

router.post('/reset-test-data', async (req, res) => {
  if (req.body?.confirmation !== 'DELETE') {
    return res.status(400).json({ error: 'Confirmation required: send { confirmation: "DELETE" }' });
  }
  const cleared = {};
  try {
    for (const t of TABLES_FK_ORDER) {
      const { count, error } = await supabase
        .from(t).delete({ count: 'exact' })
        .not('id', 'is', null);
      if (error && !/does not exist/i.test(error.message)) throw error;
      cleared[t] = count || 0;
    }
    // Drop user-added COA rows (keeps system seeded ones, including 4270).
    // Match both is_system=false AND is_system IS NULL (older rows could
    // have null if the column default was added later). bank_accounts is
    // already cleared above so no FK rows reference these.
    const { count: coaCount, error: coaErr } = await supabase
      .from('fino_chart_of_accounts')
      .delete({ count: 'exact' })
      .or('is_system.eq.false,is_system.is.null');
    if (coaErr) throw coaErr;
    cleared.fino_chart_of_accounts_user = coaCount || 0;

    res.json({ status: 'ok', cleared });
  } catch (e) {
    res.status(500).json({ error: e.message, cleared });
  }
});

module.exports = router;
