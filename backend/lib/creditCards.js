/**
 * Fino · Credit Cards service (Phase 3d)
 *
 * Liability accounting reminder:
 *   - SPEND        → CREDIT card COA (liability ↑); DEBIT expense
 *   - REFUND       → DEBIT  card COA (liability ↓); CREDIT expense
 *   - CASHBACK     → DEBIT  card COA (liability ↓); CREDIT income (4230)
 *   - INTEREST/FEE → CREDIT card COA (liability ↑); DEBIT expense
 *   - PAYMENT      → DEBIT  card COA (liability ↓); CREDIT bank
 *
 * Reward points have NO ledger entry in v1 — tracked only in fino_cc_rewards.
 */

const supabase = require('./supabase');
const { createLedgerEntry, createLedgerEntryGroup } = require('./ledger');
const { reverseLedgerGroup, reverseBySource } = require('./reversal');
const { ensureChildCoa } = require('./coaHelpers');
const { refreshCurrentBalance } = require('./bankAccounts');

const PARENT_CC_CODE = '2200';
const CASHBACK_INCOME_CODE = '4230';
const DEFAULT_EXPENSE_CODE = '5700';
const FEE_EXPENSE_CODE     = '5220';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today  = () => new Date().toISOString().slice(0, 10);

async function coaCodeById(id) {
  if (!id) return null;
  const { data, error } = await supabase.from('fino_chart_of_accounts').select('code').eq('id', id).maybeSingle();
  if (error) throw error;
  return data?.code || null;
}

