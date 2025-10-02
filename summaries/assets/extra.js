(function () {
'use strict';

// -------------------------
// Mobile toggle helper
// -------------------------
(function () {
const MOBILE_BP = 600;
const NARROW_BP = 420;
const GENERATED_ATTR = 'data-tv-mobile-toggle';
const STYLE_ID = 'tv-mobile-toggle-style-v2';
const OBS_REG = new Map();
const DEBOUNCE_MS = 140;

```
function debounce(fn, wait) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => { try { fn.apply(this, args); } catch (e) { /* silent */ } }, wait);
  };
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
```

.tv-mobile-toggle {
position: absolute;
top: 8px;
right: 8px;
z-index: 1200;
padding: 6px 10px;
font-size: 13px;
border-radius: 6px;
border: 1px solid rgba(0,0,0,0.08);
background: var(--button-bg, #f3f4f6);
color: var(--button-text, #111827);
box-shadow: 0 6px 16px rgba(0,0,0,0.08);
cursor: pointer;
white-space: nowrap;
line-height: 1;
}
.tv-mobile-toggle:focus { outline: 3px solid rgba(37,99,235,0.18); outline-offset: 2px; }
.tv-mobile-toggle.tv-icon-only {
padding: 8px;
width: 40px;
height: 40px;
display: inline-flex;
align-items: center;
justify-content: center;
font-size: 14px;
text-indent: 0;
}
@media (min-width: ${MOBILE_BP + 1}px) {
.tv-mobile-toggle { display: none !important; }
}
.table-wrapper[data-tv-mobile-enabled="1"] { position: relative; }
`;
(document.head || document.documentElement).appendChild(s);
}

```
function findOriginalToggle(wrapper) {
  if (!wrapper || !wrapper.querySelector) return null;
  const selectors = [
    '.toggle-table-btn',
    'button[data-action="toggle-collapse"]',
    '.toggle-table',
    'button.toggle-table-btn',
    'button.toggle-table'
  ];
  for (const sel of selectors) {
    const found = wrapper.querySelector(sel);
    if (found) return found;
  }
  const header = wrapper.querySelector('.table-header-wrapper, .table-header, .copy-buttons');
  if (header) {
    const btns = Array.from(header.querySelectorAll('button'));
    for (const b of btns) {
      const t = (b.textContent || b.innerText || '').trim().toLowerCase();
      if (t.includes('collapse') || t.includes('expand') || t.includes('toggle')) return b;
    }
  }
  return null;
}

function findHeaderContainer(wrapper) {
  if (!wrapper) return null;
  return wrapper.querySelector('.table-header-wrapper') || wrapper.querySelector('.table-header') || wrapper.querySelector('.copy-buttons') || wrapper;
}

function isElementVisibleWithin(el, container) {
  if (!el || !container) return false;
  try {
    const er = el.getBoundingClientRect();
    const cr = container.getBoundingClientRect();
    return er.left >= cr.left && er.right <= cr.right && er.top >= cr.top && er.bottom <= cr.bottom;
  } catch (e) { return false; }
}

function shouldShowMobileToggle(wrapper) {
  try {
    if (!wrapper) return false;
    if (window.innerWidth > MOBILE_BP) return false;
    const header = findHeaderContainer(wrapper);
    if (!header) return false;
    const overflows = header.scrollWidth > header.clientWidth + 6;
    const orig = findOriginalToggle(wrapper);
    if (!orig) return overflows;
    const visible = isElementVisibleWithin(orig, header);
    return overflows || !visible;
  } catch (e) { return false; }
}

function createMobileToggle(wrapper, original) {
  try {
    if (!wrapper || !original) return;
    if (wrapper.querySelector(`[${GENERATED_ATTR}]`)) return;
    if (!wrapper.hasAttribute('data-tv-mobile-enabled')) {
      const cs = getComputedStyle(wrapper);
      if (!cs || cs.position === 'static' || cs.position === '') {
        wrapper.dataset.tvPrevPosition = 'static';
        wrapper.style.position = 'relative';
      }
      wrapper.setAttribute('data-tv-mobile-enabled', '1');
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tv-mobile-toggle';
    btn.setAttribute(GENERATED_ATTR, '1');
    btn.setAttribute('aria-label', 'Toggle table collapse');
    btn.title = (original.title || original.getAttribute('aria-label') || original.textContent || 'Toggle').toString().trim();

    const applyIconMode = () => {
      if (window.innerWidth <= NARROW_BP) btn.classList.add('tv-icon-only');
      else btn.classList.remove('tv-icon-only');
    };
    applyIconMode();

    function buildLabel() {
      try {
        const txt = (original.textContent || original.innerText || '').trim();
        if (window.innerWidth <= NARROW_BP) return txt ? txt.charAt(0) : '☰';
        return txt || 'Toggle';
      } catch (e) { return 'Toggle'; }
    }
    btn.textContent = buildLabel();

    btn.addEventListener('click', function (ev) {
      try { ev.stopPropagation(); } catch (_) {}
      try {
        if (typeof original.click === 'function') original.click();
        else original.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      } catch (err) {
        try { if (typeof window.toggleTable === 'function') window.toggleTable(original); } catch (_) {}
      }
    }, { passive: true });

    const sync = debounce(function () {
      try {
        btn.title = (original.title || original.getAttribute('aria-label') || original.textContent || 'Toggle').toString().trim();
        btn.textContent = buildLabel();
      } catch (e) { /* silent */ }
    }, 80);

    const mo = new MutationObserver(sync);
    mo.observe(original, { childList: true, characterData: true, subtree: true, attributes: true });
    original.addEventListener('click', sync, { passive: true });

    wrapper.appendChild(btn);
    OBS_REG.set(wrapper, Object.assign(OBS_REG.get(wrapper) || {}, { mo }));

    const parentMo = new MutationObserver(debounce(() => {
      if (!document.documentElement.contains(original)) removeMobileToggle(wrapper);
    }, 180));
    parentMo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    OBS_REG.set(wrapper, Object.assign(OBS_REG.get(wrapper) || {}, { parentMo }));

    const onResize = debounce(() => { applyIconMode(); }, 100);
    window.addEventListener('resize', onResize);
    OBS_REG.set(wrapper, Object.assign(OBS_REG.get(wrapper) || {}, { onResize }));

  } catch (e) {
    try { console.warn('tv:extra createMobileToggle failed', e); } catch (_) {}
  }
}

function removeMobileToggle(wrapper) {
  try {
    if (!wrapper) return;
    const clone = wrapper.querySelector(`[${GENERATED_ATTR}]`);
    if (clone) clone.remove();
    const entry = OBS_REG.get(wrapper);
    if (entry) {
      try { if (entry.mo && typeof entry.mo.disconnect === 'function') entry.mo.disconnect(); } catch (_) {}
      try { if (entry.parentMo && typeof entry.parentMo.disconnect === 'function') entry.parentMo.disconnect(); } catch (_) {}
      try { if (entry.onResize) window.removeEventListener('resize', entry.onResize); } catch (_) {}
      try { if (entry.ro && typeof entry.ro.disconnect === 'function') entry.ro.disconnect(); } catch (_) {}
      OBS_REG.delete(wrapper);
    }
    if (wrapper.dataset.tvPrevPosition) {
      try { wrapper.style.position = ''; delete wrapper.dataset.tvPrevPosition; } catch (_) {}
    }
    wrapper.removeAttribute('data-tv-mobile-enabled');
  } catch (e) {
    try { console.warn('tv:extra removeMobileToggle failed', e); } catch (_) {}
  }
}

function refreshWrapper(wrapper) {
  try {
    if (!wrapper) return;
    const original = findOriginalToggle(wrapper);
    if (!original) { removeMobileToggle(wrapper); return; }
    if (shouldShowMobileToggle(wrapper)) createMobileToggle(wrapper, original);
    else removeMobileToggle(wrapper);
  } catch (e) { /* silent */ }
}

const refreshAll = debounce(function () {
  try {
    const wrappers = Array.from(document.querySelectorAll('.table-wrapper'));
    wrappers.forEach(w => refreshWrapper(w));
  } catch (e) { /* silent */ }
}, DEBOUNCE_MS);

function observeGlobalMutations() {
  try {
    const mo = new MutationObserver(debounce((mutations) => {
      let need = false;
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && (n.matches && n.matches('.table-wrapper') || (n.querySelector && n.querySelector('.table-wrapper')))) {
              need = true; break;
            }
          }
        }
        if (m.type === 'attributes' && m.target && (m.target.classList && m.target.classList.contains('table-header-wrapper'))) {
          need = true; break;
        }
      }
      if (need) refreshAll();
    }, 160));
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true, characterData: false });
    window.__tvExtraGlobalMO = mo;
  } catch (e) { /* silent */ }
}

function init() {
  try {
    injectStyle();
    refreshAll();
    observeGlobalMutations();
    const onResize = debounce(refreshAll, 180);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    try {
      document.querySelectorAll('.table-wrapper').forEach(wrapper => {
        try {
          const header = findHeaderContainer(wrapper);
          if (!header) return;
          const ro = new ResizeObserver(debounce(() => refreshWrapper(wrapper), 120));
          ro.observe(header);
          OBS_REG.set(wrapper, Object.assign(OBS_REG.get(wrapper) || {}, { ro }));
        } catch (e) { /* ignore per-wrapper */ }
      });
    } catch (e) { /* silent */ }

    const cleanup = () => { try { api.teardown(); } catch (_) {} };
    window.addEventListener('pagehide', cleanup);
    window.addEventListener('beforeunload', cleanup);

    window.tvExtra = Object.assign(window.tvExtra || {}, api);
  } catch (e) {
    try { console.warn('tv:extra init failed', e); } catch (_) {}
  }
}

const api = {
  refreshAll: debounce(function(){ try { refreshAll(); } catch(_){} }, 80),
  enableWrapper: function (wrapperEl) { try { if (!wrapperEl) return; wrapperEl.setAttribute('data-tv-extra-enabled', '1'); refreshWrapper(wrapperEl); } catch (e) {} },
  disableWrapper: function (wrapperEl) { try { if (!wrapperEl) return; wrapperEl.removeAttribute('data-tv-extra-enabled'); removeMobileToggle(wrapperEl); } catch (e) {} },
  teardown: function () { try { Array.from(document.querySelectorAll('.table-wrapper')).forEach(w => removeMobileToggle(w)); if (window.__tvExtraGlobalMO && typeof window.__tvExtraGlobalMO.disconnect === 'function') window.__tvExtraGlobalMO.disconnect(); delete window.__tvExtraGlobalMO; const s = document.getElementById(STYLE_ID); if (s) s.remove(); } catch (e) {} }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
```

})();

// -------------------------
// Base TVSearch module
// -------------------------
(function () {
const SENTINEL = '**TV_SEARCH**';
if (window[SENTINEL]) return;
window[SENTINEL] = true;

```
const ns = { debounceMs: (window.tvConfig && window.tvConfig.debounceMs) || 250, pageSize: (window.tvConfig && window.tvConfig.pageSize) || 200 };

function log() { try { if (console && console.log) console.log.apply(console, ['[tv-search]'].concat(Array.from(arguments))); } catch (_) {} }

function scriptBasePath() {
  try {
    const sel = document.querySelector('script[src*="script.js"], script[src*="/assets/script.js"]');
    if (sel && sel.src) return sel.src.replace(/script\.js(\?.*)?$/, '');
    const sAll = document.getElementsByTagName('script');
    for (let i = sAll.length - 1; i >= 0; i--) {
      const src = sAll[i].src || '';
      if (src.indexOf('/assets/') !== -1 && src.indexOf('script') !== -1) return src.replace(/script\.js(\?.*)?$/, '');
    }
  } catch (e) { }
  return (location.origin + (location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1) || '/'));
}

const BASE = scriptBasePath();
const INDEX_URL = (document.body && document.body.getAttribute('data-index-url')) || (BASE + 'tables_index.json');
const WORKER_URL = (document.body && document.body.getAttribute('data-worker-url')) || (BASE + 'worker.js');

// shared state exposed to advanced module
const shared = window.TVSearch && window.TVSearch._shared ? window.TVSearch._shared : {};
shared.worker = shared.worker || null;
shared.indexData = shared.indexData || null;
shared.indexLoaded = !!shared.indexLoaded;
window.TVSearch = window.TVSearch || {};
window.TVSearch._shared = shared;

let localWorker = null; // local alias

function safeFetchJson(url) {
  return fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('fetch failed: ' + r.status); return r.json(); });
}

