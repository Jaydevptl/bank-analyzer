/**
 * Fino · Loans Given service (Phase 3b)
 *
 * Public API:
 *   createLoan(data)
 *   listLoans(filters)
 *   getLoan(id, asOfDate?)
 *   computeOutstanding(loanId, asOfDate?)
 *   recordRepayment({ loanId, amountReceived, repaymentDate, receivedViaAccountId, notes })
 *   writeOffLoan(loanId, { date, reason })
 *   getBorrowerSummary()
 *   snapshotAccrual(loanId, asOfDate)
 *
 * Pure helpers (no DB, easy to unit test):
 *   _segmentInterest({ principal, rate, days })
 *   _walkSegments({ disbursedDate, principal, rate, type, repayments, asOfDate })
 *   _splitRepayment({ amountReceived, interestOutstanding })
 *
 * ─── Worked example (matches the Phase 3b prompt) ────────────────────────────
 *   ₹50,000 @ 12% simple, disbursed 2026-01-01, repayment ₹10,000 on 2026-04-30.
 *   Days outstanding before repayment = 119 (Jan 30 + Feb 28 + Mar 31 + Apr 30).
 *   Interest accrued by 04-30 = 50000 × 0.12 × 119/365 = ₹1,956.16
 *   amount_received (10,000) > interest_outstanding (1,956.16)
 *     → interest_portion  = 1,956.16
 *     → principal_portion = 8,043.84
 *   New outstanding principal = 50,000 − 8,043.84 = ₹41,956.16
 */

const supabase = require('./supabase');
const {
  createLedgerEntry,
  createLedgerEntryGroup,
} = require('./ledger');

const PRINCIPAL_CODE = '1500';   // Loans Given (asset)
const INTEREST_INCOME_CODE = '4270'; // Loan Interest Income
const WRITEOFF_EXPENSE_CODE = '5700'; // Misc Expenses

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const daysBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
const today = () => new Date().toISOString().slice(0, 10);

// ─── PURE FUNCTIONS (testable, no DB) ────────────────────────────────────────

function _segmentInterest({ principal, ratePct, days }) {
  return (Number(principal) * Number(ratePct) / 100) * (days / 365);
}

/**
 * Walk through repayments in date order, summing interest per segment.
 * Returns:
 *   { interestAccrued, currentPrincipal, segments }
 * For type='compound' (monthly), interest is capitalized at calendar month-ends inside each segment.
 * Quarterly/yearly fall back to monthly compounding for v1 (refine in Phase 19).
 */
