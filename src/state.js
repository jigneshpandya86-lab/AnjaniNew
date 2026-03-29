// ============================================================
// APP STATE & CONSTANTS
// Phase 3: Extracted from index.html inline script
//
// All feature modules import DB and constants from here instead
// of reading/writing window.DB or declaring their own constants.
// Firebase onSnapshot listeners mutate the DB arrays in-place,
// so any module holding a reference to DB automatically sees
// updated data without needing to re-import.
// ============================================================

// ── App constants ────────────────────────────────────────────
export const STAFF_NUM = '7990943652';
export const APP_PIN   = '9999';
export const SESSION_KEY = 'anjani_app_access';
export const CHAT_KEY    = 'anjani_full_chat_v1';

// ── Tuneable config values ───────────────────────────────────
export const CONFIG = {
  SMS_INTERVAL_SECONDS: 30,       // seconds between each SMS in a batch
  SMS_DAILY_LIMIT: 50,            // max messages per day
  LEAD_CUTOFF_DAYS: 5,            // days before a lead is considered stale
  LEAD_ARCHIVE_DAYS: 30,          // days before "New" leads are auto-archived
  RECENT_ORDERS_DAYS: 7,          // days window for "recent orders" view
  DASH_CACHE_TTL_MS: 5 * 60 * 1000, // dashboard cache TTL in milliseconds
};

// ── Shared data store ────────────────────────────────────────
// Firebase realtime listeners populate these arrays via push/splice.
// Modules must not reassign DB itself — only mutate its properties.
export const DB = {
  customers: [],
  orders:    [],
  stock:     [],
  payments:  [],
  leads:     [],
  jobs:      [],
  smartMsgs: {},
};

// ── Transient UI state ───────────────────────────────────────
// These are mutable by any module that imports them.
export let highlightID      = null;
export let leadFilter       = 'ALL';
export let showTodayOnly    = false;
export let currentCustID    = null;
export let sortMode         = 'TASK';
export let dashPeriod       = 'MONTH';
export let latestSmartActions = [];

// Setters for reassignable primitives (ES modules can't re-export `let`
// bindings to be mutated from outside — use these setters instead).
export function setHighlightID(v)        { highlightID = v; }
export function setLeadFilterState(v)    { leadFilter = v; }
export function setShowTodayOnly(v)      { showTodayOnly = v; }
export function setCurrentCustID(v)      { currentCustID = v; }
export function setSortMode(v)           { sortMode = v; }
export function setDashPeriod(v)         { dashPeriod = v; }
export function setLatestSmartActions(v) { latestSmartActions = v; }