function attachWorker(w) {
  try {
    if (!w) return;
    localWorker = w;
    shared.worker = w;
    w.onmessage = function (ev) {
      const d = ev.data || {};
      try {
        // handle both legacy and current worker message formats
        if (d.type === 'index-ack' || (d.type === 'status' && d.status === 'indexed')) {
          shared.indexLoaded = true;
          log('worker index ack');
        } else if (d.type === 'results' || d.type === 'searchResults') {
          // detailed worker event
          try { document.dispatchEvent(new CustomEvent('tv:search:worker', { detail: d })); } catch (_) {}
          // generic results event
          try { document.dispatchEvent(new CustomEvent('tv:search:results', { detail: { results: d.results || [], meta: d } })); } catch (_) {}
          // base rendering path: if not intercepted by advanced, render
          try { if (!window.TVSearch._adv || !window.TVSearch._adv.isActive) renderResults(d.results || []); } catch (_) { renderResults(d.results || []); }
        } else if (d.type === 'status') {
          // forward generic status
          try { document.dispatchEvent(new CustomEvent('tv:search:status', { detail: d })); } catch (_) {}
        }
      } catch (e) { log('worker message handler error', e); }
    };
    w.onerror = function (err) { log('worker error', err && err.message ? err.message : err); try { w.terminate(); } catch (_) { } shared.worker = null; localWorker = null; };
  } catch (e) { try { console.warn('attachWorker failed', e); } catch (_) {} }
}

