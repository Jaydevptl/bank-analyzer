/**
 * Broker Detector Service
 * Identifies the broker from raw file content.
 * Returns broker key, name, columnMap, and amountType.
 */

const BROKER_SIGNATURES = [
  {
    key: 'ZERODHA',
    name: 'Zerodha',
    markers: ['Kite', 'zerodha', 'trade_date,tradingsymbol', 'tradingsymbol,exchange,segment,trade_type'],
    columnMap: {
      tradeDate: 'trade_date',
      symbol: 'tradingsymbol',
      type: 'trade_type',
      quantity: 'quantity',
      price: 'price',
      exchange: 'exchange',
      segment: 'segment',
      orderId: 'order_id',
      isin: 'isin',
    },
  },
  {
    key: 'GROWW',
    name: 'Groww',
    markers: ['Groww', 'groww.in', 'Trade Date,Exchange,Segment,Symbol', 'Trade Date,Symbol,ISIN'],
    columnMap: {
      tradeDate: 'Trade Date',
      symbol: 'Symbol',
      isin: 'ISIN',
      type: 'Trade Type',
      quantity: 'Quantity',
      price: 'Price',
      amount: 'Amount',
      exchange: 'Exchange',
      segment: 'Segment',
    },
  },
  {
    key: 'UPSTOX',
    name: 'Upstox',
    markers: ['Upstox', 'RKSV', 'Instrument Name,Quantity,Buy/Sell', 'Instrument Name,Quantity'],
    columnMap: {
      tradeDate: 'Trade Date',
      symbol: 'Instrument Name',
      type: 'Buy/Sell',
      quantity: 'Quantity',
      price: 'Trade Price',
      isin: 'ISIN',
      exchange: 'Exchange',
    },
  },
  {
    key: 'ANGEL',
    name: 'Angel One',
    markers: ['Angel One', 'angelbroking', 'Angel Broking', 'Trade Date,Symbol Name,Net Qty', 'Symbol Name'],
    columnMap: {
      tradeDate: 'Trade Date',
      symbol: 'Symbol Name',
      type: 'Buy/Sell',
      quantity: 'Net Qty',
      price: 'Trade Price',
      amount: 'Trade Amount',
      brokerage: 'Brokerage',
      exchange: 'Exchange',
    },
  },
  {
    key: '5PAISA',
    name: '5Paisa',
    markers: ['5paisa', '5 paisa', 'Scrip Name,Buy Qty,Buy Rate'],
    columnMap: {
      tradeDate: 'Date',
      symbol: 'Scrip Name',
      buyQty: 'Buy Qty',
      buyRate: 'Buy Rate',
      sellQty: 'Sell Qty',
      sellRate: 'Sell Rate',
      exchange: 'Exchange',
    },
  },
  {
    key: 'ICICI',
    name: 'ICICI Direct',
    markers: ['ICICIdirect', 'icicidirect', 'ICICI Direct', 'Trade Date,Scrip Name,Action'],
    columnMap: {
      tradeDate: 'Trade Date',
      symbol: 'Scrip Name',
      type: 'Action',
      quantity: 'Quantity',
      price: 'Trade Price',
      amount: 'Trade Value',
      brokerage: 'Brokerage',
      exchange: 'Exchange',
    },
  },
  {
    // Marwadi/Geojit style trade book (lowercase columns)
    key: 'GENERIC_TRADE',
    name: 'Indian Broker',
    markers: ['trandate,scriptname,transtype', 'trandate', 'scriptname', 'transtype'],
    columnMap: {
      tradeDate: 'trandate',
      symbol: 'scriptname',
      type: 'transtype',
      quantity: 'delivqty',
      price: 'transrate',
      amount: 'amount',
      isin: 'isin',
      exchange: 'exch',
      segment: 'segmenttype',
      stt: 'stt',
      stampDuty: 'stampdutychg',
    },
  },
  {
    // Pre-calculated P&L format (Marwadi style)
    key: 'PNL_REPORT',
    name: 'P&L Report',
    markers: ['fullname,qty,sellrate,buyrate', 'sellrate,buyrate,gainloss', 'shorttermgainloss', 'longtermgainloss'],
    isPnLReport: true,
    columnMap: {
      symbol: 'fullname',
      shortName: 'shortname',
      qty: 'qty',
      sellrate: 'sellrate',
      buyrate: 'buyrate',
      gainloss: 'gainloss',
      shortTerm: 'shorttermgainloss',
      longTerm: 'longtermgainloss',
      buyDate: 'buydate',
      sellDate: 'selldate',
      sellStt: 'sellstt',
      purStt: 'purstt',
      saleValue: 'sale_value',
      purchaseValue: 'purchase_value',
    },
  },
];

function detectBroker(rawContent) {
  const header = rawContent.split('\n').slice(0, 50).join('\n');
  const lower = header.toLowerCase();

  for (const broker of BROKER_SIGNATURES) {
    const matchCount = broker.markers.filter((m) => lower.includes(m.toLowerCase())).length;
    if (matchCount >= 2) {
      return { key: broker.key, name: broker.name, columnMap: broker.columnMap };
    }
  }

  for (const broker of BROKER_SIGNATURES) {
    if (broker.markers.some((m) => lower.includes(m.toLowerCase()))) {
      return { key: broker.key, name: broker.name, columnMap: broker.columnMap };
    }
  }

  return null;
}

function extractAccountHolder(rawContent) {
  const lines = rawContent.split('\n').slice(0, 30);

  for (const line of lines) {
    const cleanLine = line.replace(/"/g, '').trim();
    const m = cleanLine.match(/^(?:Client\s*Name|Customer\s*Name|Account\s*Name|Name|Holder\s*Name)\s*[:,\-]+\s*(.+)/i);
    if (m) {
      let name = m[1].split(',').filter(s => s.trim())[0].trim();
      name = name.replace(/\d+$/, '').trim();
      if (name.length >= 3 && !/account|statement|client|id|number/i.test(name)) return name;
    }
  }

  return '';
}

function extractAccountId(rawContent) {
  const patterns = [
    /Client\s*ID\s*[:,]?\s*([A-Z0-9]{4,20})/i,
    /User\s*ID\s*[:,]?\s*([A-Z0-9]{4,20})/i,
    /Account\s*No[.:]?\s*[,]?\s*([A-Z0-9]{4,20})/i,
    /Client\s*Code\s*[:,]?\s*([A-Z0-9]{4,20})/i,
    /UCC\s*[:,]?\s*([A-Z0-9]{4,20})/i,
  ];

  for (const pattern of patterns) {
    const match = rawContent.match(pattern);
    if (match) return match[1];
  }

  // PAN as fallback
  const panMatch = rawContent.match(/PAN\s*[:,]?\s*([A-Z]{5}\d{4}[A-Z])/i);
  if (panMatch) return panMatch[1];

  return '';
}

module.exports = { detectBroker, extractAccountHolder, extractAccountId };
