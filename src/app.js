// ============================================================
// APP ENTRY POINT
// Phase 5: Single entry point that wires all modules together
//
// This file:
//  1. Imports all feature modules
//  2. Exposes necessary functions on window (for inline onclick="")
//  3. Exposes render callbacks via window._xxx (for nav/sync cross-calls)
//  4. Calls initApp() on DOMContentLoaded
// ============================================================

import { DB } from './state.js';

import { handleLogin, initApp, loadData, go } from './nav.js';

import {
  render, fillCust, calc, updMsg,
  saveOrderEdit, copyOrder, printOrder, startQuickOrder,
  shareSchedule, toggleFilter, toggleSort, placeOrder, doDel
} from './orders.js';

import { renderStockPage, setStockQty, saveStock } from './stock.js';

import {
  renderRecentPayments, quickPay, startQuickPay,
  submitPayment, executePayment, shareStatement, generatePDF
} from './payments.js';

import {
  renderCustomers, viewCust, openCustForm, saveClient,
  toggleCustActive, toggleCustFlag,
  openLocationEditor, initEditMap, submitLocationUpdate,
  openNote, saveNote
} from './customers.js';

import {
  renderLeads, addLead, setLeadFilter,
  runLeadAction, runArchive, runCombo, triggerGmailScan
} from './leads.js';

import {
  renderSmartActions, startSmartBroadcast, startBroadcast,
  startLeadOnlyBroadcast, initBroadcast, confirmBroadcastStart,
  processBroadcastStep, startCountdown, stopBroadcast, playBeep,
  renderSmsCandidates, startSmsBatch, stopSmsBatch, resetSmsButton,
  processSmsQueue, startSmsTimer, recordAction
} from './broadcast.js';

import {
  setDashPeriod, renderDashboard, renderDashboardFromData, renderExecutiveDues
} from './dashboard.js';

import {
  renderJobs, quickSend, sjSendWA, sjSendSMS,
  sendAllDueFollowUps, updateSmartBadge, renderDailyStatus,
  triggerDailyCheckpoint, filterJobs, runJob, sendJobFollowUp,
  sendMorningBrief, sendStockRequest, sendEveningReport, sendSmartBrief
} from './jobs.js';

import {
  addBubble, loadHistory, clearHistory, sendChat,
  runAiText, applyTaskType, quickFill,
  processAiResponse, startVoiceInput, initMap
} from './ai.js';

import {
  getActionQueue, saveActionQueue, enqueueAction, drainActionQueue,
  updateSyncBadge, showOfflineToast, updateOnlineStatus, forceRefresh
} from './sync.js';

// ── Expose render callbacks via window._xxx ──────────────────
// These avoid circular imports: nav.js & sync.js call these
// without importing the feature modules directly.
window._render              = render;
window._renderLeads         = renderLeads;
window._renderStockPage     = renderStockPage;
window._renderRecentPayments = renderRecentPayments;
window._renderDashboard     = renderDashboard;
window._renderSmartActions  = renderSmartActions;
window._renderJobs          = renderJobs;
window._renderDailyStatus   = renderDailyStatus;
window._updateSmartBadge    = updateSmartBadge;
window._loadHistory         = loadHistory;
window._loadData            = loadData;

// ── Expose to window for HTML onclick="" attributes ──────────
// Navigation
window.go             = go;
window.handleLogin    = handleLogin;
window.forceRefresh   = forceRefresh;

// Orders
window.render         = render;
window.fillCust       = fillCust;
window.calc           = calc;
window.updMsg         = updMsg;
window.saveOrderEdit  = saveOrderEdit;
window.copyOrder      = copyOrder;
window.printOrder     = printOrder;
window.startQuickOrder = startQuickOrder;
window.shareSchedule  = shareSchedule;
window.toggleFilter   = toggleFilter;
window.toggleSort     = toggleSort;
window.placeOrder     = placeOrder;
window.doDel          = doDel;