function initWorkerWithIndex(idx) {
  if (!window.Worker) return false;
  try {
    if (localWorker) try { localWorker.terminate(); } catch (_) {}
    const w = new Worker(WORKER_URL);
    attachWorker(w);
    // worker expects 'tables' property for indexing payload
    w.postMessage({ type: 'index', tables: idx });
    return true;
  } catch (err) { log('worker init failed', err); try { if (localWorker) localWorker.terminate(); } catch (_) {} shared.worker = null; localWorker = null; return false; }
}

function fallbackDomSearch(q) {
  try {
    const needle = (q || '').trim().toLowerCase();
    if (!needle) return deliverResults([]);
    const results = [];
    const tables = document.querySelectorAll('table');
    tables.forEach((t, ti) => {
      const rows = t.querySelectorAll('tr');
      rows.forEach((r, ri) => {
        const txt = (r.textContent || '').toLowerCase();
        if (txt.indexOf(needle) !== -1) {
          results.push({ html: r.innerHTML, tableIndex: ti, rowIndex: ri, score: 1 });
        }
      });
    });
    deliverResults(results);
  } catch (e) { log('fallbackDomSearch failed', e); deliverResults([]); }
}

function inMemorySearch(q) {
  const needle = (q || '').trim().toLowerCase();
  if (!needle) return deliverResults([]);
  try {
    const out = (shared.indexData || []).filter(it => {
      const s = ((it.summary || '') + ' ' + (it.notes || '')).toLowerCase();
      return s.indexOf(needle) !== -1;
    }).map(it => ({ item: it, score: 1, html: it.html }));
    deliverResults(out);
  } catch (e) { log('inMemorySearch failed', e); deliverResults([]); }
}

function deliverResults(results) {
  try { document.dispatchEvent(new CustomEvent('tv:search:results', { detail: { results: results } })); } catch (e) { }
  renderResults(results);
}

function renderResults(results) {
  try {
    const container = document.querySelector('#tv-results') || document.querySelector('.tv-results');
    if (!container) return;
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    const slice = (results || []).slice(0, ns.pageSize);
    slice.forEach(r => {
      const node = document.createElement('div');
      node.className = 'tv-result';
      if (r && r.html) node.innerHTML = r.html;
      else if (r && r.item && r.item.summary) node.innerHTML = '<strong>' + escapeHtml(r.item.summary) + '</strong><div>' + escapeHtml(r.item.notes || '') + '</div>';
      else node.textContent = typeof r === 'string' ? r : JSON.stringify(r);
      frag.appendChild(node);
    });
    container.appendChild(frag);
    const countNode = document.querySelector('#tv-results-count') || document.querySelector('.tv-results-count');
    if (countNode) countNode.textContent = (results && results.length) || 0;
    announce((results && results.length) || 0);
  } catch (e) { log('renderResults failed', e); }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]); }); }
function announce(n) {
  try {
    let aria = document.getElementById('tv-results-aria');
    if (!aria) {
      aria = document.createElement('div');
      aria.id = 'tv-results-aria';
      aria.setAttribute('aria-live', 'polite');
      aria.style.position = 'absolute';
      aria.style.left = '-9999px';
      aria.style.height = '1px';
      aria.style.overflow = 'hidden';
      document.body.appendChild(aria);
    }
    aria.textContent = n + ' results';
  } catch (e) { }
}

function debounce(fn, ms) { let t; return function () { const args = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, args); }, ms || 250); }; }

// base search function exposed to page. Advanced may override this with enhanced implementation.
function baseSearch(q) {
  try {
    if (shared.worker && shared.indexLoaded) { try { shared.worker.postMessage({ type: 'search', query: q }); return; } catch (e) { /* fallthrough */ } }
    if (shared.indexData) { inMemorySearch(q); return; }
    fallbackDomSearch(q);
  } catch (e) { log('baseSearch error', e); }
}

