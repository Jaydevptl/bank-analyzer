/**
 * Fino · Auth Middleware Stub (Phase 18B)
 *
 * STATUS: STUB — does NOT enforce auth. It only:
 *   1. Parses an optional `Authorization: Bearer <jwt>` header
 *   2. Decodes the Supabase JWT (without verifying signature) to extract sub/email
 *   3. Attaches { id, email } to req.user when present
 *   4. Passes through unconditionally
 *
 * Wiring it now is safe — every route still works without a token.
 *
 * --- WHEN ENABLING RLS LATER ----------------------------------------------
 *
 * Tables that will need RLS policies (filter by user_id or company_id):
 *   - fino_companies                 (owner_user_id, multi-tenant root)
 *   - fino_parties                   (company_id)
 *   - fino_items                     (company_id)
 *   - fino_chart_of_accounts         (system codes shared, custom per-company)
 *   - fino_ledger_entries            (company_id)
 *   - fino_bank_accounts             (company_id)
 *   - fino_cash_adjustments          (via company)
 *   - fino_loans_given               (company_id)
 *   - fino_loan_repayments           (via loan -> company)
 *   - fino_credit_cards              (company_id)
 *   - fino_gift_cards                (company_id)
 *   - fino_sale_invoices             (company_id)
 *   - fino_purchase_invoices         (company_id)
 *   - fino_cash_conversions          (company_id)
 *   - fino_amazon_*                  (company_id)
 *   - fino_brokers, fino_broker_accounts, fino_stock_holdings (company_id)
 *   - fino_websites + fino_website_transactions
 *   - fino_partnerships + fino_partnership_members + fino_profit_distributions
 *   - fino_intercompany_transfers, fino_owner_drawings
 *   - fino_salary_records, fino_tds_records, fino_gst_records
 *   - fino_recurring_expenses, fino_petty_cash, fino_sale_returns
 *   - fino_attachments
 *
 * Standard policy template:
 *   CREATE POLICY tenant_select ON <table>
 *     FOR SELECT TO authenticated
 *     USING (company_id IN (SELECT id FROM fino_companies WHERE owner_user_id = auth.uid()));
 *
 * Switch to enforcement by replacing `optionalAuth` mounts in server.js with
 * `requireAuth` and turning on RLS on each table.
 */

function _decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch { return null; }
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (m) {
    const payload = _decodeJwtPayload(m[1]);
    if (payload?.sub) {
      req.user = {
        id: payload.sub,
        email: payload.email || null,
        role: payload.role || 'authenticated',
      };
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
  next();
}

module.exports = { optionalAuth, requireAuth };
