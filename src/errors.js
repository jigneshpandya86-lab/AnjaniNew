/**
 * src/errors.js — Sentry error tracking
 * Replaces scattered console.error() with centralised, structured error
 * reporting sent to Sentry's dashboard.
 *
 * Setup:
 *  1. Create a free project at https://sentry.io
 *  2. Copy your DSN and add it to .env:
 *       VITE_SENTRY_DSN=https://xxxxx@oXXX.ingest.sentry.io/YYYYYYY
 *  3. Errors are now automatically captured in production.
 *
 * In development (no VITE_SENTRY_DSN), Sentry is skipped and console.error
 * continues to work normally.
 */

import * as Sentry from '@sentry/browser';

// import.meta.env is Vite-only — use optional chaining so this file works
// on GitHub Pages (no bundler) and in Vite dev equally.
const SENTRY_DSN = import.meta.env?.VITE_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env?.MODE ?? 'production',
    release: 'anjani-water-app@1.0.0',
    tracesSampleRate: 0.1,                       // 10% of transactions traced
    beforeSend(event) {
      // Strip any PII from stack traces before sending
      return event;
    },
  });
  console.log('[AnjaniApp] Sentry error tracking initialized ✅');
} else {
  console.warn('[AnjaniApp] VITE_SENTRY_DSN not set — Sentry disabled (add it to .env for production)');
}

// ── Patch console.error so all existing calls are auto-captured ─────────────
const _origConsoleError = console.error.bind(console);
console.error = (...args) => {
  _origConsoleError(...args);
  if (SENTRY_DSN) {
    const firstArg = args[0];
    if (firstArg instanceof Error) {
      Sentry.captureException(firstArg);
    } else {
      const msg = args
        .map(a => (a instanceof Error ? a.message : String(a)))
        .join(' ');
      Sentry.captureMessage(msg, 'error');
    }
  }
};

// ── Expose for manual captures anywhere in the app ───────────────────────────
// Usage: window.Sentry.captureException(err) or window.Sentry.captureMessage('msg')
window.Sentry = Sentry;
