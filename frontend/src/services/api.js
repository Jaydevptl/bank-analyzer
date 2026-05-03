/**
 * API Service
 * Centralized Axios calls to the backend.
 */

import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// ─── Upload ───────────────────────────────────────────────────────────────────

export const uploadFiles = (files, onProgress) => {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  return api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  });
};

// ─── Transactions ─────────────────────────────────────────────────────────────

export const getTransactions = (params = {}) =>
  api.get('/transactions', { params });

export const getStats = (params = {}) =>
  api.get('/transactions/stats', { params });

export const getBanks = () =>
  api.get('/transactions/banks');

export const getAccountHolders = () =>
  api.get('/transactions/account-holders');

export const addTransaction = (data) =>
  api.post('/transactions', data);

export const bulkAddTransactions = (entries) =>
  api.post('/transactions/bulk', { entries });

export const updateTransaction = (id, data) =>
  api.patch(`/transactions/${id}`, data);

export const clearAllTransactions = () =>
  api.delete('/transactions/clear');

export const deleteTransaction = (id) =>
  api.delete(`/transactions/${id}`);

export const restoreFromBackup = (id) =>
  api.post(`/transactions/${id}/restore-from-backup`);

export const undoTransaction = (id, previousState) =>
  api.post(`/transactions/${id}/undo`, { previousState });

// ─── Recycle Bin ──────────────────────────────────────────────────────────────

export const getRecycleBin = (params = {}) => api.get('/recycle', { params });
export const restoreRecycleItem = (id) => api.post(`/recycle/${id}/restore`);
export const restoreAllRecycle = () => api.post('/recycle/restore-all');
export const permanentDeleteRecycle = (id) => api.delete(`/recycle/${id}`);
export const emptyRecycleBin = () => api.delete('/recycle');

// ─── Verify / Unverify ────────────────────────────────────────────────────────

export const verifyTransaction = (id) =>
  api.patch(`/transactions/${id}/verify`);

export const unverifyTransaction = (id) =>
  api.patch(`/transactions/${id}/unverify`);

export const verifyAll = () =>
  api.patch('/transactions/verify-all');

// ─── Duplicates ───────────────────────────────────────────────────────────────

export const getDuplicates = (params = {}) =>
  api.get('/transactions', { params: { ...params, status: 'duplicate' } });

export const keepDuplicate = (id) =>
  api.patch(`/transactions/${id}`, { status: 'pending' });

// ─── Reports ──────────────────────────────────────────────────────────────────

export const getReports = () =>
  api.get('/reports');

export const getReport = (uploadId) =>
  api.get(`/reports/${uploadId}`);

// ─── Credentials ──────────────────────────────────────────────────────────────

export const credHasPassword = () => api.get('/credentials/has-password');
export const credSetPassword = (password) => api.post('/credentials/set-password', { password });
export const credVerifyPassword = (password) => api.post('/credentials/verify-password', { password });
export const getCredentials = (params = {}) => api.get('/credentials', { params });
export const addCredential = (data) => api.post('/credentials', data);
export const updateCredential = (id, data) => api.patch(`/credentials/${id}`, data);
export const deleteCredential = (id) => api.delete(`/credentials/${id}`);
export const bulkImportCredentials = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post('/credentials/bulk', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// ─── Backup ───────────────────────────────────────────────────────────────────

export const getBackupStats = () => api.get('/backup/stats');

export const downloadBackup = () => {
  // Open in new tab so the browser handles the download
  window.open('/api/backup/export', '_blank');
};

export const restoreBackup = (file, onProgress) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/backup/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress) onProgress(Math.round((e.loaded * 100) / e.total));
    },
    timeout: 600000, // 10 min for large backups
  });
};

// ─── Share Market ────────────────────────────────────────────────────────────

