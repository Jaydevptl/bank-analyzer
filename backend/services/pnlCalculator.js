/**
 * P&L Calculator Service
 * FIFO matching of BUY and SELL trades for realized P&L.
 */

/**
 * Calculate P&L for a list of trades using FIFO method.
 * Returns per-symbol breakdown.
 */
function calculatePnL(trades) {
  // Group by symbol
  const bySymbol = {};
  for (const t of trades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = [];
    bySymbol[t.symbol].push(t);
  }

  const results = [];

  for (const symbol of Object.keys(bySymbol)) {
    const symbolTrades = bySymbol[symbol].slice().sort((a, b) =>
      new Date(a.tradeDate) - new Date(b.tradeDate)
    );

    // FIFO queue of buy lots: { qty, price, date, totalCharges }
    const buyQueue = [];
    let realizedPnL = 0;
    let totalBuyQty = 0;
    let totalSellQty = 0;
    let totalBuyValue = 0;
    let totalSellValue = 0;
    let totalCharges = 0;
    let stcgPnL = 0;
    let ltcgPnL = 0;
    let lastBuyDate = null;

    for (const trade of symbolTrades) {
      totalCharges += Number(trade.totalCharges) || 0;

      if (trade.type === 'BUY') {
        buyQueue.push({
          qty: Number(trade.quantity),
          price: Number(trade.price),
          date: new Date(trade.tradeDate),
          chargesPerUnit: (Number(trade.totalCharges) || 0) / Number(trade.quantity),
        });
        totalBuyQty += Number(trade.quantity);
        totalBuyValue += Number(trade.amount);
        lastBuyDate = trade.tradeDate;
      } else if (trade.type === 'SELL') {
        let qtyToMatch = Number(trade.quantity);
        const sellPrice = Number(trade.price);
        const sellDate = new Date(trade.tradeDate);
        const sellChargesPerUnit = (Number(trade.totalCharges) || 0) / Number(trade.quantity);

        totalSellQty += Number(trade.quantity);
        totalSellValue += Number(trade.amount);

        while (qtyToMatch > 0 && buyQueue.length > 0) {
          const buyLot = buyQueue[0];
          const matchQty = Math.min(qtyToMatch, buyLot.qty);

          const grossPnL = (sellPrice - buyLot.price) * matchQty;
          const matchCharges = (sellChargesPerUnit + buyLot.chargesPerUnit) * matchQty;
          const netPnL = grossPnL - matchCharges;

          // STCG vs LTCG (Indian tax rules: > 365 days = LTCG)
          const holdingDays = Math.floor((sellDate - buyLot.date) / (1000 * 60 * 60 * 24));
          if (holdingDays > 365) {
            ltcgPnL += netPnL;
          } else {
            stcgPnL += netPnL;
          }

          realizedPnL += netPnL;

          buyLot.qty -= matchQty;
          qtyToMatch -= matchQty;

          if (buyLot.qty === 0) buyQueue.shift();
        }
      }
    }

    // Holding qty = unmatched buys
    const holdingQty = buyQueue.reduce((s, l) => s + l.qty, 0);
    const holdingValue = buyQueue.reduce((s, l) => s + l.qty * l.price, 0);
    const avgHoldingPrice = holdingQty > 0 ? holdingValue / holdingQty : 0;

    const avgBuyPrice = totalBuyQty > 0 ? totalBuyValue / totalBuyQty : 0;
    const avgSellPrice = totalSellQty > 0 ? totalSellValue / totalSellQty : 0;

    results.push({
      symbol,
      buyQty: totalBuyQty,
      sellQty: totalSellQty,
      avgBuyPrice: +avgBuyPrice.toFixed(2),
      avgSellPrice: +avgSellPrice.toFixed(2),
      totalBuyValue: +totalBuyValue.toFixed(2),
      totalSellValue: +totalSellValue.toFixed(2),
      realizedPnL: +realizedPnL.toFixed(2),
      stcgPnL: +stcgPnL.toFixed(2),
      ltcgPnL: +ltcgPnL.toFixed(2),
      pnlType: ltcgPnL > 0 && stcgPnL === 0 ? 'LTCG' : (stcgPnL > 0 && ltcgPnL === 0 ? 'STCG' : 'MIXED'),
      totalCharges: +totalCharges.toFixed(2),
      netPnL: +realizedPnL.toFixed(2),
      holdingQty,
      avgHoldingPrice: +avgHoldingPrice.toFixed(2),
      holdingValue: +holdingValue.toFixed(2),
      lastBuyDate,
    });
  }

  return results;
}