// Stock
window.renderStockPage = renderStockPage;
window.setStockQty    = setStockQty;
window.saveStock      = saveStock;

// Payments
window.renderRecentPayments = renderRecentPayments;
window.quickPay       = quickPay;
window.startQuickPay  = startQuickPay;
window.submitPayment  = submitPayment;
window.executePayment = executePayment;
window.shareStatement = shareStatement;
window.generatePDF    = generatePDF;

// Customers
window.renderCustomers     = renderCustomers;
window.viewCust            = viewCust;
window.openCustForm        = openCustForm;
window.saveClient          = saveClient;
window.toggleCustActive    = toggleCustActive;
window.toggleCustFlag      = toggleCustFlag;
window.openLocationEditor  = openLocationEditor;
window.initEditMap         = initEditMap;
window.submitLocationUpdate = submitLocationUpdate;
window.openNote            = openNote;
window.saveNote            = saveNote;

// Leads
window.renderLeads    = renderLeads;
window.addLead        = addLead;
window.setLeadFilter  = setLeadFilter;
window.runLeadAction  = runLeadAction;
window.runArchive     = runArchive;
window.runCombo       = runCombo;
window.triggerGmailScan = triggerGmailScan;

// Broadcast & SMS
window.renderSmartActions    = renderSmartActions;
window.startSmartBroadcast   = startSmartBroadcast;
window.startBroadcast        = startBroadcast;
window.startLeadOnlyBroadcast = startLeadOnlyBroadcast;
window.initBroadcast         = initBroadcast;
window.confirmBroadcastStart = confirmBroadcastStart;
window.processBroadcastStep  = processBroadcastStep;
window.startCountdown        = startCountdown;
window.stopBroadcast         = stopBroadcast;
window.playBeep              = playBeep;
window.renderSmsCandidates   = renderSmsCandidates;
window.startSmsBatch         = startSmsBatch;
window.stopSmsBatch          = stopSmsBatch;
window.resetSmsButton        = resetSmsButton;
window.processSmsQueue       = processSmsQueue;
window.startSmsTimer         = startSmsTimer;
window.recordAction          = recordAction;

// Dashboard
window.setDashPeriod         = setDashPeriod;
window.renderDashboard       = renderDashboard;
window.renderDashboardFromData = renderDashboardFromData;
window.renderExecutiveDues   = renderExecutiveDues;

// Jobs
window.renderJobs            = renderJobs;
window.quickSend             = quickSend;
window.sjSendWA              = sjSendWA;
window.sjSendSMS             = sjSendSMS;
window.sendAllDueFollowUps   = sendAllDueFollowUps;
window.updateSmartBadge      = updateSmartBadge;
window.renderDailyStatus     = renderDailyStatus;
window.triggerDailyCheckpoint = triggerDailyCheckpoint;
window.filterJobs            = filterJobs;
window.runJob                = runJob;
window.sendJobFollowUp       = sendJobFollowUp;
window.sendMorningBrief      = sendMorningBrief;
window.sendStockRequest      = sendStockRequest;
window.sendEveningReport     = sendEveningReport;
window.sendSmartBrief        = sendSmartBrief;

// AI & Voice
window.sendChat              = sendChat;
window.runAiText             = runAiText;
window.applyTaskType         = applyTaskType;
window.quickFill             = quickFill;
window.clearHistory          = clearHistory;
window.startVoiceInput       = startVoiceInput;
window.initMap               = initMap;

// Sync & offline
window.enqueueAction         = enqueueAction;
window.drainActionQueue      = drainActionQueue;
window.updateSyncBadge       = updateSyncBadge;
window.updateOnlineStatus    = updateOnlineStatus;

// ── Online/offline event listeners ───────────────────────────
window.addEventListener('online',  () => { updateOnlineStatus(); drainActionQueue(); });
window.addEventListener('offline', () => { updateOnlineStatus(); showOfflineToast(); });

// ── Boot ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', initApp);
