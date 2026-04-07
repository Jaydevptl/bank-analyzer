/**
 * Broker Normalizer Service
 * Converts raw broker rows into standard Trade format.
 */

const { parse: parseDate, isValid } = require('date-fns');

const DATE_FORMATS = [
  'yyyy-MM-dd',
  'dd-MM-yyyy',
  'dd/MM/yyyy',
  'dd MMM yyyy',
  'dd-MMM-yyyy',
  'MM/dd/yyyy',
  'MM/dd/yyyy HH:mm:ss',
  'dd/MM/yyyy HH:mm:ss',
  'yyyy-MM-dd HH:mm:ss',
  'dd-MM-yyyy HH:mm:ss',
];

function parseFlexibleDate(str) {
  if (!str) return null;
  const cleaned = String(str).trim().replace(/\s+/g, ' ');
  const refDate = new Date();

  for (const fmt of DATE_FORMATS) {
    try {
      const parsed = parseDate(cleaned, fmt, refDate);
      if (isValid(parsed) && parsed.getFullYear() > 2000) return parsed;
    } catch {}
  }

  const native = new Date(cleaned);
  if (isValid(native) && native.getFullYear() > 2000) return native;

  return null;
}

function parseNum(val) {
  if (val === null || val === undefined || val === '' || val === '-') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[₹$,\s]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function findCol(row, colName) {
  if (!colName) return undefined;
  if (row[colName] !== undefined) return row[colName];
  const lower = colName.toLowerCase().trim();
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().trim() === lower) return row[key];
  }
  return undefined;
}

/**
 * Calculate estimated charges for Indian equity trades.
 */
function calculateCharges({ amount, type, segment, broker }) {
  const isEquity = (segment || '').toLowerCase().includes('eq') || segment === 'Equity' || !segment;
  const isFnO = (segment || '').toLowerCase().includes('fno') || (segment || '').toLowerCase().includes('f&o');

  let brokerage = 0;
  let stt = 0;
  let stampDuty = 0;
  let sebiCharges = 0;
  let exchangeCharges = 0;

  if (isEquity) {
    // Delivery: 0.03% capped at 20, or zero for Zerodha
    brokerage = (broker === 'Zerodha') ? 0 : Math.min(20, amount * 0.0003);
    // STT: 0.1% on both sides for delivery
    stt = amount * 0.001;
    // Stamp duty: 0.015% on buy only
    if (type === 'BUY') stampDuty = amount * 0.00015;
    // SEBI: ₹10 per crore
    sebiCharges = amount * 0.000001;
    // Exchange transaction: ~0.00322% NSE
    exchangeCharges = amount * 0.0000322;
  } else if (isFnO) {
    // Flat ₹20 per order for futures/options
    brokerage = 20;
    // STT: 0.0125% on sell side for futures, 0.0625% for options
    if (type === 'SELL') stt = amount * 0.000125;
    sebiCharges = amount * 0.000001;
    exchangeCharges = amount * 0.0000019;
  }

  const gst = (brokerage + sebiCharges + exchangeCharges) * 0.18;

  return {
    brokerage: +brokerage.toFixed(2),
    stt: +stt.toFixed(2),
    stampDuty: +stampDuty.toFixed(2),
    sebiCharges: +sebiCharges.toFixed(4),
    exchangeCharges: +exchangeCharges.toFixed(4),
    gst: +gst.toFixed(2),
  };
}

function normalizeType(rawType) {
  if (!rawType) return null;
  const t = String(rawType).toUpperCase().trim();
  if (t === 'B' || t === 'BUY' || t.includes('BUY')) return 'BUY';
  if (t === 'S' || t === 'SELL' || t.includes('SELL')) return 'SELL';
  return null;
}

function normalizeSegment(rawSegment) {
  if (!rawSegment) return 'Equity';
  const s = String(rawSegment).toLowerCase().trim();
  if (s.includes('fno') || s.includes('f&o') || s.includes('futures') || s.includes('options')) return 'F&O';
  if (s.includes('comm') || s.includes('mcx')) return 'Commodity';
  if (s.includes('curr') || s.includes('cds')) return 'Currency';
  if (s.includes('mf') || s.includes('mutual')) return 'MF';
  if (s.includes('eq') || s === 'cm') return 'Equity';
  return 'Equity';
}

