/**
 * src/main.js — Vite entry point (local dev only)
 *
 * This file is only used when running `npm run dev` (Vite).
 * On GitHub Pages the modules are loaded directly via <script type="module">
 * tags in index.html, using the import map for CDN resolution.
 *
 * Import order:
 *  1. style.css  — Tailwind CSS built by Vite (replaces CDN on dev)
 *  2. errors.js  — Sentry (must be ready before any code can throw)
 *  3. cache.js   — Dexie IndexedDB (must be ready before window.onload)
 */

import './style.css';
import './errors.js';
import './cache.js';
