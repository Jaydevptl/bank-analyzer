/**
 * Transaction constants (schema lives in Supabase)
 */

const CATEGORIES = [
  'Salary',
  'Amazon / E-commerce',
  'Supplier Payment',
  'Logistics',
  'Utilities',
  'Advertising',
  'Transfer',
  'Fixed Deposit',
  'Personal',
  'UPI Payment',
  'Bank Charges',
  'Interest',
  'Tax / GST',
  'Rent',
  'Loan',
  'Uncategorized',
];

const STATUSES = ['pending', 'verified', 'duplicate', 'backup'];

module.exports = { CATEGORIES, STATUSES };
