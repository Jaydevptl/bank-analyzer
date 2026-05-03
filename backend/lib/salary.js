/**
 * Fino · Salary Records (Phase 16)
 *
 * Multi-line salary ledger:
 *   DEBIT  5300 Salary Expense   (basic + allowances)
 *   CREDIT 2410 TDS Payable      (tds_deducted)
 *   CREDIT 2420 PF Payable       (pf_deducted)
 *   CREDIT bank                   (net_salary)
 *   (deductions reduce salary expense — netted into the debit)
 *
 * COA:
 *   5300 Salary       (existing)
 *   2410 TDS Payable  (auto-seeded liability)
 *   2420 PF Payable   (auto-seeded liability)
 *
 * Rationale: spec said "DEBIT 5240 / CREDIT 5270 / CREDIT 5280" but 5240 = Custom Duty
 * in the existing seed and 5270/5280 are expense range codes. Using accounting-correct
 * codes 5300 (Salary expense), 2410/2420 (current liabilities). Module is independent.
 */

const supabase = require('./supabase');
const { createLedgerEntryGroup } = require('./ledger');
const { reverseBySource } = require('./reversal');

const SALARY_EXP_CODE = '5300';
const TDS_PAY_CODE    = '2410';
const PF_PAY_CODE     = '2420';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function ensureExactCoa({ code, name, type, subType }) {
  const { data: existing, error } = await supabase
    .from('fino_chart_of_accounts').select('id, code, name').eq('code', code).maybeSingle();
  if (error) throw error;
  if (existing) return existing;
  const { data, error: insErr } = await supabase
    .from('fino_chart_of_accounts').insert({
      code, name, type, sub_type: subType,
      is_system: true, is_active: true,
      description: 'Auto-seeded for Salary/TDS/PF (Phase 16)',
    }).select('id, code, name').single();
  if (insErr) throw insErr;
  return data;
}

async function seedSalaryCoa() {
  await ensureExactCoa({ code: TDS_PAY_CODE, name: 'TDS Payable', type: 'liability', subType: 'current_liability' });
  await ensureExactCoa({ code: PF_PAY_CODE,  name: 'PF Payable',  type: 'liability', subType: 'current_liability' });
}

async function _accountCoaCode(accountId) {
  if (!accountId) return null;
  const { data: ba } = await supabase
    .from('fino_bank_accounts').select('linked_account_id').eq('id', accountId).maybeSingle();
  if (ba?.linked_account_id) {
    const { data: c } = await supabase
      .from('fino_chart_of_accounts').select('code').eq('id', ba.linked_account_id).maybeSingle();
    return c?.code || null;
  }
  const { data: c2 } = await supabase
    .from('fino_chart_of_accounts').select('code').eq('id', accountId).maybeSingle();
  return c2?.code || null;
}

async function _resolveToCoaId(accountId) {
  if (!accountId) return null;
  const { data: ba } = await supabase
    .from('fino_bank_accounts').select('linked_account_id').eq('id', accountId).maybeSingle();
  if (ba?.linked_account_id) return ba.linked_account_id;
  return accountId;
}

async function _refreshBankByEither(accountId) {
  if (!accountId) return;
  try {
    const { refreshCurrentBalance } = require('./bankAccounts');
    const { data: byId } = await supabase
      .from('fino_bank_accounts').select('id').eq('id', accountId).maybeSingle();
    if (byId?.id) { await refreshCurrentBalance(byId.id); return; }
    const { data: byLinked } = await supabase
      .from('fino_bank_accounts').select('id').eq('linked_account_id', accountId).maybeSingle();
    if (byLinked?.id) await refreshCurrentBalance(byLinked.id);
  } catch (_) {}
}