/**
 * Holdings = buys not yet matched with sells
 */
function calculateHoldings(trades) {
  const pnl = calculatePnL(trades);
  return pnl
    .filter(p => p.holdingQty > 0)
    .map(p => ({
      symbol: p.symbol,
      quantity: p.holdingQty,
      avgBuyPrice: p.avgHoldingPrice,
      totalInvested: +(p.holdingQty * p.avgHoldingPrice).toFixed(2),
      lastBuyDate: p.lastBuyDate,
    }));
}

/**
 * Daily P&L: realized P&L for sells on a specific date
 */
function getDailyPnL(trades, dateStr) {
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  const next = new Date(date);
  next.setDate(next.getDate() + 1);

  const dayTrades = trades.filter(t => {
    const td = new Date(t.tradeDate);
    return td >= date && td < next;
  });

  const sells = dayTrades.filter(t => t.type === 'SELL');
  const buys = dayTrades.filter(t => t.type === 'BUY');

  return {
    date: dateStr,
    sells: sells.length,
    buys: buys.length,
    sellValue: sells.reduce((s, t) => s + (t.amount || 0), 0),
    buyValue: buys.reduce((s, t) => s + (t.amount || 0), 0),
    charges: dayTrades.reduce((s, t) => s + (t.totalCharges || 0), 0),
  };
}

/**
 * Monthly P&L
 */
function getMonthlyPnL(trades, year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const monthTrades = trades.filter(t => {
    const td = new Date(t.tradeDate);
    return td >= start && td < end;
  });

  const pnl = calculatePnL(monthTrades);
  return aggregatePnL(monthTrades, pnl, `${year}-${String(month).padStart(2, '0')}`);
}

/**
 * Quarterly P&L (Indian FY: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar)
 */
function getQuarterlyPnL(trades, fiscalYear, quarter) {
  // Indian FY: 2025-26 means Apr 2025 to Mar 2026
  let startMonth, endMonth, startYear;
  if (quarter === 1) { startMonth = 4; endMonth = 6; startYear = fiscalYear; }
  else if (quarter === 2) { startMonth = 7; endMonth = 9; startYear = fiscalYear; }
  else if (quarter === 3) { startMonth = 10; endMonth = 12; startYear = fiscalYear; }
  else { startMonth = 1; endMonth = 3; startYear = fiscalYear + 1; }

  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(startYear, endMonth, 1);

  const qtrTrades = trades.filter(t => {
    const td = new Date(t.tradeDate);
    return td >= start && td < end;
  });

  const pnl = calculatePnL(qtrTrades);
  return aggregatePnL(qtrTrades, pnl, `Q${quarter} FY${fiscalYear}-${String(fiscalYear + 1).slice(-2)}`);
}

function aggregatePnL(trades, pnl, label) {
  const buyValue = trades.filter(t => t.type === 'BUY').reduce((s, t) => s + (t.amount || 0), 0);
  const sellValue = trades.filter(t => t.type === 'SELL').reduce((s, t) => s + (t.amount || 0), 0);
  const totalRealizedPnL = pnl.reduce((s, p) => s + (p.realizedPnL || 0), 0);
  const totalCharges = trades.reduce((s, t) => s + (t.totalCharges || 0), 0);

  return {
    period: label,
    buyValue: +buyValue.toFixed(2),
    sellValue: +sellValue.toFixed(2),
    realizedPnL: +totalRealizedPnL.toFixed(2),
    charges: +totalCharges.toFixed(2),
    netPnL: +(totalRealizedPnL - totalCharges).toFixed(2),
    trades: trades.length,
  };
}

module.exports = {
  calculatePnL,
  calculateHoldings,
  getDailyPnL,
  getMonthlyPnL,
  getQuarterlyPnL,
  aggregatePnL,
};