function _walkSegments({ disbursedDate, principal, ratePct, type, repayments, asOfDate }) {
  const sorted = [...repayments]
    .map(r => ({ date: r.repayment_date || r.date, principal: Number(r.principal_portion || 0) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (type === 'none' || !ratePct) {
    let cur = Number(principal);
    for (const r of sorted) cur -= r.principal;
    return { interestAccrued: 0, currentPrincipal: round2(cur), segments: [] };
  }

  let cur  = Number(principal);
  let last = disbursedDate;
  let totalInterest = 0;
  const segments = [];

  const addSegment = (from, to, p) => {
    const days = daysBetween(from, to);
    if (days <= 0 || p <= 0) return;
    if (type === 'compound') {
      // Monthly compounding inside this segment
      let cursor = from;
      let runningP = p;
      while (cursor < to) {
        const next = _addMonths(cursor, 1);
        const segEnd = next < to ? next : to;
        const dInner = daysBetween(cursor, segEnd);
        const inner = _segmentInterest({ principal: runningP, ratePct, days: dInner });
        totalInterest += inner;
        runningP += inner;
        segments.push({ from: cursor, to: segEnd, principal: round2(p), interest: round2(inner) });
        cursor = segEnd;
      }
    } else {
      // simple
      const interest = _segmentInterest({ principal: p, ratePct, days });
      totalInterest += interest;
      segments.push({ from, to, principal: round2(p), interest: round2(interest) });
    }
  };

  for (const r of sorted) {
    if (r.date <= last) { cur -= r.principal; continue; }
    addSegment(last, r.date, cur);
    cur -= r.principal;
    last = r.date;
  }
  if (asOfDate > last) addSegment(last, asOfDate, cur);

  return {
    interestAccrued: round2(totalInterest),
    currentPrincipal: round2(cur),
    segments,
  };
}

function _addMonths(dateStr, n) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function _splitRepayment({ amountReceived, interestOutstanding }) {
  const amt = round2(amountReceived);
  const intOut = round2(interestOutstanding);
  if (amt <= intOut) return { interest: amt, principal: 0 };
  return { interest: intOut, principal: round2(amt - intOut) };
}

// ─── DB-touching service ─────────────────────────────────────────────────────

async function createLoan(payload) {
  let {
    borrowerPartyId, borrowerName,
    loanLabel, principalAmount, disbursedDate,
    interestRatePercent = 0, interestType = 'simple', compoundFrequency,
    disbursedViaAccountId, expectedReturnDate, notes, companyId,
  } = payload;

  // Allow caller to pass borrowerName instead of id (uses shared helper)
  if (!borrowerPartyId && borrowerName) {
    const { ensurePartyByName } = require('./parties');
    const party = await ensurePartyByName(borrowerName, { is_borrower: true });
    borrowerPartyId = party.id;
  }
  if (!borrowerPartyId)        throw new Error('borrowerPartyId or borrowerName required');
  if (!disbursedViaAccountId)  throw new Error('disbursedViaAccountId required');
  if (!disbursedDate)          throw new Error('disbursedDate required');
  const principal = Number(principalAmount);
  if (!(principal > 0))        throw new Error('principalAmount must be > 0');
  if (!['simple','compound','none'].includes(interestType)) throw new Error('Invalid interestType');

  // Resolve disbursed-via account code (we have id, need code for ledger helper)
  const { data: coa, error: coaErr } = await supabase
    .from('fino_chart_of_accounts')
    .select('code')
    .eq('id', disbursedViaAccountId)
    .maybeSingle();
  if (coaErr) throw coaErr;
  if (!coa) throw new Error('disbursedViaAccountId does not match any COA row');

  // Insert loan
  const { data: loan, error } = await supabase
    .from('fino_loans_given')
    .insert({
      borrower_party_id: borrowerPartyId,
      loan_label: loanLabel?.trim() || null,
      principal_amount: principal,
      disbursed_date: disbursedDate,
      interest_rate_percent: Number(interestRatePercent) || 0,
      interest_type: interestType,
      compound_frequency: interestType === 'compound' ? (compoundFrequency || 'monthly') : null,
      disbursed_via_account_id: disbursedViaAccountId,
      expected_return_date: expectedReturnDate || null,
      notes: notes?.trim() || null,
      outstanding_principal: principal,
      total_interest_accrued: 0,
      total_repaid: 0,
      status: 'active',
      company_id: companyId || null,
    })
    .select()
    .single();
  if (error) throw error;

  // Disbursement ledger: Loans Given ↑ + Bank/Cash ↓
  const ledger = await createLedgerEntry({
    txnDate: disbursedDate,
    amount: principal,
    debitAccountCode:  PRINCIPAL_CODE,
    creditAccountCode: coa.code,
    description: `Loan disbursed: ${loanLabel || loan.id}`,
    sourceModule: 'loan_disbursement',
    sourceId: loan.id,
    partyId: borrowerPartyId,
    companyId: companyId || null,
  });

  return { loan, ledger };
}

async function listLoans({ borrowerPartyId = null, status = null, companyId = null, includeDeleted = false } = {}) {
  let q = supabase.from('fino_loans_given').select('*').order('disbursed_date', { ascending: false });
  if (borrowerPartyId) q = q.eq('borrower_party_id', borrowerPartyId);
  if (status)          q = q.eq('status', status);
  if (companyId)       q = q.eq('company_id', companyId);
  if (!includeDeleted) q = q.eq('is_deleted', false);
  const { data, error } = await q;
  if (error) throw error;

  // Compute live outstanding for each
  const enriched = await Promise.all((data || []).map(async (loan) => {
    const computed = await computeOutstanding(loan.id, today());
    return { ...loan, computed };
  }));
  return enriched;
}

async function getLoan(id, asOfDate = null) {
  const { data: loan, error } = await supabase
    .from('fino_loans_given')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!loan) return null;

  const { data: borrower, error: bErr } = await supabase
    .from('fino_parties').select('*').eq('id', loan.borrower_party_id).maybeSingle();
  if (bErr) throw bErr;

  const { data: repayments, error: rErr } = await supabase
    .from('fino_loan_repayments')
    .select('*')
    .eq('loan_id', id)
    .eq('is_deleted', false)
    .order('repayment_date', { ascending: false });
  if (rErr) throw rErr;

  const computed = await computeOutstanding(id, asOfDate || today(), { loan, repayments });
  return { loan, borrower, repayments: repayments || [], computed };
}

async function computeOutstanding(loanId, asOfDate = null, prefetched = null) {
  const asOf = asOfDate || today();
  let loan, repayments;
  if (prefetched) {
    loan = prefetched.loan;
    repayments = prefetched.repayments;
  } else {
    const { data: l, error } = await supabase.from('fino_loans_given').select('*').eq('id', loanId).maybeSingle();
    if (error) throw error;
    if (!l) throw new Error('Loan not found');
    loan = l;
    const { data: r, error: rErr } = await supabase
      .from('fino_loan_repayments').select('*').eq('loan_id', loanId).eq('is_deleted', false)
      .order('repayment_date', { ascending: true });
    if (rErr) throw rErr;
    repayments = r || [];
  }

  const { interestAccrued, currentPrincipal, segments } = _walkSegments({
    disbursedDate: loan.disbursed_date,
    principal: Number(loan.principal_amount),
    ratePct: Number(loan.interest_rate_percent),
    type: loan.interest_type,
    repayments,
    asOfDate: asOf,
  });

  const interestPaid = repayments.reduce((s, r) => s + Number(r.interest_portion || 0), 0);
  const interestOutstanding = round2(Math.max(0, interestAccrued - interestPaid));
  const totalOutstanding = round2(Math.max(0, currentPrincipal) + interestOutstanding);
  const daysOutstanding = daysBetween(loan.disbursed_date, asOf);

  return {
    asOfDate: asOf,
    outstandingPrincipal: round2(Math.max(0, currentPrincipal)),
    interestAccrued: round2(interestAccrued),
    interestPaid: round2(interestPaid),
    interestOutstanding,
    totalOutstanding,
    daysOutstanding,
    segments,
  };
}

async function recordRepayment({ loanId, amountReceived, repaymentDate, receivedViaAccountId, notes }) {
  const amt = Number(amountReceived);
  if (!(amt > 0)) throw new Error('amountReceived must be > 0');
  if (!repaymentDate) throw new Error('repaymentDate required');
  if (!receivedViaAccountId) throw new Error('receivedViaAccountId required');

  // Load loan
  const { data: loan, error: lErr } = await supabase
    .from('fino_loans_given').select('*').eq('id', loanId).maybeSingle();
  if (lErr) throw lErr;
  if (!loan) throw new Error('Loan not found');
  if (loan.status === 'closed' || loan.status === 'written_off') {
    throw new Error(`Loan is ${loan.status}; cannot record repayment`);
  }
  if (repaymentDate < loan.disbursed_date) {
    throw new Error('Repayment date cannot be before disbursed date');
  }

  // Compute outstanding as of repayment date (using existing repayments)
  const { data: existing, error: eErr } = await supabase
    .from('fino_loan_repayments').select('*').eq('loan_id', loanId)
    .order('repayment_date', { ascending: true });
  if (eErr) throw eErr;
  const outstanding = await computeOutstanding(loanId, repaymentDate, { loan, repayments: existing || [] });

  if (amt > outstanding.totalOutstanding + 0.01) {
    throw new Error(`Amount ${amt.toFixed(2)} exceeds outstanding ${outstanding.totalOutstanding.toFixed(2)}. Adjust amount or use Write-Off.`);
  }

  // Split
  const split = _splitRepayment({
    amountReceived: amt,
    interestOutstanding: outstanding.interestOutstanding,
  });

  // Resolve received-via COA code
  const { data: rcoa, error: rcErr } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', receivedViaAccountId).maybeSingle();
  if (rcErr) throw rcErr;
  if (!rcoa) throw new Error('receivedViaAccountId does not match any COA row');

  // Insert repayment row first (so source_id is real)
  const { data: rep, error: insErr } = await supabase
    .from('fino_loan_repayments')
    .insert({
      loan_id: loanId,
      repayment_date: repaymentDate,
      amount_received: amt,
      principal_portion: split.principal,
      interest_portion: split.interest,
      received_via_account_id: receivedViaAccountId,
      notes: notes?.trim() || null,
    })
    .select()
    .single();
  if (insErr) throw insErr;

  // Build ledger group: up to 2 sub-pairs sharing one txn_group_id
  const lines = [];
  if (split.interest > 0) {
    lines.push({ accountCode: rcoa.code,            direction: 'debit',  amount: split.interest });
    lines.push({ accountCode: INTEREST_INCOME_CODE, direction: 'credit', amount: split.interest });
  }
  if (split.principal > 0) {
    lines.push({ accountCode: rcoa.code,        direction: 'debit',  amount: split.principal });
    lines.push({ accountCode: PRINCIPAL_CODE,   direction: 'credit', amount: split.principal });
  }

  let ledgerGroup = null;
  if (lines.length) {
    ledgerGroup = await createLedgerEntryGroup({
      txnDate: repaymentDate,
      lines,
      description: `Loan repayment · int ₹${split.interest.toFixed(2)} / pri ₹${split.principal.toFixed(2)}`,
      sourceModule: 'loan_repayment',
      sourceId: rep.id,
      partyId: loan.borrower_party_id,
      companyId: loan.company_id,
    });
    await supabase
      .from('fino_loan_repayments')
      .update({ ledger_txn_group_id: ledgerGroup.txn_group_id })
      .eq('id', rep.id);
  }

  // Recompute & persist denormalized fields + status
  const after = await computeOutstanding(loanId, today(), { loan, repayments: [...(existing || []), rep] });
  const totalRepaid = (Number(loan.total_repaid) || 0) + amt;
  const newStatus = (after.outstandingPrincipal <= 0.01 && after.interestOutstanding <= 0.01)
    ? 'closed'
    : 'partially_repaid';

  await supabase
    .from('fino_loans_given')
    .update({
      outstanding_principal: after.outstandingPrincipal,
      total_interest_accrued: after.interestAccrued,
      total_repaid: round2(totalRepaid),
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', loanId);

  return { repayment: rep, split, ledger: ledgerGroup, newOutstanding: after, status: newStatus };
}

async function writeOffLoan(loanId, { date, reason }) {
  if (!date) throw new Error('date required');
  const { data: loan, error } = await supabase
    .from('fino_loans_given').select('*').eq('id', loanId).maybeSingle();
  if (error) throw error;
  if (!loan) throw new Error('Loan not found');
  if (loan.status === 'closed' || loan.status === 'written_off') {
    throw new Error(`Loan is already ${loan.status}`);
  }

  const out = await computeOutstanding(loanId, date);
  const writeOffAmt = round2(out.outstandingPrincipal + out.interestOutstanding);
  if (writeOffAmt <= 0.01) throw new Error('Nothing to write off');

  const ledger = await createLedgerEntry({
    txnDate: date,
    amount: writeOffAmt,
    debitAccountCode:  WRITEOFF_EXPENSE_CODE,
    creditAccountCode: PRINCIPAL_CODE,
    description: `Loan write-off${reason ? ': ' + reason : ''}`,
    sourceModule: 'loan_writeoff',
    sourceId: loanId,
    partyId: loan.borrower_party_id,
    companyId: loan.company_id,
    notes: reason || null,
  });

  await supabase
    .from('fino_loans_given')
    .update({
      status: 'written_off',
      outstanding_principal: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', loanId);

  return { written_off: writeOffAmt, ledger };
}

async function getBorrowerSummary() {
  // Group loans by borrower; compute live outstanding per loan
  const loans = await listLoans();
  const map = new Map();
  for (const l of loans) {
    const cur = map.get(l.borrower_party_id) || {
      borrower_party_id: l.borrower_party_id,
      total_loans: 0,
      total_disbursed: 0,
      total_repaid: 0,
      total_outstanding: 0,
      last_disbursed_date: null,
    };
    cur.total_loans += 1;
    cur.total_disbursed += Number(l.principal_amount);
    cur.total_repaid    += Number(l.total_repaid || 0);
    cur.total_outstanding += Number(l.computed?.totalOutstanding || 0);
    if (!cur.last_disbursed_date || l.disbursed_date > cur.last_disbursed_date) cur.last_disbursed_date = l.disbursed_date;
    map.set(l.borrower_party_id, cur);
  }

  // Attach borrower names
  const ids = [...map.keys()];
  if (ids.length === 0) return [];
  const { data: parties, error } = await supabase
    .from('fino_parties').select('id, name').in('id', ids);
  if (error) throw error;
  const nameMap = new Map((parties || []).map(p => [p.id, p.name]));

  return [...map.values()].map(s => ({
    ...s,
    name: nameMap.get(s.borrower_party_id) || 'Unknown',
    total_disbursed:   round2(s.total_disbursed),
    total_repaid:      round2(s.total_repaid),
    total_outstanding: round2(s.total_outstanding),
  })).sort((a, b) => b.total_outstanding - a.total_outstanding);
}

async function snapshotAccrual(loanId, asOfDate = null) {
  const out = await computeOutstanding(loanId, asOfDate);
  const { data, error } = await supabase
    .from('fino_loan_interest_accruals')
    .insert({
      loan_id: loanId,
      as_of_date: out.asOfDate,
      outstanding_principal: out.outstandingPrincipal,
      interest_accrued: out.interestAccrued,
      total_outstanding: out.totalOutstanding,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Cancel / Delete / Edit (Phase 3 Polish) ────────────────────────────────

// Cancel disbursement: only when status='active' and NO repayments. Reverses the
// disbursement ledger group. Used to undo a mistakenly-created loan (vs Write Off).
async function cancelDisbursement(loanId, reason = null) {
  const { reverseBySource } = require('./reversal');
  const { data: loan, error } = await supabase
    .from('fino_loans_given').select('*').eq('id', loanId).maybeSingle();
  if (error) throw error;
  if (!loan) throw new Error('Loan not found');
  if (loan.is_deleted) throw new Error('Loan already deleted');
  if (loan.status !== 'active') throw new Error(`Cannot cancel: loan status is ${loan.status}`);

  const { count, error: cErr } = await supabase
    .from('fino_loan_repayments')
    .select('id', { count: 'exact', head: true })
    .eq('loan_id', loanId).eq('is_deleted', false);
  if (cErr) throw cErr;
  if ((count || 0) > 0) throw new Error('Cannot cancel: repayments exist. Delete repayments first or use Delete Loan.');

  await reverseBySource({ sourceModule: 'loan_disbursement', sourceId: loanId, reason: reason || 'Disbursement cancelled' });

  await supabase
    .from('fino_loans_given')
    .update({ status: 'cancelled', is_deleted: true, outstanding_principal: 0, total_interest_accrued: 0, updated_at: new Date().toISOString() })
    .eq('id', loanId);

  // Refresh source bank balance
  const { data: ba } = await supabase
    .from('fino_bank_accounts').select('id').eq('linked_account_id', loan.disbursed_via_account_id).maybeSingle();
  if (ba?.id) {
    const { refreshCurrentBalance } = require('./bankAccounts');
    await refreshCurrentBalance(ba.id);
  }
  return { success: true };
}

// Delete loan: reverse ALL groups (disbursement, repayments, write-offs); mark deleted.
async function deleteLoan(loanId, reason = null) {
  const { reverseBySource } = require('./reversal');
  const { data: loan, error } = await supabase
    .from('fino_loans_given').select('*').eq('id', loanId).maybeSingle();
  if (error) throw error;
  if (!loan) throw new Error('Loan not found');
  if (loan.is_deleted) throw new Error('Loan already deleted');

  // Get all repayment ids first for source-tagged reversal
  const { data: reps } = await supabase
    .from('fino_loan_repayments').select('id').eq('loan_id', loanId).eq('is_deleted', false);

  for (const sm of ['loan_disbursement', 'loan_writeoff']) {
    try { await reverseBySource({ sourceModule: sm, sourceId: loanId, reason: reason || 'Loan deleted' }); } catch (_) {}
  }
  for (const r of (reps || [])) {
    try { await reverseBySource({ sourceModule: 'loan_repayment', sourceId: r.id, reason: reason || 'Loan deleted' }); } catch (_) {}
  }

  await supabase.from('fino_loan_repayments').update({ is_deleted: true }).eq('loan_id', loanId);
  await supabase
    .from('fino_loans_given')
    .update({ status: 'deleted', is_deleted: true, outstanding_principal: 0, total_interest_accrued: 0, total_repaid: 0, updated_at: new Date().toISOString() })
    .eq('id', loanId);

  const { data: ba } = await supabase
    .from('fino_bank_accounts').select('id').eq('linked_account_id', loan.disbursed_via_account_id).maybeSingle();
  if (ba?.id) {
    const { refreshCurrentBalance } = require('./bankAccounts');
    await refreshCurrentBalance(ba.id);
  }
  return { success: true };
}

// Delete a single repayment: reverse its ledger group, mark deleted, recompute denormalized + status.
async function deleteRepayment(repaymentId, reason = null) {
  const { reverseLedgerGroup } = require('./reversal');
  const { data: rep, error } = await supabase
    .from('fino_loan_repayments').select('*').eq('id', repaymentId).maybeSingle();
  if (error) throw error;
  if (!rep) throw new Error('Repayment not found');
  if (rep.is_deleted) throw new Error('Repayment already deleted');

  if (rep.ledger_txn_group_id) {
    await reverseLedgerGroup({ txnGroupId: rep.ledger_txn_group_id, reason: reason || 'Repayment deleted' });
  }
  await supabase.from('fino_loan_repayments').update({ is_deleted: true }).eq('id', repaymentId);

  // Recompute loan denormalized + status
  const { data: loan } = await supabase
    .from('fino_loans_given').select('*').eq('id', rep.loan_id).maybeSingle();
  if (loan) {
    const after = await computeOutstanding(rep.loan_id, today());
    const { data: remaining } = await supabase
      .from('fino_loan_repayments').select('amount_received')
      .eq('loan_id', rep.loan_id).eq('is_deleted', false);
    const newTotalRepaid = (remaining || []).reduce((s, r) => s + Number(r.amount_received || 0), 0);
    const newStatus = newTotalRepaid <= 0.01 ? 'active' : (after.outstandingPrincipal <= 0.01 && after.interestOutstanding <= 0.01 ? 'closed' : 'partially_repaid');
    await supabase.from('fino_loans_given').update({
      outstanding_principal: after.outstandingPrincipal,
      total_interest_accrued: after.interestAccrued,
      total_repaid: round2(newTotalRepaid),
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', rep.loan_id);
  }
  return { success: true };
}

// Edit meta only (label, notes, expected_return_date). Sensitive fields locked.
async function updateLoanMeta(id, patch) {
  const update = { updated_at: new Date().toISOString() };
  if (patch.loanLabel          !== undefined) update.loan_label = patch.loanLabel?.trim() || null;
  if (patch.notes              !== undefined) update.notes = patch.notes?.trim() || null;
  if (patch.expectedReturnDate !== undefined) update.expected_return_date = patch.expectedReturnDate || null;
  if (Object.keys(update).length === 1) throw new Error('No editable fields supplied');

  const { data, error } = await supabase
    .from('fino_loans_given').update(update).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ─── Phase 14: EMI Schedule ──────────────────────────────────────────────────

function _addPeriod(dateStr, n, frequency) {
  const d = new Date(dateStr);
  if (frequency === 'monthly')        d.setMonth(d.getMonth() + n);
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + n * 3);
  else if (frequency === 'yearly')    d.setFullYear(d.getFullYear() + n);
  else throw new Error(`Invalid frequency: ${frequency}`);
  return d.toISOString().slice(0, 10);
}

function _periodsPerYear(frequency) {
  if (frequency === 'monthly')   return 12;
  if (frequency === 'quarterly') return 4;
  if (frequency === 'yearly')    return 1;
  throw new Error(`Invalid frequency: ${frequency}`);
}

async function generateSchedule({ loanId, startDate, installments, frequency = 'monthly' }) {
  if (!loanId)        throw new Error('loanId required');
  if (!startDate)     throw new Error('startDate required');
  const n = Number(installments);
  if (!(n > 0 && Number.isInteger(n))) throw new Error('installments must be a positive integer');
  if (!['monthly','quarterly','yearly'].includes(frequency)) throw new Error('Invalid frequency');

  const { data: loan, error } = await supabase
    .from('fino_loans_given').select('*').eq('id', loanId).maybeSingle();
  if (error) throw error;
  if (!loan) throw new Error('Loan not found');

  // Wipe any existing schedule rows (regenerate)
  await supabase.from('fino_loan_schedules').delete().eq('loan_id', loanId);

  const principal = Number(loan.principal_amount);
  const ratePct   = Number(loan.interest_rate_percent) || 0;
  const ppy       = _periodsPerYear(frequency);
  const periodicRate = (ratePct / 100) / ppy;
  const rows = [];

  if (loan.interest_type === 'compound' && periodicRate > 0) {
    // Standard EMI: P * r * (1+r)^n / ((1+r)^n - 1)
    const pow = Math.pow(1 + periodicRate, n);
    const emi = round2(principal * periodicRate * pow / (pow - 1));
    let balance = principal;
    for (let i = 1; i <= n; i++) {
      const interest = round2(balance * periodicRate);
      const principalPart = i === n ? round2(balance) : round2(emi - interest);
      const total = round2(principalPart + interest);
      balance = round2(balance - principalPart);
      rows.push({
        loan_id: loanId,
        installment_number: i,
        due_date: _addPeriod(startDate, i - 1, frequency),
        principal_amount: principalPart,
        interest_amount:  interest,
        total_amount:     total,
        status: 'upcoming',
      });
    }
  } else if (loan.interest_type === 'simple' && periodicRate > 0) {
    // Equal principal + declining interest on outstanding balance
    const principalPart = round2(principal / n);
    let balance = principal;
    for (let i = 1; i <= n; i++) {
      const interest = round2(balance * periodicRate);
      const pp = i === n ? round2(balance) : principalPart;
      const total = round2(pp + interest);
      balance = round2(balance - pp);
      rows.push({
        loan_id: loanId,
        installment_number: i,
        due_date: _addPeriod(startDate, i - 1, frequency),
        principal_amount: pp,
        interest_amount:  interest,
        total_amount:     total,
        status: 'upcoming',
      });
    }
  } else {
    // No interest: equal principal only
    const principalPart = round2(principal / n);
    let balance = principal;
    for (let i = 1; i <= n; i++) {
      const pp = i === n ? round2(balance) : principalPart;
      balance = round2(balance - pp);
      rows.push({
        loan_id: loanId,
        installment_number: i,
        due_date: _addPeriod(startDate, i - 1, frequency),
        principal_amount: pp,
        interest_amount:  0,
        total_amount:     pp,
        status: 'upcoming',
      });
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from('fino_loan_schedules').insert(rows).select();
  if (insErr) throw insErr;

  return { schedule: inserted, count: inserted.length };
}

async function getSchedule(loanId) {
  const { data, error } = await supabase
    .from('fino_loan_schedules')
    .select('*')
    .eq('loan_id', loanId)
    .order('installment_number');
  if (error) throw error;

  // Update upcoming → overdue / due based on today
  const t = today();
  const enriched = (data || []).map(r => {
    let status = r.status;
    if (status === 'upcoming') {
      if (r.due_date < t) status = 'overdue';
      else if (r.due_date === t) status = 'due';
    }
    return { ...r, status };
  });
  return enriched;
}

async function markInstallmentPaid(scheduleId, { paidDate, paidAmount }) {
  if (!paidDate)   throw new Error('paidDate required');
  const amt = Number(paidAmount);
  if (!(amt > 0)) throw new Error('paidAmount must be > 0');

  const { data: sch, error } = await supabase
    .from('fino_loan_schedules').select('*').eq('id', scheduleId).maybeSingle();
  if (error) throw error;
  if (!sch) throw new Error('Schedule not found');
  if (sch.status === 'paid') throw new Error('Already paid');

  const { data, error: uErr } = await supabase
    .from('fino_loan_schedules')
    .update({ status: 'paid', paid_date: paidDate, paid_amount: amt })
    .eq('id', scheduleId)
    .select().single();
  if (uErr) throw uErr;
  return data;
}

async function getLoansOverview() {
  const t = today();
  const { data: schedules, error } = await supabase
    .from('fino_loan_schedules')
    .select('*');
  if (error) throw error;

  let upcomingCount = 0, dueCount = 0, overdueCount = 0, paidCount = 0;
  let totalUpcoming = 0, totalOverdue = 0;
  const upcoming30 = [];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  for (const s of (schedules || [])) {
    let status = s.status;
    if (status === 'upcoming') {
      if (s.due_date < t)        status = 'overdue';
      else if (s.due_date === t) status = 'due';
    }
    if (status === 'paid')          paidCount++;
    else if (status === 'overdue') { overdueCount++; totalOverdue += Number(s.total_amount); }
    else if (status === 'due')      dueCount++;
    else if (status === 'upcoming') {
      upcomingCount++;
      totalUpcoming += Number(s.total_amount);
      if (s.due_date <= cutoffStr) upcoming30.push({ ...s, status });
    }
  }

  // Total outstanding from existing live computation
  const { data: loans } = await supabase
    .from('fino_loans_given').select('outstanding_principal').eq('is_deleted', false);
  const totalOutstanding = (loans || []).reduce((s, l) => s + Number(l.outstanding_principal || 0), 0);

  return {
    upcomingCount, dueCount, overdueCount, paidCount,
    totalUpcoming: round2(totalUpcoming),
    totalOverdue:  round2(totalOverdue),
    totalOutstanding: round2(totalOutstanding),
    upcomingNext30: upcoming30.sort((a, b) => a.due_date.localeCompare(b.due_date)),
  };
}

module.exports = {
  // Service
  createLoan, listLoans, getLoan, computeOutstanding,
  recordRepayment, writeOffLoan, getBorrowerSummary, snapshotAccrual,
  cancelDisbursement, deleteLoan, deleteRepayment, updateLoanMeta,
  // Phase 14
  generateSchedule, getSchedule, markInstallmentPaid, getLoansOverview,
  // Pure helpers (exported for tests)
  _segmentInterest, _walkSegments, _splitRepayment,
};