async function ccCoaCode(creditCardId) {
  const { data, error } = await supabase
    .from('fino_credit_cards').select('linked_account_id').eq('id', creditCardId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Credit card not found');
  return coaCodeById(data.linked_account_id);
}

async function bankCoaCode(bankAccountId) {
  const { data, error } = await supabase
    .from('fino_bank_accounts').select('linked_account_id').eq('id', bankAccountId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Bank account not found');
  return coaCodeById(data.linked_account_id);
}

// ─── Cards CRUD ──────────────────────────────────────────────────────────────

async function createCreditCard(payload) {
  let {
    cardLabel, cardHolderPartyId, cardHolderName,
    bankName, cardNetwork, cardNumberLast4,
    creditLimit, statementDay, dueDay, defaultPaymentBankId,
    rewardProgram, pointValueInr = 0, companyId, notes,
  } = payload;

  if (!cardLabel?.trim()) throw new Error('cardLabel required');
  if (!bankName?.trim())  throw new Error('bankName required');

  // Allow caller to pass cardHolderName instead of id
  if (!cardHolderPartyId && cardHolderName) {
    const { ensurePartyByName } = require('./parties');
    const party = await ensurePartyByName(cardHolderName, { is_card_holder: true });
    cardHolderPartyId = party.id;
  }
  if (rewardProgram && rewardProgram !== 'cashback' && !(Number(pointValueInr) > 0)) {
    throw new Error('point_value_inr > 0 required when reward_program is points/miles');
  }

  // Provision child COA
  const coa = await ensureChildCoa({
    parentCode: PARENT_CC_CODE,
    childName: `CC: ${cardLabel.trim()}`,
    childType: 'liability',
    subType: 'current_liability',
    description: `Auto-created for credit card "${cardLabel.trim()}"`,
  });

  const { data: card, error } = await supabase
    .from('fino_credit_cards')
    .insert({
      card_label:              cardLabel.trim(),
      card_holder_party_id:    cardHolderPartyId || null,
      bank_name:               bankName.trim(),
      card_network:            cardNetwork || null,
      card_number_last4:       cardNumberLast4?.trim() || null,
      credit_limit:            creditLimit != null ? Number(creditLimit) : null,
      statement_day:           statementDay || null,
      due_day:                 dueDay || null,
      default_payment_bank_id: defaultPaymentBankId || null,
      reward_program:          rewardProgram || null,
      point_value_inr:         Number(pointValueInr) || 0,
      linked_account_id:       coa.id,
      company_id:              companyId || null,
      notes:                   notes?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return { card, linked_coa: coa };
}

async function listCreditCards({ holderId = null, status = null, companyId = null, includeDeleted = false } = {}) {
  let q = supabase
    .from('fino_credit_cards')
    .select('*, holder:fino_parties(id, name)')
    .order('card_label');
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (holderId)        q = q.eq('card_holder_party_id', holderId);
  if (status)          q = q.eq('status', status);
  if (companyId)       q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getCreditCard(id) {
  const { data: card, error } = await supabase
    .from('fino_credit_cards')
    .select('*, holder:fino_parties(id, name)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!card) return null;

  const [txnsR, paysR, stmtsR, rewardsR] = await Promise.all([
    supabase.from('fino_cc_transactions').select('*').eq('credit_card_id', id).eq('is_deleted', false).order('txn_date', { ascending: false }).limit(200),
    supabase.from('fino_cc_payments').select('*').eq('credit_card_id', id).eq('is_deleted', false).order('payment_date', { ascending: false }),
    supabase.from('fino_cc_statements').select('*').eq('credit_card_id', id).eq('is_deleted', false).order('statement_date', { ascending: false }),
    supabase.from('fino_cc_rewards').select('*').eq('credit_card_id', id).eq('is_deleted', false).order('earn_date', { ascending: false }),
  ]);
  if (txnsR.error || paysR.error || stmtsR.error || rewardsR.error) {
    throw txnsR.error || paysR.error || stmtsR.error || rewardsR.error;
  }
  return {
    card,
    transactions: txnsR.data || [],
    payments:     paysR.data || [],
    statements:   stmtsR.data || [],
    rewards:      rewardsR.data || [],
  };
}

async function updateCardMeta(id, patch) {
  const update = { updated_at: new Date().toISOString() };
  const map = {
    cardLabel: 'card_label', notes: 'notes',
    defaultPaymentBankId: 'default_payment_bank_id',
    pointValueInr: 'point_value_inr',
    statementDay: 'statement_day', dueDay: 'due_day',
    creditLimit: 'credit_limit',
    status: 'status',
    cardNumberLast4: 'card_number_last4',
  };
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) update[col] = (typeof patch[k] === 'string') ? patch[k].trim() : patch[k];
  }
  if (update.status && !['active', 'inactive'].includes(update.status)) {
    throw new Error("status can only be set to 'active' or 'inactive' via edit");
  }
  if (Object.keys(update).length === 1) throw new Error('No editable fields supplied');

  const { data, error } = await supabase.from('fino_credit_cards').update(update).eq('id', id).select().single();
  if (error) throw error;

  // Rename COA if label changed
  if (patch.cardLabel && data.linked_account_id) {
    await supabase.from('fino_chart_of_accounts')
      .update({ name: `CC: ${patch.cardLabel.trim()}` }).eq('id', data.linked_account_id);
  }
  return data;
}

async function bumpOutstanding(id, delta) {
  const { data: c } = await supabase.from('fino_credit_cards').select('current_outstanding').eq('id', id).maybeSingle();
  const newOut = round2(Number(c?.current_outstanding || 0) + Number(delta));
  await supabase.from('fino_credit_cards')
    .update({ current_outstanding: newOut, updated_at: new Date().toISOString() }).eq('id', id);
  return newOut;
}

// ─── Transactions ────────────────────────────────────────────────────────────

async function recordSpend({
  creditCardId, txnDate, amount, description,
  expenseCategoryCode = DEFAULT_EXPENSE_CODE,
  category = null,
  linkedModule = null, linkedId = null, businessId = null, notes,
}) {
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('amount must be > 0');
  if (!txnDate || !description?.trim()) throw new Error('txnDate + description required');

  const ccCode = await ccCoaCode(creditCardId);
  const { data: txn, error } = await supabase
    .from('fino_cc_transactions').insert({
      credit_card_id: creditCardId, txn_date: txnDate, amount: amt,
      description: description.trim(), txn_type: 'spend',
      linked_module: linkedModule, linked_id: linkedId,
      expense_category_code: expenseCategoryCode,
      category: category || 'Other',
      business_id: businessId,
    }).select().single();
  if (error) throw error;

  const ledger = await createLedgerEntry({
    txnDate, amount: amt,
    debitAccountCode:  expenseCategoryCode,
    creditAccountCode: ccCode,
    description: description.trim(),
    sourceModule: 'cc_spend', sourceId: txn.id,
    companyId: businessId, notes,
  });
  await supabase.from('fino_cc_transactions').update({ ledger_txn_group_id: ledger.txn_group_id }).eq('id', txn.id);
  const newOutstanding = await bumpOutstanding(creditCardId, +amt);
  return { txn, ledger, newOutstanding };
}

async function recordRefund({ creditCardId, txnDate, amount, description, expenseCategoryCode = DEFAULT_EXPENSE_CODE, businessId = null, notes }) {
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('amount must be > 0');

  const ccCode = await ccCoaCode(creditCardId);
  const { data: txn, error } = await supabase
    .from('fino_cc_transactions').insert({
      credit_card_id: creditCardId, txn_date: txnDate, amount: amt,
      description: description?.trim() || 'Merchant refund', txn_type: 'refund',
      expense_category_code: expenseCategoryCode, business_id: businessId,
    }).select().single();
  if (error) throw error;

  const ledger = await createLedgerEntry({
    txnDate, amount: amt,
    debitAccountCode:  ccCode,
    creditAccountCode: expenseCategoryCode,
    description: description || 'Merchant refund',
    sourceModule: 'cc_refund', sourceId: txn.id,
    companyId: businessId, notes,
  });
  await supabase.from('fino_cc_transactions').update({ ledger_txn_group_id: ledger.txn_group_id }).eq('id', txn.id);
  const newOutstanding = await bumpOutstanding(creditCardId, -amt);
  return { txn, ledger, newOutstanding };
}

async function recordCashback({ creditCardId, earnDate, amount, description, sourceTxnId = null, notes }) {
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('amount must be > 0');

  const ccCode = await ccCoaCode(creditCardId);

  const { data: txn, error } = await supabase
    .from('fino_cc_transactions').insert({
      credit_card_id: creditCardId, txn_date: earnDate, amount: amt,
      description: description?.trim() || 'Cashback', txn_type: 'cashback',
    }).select().single();
  if (error) throw error;

  const { data: reward, error: rErr } = await supabase
    .from('fino_cc_rewards').insert({
      credit_card_id: creditCardId, earn_date: earnDate,
      reward_type: 'cashback', raw_amount: amt, inr_value: amt,
      source_txn_id: sourceTxnId,
    }).select().single();
  if (rErr) throw rErr;

  const ledger = await createLedgerEntry({
    txnDate: earnDate, amount: amt,
    debitAccountCode:  ccCode,
    creditAccountCode: CASHBACK_INCOME_CODE,
    description: description || 'Cashback credit',
    sourceModule: 'cc_cashback', sourceId: txn.id, notes,
  });
  await supabase.from('fino_cc_transactions').update({ ledger_txn_group_id: ledger.txn_group_id }).eq('id', txn.id);

  // YTD + outstanding
  const { data: c } = await supabase.from('fino_credit_cards').select('total_cashback_ytd').eq('id', creditCardId).maybeSingle();
  await supabase.from('fino_credit_cards').update({
    total_cashback_ytd: round2(Number(c?.total_cashback_ytd || 0) + amt),
  }).eq('id', creditCardId);
  const newOutstanding = await bumpOutstanding(creditCardId, -amt);
  return { txn, reward, ledger, newOutstanding };
}

async function recordRewardPoints({ creditCardId, earnDate, points, sourceTxnId = null, notes }) {
  const pts = Number(points);
  if (!(pts > 0)) throw new Error('points must be > 0');

  const { data: card, error: cErr } = await supabase.from('fino_credit_cards').select('point_value_inr').eq('id', creditCardId).maybeSingle();
  if (cErr) throw cErr;
  const pv = Number(card?.point_value_inr || 0);
  if (!(pv > 0)) throw new Error('Card has no point_value_inr set; configure card first');

  const inrValue = round2(pts * pv);

  const { data: reward, error } = await supabase
    .from('fino_cc_rewards').insert({
      credit_card_id: creditCardId, earn_date: earnDate,
      reward_type: 'points', raw_amount: pts, inr_value: inrValue,
      source_txn_id: sourceTxnId, notes,
    }).select().single();
  if (error) throw error;

  // Track on the card (no ledger in v1)
  const { data: c } = await supabase.from('fino_credit_cards').select('total_rewards_ytd').eq('id', creditCardId).maybeSingle();
  await supabase.from('fino_credit_cards').update({
    total_rewards_ytd: round2(Number(c?.total_rewards_ytd || 0) + inrValue),
  }).eq('id', creditCardId);

  return { reward, inrValue };
}

async function recordInterestOrFee({ creditCardId, txnDate, amount, type, description, notes }) {
  if (!['interest', 'fee'].includes(type)) throw new Error("type must be 'interest' or 'fee'");
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('amount must be > 0');

  const ccCode = await ccCoaCode(creditCardId);
  const expenseCode = type === 'fee' ? FEE_EXPENSE_CODE : DEFAULT_EXPENSE_CODE;

  const { data: txn, error } = await supabase
    .from('fino_cc_transactions').insert({
      credit_card_id: creditCardId, txn_date: txnDate, amount: amt,
      description: description?.trim() || (type === 'fee' ? 'Annual / late fee' : 'Interest charge'),
      txn_type: type, expense_category_code: expenseCode,
    }).select().single();
  if (error) throw error;

  const ledger = await createLedgerEntry({
    txnDate, amount: amt,
    debitAccountCode:  expenseCode,
    creditAccountCode: ccCode,
    description: description || (type === 'fee' ? 'CC fee' : 'CC interest'),
    sourceModule: type === 'fee' ? 'cc_fee' : 'cc_interest',
    sourceId: txn.id, notes,
  });
  await supabase.from('fino_cc_transactions').update({ ledger_txn_group_id: ledger.txn_group_id }).eq('id', txn.id);
  const newOutstanding = await bumpOutstanding(creditCardId, +amt);
  return { txn, ledger, newOutstanding };
}

async function deleteCcTransaction(id, reason = null) {
  const { data: t, error } = await supabase
    .from('fino_cc_transactions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!t) throw new Error('Transaction not found');
  if (t.is_deleted) throw new Error('Already deleted');

  if (t.ledger_txn_group_id) {
    await reverseLedgerGroup({ txnGroupId: t.ledger_txn_group_id, reason: reason || 'Txn deleted' });
  }
  await supabase.from('fino_cc_transactions').update({ is_deleted: true }).eq('id', id);

  // Reverse outstanding effect
  const sign = (t.txn_type === 'spend' || t.txn_type === 'interest' || t.txn_type === 'fee') ? -1 : +1;
  await bumpOutstanding(t.credit_card_id, sign * Number(t.amount));

  // Cashback rewards row + YTD rollback
  if (t.txn_type === 'cashback') {
    await supabase.from('fino_cc_rewards').update({ is_deleted: true })
      .eq('source_txn_id', id);
    const { data: c } = await supabase.from('fino_credit_cards').select('total_cashback_ytd').eq('id', t.credit_card_id).maybeSingle();
    await supabase.from('fino_credit_cards').update({
      total_cashback_ytd: round2(Math.max(0, Number(c?.total_cashback_ytd || 0) - Number(t.amount))),
    }).eq('id', t.credit_card_id);
  }
  return { success: true };
}

// ─── Payments ────────────────────────────────────────────────────────────────

async function recordPayment({ creditCardId, paymentDate, amount, paidViaBankId, linkedStatementId = null, notes }) {
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('amount must be > 0');
  if (!paidViaBankId) throw new Error('paidViaBankId required');

  const ccCode = await ccCoaCode(creditCardId);
  const bankCode = await bankCoaCode(paidViaBankId);

  const { data: pay, error } = await supabase
    .from('fino_cc_payments').insert({
      credit_card_id: creditCardId,
      payment_date: paymentDate, amount: amt,
      paid_via_bank_id: paidViaBankId,
      linked_statement_id: linkedStatementId,
      notes: notes || null,
    }).select().single();
  if (error) throw error;

  const ledger = await createLedgerEntry({
    txnDate: paymentDate, amount: amt,
    debitAccountCode:  ccCode,
    creditAccountCode: bankCode,
    description: `CC payment`,
    sourceModule: 'cc_payment', sourceId: pay.id,
  });
  await supabase.from('fino_cc_payments').update({ ledger_txn_group_id: ledger.txn_group_id }).eq('id', pay.id);

  await bumpOutstanding(creditCardId, -amt);
  await refreshCurrentBalance(paidViaBankId);

  if (linkedStatementId) await recomputeStatementStatus(linkedStatementId);
  return { payment: pay, ledger };
}

async function deleteCcPayment(id, reason = null) {
  const { data: p, error } = await supabase
    .from('fino_cc_payments').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!p) throw new Error('Payment not found');
  if (p.is_deleted) throw new Error('Already deleted');

  if (p.ledger_txn_group_id) {
    await reverseLedgerGroup({ txnGroupId: p.ledger_txn_group_id, reason: reason || 'Payment deleted' });
  }
  await supabase.from('fino_cc_payments').update({ is_deleted: true }).eq('id', id);
  await bumpOutstanding(p.credit_card_id, +Number(p.amount));
  await refreshCurrentBalance(p.paid_via_bank_id);
  if (p.linked_statement_id) await recomputeStatementStatus(p.linked_statement_id);
  return { success: true };
}

// ─── Statements ──────────────────────────────────────────────────────────────

async function createStatement(payload) {
  const cols = [
    'creditCardId', 'statementPeriod', 'statementDate', 'dueDate',
    'openingBalance', 'totalSpend', 'totalPayment', 'totalCashback', 'totalInterest',
    'totalFees', 'closingBalance', 'minAmountDue', 'totalAmountDue',
    'pdfUrl', 'notes',
  ];
  const map = {
    creditCardId: 'credit_card_id', statementPeriod: 'statement_period',
    statementDate: 'statement_date', dueDate: 'due_date',
    openingBalance: 'opening_balance', totalSpend: 'total_spend',
    totalPayment: 'total_payment', totalCashback: 'total_cashback',
    totalInterest: 'total_interest', totalFees: 'total_fees',
    closingBalance: 'closing_balance', minAmountDue: 'min_amount_due',
    totalAmountDue: 'total_amount_due',
    pdfUrl: 'pdf_url', notes: 'notes',
  };
  const row = {};
  for (const k of cols) if (payload[k] !== undefined) row[map[k]] = payload[k];
  if (!row.credit_card_id || !row.statement_period || !row.statement_date || !row.due_date) {
    throw new Error('creditCardId, statementPeriod, statementDate, dueDate required');
  }
  const { data, error } = await supabase
    .from('fino_cc_statements').insert(row).select().single();
  if (error) throw error;
  return data;
}

async function updateStatement(id, patch) {
  const map = {
    statementPeriod: 'statement_period', statementDate: 'statement_date', dueDate: 'due_date',
    openingBalance: 'opening_balance', totalSpend: 'total_spend',
    totalPayment: 'total_payment', totalCashback: 'total_cashback',
    totalInterest: 'total_interest', totalFees: 'total_fees',
    closingBalance: 'closing_balance', minAmountDue: 'min_amount_due',
    totalAmountDue: 'total_amount_due', pdfUrl: 'pdf_url', notes: 'notes',
  };
  const update = {};
  for (const [k, col] of Object.entries(map)) if (patch[k] !== undefined) update[col] = patch[k];
  if (!Object.keys(update).length) throw new Error('No editable fields supplied');
  const { data, error } = await supabase.from('fino_cc_statements').update(update).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function deleteStatement(id, reason = null) {
  const { data: s, error } = await supabase.from('fino_cc_statements').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!s) throw new Error('Statement not found');
  if (s.is_deleted) throw new Error('Already deleted');
  await supabase.from('fino_cc_statements').update({ is_deleted: true, notes: reason ? `${s.notes || ''} [deleted: ${reason}]`.trim() : s.notes }).eq('id', id);
  // Unlink any payments pointing at it
  await supabase.from('fino_cc_payments').update({ linked_statement_id: null }).eq('linked_statement_id', id);
  return { success: true };
}

async function recomputeStatementStatus(statementId) {
  const { data: s, error } = await supabase.from('fino_cc_statements').select('*').eq('id', statementId).maybeSingle();
  if (error) throw error;
  if (!s) return;
  const { data: pays, error: pErr } = await supabase
    .from('fino_cc_payments').select('amount').eq('linked_statement_id', statementId).eq('is_deleted', false);
  if (pErr) throw pErr;
  const paid = (pays || []).reduce((sum, p) => sum + Number(p.amount), 0);
  const totalDue = Number(s.total_amount_due || 0);
  let status = 'unpaid';
  if (paid + 0.01 >= totalDue && totalDue > 0) status = 'paid';
  else if (paid > 0.01) status = 'partial';
  else if (s.due_date < today() && totalDue > 0) status = 'overdue';

  await supabase.from('fino_cc_statements').update({
    paid_amount: round2(paid),
    payment_status: status,
    paid_at: status === 'paid' ? today() : s.paid_at,
  }).eq('id', statementId);
}

// ─── Card delete (cascade reversal) ──────────────────────────────────────────

async function deleteCreditCard(id, reason = null) {
  const { data: card, error } = await supabase.from('fino_credit_cards').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!card) throw new Error('Card not found');
  if (card.is_deleted) throw new Error('Already deleted');

  // Reverse all linked source-tagged groups
  for (const sm of ['cc_spend', 'cc_refund', 'cc_cashback', 'cc_interest', 'cc_fee', 'cc_payment']) {
    const { data: rows } = await supabase
      .from('fino_ledger_entries')
      .select('source_id')
      .eq('source_module', sm)
      .eq('is_reversed', false);
    const ids = [...new Set((rows || []).map(r => r.source_id))];
    for (const sid of ids) {
      const { data: belongsRow } = await supabase
        .from(sm.startsWith('cc_payment') ? 'fino_cc_payments' : 'fino_cc_transactions')
        .select('credit_card_id').eq('id', sid).maybeSingle();
      if (belongsRow?.credit_card_id === id) {
        try { await reverseBySource({ sourceModule: sm, sourceId: sid, reason: reason || 'Card deleted' }); } catch (_) {}
      }
    }
  }

  // Soft-delete child rows
  await supabase.from('fino_cc_transactions').update({ is_deleted: true }).eq('credit_card_id', id);
  await supabase.from('fino_cc_payments').update({ is_deleted: true }).eq('credit_card_id', id);
  await supabase.from('fino_cc_statements').update({ is_deleted: true }).eq('credit_card_id', id);
  await supabase.from('fino_cc_rewards').update({ is_deleted: true }).eq('credit_card_id', id);

  // Hide COA child + mark card deleted
  if (card.linked_account_id) {
    await supabase.from('fino_chart_of_accounts').update({ is_active: false }).eq('id', card.linked_account_id);
  }
  await supabase.from('fino_credit_cards').update({
    is_deleted: true, status: 'deleted',
    current_outstanding: 0, total_cashback_ytd: 0, total_rewards_ytd: 0,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  // Refresh any banks affected by reversed payments
  const { data: pays } = await supabase
    .from('fino_cc_payments').select('paid_via_bank_id').eq('credit_card_id', id);
  for (const b of [...new Set((pays || []).map(p => p.paid_via_bank_id))]) {
    if (b) try { await refreshCurrentBalance(b); } catch (_) {}
  }
  return { success: true };
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

async function getDashboardSummary() {
  const cards = await listCreditCards({});
  const today_ = today();
  const next7 = new Date(); next7.setDate(next7.getDate() + 7);
  const next7Str = next7.toISOString().slice(0, 10);

  const { data: stmts } = await supabase
    .from('fino_cc_statements')
    .select('*, card:fino_credit_cards(card_label)')
    .eq('is_deleted', false)
    .neq('payment_status', 'paid');

  const due_this_week = [];
  const overdue = [];
  for (const s of (stmts || [])) {
    const item = {
      statement_id: s.id, card_label: s.card?.card_label || 'Unknown',
      due_date: s.due_date, amount: Number(s.total_amount_due || 0) - Number(s.paid_amount || 0),
    };
    if (s.due_date < today_) overdue.push(item);
    else if (s.due_date <= next7Str) due_this_week.push(item);
  }

  return {
    total_active_cards: cards.filter(c => c.status === 'active').length,
    total_credit_limit: round2(cards.reduce((a, c) => a + Number(c.credit_limit || 0), 0)),
    total_outstanding:  round2(cards.reduce((a, c) => a + Number(c.current_outstanding || 0), 0)),
    total_cashback_ytd: round2(cards.reduce((a, c) => a + Number(c.total_cashback_ytd || 0), 0)),
    total_rewards_ytd:  round2(cards.reduce((a, c) => a + Number(c.total_rewards_ytd  || 0), 0)),
    due_this_week, overdue,
  };
}

// ─── Phase 8: Analytics ──────────────────────────────────────────────────────

async function getSpendAnalytics({ cardId, from = null, to = null } = {}) {
  if (!cardId) throw new Error('cardId required');

  let q = supabase
    .from('fino_cc_transactions')
    .select('id, txn_date, amount, description, txn_type, category, is_deleted')
    .eq('credit_card_id', cardId)
    .eq('is_deleted', false);
  if (from) q = q.gte('txn_date', from);
  if (to)   q = q.lte('txn_date', to);
  const { data: txns, error } = await q;
  if (error) throw error;

  const spendOnly = (txns || []).filter(t => t.txn_type === 'spend');

  // Category breakdown
  const catMap = new Map();
  for (const t of spendOnly) {
    const k = t.category || 'Other';
    const cur = catMap.get(k) || { category: k, total: 0, count: 0 };
    cur.total += Number(t.amount); cur.count += 1;
    catMap.set(k, cur);
  }
  const totalSpend = round2(spendOnly.reduce((a, t) => a + Number(t.amount), 0));
  const categoryBreakdown = [...catMap.values()]
    .map(c => ({ ...c, total: round2(c.total), pct: totalSpend > 0 ? Math.round(c.total / totalSpend * 1000) / 10 : 0 }))
    .sort((a, b) => b.total - a.total);

  // Monthly trend (across all txn types)
  const mMap = new Map();
  for (const t of (txns || [])) {
    const month = String(t.txn_date).slice(0, 7);
    const cur = mMap.get(month) || { month, total_spend: 0, total_cashback: 0, total_payment: 0, total_other: 0 };
    if (t.txn_type === 'spend')         cur.total_spend    += Number(t.amount);
    else if (t.txn_type === 'cashback') cur.total_cashback += Number(t.amount);
    else if (t.txn_type === 'refund')   cur.total_cashback += Number(t.amount);
    else                                cur.total_other    += Number(t.amount);
    mMap.set(month, cur);
  }
  // Add payments (from cc_payments table) as separate metric
  let paysQ = supabase.from('fino_cc_payments').select('payment_date, amount').eq('credit_card_id', cardId).eq('is_deleted', false);
  if (from) paysQ = paysQ.gte('payment_date', from);
  if (to)   paysQ = paysQ.lte('payment_date', to);
  const { data: pays } = await paysQ;
  for (const p of (pays || [])) {
    const month = String(p.payment_date).slice(0, 7);
    const cur = mMap.get(month) || { month, total_spend: 0, total_cashback: 0, total_payment: 0, total_other: 0 };
    cur.total_payment += Number(p.amount);
    mMap.set(month, cur);
  }
  const monthlyTrend = [...mMap.values()]
    .map(m => ({
      ...m,
      total_spend:    round2(m.total_spend),
      total_cashback: round2(m.total_cashback),
      total_payment:  round2(m.total_payment),
      total_other:    round2(m.total_other),
      net:            round2(m.total_spend - m.total_cashback - m.total_payment),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Top merchants (group by description, spend only)
  const merchMap = new Map();
  for (const t of spendOnly) {
    const k = (t.description || 'Unknown').trim() || 'Unknown';
    const cur = merchMap.get(k) || { description: k, total: 0, count: 0 };
    cur.total += Number(t.amount); cur.count += 1;
    merchMap.set(k, cur);
  }
  const topMerchants = [...merchMap.values()]
    .map(m => ({ ...m, total: round2(m.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const months = monthlyTrend.map(m => m.total_spend);
  const summary = {
    total_spend: totalSpend,
    avg_monthly: months.length ? round2(months.reduce((a, x) => a + x, 0) / months.length) : 0,
    highest_month: months.length ? round2(Math.max(...months)) : 0,
    lowest_month:  months.length ? round2(Math.min(...months)) : 0,
    txn_count: spendOnly.length,
  };

  return { summary, categoryBreakdown, monthlyTrend, topMerchants };
}

// ─── Phase 8: Statement Reconciliation ───────────────────────────────────────

async function reconcileTransaction(txnId, statementId) {
  if (!txnId || !statementId) throw new Error('txnId + statementId required');
  const [txnR, stmtR] = await Promise.all([
    supabase.from('fino_cc_transactions').select('*').eq('id', txnId).maybeSingle(),
    supabase.from('fino_cc_statements').select('*').eq('id', statementId).maybeSingle(),
  ]);
  if (txnR.error)  throw txnR.error;
  if (stmtR.error) throw stmtR.error;
  if (!txnR.data)  throw new Error('Transaction not found');
  if (!stmtR.data) throw new Error('Statement not found');
  if (txnR.data.is_deleted)  throw new Error('Transaction is deleted');
  if (stmtR.data.is_deleted) throw new Error('Statement is deleted');
  if (txnR.data.credit_card_id !== stmtR.data.credit_card_id) {
    throw new Error('Transaction and statement belong to different cards');
  }

  // Validate txn date falls inside statement period (loose check via statement_date and prior month)
  // Use the statement_period field if present (e.g. "2026-04"); otherwise allow.
  const period = stmtR.data.statement_period;
  if (period && /^\d{4}-\d{2}$/.test(period)) {
    const txnMonth = String(txnR.data.txn_date).slice(0, 7);
    if (txnMonth !== period) {
      // Allow but warn — the spec wants reject if outside period
      throw new Error(`Txn date ${txnR.data.txn_date} is outside statement period ${period}`);
    }
  }

  const { data, error } = await supabase
    .from('fino_cc_transactions').update({
      is_reconciled: true,
      reconciled_statement_id: statementId,
      reconciled_at: new Date().toISOString(),
    }).eq('id', txnId).select().single();
  if (error) throw error;
  return data;
}

async function unreconcileTransaction(txnId) {
  const { data, error } = await supabase
    .from('fino_cc_transactions').update({
      is_reconciled: false,
      reconciled_statement_id: null,
      reconciled_at: null,
    }).eq('id', txnId).select().single();
  if (error) throw error;
  return data;
}

async function getReconciliationStatus(statementId) {
  const { data: stmt, error } = await supabase
    .from('fino_cc_statements').select('*').eq('id', statementId).maybeSingle();
  if (error) throw error;
  if (!stmt) throw new Error('Statement not found');

  // All non-deleted txns for the same card. Filter to statement period if available.
  let q = supabase
    .from('fino_cc_transactions')
    .select('*')
    .eq('credit_card_id', stmt.credit_card_id)
    .eq('is_deleted', false)
    .order('txn_date', { ascending: true });
  if (stmt.statement_period && /^\d{4}-\d{2}$/.test(stmt.statement_period)) {
    const monthStart = `${stmt.statement_period}-01`;
    const [y, m] = stmt.statement_period.split('-').map(Number);
    const nextMonth = new Date(y, m, 1);
    const monthEnd = nextMonth.toISOString().slice(0, 10);
    q = q.gte('txn_date', monthStart).lt('txn_date', monthEnd);
  }
  const { data: txns, error: tErr } = await q;
  if (tErr) throw tErr;

  const matched   = (txns || []).filter(t => t.is_reconciled && t.reconciled_statement_id === statementId);
  const unmatched = (txns || []).filter(t => !t.is_reconciled || t.reconciled_statement_id !== statementId);

  // Statement net charge (signed: spends/interest/fees +, refunds/cashback -)
  const txnNet = (t) => {
    if (['spend', 'interest', 'fee'].includes(t.txn_type)) return  Number(t.amount);
    if (['refund', 'cashback'].includes(t.txn_type))       return -Number(t.amount);
    return 0;
  };
  const matchedTotal = round2(matched.reduce((a, t) => a + txnNet(t), 0));
  const stmtTotal = round2(Number(stmt.closing_balance || 0) - Number(stmt.opening_balance || 0) + Number(stmt.total_payment || 0));

  return {
    statement: stmt,
    matched,
    unmatched,
    matched_total: matchedTotal,
    statement_total: stmtTotal,
    difference: round2(stmtTotal - matchedTotal),
  };
}

async function updateTxnCategory(txnId, category) {
  const { data, error } = await supabase
    .from('fino_cc_transactions')
    .update({ category: category || null })
    .eq('id', txnId).select().single();
  if (error) throw error;
  return data;
}

module.exports = {
  createCreditCard, listCreditCards, getCreditCard, updateCardMeta, deleteCreditCard,
  recordSpend, recordRefund, recordCashback, recordRewardPoints, recordInterestOrFee, deleteCcTransaction,
  recordPayment, deleteCcPayment,
  createStatement, updateStatement, deleteStatement, recomputeStatementStatus,
  getDashboardSummary,
  // Phase 8
  getSpendAnalytics,
  reconcileTransaction, unreconcileTransaction, getReconciliationStatus,
  updateTxnCategory,
};