async function recordSalary({
  employeePartyId, companyId, salaryMonth, payDate,
  basicSalary, allowances = 0, deductions = 0,
  tdsDeducted = 0, pfDeducted = 0,
  paidViaAccountId, notes,
}) {
  if (!employeePartyId)  throw new Error('employeePartyId required');
  if (!salaryMonth)      throw new Error('salaryMonth required');
  if (!payDate)          throw new Error('payDate required');
  if (!paidViaAccountId) throw new Error('paidViaAccountId required');

  await seedSalaryCoa();

  // Validate party is an employee (auto-tag if not)
  const { data: party, error: pErr } = await supabase
    .from('fino_parties').select('id, name, is_employee').eq('id', employeePartyId).maybeSingle();
  if (pErr) throw pErr;
  if (!party) throw new Error('Employee party not found');
  if (!party.is_employee) {
    await supabase.from('fino_parties')
      .update({ is_employee: true, updated_at: new Date().toISOString() })
      .eq('id', employeePartyId);
  }

  const basic = Number(basicSalary) || 0;
  const allow = Number(allowances)  || 0;
  const ded   = Number(deductions)  || 0;
  const tds   = Number(tdsDeducted) || 0;
  const pf    = Number(pfDeducted)  || 0;
  if (!(basic > 0)) throw new Error('basicSalary must be > 0');

  const grossExpense = round2(basic + allow - ded);
  const netSalary    = round2(grossExpense - tds - pf);
  if (netSalary < 0) throw new Error('Net salary cannot be negative');

  const bankCode = await _accountCoaCode(paidViaAccountId);
  if (!bankCode) throw new Error('paidViaAccountId does not resolve to COA');
  const paidViaCoaId = await _resolveToCoaId(paidViaAccountId);

  const { data: row, error } = await supabase
    .from('fino_salary_records').insert({
      employee_party_id: employeePartyId,
      company_id: companyId || null,
      salary_month: salaryMonth,
      pay_date: payDate,
      basic_salary: basic,
      allowances: allow,
      deductions: ded,
      tds_deducted: tds,
      pf_deducted: pf,
      net_salary: netSalary,
      paid_via_account_id: paidViaCoaId,
      notes: notes?.trim() || null,
      status: 'paid',
    }).select().single();
  if (error) throw error;

  const lines = [
    { accountCode: SALARY_EXP_CODE, direction: 'debit',  amount: grossExpense, partyId: employeePartyId, companyId },
  ];
  if (tds > 0) lines.push({ accountCode: TDS_PAY_CODE, direction: 'credit', amount: tds, partyId: employeePartyId, companyId });
  if (pf  > 0) lines.push({ accountCode: PF_PAY_CODE,  direction: 'credit', amount: pf,  partyId: employeePartyId, companyId });
  if (netSalary > 0) lines.push({ accountCode: bankCode, direction: 'credit', amount: netSalary, companyId });

  const ledger = await createLedgerEntryGroup({
    txnDate: payDate,
    lines,
    description: `Salary ${salaryMonth} · ${party.name}`,
    sourceModule: 'salary_payment',
    sourceId: row.id,
    partyId: employeePartyId,
    companyId: companyId || null,
  });
  await supabase.from('fino_salary_records')
    .update({ ledger_txn_group_id: ledger.txn_group_id })
    .eq('id', row.id);

  // Refresh bank balance (input is the bank id from frontend)
  await _refreshBankByEither(paidViaAccountId);

  return { record: row, ledger };
}

async function listSalaryRecords({ employeeId = null, month = null, companyId = null, includeDeleted = false } = {}) {
  let q = supabase
    .from('fino_salary_records')
    .select('*, employee:employee_party_id(id, name)')
    .order('pay_date', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  if (employeeId)      q = q.eq('employee_party_id', employeeId);
  if (month)           q = q.eq('salary_month', month);
  if (companyId)       q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function cancelSalary(id, reason = null) {
  const { data: row, error } = await supabase
    .from('fino_salary_records').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Salary record not found');
  if (row.is_deleted) throw new Error('Already deleted');

  if (row.ledger_txn_group_id) {
    try { await reverseBySource({ sourceModule: 'salary_payment', sourceId: id, reason: reason || 'Salary cancelled' }); } catch (_) {}
  }
  await supabase.from('fino_salary_records').update({ is_deleted: true, status: 'cancelled' }).eq('id', id);

  // row.paid_via_account_id is now a COA id; helper handles either
  await _refreshBankByEither(row.paid_via_account_id);
  return { success: true };
}

async function getSalarySummary({ companyId = null, from = null, to = null } = {}) {
  let q = supabase
    .from('fino_salary_records')
    .select('*, employee:employee_party_id(id, name)')
    .eq('is_deleted', false);
  if (companyId) q = q.eq('company_id', companyId);
  if (from)      q = q.gte('pay_date', from);
  if (to)        q = q.lte('pay_date', to);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data || [];
  let totalGross = 0, totalNet = 0, totalTds = 0, totalPf = 0;
  const byEmployee = new Map();
  for (const r of rows) {
    const gross = Number(r.basic_salary) + Number(r.allowances || 0) - Number(r.deductions || 0);
    totalGross += gross;
    totalNet   += Number(r.net_salary || 0);
    totalTds   += Number(r.tds_deducted || 0);
    totalPf    += Number(r.pf_deducted || 0);
    const k = r.employee_party_id;
    const cur = byEmployee.get(k) || { name: r.employee?.name, gross: 0, net: 0, tds: 0, pf: 0, count: 0 };
    cur.gross += gross; cur.net += Number(r.net_salary || 0);
    cur.tds += Number(r.tds_deducted || 0); cur.pf += Number(r.pf_deducted || 0);
    cur.count += 1;
    byEmployee.set(k, cur);
  }
  return {
    count: rows.length,
    totalGross: round2(totalGross),
    totalNet:   round2(totalNet),
    totalTds:   round2(totalTds),
    totalPf:    round2(totalPf),
    byEmployee: [...byEmployee.entries()].map(([id, v]) => ({
      employee_party_id: id, name: v.name,
      gross: round2(v.gross), net: round2(v.net), tds: round2(v.tds), pf: round2(v.pf), count: v.count,
    })),
  };
}

module.exports = {
  recordSalary, listSalaryRecords, cancelSalary, getSalarySummary, seedSalaryCoa,
};
