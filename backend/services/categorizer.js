/**
 * Categorizer Service
 * Auto-categorizes transactions based on description keywords.
 * Rules are ordered by priority (first match wins).
 */

const CATEGORY_RULES = [
  // ── Salary / Payroll ────────────────────────────────────────────────────────
  {
    category: 'Salary',
    keywords: ['salary', 'payroll', 'sal cr', 'sal/cr', 'sal-', 'wages', 'stipend'],
  },

  // ── Amazon / E-commerce ─────────────────────────────────────────────────────
  {
    category: 'Amazon / E-commerce',
    keywords: [
      'amazon', 'amazon seller', 'amazon services', 'flipkart', 'meesho',
      'myntra', 'snapdeal', 'shopify', 'hsbc/amazon', 'amazonseller',
    ],
  },

  // ── Advertising ─────────────────────────────────────────────────────────────
  {
    category: 'Advertising',
    keywords: ['google ads', 'facebook ads', 'meta ads', 'advertising', 'ads payment', 'sponsored'],
  },

  // ── Supplier / Vendor ────────────────────────────────────────────────────────
  {
    category: 'Supplier Payment',
    keywords: [
      'jayesh enterprises', 'arihant', 'golden aura', 'supplier', 'vendor',
      'purchase', 'procurement', 'raw material', 'wholesale',
    ],
  },

  // ── Logistics ────────────────────────────────────────────────────────────────
  {
    category: 'Logistics',
    keywords: ['courier', 'shipping', 'logistics', 'delhivery', 'bluedart', 'dtdc',
      'ecom express', 'xpressbees', 'shadowfax', 'fedex', 'ups', 'transport'],
  },

  // ── Utilities ────────────────────────────────────────────────────────────────
  {
    category: 'Utilities',
    keywords: ['msedcl', 'electricity', 'gas', 'water', 'broadband', 'internet',
      'airtel', 'jio', 'vodafone', 'vi/', 'bsnl', 'tata sky', 'dish tv',
      'mahanagar', 'bescom', 'tneb'],
  },

  // ── Fixed Deposit ─────────────────────────────────────────────────────────────
  {
    category: 'Fixed Deposit',
    keywords: ['fd a/c', 'fixed deposit', 'sweep trf', 'repayment credit', 'fd cr',
      'debit for fd', 'trf from:', 'trf to fd'],
  },

  // ── Tax / GST ─────────────────────────────────────────────────────────────────
  {
    category: 'Tax / GST',
    keywords: ['gst', 'income tax', 'tds', 'tcs', 'cbdt', 'nsdl', 'epf', 'esic',
      'maharashtra informati', 'mca', 'roc'],
  },

  // ── Loan ──────────────────────────────────────────────────────────────────────
  {
    category: 'Loan',
    keywords: ['emi', 'loan', 'home loan', 'car loan', 'personal loan', 'installment',
      'bajaj finance', 'hdfc bank emi', 'tata capital'],
  },

  // ── Rent ──────────────────────────────────────────────────────────────────────
  {
    category: 'Rent',
    keywords: ['rent', 'lease', 'rental', 'landlord'],
  },

  // ── Bank Charges ──────────────────────────────────────────────────────────────
  {
    category: 'Bank Charges',
    keywords: ['bank charges', 'service charge', 'annual fee', 'maintenance charge',
      'sms charges', 'processing fee', 'penalty'],
  },

  // ── Interest ──────────────────────────────────────────────────────────────────
  {
    category: 'Interest',
    keywords: ['int.pd', 'interest paid', 'interest credit', 'interest earned', 'int cr',
      'internal ac for int', 'deut0797bgl'],
  },

  // ── UPI Payments ─────────────────────────────────────────────────────────────
  {
    category: 'UPI Payment',
    keywords: ['upi/p2a', 'upi/p2m', 'upi/', 'bhim', 'gpay', 'phonepe', 'paytm', 'cred'],
  },

  // ── Transfer ──────────────────────────────────────────────────────────────────
  {
    category: 'Transfer',
    keywords: ['neft', 'rtgs', 'imps', 'transfer', 'trf', 'p2a', 'p2m', 'indb', 'internal'],
  },

  // ── Personal ─────────────────────────────────────────────────────────────────
  {
    category: 'Personal',
    keywords: ['sudeep tripathi', 'self', 'personal', 'withdraw', 'atm'],
  },
];

/**
 * Categorizes a transaction description.
 * @param {string} description
 * @returns {string} Category name
 */
function categorize(description) {
  if (!description) return 'Uncategorized';

  const lower = description.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return rule.category;
    }
  }

  return 'Uncategorized';
}

module.exports = { categorize };