export const uploadTrades = (files, fileMeta = {}, onProgress) => {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  formData.append('fileMeta', JSON.stringify(fileMeta));
  return api.post('/trades/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  });
};

export const getStockAccounts = () => api.get('/trades/accounts');
export const getOverview = () => api.get('/trades/overview');
export const getDaywisePnL = (params = {}) => api.get('/trades/daywise-pnl', { params });
export const getTradePnL = (params = {}) => api.get('/trades/pnl', { params });
export const getLedger = (params = {}) => api.get('/trades/ledger', { params });
export const clearTrades = () => api.delete('/trades/clear');

// ─── Amazon Multi-Card Tracking ───────────────────────────────────────────────

export const amzGetCards          = () => api.get('/amazon/cards');
export const amzGetCardBalances   = () => api.get('/amazon/cards/balances');
export const amzAddCard           = (data) => api.post('/amazon/cards', data);
export const amzUpdateCard        = (id, data) => api.patch(`/amazon/cards/${id}`, data);
export const amzDeleteCard        = (id) => api.delete(`/amazon/cards/${id}`);

export const amzUpload = (file, onProgress) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post('/amazon/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 600000,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  });
};

export const amzGetOrders         = (params = {}) => api.get('/amazon/orders', { params });
export const amzGetOrderSummary   = () => api.get('/amazon/orders/summary');
export const amzGetTransactions   = (params = {}) => api.get('/amazon/transactions', { params });
export const amzAddTransaction    = (data) => api.post('/amazon/transactions', data);
export const amzDeleteTransaction = (id) => api.delete(`/amazon/transactions/${id}`);
export const amzGetReports        = () => api.get('/amazon/reports');
export const amzGetDashboard      = () => api.get('/amazon/dashboard');

// ─── Fino Phase 3a: Bank Accounts ─────────────────────────────────────────────

export const finoListBanks       = (params = {}) => api.get('/bank-accounts', { params });
export const finoGetBank         = (id) => api.get(`/bank-accounts/${id}`);
export const finoCreateBank      = (data) => api.post('/bank-accounts', data);
export const finoDeactivateBank  = (id) => api.post(`/bank-accounts/${id}/deactivate`);
export const finoBankLedger      = (id, params = {}) => api.get(`/bank-accounts/${id}/ledger`, { params });

export const finoBankDeposit     = (data) => api.post('/bank-transactions/deposit', data);
export const finoBankWithdraw    = (data) => api.post('/bank-transactions/withdraw', data);
export const finoBankTransfer    = (data) => api.post('/bank-transactions/transfer', data);
export const finoBankCharge      = (data) => api.post('/bank-transactions/charge', data);
export const finoBankInterest    = (data) => api.post('/bank-transactions/interest', data);

// ─── Fino Phase 3a: Cash ──────────────────────────────────────────────────────

export const finoCashBalance     = (params = {}) => api.get('/cash/balance', { params });
export const finoCashLedger      = (params = {}) => api.get('/cash/ledger', { params });
export const finoCashDeposit     = (data) => api.post('/cash/deposit', data);
export const finoCashWithdrawal  = (data) => api.post('/cash/withdrawal', data);
export const finoCashAdjustment  = (data) => api.post('/cash/adjustment', data);

// ─── Fino Phase 3a: Fixed Assets ──────────────────────────────────────────────

export const finoListAssets      = (params = {}) => api.get('/fixed-assets', { params });
export const finoGetAsset        = (id) => api.get(`/fixed-assets/${id}`);
export const finoCreateAsset     = (data) => api.post('/fixed-assets', data);
export const finoDepreciate      = (id, data) => api.post(`/fixed-assets/${id}/depreciate`, data);
export const finoAppreciate      = (id, data) => api.post(`/fixed-assets/${id}/appreciate`, data);
export const finoAssetHistory    = (id) => api.get(`/fixed-assets/${id}/history`);

// ─── Fino Phase 4: Parties + Items ───────────────────────────────────────────

export const finoUpdateParty       = (id, data) => api.patch(`/parties/${id}`, data);
export const finoDeleteParty       = (id, reason) => api.delete(`/parties/${id}`, { data: { reason } });
export const finoGetParty          = (id) => api.get(`/parties/${id}`);
export const finoPartyLedger       = (id, params = {}) => api.get(`/parties/${id}/ledger`, { params });
export const finoPartySummary      = (id) => api.get(`/parties/${id}/summary`);

export const finoListItems         = (params = {}) => api.get('/items', { params });
export const finoGetItem           = (id) => api.get(`/items/${id}`);
export const finoCreateItem        = (data) => api.post('/items', data);
export const finoUpdateItem        = (id, data) => api.patch(`/items/${id}`, data);
export const finoDeleteItem        = (id, reason) => api.delete(`/items/${id}`, { data: { reason } });
export const finoItemCategories    = () => api.get('/items/categories/summary');

// ─── Fino Phase 5: Sale Invoices ─────────────────────────────────────────────

export const finoListInvoices      = (params = {}) => api.get('/sale-invoices', { params });
export const finoGetInvoice        = (id) => api.get(`/sale-invoices/${id}`);
export const finoCreateInvoice     = (data) => api.post('/sale-invoices', data);
export const finoUpdateInvoice     = (id, data) => api.patch(`/sale-invoices/${id}`, data);
export const finoCancelInvoice     = (id, reason) => api.delete(`/sale-invoices/${id}`, { data: { reason } });
export const finoNextInvoiceNumber = () => api.get('/sale-invoices/next-number');
export const finoInvoiceSummary    = () => api.get('/sale-invoices/summary');
export const finoInvoicePayments   = (id) => api.get(`/sale-invoices/${id}/payments`);
export const finoRecordPayment     = (id, data) => api.post(`/sale-invoices/${id}/payments`, data);
export const finoDeletePayment     = (pid, reason) => api.delete(`/sale-invoices/payments/${pid}`, { data: { reason } });
export const finoCustomerOutstanding = (partyId) => api.get(`/sale-invoices/customer/${partyId}/outstanding`);

// ─── Fino Phase 6: Purchase Bills ────────────────────────────────────────────

export const finoListBills          = (params = {}) => api.get('/purchase-invoices', { params });
export const finoGetBill            = (id) => api.get(`/purchase-invoices/${id}`);
export const finoCreateBill         = (data) => api.post('/purchase-invoices', data);
export const finoUpdateBill         = (id, data) => api.patch(`/purchase-invoices/${id}`, data);
export const finoCancelBill         = (id, reason) => api.delete(`/purchase-invoices/${id}`, { data: { reason } });
export const finoNextBillNumber     = () => api.get('/purchase-invoices/next-number');
export const finoBillSummary        = () => api.get('/purchase-invoices/summary');
export const finoBillPayments       = (id) => api.get(`/purchase-invoices/${id}/payments`);
export const finoMakeBillPayment    = (id, data) => api.post(`/purchase-invoices/${id}/payments`, data);
export const finoDeleteBillPayment  = (pid, reason) => api.delete(`/purchase-invoices/payments/${pid}`, { data: { reason } });
export const finoSupplierPayable    = (partyId) => api.get(`/purchase-invoices/supplier/${partyId}/payable`);

// ─── Fino Phase 7: Cash Conversions ──────────────────────────────────────────

export const finoListConversions    = (params = {}) => api.get('/cash-conversions', { params });
export const finoGetConversion      = (id) => api.get(`/cash-conversions/${id}`);
export const finoCreateConversion   = (data) => api.post('/cash-conversions', data);
export const finoUpdateConversion   = (id, data) => api.patch(`/cash-conversions/${id}`, data);
export const finoCancelConversion   = (id, reason) => api.delete(`/cash-conversions/${id}`, { data: { reason } });
export const finoNextConversionNumber = () => api.get('/cash-conversions/next-number');
export const finoConversionSummary  = () => api.get('/cash-conversions/summary');
export const finoMarkCashReceived   = (id, data) => api.post(`/cash-conversions/${id}/cash-received`, data);
export const finoMarkGstReceived    = (id, data) => api.post(`/cash-conversions/${id}/gst-invoice-received`, data);

// ─── Fino Phase 9: Statement Uploads ─────────────────────────────────────────

export const finoListUploads        = (params = {}) => api.get('/statement-uploads', { params });
export const finoGetUpload          = (id) => api.get(`/statement-uploads/${id}`);
export const finoCreateUpload       = (data) => api.post('/statement-uploads', data);
export const finoUpdateUploadedTxn  = (txnId, data) => api.patch(`/statement-uploads/transactions/${txnId}`, data);
export const finoImportUploadTxns   = (id, transactionIds) => api.post(`/statement-uploads/${id}/import`, { transactionIds });
export const finoSkipUploadTxns     = (id, transactionIds) => api.post(`/statement-uploads/${id}/skip`, { transactionIds });
export const finoDeleteUpload       = (id, reason) => api.delete(`/statement-uploads/${id}`, { data: { reason } });

// ─── Fino Phase 10: Share Market ─────────────────────────────────────────────

export const finoSmListBrokers     = () => api.get('/share-market/brokers');
export const finoSmCreateBroker    = (data) => api.post('/share-market/brokers', data);
export const finoSmListAccounts    = (params = {}) => api.get('/share-market/accounts', { params });
export const finoSmGetAccount      = (id) => api.get(`/share-market/accounts/${id}`);
export const finoSmCreateAccount   = (data) => api.post('/share-market/accounts', data);
export const finoSmDeleteAccount   = (id, reason) => api.delete(`/share-market/accounts/${id}`, { data: { reason } });
export const finoSmBuy             = (id, data) => api.post(`/share-market/accounts/${id}/buy`, data);
export const finoSmSell            = (id, data) => api.post(`/share-market/accounts/${id}/sell`, data);
export const finoSmDividend        = (id, data) => api.post(`/share-market/accounts/${id}/dividend`, data);
export const finoSmDeleteTxn       = (txnId, reason) => api.delete(`/share-market/transactions/${txnId}`, { data: { reason } });
export const finoSmUpdatePrice     = (holdingId, currentPrice) => api.post(`/share-market/holdings/${holdingId}/update-price`, { currentPrice });
export const finoSmBulkUpdatePrices = (updates) => api.post('/share-market/holdings/bulk-update-prices', { updates });
export const finoSmPnL             = (id, params = {}) => api.get(`/share-market/accounts/${id}/pnl`, { params });
export const finoSmDashboard       = () => api.get('/share-market/dashboard');

// ─── Fino Phase 11: Amazon Import (Hawala + US Cards + Orders + Shipments) ──

export const finoAiDashboard          = () => api.get('/amazon-import/dashboard');

export const finoAiListHawala         = (params = {}) => api.get('/amazon-import/hawala', { params });
export const finoAiNextHawalaNumber   = () => api.get('/amazon-import/hawala/next-number');
export const finoAiHawalaSummary      = () => api.get('/amazon-import/hawala/summary');
export const finoAiCreateHawala       = (data) => api.post('/amazon-import/hawala', data);
export const finoAiGetHawala          = (id) => api.get(`/amazon-import/hawala/${id}`);
export const finoAiHawalaInrPaid      = (id, data) => api.post(`/amazon-import/hawala/${id}/inr-paid`, data);
export const finoAiHawalaUsdReceived  = (id, data) => api.post(`/amazon-import/hawala/${id}/usd-received`, data);
export const finoAiCancelHawala       = (id, reason) => api.delete(`/amazon-import/hawala/${id}`, { data: { reason } });

export const finoAiListCards          = () => api.get('/amazon-import/cards');
export const finoAiGetCard            = (id) => api.get(`/amazon-import/cards/${id}`);
export const finoAiCreateCard         = (data) => api.post('/amazon-import/cards', data);
export const finoAiLoadCard           = (id, data) => api.post(`/amazon-import/cards/${id}/load`, data);
export const finoAiTransferCard       = (id, data) => api.post(`/amazon-import/cards/${id}/transfer`, data);
export const finoAiDeleteCard         = (id, reason) => api.delete(`/amazon-import/cards/${id}`, { data: { reason } });

export const finoAiListOrders         = (params = {}) => api.get('/amazon-import/orders', { params });
export const finoAiCreateOrder        = (data) => api.post('/amazon-import/orders', data);
export const finoAiGetOrder           = (id) => api.get(`/amazon-import/orders/${id}`);
export const finoAiDeleteOrder        = (id, reason) => api.delete(`/amazon-import/orders/${id}`, { data: { reason } });

export const finoAiListShipments      = (params = {}) => api.get('/amazon-import/shipments', { params });
export const finoAiNextShipmentNumber = () => api.get('/amazon-import/shipments/next-number');
export const finoAiCreateShipment     = (data) => api.post('/amazon-import/shipments', data);
export const finoAiGetShipment        = (id) => api.get(`/amazon-import/shipments/${id}`);
export const finoAiLinkOrder          = (id, orderId) => api.post(`/amazon-import/shipments/${id}/link-order`, { orderId });
export const finoAiAllocate           = (id) => api.post(`/amazon-import/shipments/${id}/allocate`);
export const finoAiShipmentReceived   = (id, data) => api.post(`/amazon-import/shipments/${id}/received`, data);
export const finoAiCancelShipment     = (id, reason) => api.delete(`/amazon-import/shipments/${id}`, { data: { reason } });

// ─── Fino Phase 3d: Credit Cards ──────────────────────────────────────────────

export const finoListCC          = (params = {}) => api.get('/credit-cards', { params });
export const finoGetCC           = (id) => api.get(`/credit-cards/${id}`);
export const finoCreateCC        = (data) => api.post('/credit-cards', data);
export const finoUpdateCC        = (id, data) => api.patch(`/credit-cards/${id}`, data);
export const finoDeleteCC        = (id, reason) => api.delete(`/credit-cards/${id}`, { data: { reason } });

export const finoCcTxn           = (id, data) => api.post(`/credit-cards/${id}/transactions`, data);
export const finoDeleteCcTxn     = (txnId, reason) => api.delete(`/credit-cards/transactions/${txnId}`, { data: { reason } });

export const finoCcPoints        = (id, data) => api.post(`/credit-cards/${id}/rewards/points`, data);

export const finoCcPayment       = (id, data) => api.post(`/credit-cards/${id}/payments`, data);
export const finoDeleteCcPayment = (pid, reason) => api.delete(`/credit-cards/payments/${pid}`, { data: { reason } });

export const finoCcStatement     = (id, data) => api.post(`/credit-cards/${id}/statements`, data);
export const finoUpdateCcStmt    = (sid, data) => api.patch(`/credit-cards/statements/${sid}`, data);
export const finoDeleteCcStmt    = (sid, reason) => api.delete(`/credit-cards/statements/${sid}`, { data: { reason } });

export const finoCcDashboard     = () => api.get('/credit-cards/summary/dashboard');

// Phase 8: analytics + reconciliation + category
export const finoCcAnalytics     = (id, params = {}) => api.get(`/credit-cards/${id}/analytics`, { params });
export const finoCcSetCategory   = (txnId, category) => api.patch(`/credit-cards/transactions/${txnId}/category`, { category });
export const finoCcReconcile     = (txnId, statementId) => api.post(`/credit-cards/transactions/${txnId}/reconcile`, { statementId });
export const finoCcUnreconcile   = (txnId) => api.post(`/credit-cards/transactions/${txnId}/unreconcile`);
export const finoCcStmtReconciliation = (sid) => api.get(`/credit-cards/statements/${sid}/reconciliation`);

// ─── Fino Phase 3c: Gift Cards ────────────────────────────────────────────────

export const finoListGcPlatforms = () => api.get('/gift-cards/platforms');
export const finoCreateGcPlatform = (data) => api.post('/gift-cards/platforms', data);
export const finoListGiftCards    = (params = {}) => api.get('/gift-cards', { params });
export const finoGetGiftCard      = (id) => api.get(`/gift-cards/${id}`);
export const finoCreateGiftCard   = (data) => api.post('/gift-cards', data);
export const finoUpdateGiftCard   = (id, data) => api.patch(`/gift-cards/${id}`, data);
export const finoDeleteGiftCard   = (id, reason) => api.delete(`/gift-cards/${id}`, { data: { reason } });
export const finoUseGiftCard      = (id, data) => api.post(`/gift-cards/${id}/usages`, data);
export const finoDeleteGcUsage    = (uid, reason) => api.delete(`/gift-cards/usages/${uid}`, { data: { reason } });
export const finoGcTransfer       = (data) => api.post('/gift-cards/transfers', data);
export const finoDeleteGcTransfer = (tid, reason) => api.delete(`/gift-cards/transfers/${tid}`, { data: { reason } });
export const finoGcSummary        = () => api.get('/gift-cards/summary/platform-wise');

// ─── Fino Phase 3 Polish: edit / delete / dev tools ──────────────────────────

export const finoUpdateBank          = (id, data) => api.patch(`/bank-accounts/${id}`, data);
export const finoDeleteBank          = (id, reason) => api.delete(`/bank-accounts/${id}`, { data: { reason } });
export const finoUpdateBankTxn       = (gid, data) => api.patch(`/bank-transactions/${gid}`, data);
export const finoDeleteBankTxn       = (gid, reason) => api.delete(`/bank-transactions/${gid}`, { data: { reason } });

export const finoUpdateCashAdj       = (id, data) => api.patch(`/cash/adjustment/${id}`, data);
export const finoDeleteCashAdj       = (id, reason) => api.delete(`/cash/adjustment/${id}`, { data: { reason } });
export const finoUpdateCashTxn       = (gid, data) => api.patch(`/cash/transaction/${gid}`, data);
export const finoDeleteCashTxn       = (gid, reason) => api.delete(`/cash/transaction/${gid}`, { data: { reason } });

export const finoUpdateAsset         = (id, data) => api.patch(`/fixed-assets/${id}`, data);
export const finoDeleteAsset         = (id, reason) => api.delete(`/fixed-assets/${id}`, { data: { reason } });
export const finoDeleteAssetAdj      = (adjId, reason) => api.delete(`/fixed-assets/adjustments/${adjId}`, { data: { reason } });

export const finoUpdateLoan          = (id, data) => api.patch(`/loans/${id}`, data);
export const finoDeleteLoan          = (id, reason) => api.delete(`/loans/${id}`, { data: { reason } });
export const finoCancelLoan          = (id, reason) => api.post(`/loans/${id}/cancel`, { reason });
export const finoDeleteRepayment     = (rid, reason) => api.delete(`/loans/repayments/${rid}`, { data: { reason } });

export const finoResetTestData       = (confirmation) => api.post('/dev/reset-test-data', { confirmation });

// ─── Fino Phase 3b: Loans Given + Parties ─────────────────────────────────────

export const finoListLoans       = (params = {}) => api.get('/loans', { params });
export const finoGetLoan         = (id, params = {}) => api.get(`/loans/${id}`, { params });
export const finoCreateLoan      = (data) => api.post('/loans', data);
export const finoLoanRepayment   = (id, data) => api.post(`/loans/${id}/repayments`, data);
export const finoLoanWriteOff    = (id, data) => api.post(`/loans/${id}/writeoff`, data);
export const finoLoanOutstanding = (id, params = {}) => api.get(`/loans/${id}/outstanding`, { params });
export const finoBorrowerSummary = () => api.get('/loans/summary/borrower-wise');

export const finoListParties     = (params = {}) => api.get('/parties', { params });
export const finoCreateParty     = (data) => api.post('/parties', data);

// ─── Export ───────────────────────────────────────────────────────────────────

export const exportExcel = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  window.open(`/api/export/excel?${query}`, '_blank');
};

export const exportPDF = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  window.open(`/api/export/pdf?${query}`, '_blank');
};