function normalizeWithMap(row, brokerKey, columnMap) {
  if (!columnMap) return null;

  // P&L Report format: each row contains BOTH buy and sell - generate 2 trades
  if (brokerKey === 'PNL_REPORT') {
    const symbol = String(findCol(row, columnMap.shortName) || findCol(row, columnMap.symbol) || '').trim();
    if (!symbol) return null;

    const qty = parseNum(findCol(row, columnMap.qty));
    const buyRate = parseNum(findCol(row, columnMap.buyrate));
    const sellRate = parseNum(findCol(row, columnMap.sellrate));
    const buyDate = parseFlexibleDate(findCol(row, columnMap.buyDate));
    const sellDate = parseFlexibleDate(findCol(row, columnMap.sellDate));
    const sellStt = parseNum(findCol(row, columnMap.sellStt));
    const purStt = parseNum(findCol(row, columnMap.purStt));

    if (!qty || !buyDate || !sellDate || !buyRate || !sellRate) return null;

    const trades = [];

    // Buy trade
    const buyAmount = qty * buyRate;
    const buyCharges = calculateCharges({ amount: buyAmount, type: 'BUY', segment: 'Equity', broker: null });
    if (purStt > 0) buyCharges.stt = purStt;
    const buyTotal = buyCharges.brokerage + buyCharges.stt + buyCharges.stampDuty + buyCharges.sebiCharges + buyCharges.exchangeCharges + buyCharges.gst;
    trades.push({
      tradeDate: buyDate,
      symbol,
      isin: '',
      type: 'BUY',
      quantity: qty,
      price: +buyRate.toFixed(2),
      amount: +buyAmount.toFixed(2),
      ...buyCharges,
      totalCharges: +buyTotal.toFixed(2),
      netAmount: +(buyAmount + buyTotal).toFixed(2),
      exchange: '',
      segment: 'Equity',
    });

    // Sell trade
    const sellAmount = qty * sellRate;
    const sellCharges = calculateCharges({ amount: sellAmount, type: 'SELL', segment: 'Equity', broker: null });
    if (sellStt > 0) sellCharges.stt = sellStt;
    const sellTotal = sellCharges.brokerage + sellCharges.stt + sellCharges.stampDuty + sellCharges.sebiCharges + sellCharges.exchangeCharges + sellCharges.gst;
    trades.push({
      tradeDate: sellDate,
      symbol,
      isin: '',
      type: 'SELL',
      quantity: qty,
      price: +sellRate.toFixed(2),
      amount: +sellAmount.toFixed(2),
      ...sellCharges,
      totalCharges: +sellTotal.toFixed(2),
      netAmount: +(sellAmount - sellTotal).toFixed(2),
      exchange: '',
      segment: 'Equity',
    });

    return trades;
  }

  const dateStr = findCol(row, columnMap.tradeDate);
  const tradeDate = parseFlexibleDate(dateStr);
  if (!tradeDate) return null;

  const symbol = String(findCol(row, columnMap.symbol) || '').trim();
  if (!symbol) return null;

  // 5Paisa has buy/sell as separate columns
  if (brokerKey === '5PAISA') {
    const buyQty = parseNum(findCol(row, columnMap.buyQty));
    const buyRate = parseNum(findCol(row, columnMap.buyRate));
    const sellQty = parseNum(findCol(row, columnMap.sellQty));
    const sellRate = parseNum(findCol(row, columnMap.sellRate));
    const exchange = String(findCol(row, columnMap.exchange) || '').trim();

    const trades = [];
    if (buyQty > 0) {
      const amount = buyQty * buyRate;
      const charges = calculateCharges({ amount, type: 'BUY', segment: 'Equity', broker: '5Paisa' });
      const totalCharges = charges.brokerage + charges.stt + charges.stampDuty + charges.sebiCharges + charges.exchangeCharges + charges.gst;
      trades.push({
        tradeDate, symbol, type: 'BUY', quantity: buyQty, price: buyRate, amount,
        ...charges, totalCharges: +totalCharges.toFixed(2),
        netAmount: amount + totalCharges, exchange, segment: 'Equity',
      });
    }
    if (sellQty > 0) {
      const amount = sellQty * sellRate;
      const charges = calculateCharges({ amount, type: 'SELL', segment: 'Equity', broker: '5Paisa' });
      const totalCharges = charges.brokerage + charges.stt + charges.stampDuty + charges.sebiCharges + charges.exchangeCharges + charges.gst;
      trades.push({
        tradeDate, symbol, type: 'SELL', quantity: sellQty, price: sellRate, amount,
        ...charges, totalCharges: +totalCharges.toFixed(2),
        netAmount: amount - totalCharges, exchange, segment: 'Equity',
      });
    }
    return trades;
  }

  const type = normalizeType(findCol(row, columnMap.type));
  if (!type) return null;

  const quantity = parseNum(findCol(row, columnMap.quantity));
  const price = parseNum(findCol(row, columnMap.price));
  if (quantity === 0 || price === 0) return null;

  const amountFromCol = parseNum(findCol(row, columnMap.amount));
  const amount = amountFromCol > 0 ? amountFromCol : quantity * price;

  const isin = String(findCol(row, columnMap.isin) || '').trim();
  const exchange = String(findCol(row, columnMap.exchange) || '').trim();
  const segment = normalizeSegment(findCol(row, columnMap.segment));

  // Brokerage from file if available
  const brokerageFromFile = parseNum(findCol(row, columnMap.brokerage));
  let charges;
  if (brokerageFromFile > 0) {
    charges = {
      brokerage: brokerageFromFile,
      stt: amount * (segment === 'F&O' && type === 'SELL' ? 0.000125 : type === 'SELL' ? 0.001 : 0),
      stampDuty: type === 'BUY' ? amount * 0.00015 : 0,
      sebiCharges: amount * 0.000001,
      exchangeCharges: amount * 0.0000322,
      gst: brokerageFromFile * 0.18,
    };
  } else {
    charges = calculateCharges({ amount, type, segment, broker: brokerKey === 'ZERODHA' ? 'Zerodha' : null });
  }

  const totalCharges = charges.brokerage + charges.stt + charges.stampDuty + charges.sebiCharges + charges.exchangeCharges + charges.gst;
  const netAmount = type === 'BUY' ? amount + totalCharges : amount - totalCharges;

  return {
    tradeDate,
    symbol,
    isin,
    type,
    quantity,
    price,
    amount: +amount.toFixed(2),
    brokerage: +charges.brokerage.toFixed(2),
    stt: +charges.stt.toFixed(2),
    gst: +charges.gst.toFixed(2),
    sebiCharges: +charges.sebiCharges.toFixed(4),
    stampDuty: +charges.stampDuty.toFixed(2),
    exchangeCharges: +charges.exchangeCharges.toFixed(4),
    otherCharges: 0,
    totalCharges: +totalCharges.toFixed(2),
    netAmount: +netAmount.toFixed(2),
    exchange,
    segment,
  };
}