// bind input handlers
function bindSearchInput() {
  try {
    const selectors = ['#searchBox', '.tv-search input', 'input[type="search"]', 'input[name="q"]'];
    let input = null;
    for (const s of selectors) { input = document.querySelector(s); if (input) break; }
    if (!input) { log('no search input found'); return; }
    const handler = debounce(function (e) {
      const q = (e && e.target && e.target.value) ? e.target.value : (typeof e === 'string' ? e : '');
      try { baseSearch(q); } catch (e) { fallbackDomSearch(q); }
      try {
        const u = new URL(location);
        if (q) u.searchParams.set('q', q); else u.searchParams.delete('q');
        history.replaceState(null, '', u);
      } catch (e) { }
    }, ns.debounceMs);
    input.addEventListener('input', handler, { passive: true });
    input.addEventListener('keyup', function (e) { if (e.key === 'Enter') baseSearch(input.value); }, { passive: true });
    try {
      const params = new URLSearchParams(location.search);
      if (params.has('q') && !input.value) { input.value = params.get('q'); input.dispatchEvent(new Event('input')); }
    } catch (e) { }
  } catch (e) { log('bindSearchInput failed', e); }
}

// init: load index then bind
safeFetchJson(INDEX_URL).then(idx => {
  shared.indexData = idx;
  log('index loaded', Array.isArray(idx) ? idx.length : typeof idx);
  if (!initWorkerWithIndex(idx)) {
    log('worker unavailable or failed; index will be used in-memory');
    shared.indexLoaded = true;
  }
}).catch(err => {
  log('index not found or failed to load', err);
}).finally(() => { bindSearchInput(); });

// expose minimal API
window.TVSearch = window.TVSearch || {};
window.TVSearch.search = baseSearch;
window.TVSearch.start = bindSearchInput;
window.TVSearch.stop = function () { /* no-op for compatibility */ };
window.TVSearch._initWorker = initWorkerWithIndex;
// shared is available at window.TVSearch._shared
```

})();

// -------------------------
// Advanced TVSearch module (namespace-isolated, safe)
// -------------------------
(function () {
const SENTINEL2 = '**TV_SEARCH_ADV**';
if (window[SENTINEL2]) return;
window[SENTINEL2] = true;

```
const cfg = window.tvConfig || {};
const MODE_KEY = 'tv:search:mode';
const DEFAULT_MODE = cfg.defaultMode || 'fuzzy';
const FUSE_CDN = cfg.fuseCdn || 'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js';
const XLSX_PATH = cfg.xlsxPath || (location.origin + '/assets/xlsx.full.min.js');
const VBUFFER = cfg.virtualBuffer || 5;

// adv state stored on window.TVSearch._adv
window.TVSearch = window.TVSearch || {};
const adv = window.TVSearch._adv = window.TVSearch._adv || {};
adv.isActive = true;

// reuse shared state from base module
const shared = window.TVSearch._shared || { worker: null, indexData: null, indexLoaded: false };

let fuseLib = null;
let useFuse = (localStorage.getItem(MODE_KEY) || DEFAULT_MODE) === 'fuzzy';
let lastQueryId = 0;
let pending = new Map();
let metrics = { searches: 0, lastQuery: null, lastTimeMs: 0, lastCount: 0 };

function log2() { try { if (console && console.log) console.log.apply(console, ['[tv-search-adv]'].concat(Array.from(arguments))); } catch (_) {} }

function loadFuseIfNeeded() {
  if (!useFuse || fuseLib) return Promise.resolve();
  if (window.Fuse) { fuseLib = window.Fuse; return Promise.resolve(); }
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = FUSE_CDN;
    s.async = true;
    s.onload = function () { try { fuseLib = window.Fuse; res(); } catch (e) { rej(e); } };
    s.onerror = function (e) { log2('failed to load fuse', e); rej(e); };
    document.head.appendChild(s);
  });
}

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]); }); }

function highlightHtml(text, q) {
  if (!q) return escapeHtml(text);
  const parts = q.trim().split(/\s+/).filter(Boolean).map(p => escapeRegExp(p));
  if (!parts.length) return escapeHtml(text);
  const re = new RegExp('(' + parts.join('|') + ')', 'ig');
  return escapeHtml(text).replace(re, '<mark class="tv-hl">$1</mark>');
}

function deliverResultsEnhanced(results, meta) {
  try {
    const container = document.querySelector('#tv-results') || document.querySelector('.tv-results');
    try { document.dispatchEvent(new CustomEvent('tv:search:results', { detail: { results: results, meta } })); } catch (_) {}
    if (!container) return;
    if (meta && meta.partial) appendResultNodes(container, results, meta);
    else renderVirtualized(container, results, meta);
  } catch (e) { log2('deliverResultsEnhanced failed', e); }
}

function appendResultNodes(container, results, meta) {
  try {
    const q = meta && meta.q;
    results.forEach(r => {
      const node = document.createElement('div');
      node.className = 'tv-result';
      if (r.item) {
        node.innerHTML = '<div class="tv-summary">' + highlightHtml(r.item.summary || '', q) + '</div>' +
          '<div class="tv-notes">' + highlightHtml(r.item.notes || '', q) + '</div>';
        node.dataset.id = r.item.id || '';
      } else if (r.html) node.innerHTML = r.html;
      else node.textContent = JSON.stringify(r);
      container.appendChild(node);
    });
  } catch (e) { log2('appendResultNodes failed', e); }
}

