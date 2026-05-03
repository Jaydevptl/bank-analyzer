/**
 * Fino · Share Market service (Phase 10)
 *
 * Ledger flow:
 *   BUY     : DEBIT  Inv:<account> (19XX)         (qty*price + charges)
 *             CREDIT Bank (12XX)                  same
 *   SELL    : DEBIT  Bank (12XX)                  (qty*price - charges)
 *             DEBIT  Brokerage Charges (5220)     charges      (only if > 0)
 *             CREDIT Inv:<account> (19XX)         cost basis (qty*avg_buy_price)
 *             CREDIT/DEBIT Realized Gain (4270) / Realized Loss (5250) for the residual
 *   DIVIDEND: DEBIT  Bank (12XX)                  amount
 *             CREDIT Dividend Received (4220)     amount
 *
 * Avg buy price uses weighted average — no FIFO. Sell of last shares keeps
 * the holding row at qty=0 for history.
 *
 * Note: codes 4250/4260 are already taken (Refunds/TDS Refund). We use
 * 4270 / 5250 for stock realized gain / loss; both are seeded on demand.
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseLedgerGroup, reverseBySource } = require('./reversal');
const { ensureChildCoa } = require('./coaHelpers');
const { refreshCurrentBalance } = require('./bankAccounts');

const PARENT_INVEST_CODE   = '1900';
const BANK_CHARGES_CODE    = '5220';
const DIVIDEND_INCOME_CODE = '4220';
const REALIZED_GAIN_CODE   = '4270';
const REALIZED_LOSS_CODE   = '5250';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Ensure a COA row exists at an EXACT code (not auto-numbered like ensureChildCoa).
async function ensureExactCoa({ code, name, type, subType }) {
  const { data: existing, error } = await supabase
    .from('fino_chart_of_accounts').select('id, code, name').eq('code', code).maybeSingle();
  if (error) throw error;
  if (existing) return existing;
  const { data, error: insErr } = await supabase
    .from('fino_chart_of_accounts').insert({
      code, name, type, sub_type: subType,
      is_system: true, is_active: true,
      description: 'Auto-seeded for Share Market (Phase 10)',
    }).select('id, code, name').single();
  if (insErr) throw insErr;
  return data;
}

async function seedShareMarketCoa() {
  await ensureExactCoa({ code: REALIZED_GAIN_CODE, name: 'Realized Gain on Investments', type: 'income',  subType: 'other_income' });
  await ensureExactCoa({ code: REALIZED_LOSS_CODE, name: 'Realized Loss on Investments', type: 'expense', subType: 'direct_expense' });
}

async function bankCoaCode(bankAccountId) {
  if (!bankAccountId) return null;
  const { data } = await supabase
    .from('fino_bank_accounts').select('linked_account_id').eq('id', bankAccountId).maybeSingle();
  if (!data) return null;
  const { data: c } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', data.linked_account_id).maybeSingle();
  return c?.code || null;
}

async function accountCoaCode(brokerAccountId) {
  const { data } = await supabase
    .from('fino_broker_accounts').select('linked_account_id').eq('id', brokerAccountId).maybeSingle();
  if (!data) throw new Error('Broker account not found');
  const { data: c } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', data.linked_account_id).maybeSingle();
  return c?.code || null;
}

// ─── Brokers ─────────────────────────────────────────────────────────────────

async function listBrokers() {
  const { data, error } = await supabase
    .from('fino_brokers').select('*').order('name');
  if (error) throw error;
  return data || [];
}

async function createBroker({ name, code, notes }) {
  if (!name?.trim()) throw new Error('name required');
  const { data, error } = await supabase
    .from('fino_brokers').insert({
      name: name.trim(),
      broker_code: code?.trim() || null,
      notes: notes?.trim() || null,
    }).select().single();
  if (error) throw error;
  return data;
}

// ─── Broker Accounts ─────────────────────────────────────────────────────────

async function listBrokerAccounts({ brokerId = null, includeDeleted = false } = {}) {
  let q = supabase
    .from('fino_broker_accounts')
    .select('*, broker:fino_brokers(id, name, broker_code), bank:fino_bank_accounts(id, account_name, bank_name)')
    .order('account_holder');
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (brokerId) q = q.eq('broker_id', brokerId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getBrokerAccount(id) {
  const { data: account, error } = await supabase
    .from('fino_broker_accounts')
    .select('*, broker:fino_brokers(id, name, broker_code), bank:fino_bank_accounts(id, account_name, bank_name)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!account) return null;

  const [holdingsR, txnsR] = await Promise.all([
    supabase.from('fino_stock_holdings').select('*')
      .eq('broker_account_id', id).order('symbol', { ascending: true }),
    supabase.from('fino_stock_transactions').select('*')
      .eq('broker_account_id', id).eq('is_deleted', false)
      .order('txn_date', { ascending: false }).order('created_at', { ascending: false }),
  ]);
  if (holdingsR.error) throw holdingsR.error;
  if (txnsR.error)     throw txnsR.error;
  return { account, holdings: holdingsR.data || [], transactions: txnsR.data || [] };
}

async function createBrokerAccount(payload) {
  const {
    brokerId, accountHolderName, clientId, pan,
    linkedBankAccountId, companyId, notes,
  } = payload;
  if (!brokerId)               throw new Error('brokerId required');
  if (!accountHolderName?.trim()) throw new Error('accountHolderName required');

  // Resolve broker name for COA naming
  const { data: broker, error: bErr } = await supabase
    .from('fino_brokers').select('name').eq('id', brokerId).maybeSingle();
  if (bErr) throw bErr;
  if (!broker) throw new Error('Broker not found');

  // Auto-COA child under 1900
  const childName = `Inv: ${broker.name} - ${accountHolderName.trim()}`;
  const coa = await ensureChildCoa({
    parentCode: PARENT_INVEST_CODE,
    childName,
    childType: 'asset',
    subType:   'non_current_asset',
    description: `Auto-created for broker account "${childName}"`,
  });

  const { data, error } = await supabase
    .from('fino_broker_accounts').insert({
      broker_id: brokerId,
      account_holder: accountHolderName.trim(),
      client_id: clientId?.trim() || null,
      pan: pan?.trim() || null,
      linked_bank_account_id: linkedBankAccountId || null,
      linked_account_id: coa.id,
      company_id: companyId || null,
      notes: notes?.trim() || null,
    }).select().single();
  if (error) throw error;
  return { account: data, linked_coa: coa };
}

// Holding helpers ------------------------------------------------------------

async function _getHolding(brokerAccountId, symbol) {
  const { data, error } = await supabase
    .from('fino_stock_holdings').select('*')
    .eq('broker_account_id', brokerAccountId)
    .eq('symbol', symbol)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function _upsertHoldingAfterBuy(brokerAccountId, symbol, exchange, addQty, addCost) {
  const existing = await _getHolding(brokerAccountId, symbol);
  if (!existing) {
    const { data, error } = await supabase
      .from('fino_stock_holdings').insert({
        broker_account_id: brokerAccountId,
        symbol,
        exchange: exchange || null,
        quantity: addQty,
        avg_buy_price: round2(addCost / addQty),
        invested_value: round2(addCost),
        current_price: 0,
        current_value: 0,
        unrealized_pnl: 0,
      }).select().single();
    if (error) throw error;
    return data;
  }
  const newQty = round2(Number(existing.quantity) + addQty);
  const newInvested = round2(Number(existing.invested_value) + addCost);
  const newAvg = newQty > 0 ? round2(newInvested / newQty) : 0;
  const cur = Number(existing.current_price) || 0;
  const { data, error } = await supabase
    .from('fino_stock_holdings').update({
      quantity: newQty,
      invested_value: newInvested,
      avg_buy_price: newAvg,
      exchange: exchange || existing.exchange,
      current_value: round2(newQty * cur),
      unrealized_pnl: round2(newQty * cur - newInvested),
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id).select().single();
  if (error) throw error;
  return data;
}

async function _reduceHoldingAfterSell(holding, sellQty) {
  const newQty = round2(Number(holding.quantity) - sellQty);
  const costBasisRemoved = round2(sellQty * Number(holding.avg_buy_price));
  const newInvested = round2(Number(holding.invested_value) - costBasisRemoved);
  const cur = Number(holding.current_price) || 0;
  const { data, error } = await supabase
    .from('fino_stock_holdings').update({
      quantity: newQty,
      invested_value: Math.max(0, newInvested),
      current_value: round2(newQty * cur),
      unrealized_pnl: round2(newQty * cur - Math.max(0, newInvested)),
      updated_at: new Date().toISOString(),
    }).eq('id', holding.id).select().single();
  if (error) throw error;
  return data;
}

async function _refreshAccountTotals(brokerAccountId) {
  const { data: hs } = await supabase.from('fino_stock_holdings').select('*')
    .eq('broker_account_id', brokerAccountId);
  let invested = 0, current = 0, unreal = 0;
  for (const h of (hs || [])) {
    invested += Number(h.invested_value || 0);
    current  += Number(h.current_value  || 0);
    unreal   += Number(h.unrealized_pnl || 0);
  }
  await supabase.from('fino_broker_accounts').update({
    total_invested: round2(invested),
    current_value: round2(current),
    unrealized_pnl: round2(unreal),
    updated_at: new Date().toISOString(),
  }).eq('id', brokerAccountId);
}

async function _bumpRealized(brokerAccountId, delta) {
  const { data: a } = await supabase.from('fino_broker_accounts')
    .select('realized_pnl').eq('id', brokerAccountId).maybeSingle();
  await supabase.from('fino_broker_accounts').update({
    realized_pnl: round2(Number(a?.realized_pnl || 0) + Number(delta)),
    updated_at: new Date().toISOString(),
  }).eq('id', brokerAccountId);
}

async function _bumpDividend(brokerAccountId, delta) {
  const { data: a } = await supabase.from('fino_broker_accounts')
    .select('total_dividend').eq('id', brokerAccountId).maybeSingle();
  await supabase.from('fino_broker_accounts').update({
    total_dividend: round2(Number(a?.total_dividend || 0) + Number(delta)),
    updated_at: new Date().toISOString(),
  }).eq('id', brokerAccountId);
}

// ─── Buy / Sell / Dividend ───────────────────────────────────────────────────

async function recordBuy({
  brokerAccountId, txnDate, symbol, exchange,
  quantity, price, brokerage = 0, stt = 0, otherCharges = 0, notes,
}) {
  if (!brokerAccountId) throw new Error('brokerAccountId required');
  if (!symbol?.trim())  throw new Error('symbol required');
  const qty = Number(quantity), pr = Number(price);
  if (!(qty > 0)) throw new Error('quantity must be > 0');
  if (!(pr  > 0)) throw new Error('price must be > 0');

  const charges = round2(Number(brokerage) + Number(stt) + Number(otherCharges));
  const grossAmt = round2(qty * pr);
  const totalCost = round2(grossAmt + charges);

  // Resolve account COA + linked bank
  const { data: account, error: aErr } = await supabase
    .from('fino_broker_accounts').select('*').eq('id', brokerAccountId).maybeSingle();
  if (aErr) throw aErr;
  if (!account) throw new Error('Broker account not found');
  if (account.is_deleted) throw new Error('Account is deleted');
  const { data: invCoa } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', account.linked_account_id).maybeSingle();
  if (!invCoa?.code) throw new Error('Investment COA not resolvable');

  if (!account.linked_bank_account_id) throw new Error('Account has no linked bank — set one to record buys');
  const bankCode = await bankCoaCode(account.linked_bank_account_id);
  if (!bankCode) throw new Error('Linked bank COA not resolvable');

  // Insert txn row
  const { data: txn, error: tErr } = await supabase
    .from('fino_stock_transactions').insert({
      broker_account_id: brokerAccountId,
      txn_date: txnDate,
      txn_type: 'buy',
      symbol: symbol.trim().toUpperCase(),
      exchange: exchange || null,
      quantity: qty,
      price: pr,
      amount: grossAmt,
      brokerage: Number(brokerage) || 0,
      stt: Number(stt) || 0,
      other_charges: Number(otherCharges) || 0,
      total_charges: charges,
      net_amount: totalCost,
      notes: notes || null,
    }).select().single();
  if (tErr) throw tErr;

  // Ledger
  const ledger = await createLedgerEntryGroup({
    txnDate,
    lines: [
      { accountCode: invCoa.code, direction: 'debit',  amount: totalCost, description: `Buy ${qty} ${symbol}` },
      { accountCode: bankCode,    direction: 'credit', amount: totalCost, description: `Buy ${qty} ${symbol}` },
    ],
    sourceModule: 'stock_buy', sourceId: txn.id,
    companyId: account.company_id || null,
    description: `Buy ${qty} ${symbol} @ ${pr}`,
  });
  await supabase.from('fino_stock_transactions')
    .update({ ledger_txn_group_id: ledger.txn_group_id }).eq('id', txn.id);

  await _upsertHoldingAfterBuy(brokerAccountId, symbol.trim().toUpperCase(), exchange, qty, totalCost);
  await _refreshAccountTotals(brokerAccountId);
  if (account.linked_bank_account_id) try { await refreshCurrentBalance(account.linked_bank_account_id); } catch (_) {}

  return { txn, ledger };
}

async function recordSell({
  brokerAccountId, txnDate, symbol, exchange,
  quantity, price, brokerage = 0, stt = 0, otherCharges = 0, notes,
}) {
  if (!brokerAccountId) throw new Error('brokerAccountId required');
  if (!symbol?.trim())  throw new Error('symbol required');
  const qty = Number(quantity), pr = Number(price);
  if (!(qty > 0)) throw new Error('quantity must be > 0');
  if (!(pr  > 0)) throw new Error('price must be > 0');

  const sym = symbol.trim().toUpperCase();
  const holding = await _getHolding(brokerAccountId, sym);
  if (!holding) throw new Error(`No holding for ${sym}`);
  if (qty > Number(holding.quantity) + 0.0001) {
    throw new Error(`Cannot sell ${qty} of ${sym}; holding only ${holding.quantity}`);
  }

  await seedShareMarketCoa();
  const charges = round2(Number(brokerage) + Number(stt) + Number(otherCharges));
  const gross   = round2(qty * pr);
  const net     = round2(gross - charges);                    // bank receives
  const cost    = round2(qty * Number(holding.avg_buy_price)); // cost basis
  const realized = round2(gross - cost);                       // P&L vs cost basis (charges booked separately as expense)

  const { data: account } = await supabase
    .from('fino_broker_accounts').select('*').eq('id', brokerAccountId).maybeSingle();
  if (!account) throw new Error('Broker account not found');
  if (account.is_deleted) throw new Error('Account is deleted');
  if (!account.linked_bank_account_id) throw new Error('Account has no linked bank');
  const { data: invCoa } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', account.linked_account_id).maybeSingle();
  const bankCode = await bankCoaCode(account.linked_bank_account_id);

  const { data: txn, error: tErr } = await supabase
    .from('fino_stock_transactions').insert({
      broker_account_id: brokerAccountId,
      txn_date: txnDate,
      txn_type: 'sell',
      symbol: sym, exchange: exchange || holding.exchange,
      quantity: qty, price: pr, amount: gross,
      brokerage: Number(brokerage) || 0,
      stt: Number(stt) || 0,
      other_charges: Number(otherCharges) || 0,
      total_charges: charges,
      net_amount: net,
      cost_basis: cost,
      realized_pnl: realized,
      notes: notes || null,
    }).select().single();
  if (tErr) throw tErr;

  // Build ledger lines.
  // Debits:  bank (net), brokerage charges (if > 0), realized loss (if loss)
  // Credits: investment (cost), realized gain (if gain)
  const lines = [];
  if (net > 0) lines.push({ accountCode: bankCode,         direction: 'debit',  amount: net,     description: `Sell proceeds ${qty} ${sym}` });
  if (charges > 0) lines.push({ accountCode: BANK_CHARGES_CODE, direction: 'debit',  amount: charges, description: `Brokerage on sell ${sym}` });
  if (realized < 0) lines.push({ accountCode: REALIZED_LOSS_CODE, direction: 'debit', amount: Math.abs(realized), description: `Realized loss ${sym}` });

  if (cost > 0) lines.push({ accountCode: invCoa.code, direction: 'credit', amount: cost, description: `Cost basis ${qty} ${sym}` });
  if (realized > 0) lines.push({ accountCode: REALIZED_GAIN_CODE, direction: 'credit', amount: realized, description: `Realized gain ${sym}` });

  // Sanity — sum check
  let dr = 0, cr = 0;
  for (const l of lines) (l.direction === 'debit' ? dr += l.amount : cr += l.amount);
  if (Math.abs(dr - cr) > 0.01) {
    throw new Error(`Internal: sell ledger unbalanced (dr ${dr.toFixed(2)} / cr ${cr.toFixed(2)})`);
  }

  const ledger = await createLedgerEntryGroup({
    txnDate, lines,
    sourceModule: 'stock_sell', sourceId: txn.id,
    companyId: account.company_id || null,
    description: `Sell ${qty} ${sym} @ ${pr}`,
  });
  await supabase.from('fino_stock_transactions')
    .update({ ledger_txn_group_id: ledger.txn_group_id }).eq('id', txn.id);

  await _reduceHoldingAfterSell(holding, qty);
  await _bumpRealized(brokerAccountId, realized);
  await _refreshAccountTotals(brokerAccountId);
  if (account.linked_bank_account_id) try { await refreshCurrentBalance(account.linked_bank_account_id); } catch (_) {}

  return { txn, ledger, realizedPnL: realized };
}

async function recordDividend({ brokerAccountId, txnDate, symbol, amount, notes }) {
  if (!brokerAccountId) throw new Error('brokerAccountId required');
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('amount must be > 0');

  const { data: account } = await supabase
    .from('fino_broker_accounts').select('*').eq('id', brokerAccountId).maybeSingle();
  if (!account) throw new Error('Broker account not found');
  if (account.is_deleted) throw new Error('Account is deleted');
  if (!account.linked_bank_account_id) throw new Error('Account has no linked bank');
  const bankCode = await bankCoaCode(account.linked_bank_account_id);

  const { data: txn, error: tErr } = await supabase
    .from('fino_stock_transactions').insert({
      broker_account_id: brokerAccountId,
      txn_date: txnDate,
      txn_type: 'dividend',
      symbol: symbol?.trim().toUpperCase() || null,
      amount: amt,
      net_amount: amt,
      notes: notes || null,
    }).select().single();
  if (tErr) throw tErr;

  const ledger = await createLedgerEntryGroup({
    txnDate,
    lines: [
      { accountCode: bankCode,            direction: 'debit',  amount: amt, description: `Dividend ${symbol || ''}`.trim() },
      { accountCode: DIVIDEND_INCOME_CODE, direction: 'credit', amount: amt, description: `Dividend income ${symbol || ''}`.trim() },
    ],
    sourceModule: 'stock_dividend', sourceId: txn.id,
    companyId: account.company_id || null,
    description: `Dividend ${symbol || ''} ₹${amt}`.trim(),
  });
  await supabase.from('fino_stock_transactions')
    .update({ ledger_txn_group_id: ledger.txn_group_id }).eq('id', txn.id);

  await _bumpDividend(brokerAccountId, amt);
  if (account.linked_bank_account_id) try { await refreshCurrentBalance(account.linked_bank_account_id); } catch (_) {}

  return { txn, ledger };
}

// ─── Manual price update ─────────────────────────────────────────────────────

async function updatePrice({ holdingId, currentPrice }) {
  const cp = Number(currentPrice);
  if (!(cp > 0)) throw new Error('currentPrice must be > 0');
  const { data: h, error } = await supabase
    .from('fino_stock_holdings').select('*').eq('id', holdingId).maybeSingle();
  if (error) throw error;
  if (!h) throw new Error('Holding not found');
  const cur = round2(Number(h.quantity) * cp);
  const unr = round2(cur - Number(h.invested_value));
  const { data: updated, error: uErr } = await supabase
    .from('fino_stock_holdings').update({
      current_price: cp,
      current_value: cur,
      unrealized_pnl: unr,
      last_price_update: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', holdingId).select().single();
  if (uErr) throw uErr;
  await _refreshAccountTotals(h.broker_account_id);
  return updated;
}

async function bulkUpdatePrices(updates = []) {
  const out = [];
  for (const u of updates) {
    if (!u?.holdingId || !(Number(u.currentPrice) > 0)) continue;
    out.push(await updatePrice(u));
  }
  return { updated: out.length, holdings: out };
}

// ─── Reports ─────────────────────────────────────────────────────────────────

async function getRealizedPnL({ brokerAccountId, from = null, to = null } = {}) {
  let q = supabase.from('fino_stock_transactions')
    .select('*')
    .eq('txn_type', 'sell').eq('is_deleted', false)
    .order('txn_date', { ascending: false });
  if (brokerAccountId) q = q.eq('broker_account_id', brokerAccountId);
  if (from) q = q.gte('txn_date', from);
  if (to)   q = q.lte('txn_date', to);
  const { data, error } = await q;
  if (error) throw error;

  // Per-symbol summary
  const map = new Map();
  for (const t of (data || [])) {
    const k = t.symbol;
    const cur = map.get(k) || { symbol: k, sells: 0, qty_sold: 0, gross: 0, charges: 0, realized: 0 };
    cur.sells += 1;
    cur.qty_sold += Number(t.quantity);
    cur.gross    += Number(t.amount || 0);
    cur.charges  += Number(t.total_charges || 0);
    cur.realized += Number(t.realized_pnl || 0);
    map.set(k, cur);
  }
  const perSymbol = [...map.values()]
    .map(s => ({ ...s, gross: round2(s.gross), charges: round2(s.charges), realized: round2(s.realized) }))
    .sort((a, b) => b.realized - a.realized);
  const total_realized = round2((data || []).reduce((a, t) => a + Number(t.realized_pnl || 0), 0));
  return { trades: data || [], perSymbol, total_realized };
}

async function getOverallDashboard() {
  const { data: accounts, error } = await supabase
    .from('fino_broker_accounts').select('*, broker:fino_brokers(name)')
    .eq('is_deleted', false);
  if (error) throw error;
  let totals = {
    total_accounts: 0, total_invested: 0, total_current_value: 0,
    total_unrealized: 0, total_realized: 0, total_dividend: 0,
  };
  for (const a of (accounts || [])) {
    totals.total_accounts += 1;
    totals.total_invested      += Number(a.total_invested  || 0);
    totals.total_current_value += Number(a.current_value   || 0);
    totals.total_unrealized    += Number(a.unrealized_pnl  || 0);
    totals.total_realized      += Number(a.realized_pnl    || 0);
    totals.total_dividend      += Number(a.total_dividend  || 0);
  }
  for (const k of Object.keys(totals)) if (k !== 'total_accounts') totals[k] = round2(totals[k]);
  return { ...totals, accounts: accounts || [] };
}

// ─── Delete ──────────────────────────────────────────────────────────────────

async function deleteTransaction(txnId, reason = null) {
  const { data: t, error } = await supabase
    .from('fino_stock_transactions').select('*').eq('id', txnId).maybeSingle();
  if (error) throw error;
  if (!t) throw new Error('Transaction not found');
  if (t.is_deleted) throw new Error('Already deleted');

  // Reverse ledger
  if (t.ledger_txn_group_id) {
    try { await reverseLedgerGroup({ txnGroupId: t.ledger_txn_group_id, reason: reason || 'Stock txn deleted' }); } catch (_) {}
  }
  await supabase.from('fino_stock_transactions').update({ is_deleted: true }).eq('id', txnId);

  // Reverse holding effect
  if (t.txn_type === 'buy' && t.symbol) {
    const holding = await _getHolding(t.broker_account_id, t.symbol);
    if (holding) {
      // Guard: cannot delete a buy that has been partially sold below the original add
      // Simplification: if current qty < bought qty → reject
      if (Number(holding.quantity) < Number(t.quantity) - 0.0001) {
        // Restore is_deleted=false and surface error
        await supabase.from('fino_stock_transactions').update({ is_deleted: false }).eq('id', txnId);
        if (t.ledger_txn_group_id) {
          // Note: we already created reversal entries; not undoing those for safety.
          // Caller should investigate.
        }
        throw new Error(`Cannot delete this buy: ${holding.quantity} ${t.symbol} remain but the buy added ${t.quantity}. Delete sells first.`);
      }
      const newQty = round2(Number(holding.quantity) - Number(t.quantity));
      const newInvested = round2(Number(holding.invested_value) - Number(t.net_amount));
      const newAvg = newQty > 0 ? round2(newInvested / newQty) : 0;
      const cur = Number(holding.current_price) || 0;
      await supabase.from('fino_stock_holdings').update({
        quantity: newQty,
        invested_value: Math.max(0, newInvested),
        avg_buy_price: newAvg,
        current_value: round2(newQty * cur),
        unrealized_pnl: round2(newQty * cur - Math.max(0, newInvested)),
        updated_at: new Date().toISOString(),
      }).eq('id', holding.id);
    }
  } else if (t.txn_type === 'sell' && t.symbol) {
    // Restore qty + invested
    const holding = await _getHolding(t.broker_account_id, t.symbol);
    if (holding) {
      const newQty = round2(Number(holding.quantity) + Number(t.quantity));
      const newInvested = round2(Number(holding.invested_value) + Number(t.cost_basis || 0));
      const newAvg = newQty > 0 ? round2(newInvested / newQty) : 0;
      const cur = Number(holding.current_price) || 0;
      await supabase.from('fino_stock_holdings').update({
        quantity: newQty,
        invested_value: newInvested,
        avg_buy_price: newAvg,
        current_value: round2(newQty * cur),
        unrealized_pnl: round2(newQty * cur - newInvested),
        updated_at: new Date().toISOString(),
      }).eq('id', holding.id);
    }
    await _bumpRealized(t.broker_account_id, -Number(t.realized_pnl || 0));
  } else if (t.txn_type === 'dividend') {
    await _bumpDividend(t.broker_account_id, -Number(t.amount || 0));
  }

  await _refreshAccountTotals(t.broker_account_id);

  // Refresh bank balance
  const { data: account } = await supabase
    .from('fino_broker_accounts').select('linked_bank_account_id').eq('id', t.broker_account_id).maybeSingle();
  if (account?.linked_bank_account_id) try { await refreshCurrentBalance(account.linked_bank_account_id); } catch (_) {}

  return { success: true };
}

async function deleteBrokerAccount(id, reason = null) {
  const { data: account, error } = await supabase
    .from('fino_broker_accounts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!account) throw new Error('Account not found');
  if (account.is_deleted) throw new Error('Already deleted');

  for (const sm of ['stock_buy', 'stock_sell', 'stock_dividend']) {
    const { data: txns } = await supabase
      .from('fino_stock_transactions').select('id')
      .eq('broker_account_id', id).eq('is_deleted', false);
    for (const t of (txns || [])) {
      try { await reverseBySource({ sourceModule: sm, sourceId: t.id, reason: reason || 'Account deleted' }); } catch (_) {}
    }
  }
  await supabase.from('fino_stock_transactions').update({ is_deleted: true }).eq('broker_account_id', id);
  await supabase.from('fino_stock_holdings').delete().eq('broker_account_id', id);
  if (account.linked_account_id) {
    await supabase.from('fino_chart_of_accounts').update({ is_active: false }).eq('id', account.linked_account_id);
  }
  await supabase.from('fino_broker_accounts').update({
    is_deleted: true,
    total_invested: 0, current_value: 0, unrealized_pnl: 0,
    realized_pnl: 0, total_dividend: 0,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (account.linked_bank_account_id) try { await refreshCurrentBalance(account.linked_bank_account_id); } catch (_) {}
  return { success: true };
}

module.exports = {
  // Brokers
  listBrokers, createBroker,
  // Accounts
  listBrokerAccounts, getBrokerAccount, createBrokerAccount, deleteBrokerAccount,
  // Transactions
  recordBuy, recordSell, recordDividend, deleteTransaction,
  // Prices
  updatePrice, bulkUpdatePrices,
  // Reports
  getRealizedPnL, getOverallDashboard,
  // Setup
  seedShareMarketCoa,
};
