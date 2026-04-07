/**
 * Trade constants (schema lives in Supabase)
 */

const SEGMENTS = ['Equity', 'F&O', 'Commodity', 'Currency', 'MF', 'Unknown'];
const TRADE_TYPES = ['BUY', 'SELL'];

const BROKERS = [
  'Zerodha',
  'Groww',
  'Upstox',
  'Angel One',
  '5Paisa',
  'ICICI Direct',
  'Unknown',
];

module.exports = { SEGMENTS, TRADE_TYPES, BROKERS };