// lightweight virtualized renderer
function renderVirtualized(container, results, meta) {
  container._tv_full_results = results || [];
  container.innerHTML = '';
  let viewport = container.querySelector('.tv-viewport');
  if (!viewport) {
    viewport = document.createElement('div');
    viewport.className = 'tv-viewport';
    viewport.style.position = 'relative';
    viewport.style.height = container.style.height || '480px';
    viewport.style.overflow = 'auto';
    container.appendChild(viewport);
  } else viewport.innerHTML = '';

  const sampleHeight = 40;
  const total = (results || []).length;
  const spacer = document.createElement('div');
  spacer.className = 'tv-spacer';
  spacer.style.height = (total * sampleHeight) + 'px';
  viewport.appendChild(spacer);

  function renderWindow() {
    const scrollTop = viewport.scrollTop;
    const vh = viewport.clientHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / sampleHeight) - VBUFFER);
    const endIndex = Math.min(total, Math.ceil((scrollTop + vh) / sampleHeight) + VBUFFER);
    let windowEl = viewport.querySelector('.tv-window');
    if (!windowEl) {
      windowEl = document.createElement('div');
      windowEl.className = 'tv-window';
      windowEl.style.position = 'absolute';
      viewport.appendChild(windowEl);
    }
    windowEl.style.top = (startIndex * sampleHeight) + 'px';
    windowEl.innerHTML = '';
    const q = meta && meta.q;
    for (let i = startIndex; i < endIndex; i++) {
      const r = results[i];
      const node = document.createElement('div');
      node.className = 'tv-result';
      node.style.height = sampleHeight + 'px';
      if (r && r.item) {
        node.innerHTML = '<div class="tv-summary">' + highlightHtml(r.item.summary || '', q) + '</div>' +
          '<div class="tv-notes">' + highlightHtml(r.item.notes || '', q) + '</div>';
        node.dataset.index = i;
      } else if (r && r.html) node.innerHTML = r.html;
      else node.textContent = JSON.stringify(r);
      windowEl.appendChild(node);
    }
    const countNode = document.querySelector('#tv-results-count') || document.querySelector('.tv-results-count');
    if (countNode) countNode.textContent = total;
  }

  if (!viewport._tv_scroll_bound) {
    viewport.addEventListener('scroll', throttle(renderWindow, 80));
    viewport._tv_scroll_bound = true;
  }
  renderWindow();
  setupKeyboardNav(container);
}

function throttle(fn, ms) { let busy = false; return function () { if (busy) return; busy = true; setTimeout(() => { busy = false; fn.apply(null, arguments); }, ms); }; }

function setupKeyboardNav(container) {
  if (container._tv_nav_bound) return;
  const viewport = container.querySelector('.tv-viewport') || container;
  let idx = -1;
  function focusIndex(i) {
    const full = container._tv_full_results || [];
    const total = full.length;
    if (i < 0) i = 0;
    if (i >= total) i = total - 1;
    idx = i;
    const node = viewport.querySelector('[data-index="' + i + '"]');
    if (node) {
      try { node.focus && node.focus(); } catch (_) {}
      viewport.querySelectorAll('.tv-result.selected').forEach(n => n.classList.remove('selected'));
      try { node.classList.add('selected'); } catch (_) {}
    }
  }
  document.addEventListener('keydown', function (e) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx === -1 ? 0 : idx + 1); focusIndex(idx); }
      if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx === -1 ? 0 : idx - 1); focusIndex(idx); }
      if (e.key === 'Enter') { e.preventDefault(); const full = container._tv_full_results || []; const item = full[idx]; if (item) dispatchActivate(item); }
    }
  }, { passive: true });
  container._tv_nav_bound = true;
}

function dispatchActivate(item) { try { document.dispatchEvent(new CustomEvent('tv:search:activate', { detail: item })); } catch (_) { } }

// apply simple filters by data-filter-* attributes on body
function applyFilters(results) {
  try {
    const body = document.body;
    if (!body) return results;
    const filters = {};
    Array.prototype.slice.call(body.attributes).forEach(attr => {
      if (attr.name.indexOf('data-filter-') === 0) {
        const k = attr.name.replace('data-filter-', '');
        filters[k] = attr.value;
      }
    });
    if (Object.keys(filters).length === 0) return results;
    return results.filter(r => {
      const it = r.item || r;
      for (const k in filters) {
        const v = (it[k] || '').toString();
        if (!v.includes(filters[k])) return false;
      }
      return true;
    });
  } catch (e) { log2('applyFilters failed', e); return results; }
}

// export results using lazy SheetJS
function exportResults(format) {
  const container = document.querySelector('#tv-results') || document.querySelector('.tv-results');
  const data = (container && container._tv_full_results) || [];
  if (!data.length) return Promise.resolve(false);
  if (window.XLSX) return Promise.resolve(doExport(window.XLSX, data, format));
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = XLSX_PATH;
    s.onload = () => { if (window.XLSX) res(doExport(window.XLSX, data, format)); else rej('xlsx absent'); };
    s.onerror = (e) => { log2('xlsx load failed', e); rej(e); };
    document.head.appendChild(s);
  });
}

