/**
 * src/cache.js — IndexedDB cache via Dexie
 * Replaces localStorage (5 MB limit, plain-text) with IndexedDB (no practical
 * size limit, structured storage, works on all modern browsers).
 *
 * Exposes window.AnjaniCache for use by the non-module main app script.
 */

import Dexie from 'dexie';

const idb = new Dexie('AnjaniCache');

idb.version(1).stores({
  // Simple key-value table: key is the primary key
  keyval: 'key, ts',
});

window.AnjaniCache = {
  /**
   * Read a value by key. Returns null if not found.
   * @param {string} key
   * @returns {Promise<any|null>}
   */
  async get(key) {
    try {
      const row = await idb.keyval.get(key);
      return row ? row.value : null;
    } catch (e) {
      console.warn('[Cache] get failed:', e.message);
      return null;
    }
  },

  /**
   * Write a value.
   * @param {string} key
   * @param {any} value  — must be JSON-serialisable
   * @returns {Promise<void>}
   */
  async set(key, value) {
    try {
      await idb.keyval.put({ key, value, ts: Date.now() });
    } catch (e) {
      console.warn('[Cache] set failed:', e.message);
    }
  },

  /**
   * Return the timestamp (ms) when the key was last written, or null.
   * @param {string} key
   * @returns {Promise<number|null>}
   */
  async getTimestamp(key) {
    try {
      const row = await idb.keyval.get(key);
      return row ? row.ts : null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Delete a key.
   * @param {string} key
   * @returns {Promise<void>}
   */
  async remove(key) {
    try {
      await idb.keyval.delete(key);
    } catch (e) {
      console.warn('[Cache] remove failed:', e.message);
    }
  },
};

console.log('[AnjaniApp] IndexedDB cache (Dexie) initialized ✅');
