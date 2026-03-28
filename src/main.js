/**
 * src/main.js — Vite entry point
 *
 * Import order matters:
 *  1. style.css   — Tailwind CSS (built by Vite, replaces CDN script)
 *  2. errors.js   — Sentry must be ready before any other code can throw
 *  3. cache.js    — IndexedDB (Dexie) must be ready before window.onload fires
 *
 * Both cache.js and errors.js attach helpers to `window.*` so the non-module
 * main app script in index.html can use them without import syntax.
 */

import './style.css';
import './errors.js';
import './cache.js';