/**
 * Generic fallback - try common column names
 */
function normalizeGeneric(row) {
  const find = (...names) => {
    for (const n of names) {
      const found = Object.keys(row).find(k => k.toLowerCase().trim() === n.toLowerCase());
      if (found && row[found] !== undefined) return row[found];
    }
    return undefined;
  };

  const dateStr = find('trade date', 'date', 'tradedate', 'trade_date');
  const tradeDate = parseFlexibleDate(dateStr);
  if (!tradeDate) return null;

  const symbol = String(find('symbol', 'tradingsymbol', 'scrip name', 'instrument name', 'symbol name') || '').trim();
  if (!symbol) return null;

  const type = normalizeType(find('type', 'trade_type', 'buy/sell', 'action', 'side'));
  if (!type) return null;

  const quantity = parseNum(find('quantity', 'qty', 'net qty'));
  const price = parseNum(find('price', 'rate', 'trade price', 'trade rate'));
  if (quantity === 0 || price === 0) return null;

  const amount = quantity * price;
  const charges = calculateCharges({ amount, type, segment: 'Equity', broker: null });
  const totalCharges = charges.brokerage + charges.stt + charges.stampDuty + charges.sebiCharges + charges.exchangeCharges + charges.gst;
  const netAmount = type === 'BUY' ? amount + totalCharges : amount - totalCharges;

  return {
    tradeDate,
    symbol,
    isin: '',
    type,
    quantity,
    price,
    amount: +amount.toFixed(2),
    ...charges,
    totalCharges: +totalCharges.toFixed(2),
    netAmount: +netAmount.toFixed(2),
    exchange: String(find('exchange') || ''),
    segment: 'Equity',
  };
}

function normalizeTradeRow(row, brokerKey, columnMap) {
  if (columnMap) {
    return normalizeWithMap(row, brokerKey, columnMap);
  }
  return normalizeGeneric(row);
}

module.exports = { normalizeTradeRow, parseFlexibleDate, parseNum, calculateCharges };
