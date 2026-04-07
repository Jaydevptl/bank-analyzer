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

// ─── Trades / Share Market ────────────────────────────────────────────────────

export const uploadTrades = (files, onProgress) => {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  return api.post('/trades/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  });
};

export const getTrades = (params = {}) => api.get('/trades', { params });
export const getTradeSummary = (params = {}) => api.get('/trades/summary', { params });
export const getTradePnL = (params = {}) => api.get('/trades/pnl', { params });
export const getTradeCharges = (params = {}) => api.get('/trades/charges', { params });
export const getHoldings = (params = {}) => api.get('/trades/holdings', { params });
export const getTradeReports = () => api.get('/trades/reports');
export const getTradeBrokers = () => api.get('/trades/brokers');
export const clearTrades = () => api.delete('/trades/clear');

// ─── Export ───────────────────────────────────────────────────────────────────

export const exportExcel = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  window.open(`/api/export/excel?${query}`, '_blank');
};

export const exportPDF = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  window.open(`/api/export/pdf?${query}`, '_blank');
};
