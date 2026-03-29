// ============================================================
// SHARED UTILITIES
// Phase 2: Extracted from index.html inline script
// All functions are pure helpers with no external dependencies
// ============================================================

/**
 * HTML-escapes a string to prevent XSS when injecting into innerHTML.
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Safely sets the text content of a DOM element by id.
 * @param {string} id
 * @param {string|number} val
 */
export function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerText = val;
}

/**
 * Returns a debounced version of `func` that delays invoking it
 * until `wait` milliseconds have elapsed since the last call.
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
export function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Displays a temporary toast notification at the top of the screen.
 * @param {string} msg  - HTML content for the toast
 * @param {boolean} [isError=false]
 */
export function showToast(msg, isError) {
  let toast = document.getElementById('custom-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'custom-toast';
    document.body.appendChild(toast);
  }
  toast.className =
    'fixed top-5 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl font-bold text-sm z-[100] transition-all duration-300 ' +
    (isError ? 'bg-red-500 text-white' : 'bg-slate-900 text-white');
  toast.innerHTML = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

/**
 * Shows the app-wide loading spinner with an optional message.
 * @param {string} [msg]
 */
export function showSpinner(msg) {
  const l = document.getElementById('loader');
  if (l) l.classList.remove('hidden');
}

/**
 * Hides the app-wide loading spinner.
 */
export function hideSpinner() {
  const l = document.getElementById('loader');
  if (l) l.classList.add('hidden');
}
