// ============================================================
// APP ENTRY POINT
// ============================================================
import { getAuth, onAuthStateChanged } from "firebase/auth";
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

// 🔥 WE STRIPPED OUT ALL THE BROKEN AI IMPORTS HERE:
import { clearHistory, sendChat, startVoiceInput } from './ai.js';

import {
  getActionQueue, saveActionQueue, enqueueAction, drainActionQueue,
  updateSyncBadge, showOfflineToast, updateOnlineStatus, forceRefresh
} from './sync.js';

// ── Expose render callbacks via window._xxx ──────────────────
window._render              = render;
window._renderLeads         = renderLeads;
window._renderStockPage     = renderStockPage;
window._renderRecentPayments = renderRecentPayments;
window._renderDashboard     = renderDashboard;
window._renderSmartActions  = renderSmartActions;
window._renderJobs          = renderJobs;
window._renderDailyStatus   = renderDailyStatus;
window._updateSmartBadge    = updateSmartBadge;
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

// AI & Voice (Stripped down to avoid crashes)
window.sendChat              = sendChat;
window.clearHistory          = clearHistory;
window.startVoiceInput       = startVoiceInput;

// Sync & offline
window.enqueueAction         = enqueueAction;
window.drainActionQueue      = drainActionQueue;
window.updateSyncBadge       = updateSyncBadge;
window.updateOnlineStatus    = updateOnlineStatus;

// ── Online/offline event listeners ───────────────────────────
window.addEventListener('online',  () => { updateOnlineStatus(); drainActionQueue(); });
window.addEventListener('offline', () => { updateOnlineStatus(); showOfflineToast(); });

// ── Boot Sequence: The Master Controller ──────────────
async function startApp() {
  const loader = document.getElementById('loader');
  const loginScreen = document.getElementById('login-screen');

  const session = localStorage.getItem('anjani_session');

  if (session) {
    if (loader) loader.classList.remove('hidden');
    if (loginScreen) loginScreen.classList.add('hidden');

    const auth = getAuth();
    await new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          resolve(); 
          unsubscribe();
        }
      });
      setTimeout(() => { resolve(); }, 3000); 
    });

    try {
      if (typeof window._loadData === 'function') {
        await window._loadData(); 
      }
    } catch (err) {
      console.warn("⏳ Data Gate error:", err);
    }

    if (typeof window._render === 'function') window._render();
    if (typeof window._renderDashboard === 'function') window._renderDashboard();
    
    if (typeof window.drainActionQueue === 'function') {
        window.drainActionQueue();
    }
    
    if (loader) loader.classList.add('hidden');

  } else {
    if (loginScreen) loginScreen.classList.remove('hidden');
    if (loader) loader.classList.add('hidden');
  }
}

window.addEventListener('DOMContentLoaded', startApp);

// ── Aggressive Auto-Sync Timer ────────────────────────────────
setInterval(() => {
    if (navigator.onLine && typeof window.drainActionQueue === 'function') {
        window.drainActionQueue();
    }
}, 15000);