function doExport(XLSX, data, format) {
  try {
    const aoa = data.map(r => {
      const it = r.item || r;
      return [it.summary || '', it.notes || ''];
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    const wbout = XLSX.write(wb, { bookType: format || 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tv-results.' + (format || 'xlsx');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch (e) { log2('doExport failed', e); return false; }
}

// wire worker events from base module to advanced deliver
document.addEventListener('tv:search:worker', function (e) {
  try {
    const d = e && e.detail ? e.detail : {};
    // forward to advanced renderer if adv is active
    if (!d) return;
    // d should contain results, qid, q, partial flags if worker supports streaming
    deliverResultsEnhanced(d.results || [], { q: d.q, qid: d.qid, partial: !!d.partial });
  } catch (err) { log2('tv:search:worker handler failed', err); }
});

// advanced query implementation (overrides base search)
function query(q) {
  metrics.searches++;
  metrics.lastQuery = q;
  const qid = ++lastQueryId;
  pending.forEach((v, k) => { if (k !== qid && v.cancel) try { v.cancel(); } catch (_) { } pending.delete(k); });
  const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const onResults = (results, partial = false) => {
    metrics.lastTimeMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - start);
    metrics.lastCount = (results && results.length) || 0;
    deliverResultsEnhanced(results, { q, qid, partial });
  };

  const cancel = () => { try { if (shared.worker) shared.worker.postMessage({ type: 'cancel', qid }); } catch (_) { } };
  pending.set(qid, { cancel });

  // prefer worker if available
  if (shared.worker && shared.indexLoaded) {
    try { shared.worker.postMessage({ type: 'search', query: q, limit: 1000, requestId: qid, mode: useFuse ? 'fuzzy' : 'exact' }); } catch (e) { log2('post to worker failed', e); }
    return qid;
  }

  // in-memory fuzzy via Fuse or substring exact
  (useFuse ? loadFuseIfNeeded().then(() => {
    try {
      if (!shared.indexData) { onResults([]); return; }
      const F = (typeof fuseLib === 'function' || typeof fuseLib === 'object') ? fuseLib : window.Fuse;
      const f = new F(shared.indexData, { keys: ['summary', 'notes'], includeScore: true, threshold: 0.4 });
      const out = f.search(q, { limit: 1000 }).map(r => ({ item: r.item, score: 1 / (1 + (r.score || 0)) }));
      onResults(applyFilters(out));
    } catch (e) { log2('fuse search failed', e); onResults([]); }
  }) : Promise.resolve().then(() => {
    const needle = (q || '').toLowerCase();
    if (!needle) { onResults([]); return; }
    const out = (shared.indexData || []).filter(it => ((it.summary || '') + ' ' + (it.notes || '')).toLowerCase().includes(needle)).map(it => ({ item: it, score: 1 }));
    onResults(applyFilters(out));
  })).catch(err => { log2('in-memory search path failed', err); onResults([]); });

  return qid;
}

// UI controls for mode and export
function bindUiControls() {
  try {
    const modeBtn = document.querySelector('#tv-toggle-mode') || document.querySelector('.tv-toggle-mode');
    if (modeBtn) {
      modeBtn.addEventListener('click', function () {
        window.TVSearch.setMode(useFuse ? 'exact' : 'fuzzy');
        modeBtn.textContent = useFuse ? 'Exact' : 'Fuzzy';
      }, { passive: true });
      modeBtn.textContent = useFuse ? 'Fuzzy' : 'Exact';
    }
    const expBtn = document.querySelector('#tv-export') || document.querySelector('.tv-export');
    if (expBtn) {
      expBtn.addEventListener('click', function () { exportResults('xlsx').catch(e => log2('export failed', e)); }, { passive: true });
    }
  } catch (e) { log2('bindUiControls failed', e); }
}

// expose adv API under TVSearch
window.TVSearch = window.TVSearch || {};
Object.assign(window.TVSearch, {
  setMode(m) { useFuse = (m === 'fuzzy'); localStorage.setItem(MODE_KEY, useFuse ? 'fuzzy' : 'exact'); },
  search(q) { return query(q); },
  exportResults(format) { return exportResults(format); },
  getMetrics() { return Object.assign({}, metrics); },
  useWorker() { return !!(shared.worker); }
});

// allow toggling worker creation by consumer
window.TVSearch.setWorkerMode = function (enabled) {
  if (!enabled && shared.worker) { try { shared.worker.terminate(); } catch (_) { } shared.worker = null; return; }
  if (enabled && !shared.worker && shared.indexData && window.TVSearch._initWorker) try { window.TVSearch._initWorker(shared.indexData); } catch (_) { }
};

// ensure minimal CSS for highlights
(function ensureStyle() {
  try {
    if (document.getElementById('tv-search-adv-style')) return;
    const s = document.createElement('style');
    s.id = 'tv-search-adv-style';
    s.textContent = '.tv-result{padding:6px 8px;border-bottom:1px solid rgba(0,0,0,0.04)} .tv-summary{font-weight:600} .tv-hl{background:yellow;color:inherit}';
    (document.head || document.documentElement).appendChild(s);
  } catch (_) { }
})();

// wire UI and warm-up
(function initAdvanced() {
  bindUiControls();
  if (cfg.preloadFuse) loadFuseIfNeeded().catch(() => { });
  // load index if base hasn't already populated shared.indexData
  if (!shared.indexData) {
    // attempt fetch same index URL as base if available
    try {
      const baseIndexUrl = (document.body && document.body.getAttribute('data-index-url')) || null;
      if (baseIndexUrl) {
        fetch(baseIndexUrl, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(idx => { if (idx) shared.indexData = idx; }).catch(() => { });
      }
    } catch (_) { }
  }
  const container = document.querySelector('#tv-results') || document.querySelector('.tv-results');
  if (container) container.setAttribute('role', 'list');
})();
```

})();

})();

// -------------------------
// tvDiagnostics — appended to extra.js
// -------------------------
;(function () {
'use strict';
if (window.tvDiagnostics) return;

const STYLE_ID = 'tv-diag-style-v1';
const BADGE_ID = 'tv-diag-badge-v1';
const PANEL_ID = 'tv-diag-panel-v1';

const issues = []; // { id, reason, tag, snippet, time, nodeRef }
const issueIndex = new Map(); // key -> entry
const nodeMap = new WeakMap(); // node -> synthetic id
let uidCounter = 1;
let badgeCreated = false;
let panelOpen = false;

function getSyntheticId(node) {
if (!node || node.nodeType !== 1) return null;
if (node.id) return node.id;
if (nodeMap.has(node)) return nodeMap.get(node);
const id = 'tvdiag-node-' + (uidCounter++);
nodeMap.set(node, id);
return id;
}

function snippetOf(node) {
try {
if (!node) return '';
const txt = (node.textContent || '').trim().replace(/\s+/g, ' ');
return txt.length > 120 ? txt.slice(0, 120) + '…' : txt;
} catch (e) { return ''; }
}

function makeKey(node, reason) {
const id = getSyntheticId(node) || ('tvdiag-null-' + reason);
return id + '|' + reason;
}

function injectStyle() {
if (document.getElementById(STYLE_ID)) return;
const s = document.createElement('style');
s.id = STYLE_ID;
s.textContent = `#${BADGE_ID} {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 999999;
  background: #ef4444;
  color: #fff;
  border: 0;
  border-radius: 999px;
  min-width: 44px;
  height: 44px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(15,23,42,0.18);
} #${BADGE_ID}.tv-diag--hidden { display: none !important; } #${BADGE_ID}:focus { outline: 3px solid rgba(59,130,246,0.24); outline-offset: 2px; } #${PANEL_ID} {
  position: fixed;
  right: 12px;
  bottom: 68px;
  z-index: 999999;
  width: 320px;
  max-height: 48vh;
  overflow: auto;
  background: #fff;
  color: #0f172a;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(2,6,23,0.2);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
  border: 1px solid rgba(2,6,23,0.06);
  padding: 8px;
} #${PANEL_ID} h4 { margin: 4px 0 8px; font-size: 13px; } #${PANEL_ID} .tv-diag-list { list-style: none; margin: 0; padding: 0; font-size: 13px; } #${PANEL_ID} .tv-diag-item { padding: 6px; border-bottom: 1px solid rgba(2,6,23,0.03); display:flex; align-items:flex-start; gap:8px; } #${PANEL_ID} .tv-diag-item .meta { flex: 1; } #${PANEL_ID} .tv-diag-item .meta .reason { font-weight:700; font-size:12px; color:#b91c1c; } #${PANEL_ID} .tv-diag-item .meta .tag { font-size:11px; color:#374151; margin-top:3px; display:block; } #${PANEL_ID} .tv-diag-item button { margin-left: 8px; } #${PANEL_ID} .tv-diag-actions { display:flex; gap:8px; margin-top:8px; } #${PANEL_ID} .tv-diag-actions button { flex:1; padding:8px; border-radius:6px; border:1px solid rgba(2,6,23,0.06); background:#f8fafc; cursor:pointer; }
@media (max-width:520px) {   #${PANEL_ID} { right: 8px; left: 8px; width: auto; bottom: 72px; max-height: 60vh; }
}`;
(document.head || document.documentElement).appendChild(s);
}

function createBadge() {
if (badgeCreated) return;
try {
injectStyle();
const btn = document.createElement('button');
btn.id = BADGE_ID;
btn.type = 'button';
btn.setAttribute('aria-haspopup', 'dialog');
btn.setAttribute('aria-expanded', 'false');
btn.title = 'Inline-block diagnostic';
btn.className = 'tv-diag--hidden';
const span = document.createElement('span');
span.className = 'tv-diag-count';
span.style.pointerEvents = 'none';
span.textContent = '0';
btn.appendChild(span);
btn.addEventListener('click', function (e) {
e.preventDefault();
togglePanel();
}, { passive: true });
document.body.appendChild(btn);
createPanel();
badgeCreated = true;
updateBadge();
} catch (e) {
// silent fallback
}
}

function createPanel() {
if (document.getElementById(PANEL_ID)) return;
try {
const p = document.createElement('div');
p.id = PANEL_ID;
p.setAttribute('role', 'dialog');
p.setAttribute('aria-label', 'Inline-block diagnostics');
p.style.display = 'none';
p.innerHTML = `         <h4>Inline-block issues</h4>         <ul class="tv-diag-list" aria-live="polite"></ul>         <div class="tv-diag-actions">           <button type="button" data-action="console">Open console</button>           <button type="button" data-action="restore">Restore all</button>           <button type="button" data-action="clear">Clear</button>         </div>
      `;
document.body.appendChild(p);
p.querySelector('[data-action="console"]').addEventListener('click', function () { consoleLogReport(); }, { passive: true });
p.querySelector('[data-action="restore"]').addEventListener('click', function () { restoreAll(); }, { passive: true });
p.querySelector('[data-action="clear"]').addEventListener('click', function () { clearIssues(); }, { passive: true });
} catch (e) { /* silent */ }
}

function updateBadge() {
try {
createBadge();
const btn = document.getElementById(BADGE_ID);
const panel = document.getElementById(PANEL_ID);
const count = issueIndex.size;
if (!btn) return;
const span = btn.querySelector('.tv-diag-count');
if (span) span.textContent = String(count || 0);
if (count === 0) btn.classList.add('tv-diag--hidden');
else btn.classList.remove('tv-diag--hidden');
if (panel) renderPanelList();
} catch (e) { /* silent */ }
}

function renderPanelList() {
try {
const panel = document.getElementById(PANEL_ID);
if (!panel) return;
const list = panel.querySelector('.tv-diag-list');
list.innerHTML = '';
const arr = Array.from(issueIndex.values()).slice(0, 200);
if (arr.length === 0) {
const li = document.createElement('li');
li.className = 'tv-diag-item';
li.textContent = 'No issues detected.';
list.appendChild(li);
return;
}
arr.forEach(entry => {
const li = document.createElement('li');
li.className = 'tv-diag-item';
const meta = document.createElement('div');
meta.className = 'meta';
const reason = document.createElement('div');
reason.className = 'reason';
reason.textContent = entry.reason;
const tag = document.createElement('div');
tag.className = 'tag';
tag.textContent = (entry.tag ? entry.tag + ' ' : '') + (entry.id ? '[' + entry.id + ']' : '') + (entry.snippet ? ' — ' + entry.snippet : '');
meta.appendChild(reason);
meta.appendChild(tag);
li.appendChild(meta);

```
    const btnRestore = document.createElement('button');
    btnRestore.type = 'button';
    btnRestore.textContent = 'Restore';
    btnRestore.addEventListener('click', function () {
      try { restoreNode(entry.nodeRef); removeEntry(entry); } catch (e) { /* silent */ }
    }, { passive: true });

    const btnLog = document.createElement('button');
    btnLog.type = 'button';
    btnLog.textContent = 'Log';
    btnLog.addEventListener('click', function () {
      try { console.log('[tvDiagnostics] entry detail', entry); } catch (e) { /* silent */ }
    }, { passive: true });

    const btns = document.createElement('div');
    btns.style.display = 'flex';
    btns.style.flexDirection = 'column';
    btns.style.gap = '6px';
    btns.appendChild(btnRestore);
    btns.appendChild(btnLog);
    li.appendChild(btns);

    list.appendChild(li);
  });
} catch (e) { /* silent */ }
```

}

function togglePanel() {
try {
const panel = document.getElementById(PANEL_ID);
const btn = document.getElementById(BADGE_ID);
if (!panel || !btn) return;
panelOpen = !panelOpen;
panel.style.display = panelOpen ? 'block' : 'none';
btn.setAttribute('aria-expanded', panelOpen ? 'true' : 'false');
if (panelOpen) {
renderPanelList();
}
} catch (e) { /* silent */ }
}

function addIssue(node, reason, details) {
try {
if (!node && !details) return null;
const key = makeKey(node, reason);
if (issueIndex.has(key)) return issueIndex.get(key);
const entry = {
key,
id: getSyntheticId(node),
reason: reason || 'unknown',
tag: node && node.tagName ? node.tagName.toLowerCase() : null,
snippet: snippetOf(node),
time: new Date().toISOString(),
details: details || null,
nodeRef: node || null
};
issues.push(entry);
issueIndex.set(key, entry);
updateBadge();
return entry;
} catch (e) { return null; }
}

function removeEntry(entry) {
try {
if (!entry) return;
if (issueIndex.has(entry.key)) issueIndex.delete(entry.key);
const idx = issues.indexOf(entry);
if (idx !== -1) issues.splice(idx, 1);
updateBadge();
} catch (e) { /* silent */ }
}

function logNodeIssue(node, reason, details) {
try {
const entry = addIssue(node, reason, details);
if (entry) {
try { console.warn('[tvDiagnostics] issue logged', { id: entry.id, reason: entry.reason, snippet: entry.snippet }); } catch (_) {}
}
return entry;
} catch (e) { return null; }
}

function forceInlineBlock(node, reason) {
try {
if (!node || node.nodeType !== 1) return false;
if (node.dataset && node.dataset.tvDiagPrevDisplay === undefined) {
try { node.dataset.tvDiagPrevDisplay = node.style && node.style.display ? node.style.display : ''; } catch (*) {}
}
try { node.style.display = 'inline-block'; } catch (*) {}
try { node.classList.add && node.classList.add('tv-inline--repair'); } catch (_) {}
return !!addIssue(node, reason || 'forced-inline-block');
} catch (e) { return false; }
}

function restoreNode(node) {
try {
if (!node || node.nodeType !== 1) return false;
try {
if (node.dataset && typeof node.dataset.tvDiagPrevDisplay !== 'undefined') {
node.style.display = node.dataset.tvDiagPrevDisplay || '';
try { delete node.dataset.tvDiagPrevDisplay; } catch (*) { node.removeAttribute('data-tv-diag-prev-display'); }
} else {
// remove inline style only if it was our repair class
if ((node.classList && node.classList.contains('tv-inline--repair')) || node.style.display === 'inline-block') {
node.style.display = '';
}
}
} catch (*) {}
try { node.classList && node.classList.remove('tv-inline--repair'); } catch (_) {}
return true;
} catch (e) { return false; }
}

function restoreAll() {
try {
Array.from(issueIndex.values()).forEach(entry => {
try { if (entry && entry.nodeRef) restoreNode(entry.nodeRef); } catch (_) {}
});
clearIssues();
updateBadge();
} catch (e) { /* silent */ }
}

function clearIssues() {
try {
issues.length = 0;
issueIndex.clear();
updateBadge();
} catch (e) { /* silent */ }
}

function consoleLogReport() {
try {
if (issues.length === 0) {
console.log('[tvDiagnostics] No issues.');
return;
}
console.group('[tvDiagnostics] Inline-block issues summary (' + issues.length + ')');
issues.forEach(i => {
console.log('Issue:', i.reason, 'id:', i.id, 'tag:', i.tag, i.snippet ? ('snippet: ' + i.snippet) : '', i.nodeRef || {});
});
console.groupEnd();
} catch (e) { /* silent */ }
}

function reportSummary() {
try {
const out = Array.from(issueIndex.values()).map(e => ({ id: e.id, reason: e.reason, tag: e.tag, snippet: e.snippet, time: e.time }));
console.table(out);
return out;
} catch (e) { return []; }
}

function getIssues() {
try { return Array.from(issueIndex.values()).slice(); } catch (e) { return []; }
}

// Auto-create badge when first issue is added, or when explicitly enabled
const originalAddIssue = addIssue;
function wrappedAddIssue(node, reason, details) {
const entry = originalAddIssue(node, reason, details);
try { if (entry) createBadge(); } catch (_) {}
return entry;
}

// export API
window.tvDiagnostics = {
logNodeIssue: function (node, reason, details) { return logNodeIssue(node, reason, details); },
forceInlineBlock: function (node, reason) { return forceInlineBlock(node, reason); },
restoreNode: function (node) { return restoreNode(node); },
restoreAll: function () { return restoreAll(); },
reportSummary: function () { return reportSummary(); },
getIssues: function () { return getIssues(); },
clearIssues: function () { return clearIssues(); },
openPanel: function () { try { createBadge(); panelOpen = true; const p = document.getElementById(PANEL_ID); if (p) p.style.display = 'block'; const b = document.getElementById(BADGE_ID); if (b) b.setAttribute('aria-expanded', 'true'); renderPanelList(); } catch (*) {} },
closePanel: function () { try { panelOpen = false; const p = document.getElementById(PANEL_ID); if (p) p.style.display = 'none'; const b = document.getElementById(BADGE_ID); if (b) b.setAttribute('aria-expanded', 'false'); } catch (*) {} },
enableBadge: function () { try { createBadge(); updateBadge(); } catch (*) {} },
disableBadge: function () { try { const b = document.getElementById(BADGE_ID); if (b) b.remove(); const p = document.getElementById(PANEL_ID); if (p) p.remove(); const s = document.getElementById(STYLE_ID); if (s) s.remove(); badgeCreated = false; } catch (*) {} }
};

// Ensure tvDiagnostics created after DOM ready (no-op listener)
try {
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', function () { /* noop */ }, { once: true });
}
} catch (e) { /* noop */ }

// final no-op return
return;
})();
