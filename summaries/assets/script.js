/* script.js — revised for performance and defensive hardening
   - Maintains all external globals and function names.
   - Optimizes DOM queries, caching, and highlight work.
   - Preserves behavior, signatures, and UX.
   - Reviewed for safety; keep backups before replacing.
*/
(function () {
  'use strict';

  // -----------------------------
  // Minimal helpers (consolidated)
  // -----------------------------
  const d = document;
  const w = window;
  const noop = function () { };
  const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };
  const isString = (x) => typeof x === 'string';
  const q = (sel, root = d) => safe(() => root.querySelector(sel), null);
  const qa = (sel, root = d) => safe(() => Array.from(root.querySelectorAll(sel)), []);
  const once = (fn) => {
    let called = false;
    return function () { if (called) return; called = true; try { fn(); } catch (e) { /* silent */ } };
  };
  const rIC = w.requestIdleCallback ? w.requestIdleCallback.bind(w) : (cb) => setTimeout(cb, 50);

  // -----------------------------
  // Public config and API (unchanged names)
  // -----------------------------
  const defaultConfig = { highlight: true, debounceMs: 150, chunkSize: 300 };
  w.tvConfig = w.tvConfig || {};
  Object.assign(w.tvConfig, defaultConfig);

  w.setTvSearchConfig = function (cfg) {
    try {
      if (!cfg || typeof cfg !== 'object') return;
      if (typeof cfg.highlight === 'boolean') w.tvConfig.highlight = cfg.highlight;
      if (typeof cfg.debounceMs === 'number') w.tvConfig.debounceMs = Math.max(0, cfg.debounceMs);
      if (typeof cfg.chunkSize === 'number') w.tvConfig.chunkSize = Math.max(50, cfg.chunkSize);
    } catch (e) { /* silent */ }
  };

  // -----------------------------
  // URL helpers
  // -----------------------------
  function joinUrl(base, rel) {
    try {
      if (!base) return rel;
      return new URL(rel, base).href;
    } catch (e) {
      if (!base) return rel;
      return (base.replace(/\/?$/, '/') + rel.replace(/^\//, ''));
    }
  }

  // -----------------------------
  // Robust base-path detection (unchanged semantics)
  // -----------------------------
  function detectScriptBase() {
    let src = safe(() => d.currentScript && d.currentScript.src) || '';
    if (isString(src) && src) return src.replace(/[^\/]*$/, '');
    try {
      const scripts = d.getElementsByTagName('script');
      for (let i = scripts.length - 1; i >= 0; i--) {
        const ssrc = scripts[i].src || '';
        if (!ssrc) continue;
        if (ssrc.indexOf('/assets/script.js') !== -1 || /(^|\/)script\.js(\?.*)?$/.test(ssrc)) {
          return ssrc.replace(/[^\/]*$/, '');
        }
      }
    } catch (e) { /* ignore */ }
    try {
      const loc = location;
      return loc.origin + loc.pathname.substring(0, loc.pathname.lastIndexOf('/') + 1 || '/');
    } catch (e) { return '/'; }
  }

  const TV_BASE = detectScriptBase();
  w.__tv_base = w.__tv_base || TV_BASE;

  // -----------------------------
  // Ensure index / worker attrs
  // -----------------------------
  function ensureIndexAndWorkerAttrs(base) {
    try {
      if (!d.body) {
        d.addEventListener('DOMContentLoaded', function bound() {
          d.removeEventListener('DOMContentLoaded', bound);
          ensureIndexAndWorkerAttrs(base);
        });
        return;
      }
      const existingIndex = d.body.getAttribute('data-index-url');
      const existingWorker = d.body.getAttribute('data-worker-url');
      const defaultIndex = joinUrl(base, 'tables_index.json');
      const defaultWorker = joinUrl(base, 'worker.js');
      if (!existingIndex || existingIndex.trim() === '') {
        try { d.body.setAttribute('data-index-url', defaultIndex); } catch (e) {}
      }
      if (!existingWorker || existingWorker.trim() === '') {
        try { d.body.setAttribute('data-worker-url', defaultWorker); } catch (e) {}
      }
      w.tvIndexUrl = w.tvIndexUrl || d.body.getAttribute('data-index-url') || defaultIndex;
      w.tvWorkerUrl = w.tvWorkerUrl || d.body.getAttribute('data-worker-url') || defaultWorker;
    } catch (e) { /* silent */ }
  }
  ensureIndexAndWorkerAttrs(TV_BASE);

  // -----------------------------
  // Extra.js loader (sequential) — kept behavior
  // -----------------------------
  function createScriptElement(src, opts) {
    opts = opts || {};
    const s = d.createElement('script');
    s.src = src;
    s.async = !!opts.async;
    s.defer = !!opts.defer;
    if (opts.type) s.type = opts.type;
    if (opts.crossorigin) s.crossOrigin = opts.crossorigin;
    return s;
  }

  function loadExtraSequentially(possiblePaths, onDone, onAllFailed) {
    if (!possiblePaths || possiblePaths.length === 0) { if (onAllFailed) onAllFailed(); return; }
    const parent = d.head || d.getElementsByTagName('head')[0] || d.documentElement || d.body;
    let idx = 0;
    function tryNext() {
      if (idx >= possiblePaths.length) {
        if (onAllFailed) onAllFailed();
        return;
      }
      const path = possiblePaths[idx++];
      try {
        const s = createScriptElement(path, { async: false });
        s.onload = once(function () {
          try { if (console && console.info) console.info('tv:extra loaded ->', path); } catch (_) {}
          if (onDone) onDone(path);
        });
        s.onerror = function () { try { s.remove(); } catch (_) {} setTimeout(tryNext, 20); };
        parent.appendChild(s);
      } catch (e) { setTimeout(tryNext, 20); }
    }
    tryNext();
  }

  const extraCandidates = [
    joinUrl(TV_BASE, 'extra.js'),
    joinUrl(TV_BASE, 'assets/extra.js'),
    'assets/extra.js',
    '/assets/extra.js',
    'extra.js'
  ];

  function startExtraLoader() {
    try {
      if (w._tv_extra_loader_attached || w.tvExtra || d.querySelector('script[src*="extra.js"]')) {
        try { if (console && console.info) console.info('tv:extra already present or loader attached; skipping'); } catch (_) {}
        return;
      }
      w._tv_extra_loader_attached = true;
      loadExtraSequentially(extraCandidates, function () { }, function () {
        try { if (console && console.warn) console.warn('tv:extra loader: all candidate paths failed.'); } catch (_) {}
      });
    } catch (e) { /* silent */ }
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', function () { ensureIndexAndWorkerAttrs(TV_BASE); startExtraLoader(); });
  } else {
    ensureIndexAndWorkerAttrs(TV_BASE);
    startExtraLoader();
  }

  // -----------------------------
  // Early-hide Export Markdown CSS (reduces flicker)
  // -----------------------------
  try {
    const hideMdCss = `
/* tv early-hide export markdown */
.export-markdown-btn, .export-markdown, .export-markdown-table,
#exportMarkdownBtn, [data-action="export-markdown"],
button[data-format="md"], a[data-format="md"] { display: none !important; }
`;
    if (d.head) {
      const se = d.createElement('style');
      se.setAttribute('data-tv-early-hide-md', '1');
      se.appendChild(d.createTextNode(hideMdCss));
      d.head.appendChild(se);
    }
  } catch (e) { /* silent */ }

  // -----------------------------
  // Toasts & modal helpers (unchanged semantics)
  // -----------------------------
  let _toastQueue = [];
  let _activeToast = null;
  let _toastIdCounter = 0;

  function _ensureToastContainer() {
    try {
      let c = d.getElementById('tv-toast-container');
      if (c) return c;
      c = d.createElement('div');
      c.id = 'tv-toast-container';
      c.setAttribute('role', 'status');
      c.setAttribute('aria-live', 'polite');
      c.setAttribute('aria-atomic', 'true');
      Object.assign(c.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        alignItems: 'flex-end',
        pointerEvents: 'none',
        maxWidth: 'calc(100% - 48px)'
      });
      d.body.appendChild(c);
      return c;
    } catch (e) { return null; }
  }

  function _computeToastDuration(msg, type, optDuration) {
    try {
      if (typeof optDuration === 'number' && isFinite(optDuration) && optDuration >= 200) return Math.max(200, Math.floor(optDuration));
      const len = (msg || '').length || 0;
      let base = 1600;
      if (type === 'success') base = 1400;
      else if (type === 'warn') base = 2000;
      else if (type === 'error') base = 3600;
      const perChar = 40;
      let dur = base + Math.min(6000, len * perChar);
      dur = Math.max(900, Math.min(8000, dur));
      return dur;
    } catch (e) { return 2500; }
  }

  function showToast(msg, { duration = null, type = 'info' } = {}) {
    try {
      const id = ++_toastIdCounter;
      _toastQueue.push({ id, msg: String(msg || ''), duration, type });
      setTimeout(_processToastQueue, 0);
      return { id, dismiss: () => _dismissToastById(id) };
    } catch (e) { try { alert(String(msg || '')); } catch (_) {} return null; }
  }

  function _processToastQueue() {
    try {
      if (_activeToast) return;
      if (_toastQueue.length === 0) return;
      const item = _toastQueue.shift();
      const container = _ensureToastContainer();
      if (!container) { try { alert(item.msg); } catch (_) {} setTimeout(_processToastQueue, 0); return; }
      const el = d.createElement('div');
      el.className = 'tv-toast';
      el.setAttribute('data-toast-id', item.id);
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.tabIndex = -1;
      Object.assign(el.style, {
        background: (getComputedStyle(d.documentElement).getPropertyValue('--panel') || '#fff').trim(),
        color: (getComputedStyle(d.documentElement).getPropertyValue('--text') || '#111').trim(),
        padding: '8px 12px',
        borderRadius: '8px',
        boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
        opacity: '0',
        transform: 'translateY(6px)',
        transition: 'opacity .18s ease, transform .18s ease',
        pointerEvents: 'auto',
        maxWidth: '360px',
        wordBreak: 'normal',
        whiteSpace: 'pre-wrap',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      });
      if (item.type === 'success') { el.style.background = '#16a34a'; el.style.color = '#fff'; }
      else if (item.type === 'warn') { el.style.background = '#f59e0b'; el.style.color = '#fff'; }
      else if (item.type === 'error') { el.style.background = '#dc2626'; el.style.color = '#fff'; }
      const textWrap = d.createElement('div');
      textWrap.style.flex = '1 1 auto';
      textWrap.style.minWidth = '0';
      textWrap.textContent = item.msg;
      const closeBtn = d.createElement('button');
      closeBtn.type = 'button';
      closeBtn.ariaLabel = 'Dismiss notification';
      closeBtn.title = 'Dismiss';
      closeBtn.innerHTML = '✖';
      Object.assign(closeBtn.style, { border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '14px', lineHeight: '1', padding: '4px', margin: '0' });
      closeBtn.addEventListener('click', function (ev) { try { ev.stopPropagation(); } catch (_) {} _hideActiveToast(el, true); }, { passive: true });
      el.addEventListener('click', function () { _hideActiveToast(el, true); }, { passive: true });
      el.appendChild(textWrap);
      el.appendChild(closeBtn);
      container.appendChild(el);
      void el.offsetHeight;
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
      const timeoutMs = _computeToastDuration(item.msg, item.type, item.duration);
      const to = setTimeout(() => { _hideActiveToast(el, false); }, timeoutMs);
      _activeToast = { id: item.id, el, timeoutId: to };
      try {
        const prevActive = d.activeElement;
        if (container && typeof container.focus === 'function') {
          container.tabIndex = -1;
          container.focus({ preventScroll: true });
          setTimeout(() => { try { if (prevActive && typeof prevActive.focus === 'function') prevActive.focus({ preventScroll: true }); } catch (_) {} }, 60);
        }
      } catch (_) {}
    } catch (e) { /* silent */ }
  }

  function _hideActiveToast(el, manual) {
    try {
      if (!_activeToast || !_activeToast.el) {
        if (el && el.parentNode) el.remove();
        setTimeout(_processToastQueue, 100);
        return;
      }
      try { clearTimeout(_activeToast.timeoutId); } catch (_) {}
      try { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; } catch (_) {}
      setTimeout(() => {
        try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (_) {}
        _activeToast = null;
        setTimeout(_processToastQueue, 80);
      }, 220);
    } catch (e) { _activeToast = null; setTimeout(_processToastQueue, 80); }
  }

  function _dismissToastById(id) {
    try {
      if (_activeToast && _activeToast.id === id && _activeToast.el) { _hideActiveToast(_activeToast.el, true); return; }
      for (let i = 0; i < _toastQueue.length; i++) {
        if (_toastQueue[i].id === id) { _toastQueue.splice(i, 1); return; }
      }
    } catch (e) { /* silent */ }
  }

  // Copy modal (unchanged behavior)
  function showCopyModal(text, { title = 'Copy text' } = {}) {
    try {
      const existing = d.getElementById('tv-copy-modal');
      if (existing) existing.remove();
      const overlay = d.createElement('div');
      overlay.id = 'tv-copy-modal';
      Object.assign(overlay.style, { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.45)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' });
      const panel = d.createElement('div');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.tabIndex = -1;
      const rootStyles = getComputedStyle(d.documentElement);
      const panelBg = rootStyles.getPropertyValue('--panel') || '#fff';
      const textColor = rootStyles.getPropertyValue('--text') || '#111';
      Object.assign(panel.style, { background: panelBg.trim(), color: textColor.trim(), borderRadius: '8px', boxShadow: '0 12px 40px rgba(0,0,0,0.35)', maxWidth: 'min(90%,1000px)', width: '100%', maxHeight: '80vh', overflow: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' });
      const hdr = d.createElement('div');
      hdr.style.display = 'flex';
      hdr.style.justifyContent = 'space-between';
      hdr.style.alignItems = 'center';
      const h = d.createElement('strong');
      h.textContent = title || 'Copy';
      const closeBtn = d.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = 'Close';
      Object.assign(closeBtn.style, { marginLeft: '8px' });
      closeBtn.addEventListener('click', () => overlay.remove());
      hdr.appendChild(h);
      hdr.appendChild(closeBtn);
      const ta = d.createElement('textarea');
      ta.value = text || '';
      ta.readOnly = false;
      ta.style.width = '100%';
      ta.style.height = '320px';
      ta.style.resize = 'vertical';
      ta.style.whiteSpace = 'pre-wrap';
      ta.style.fontFamily = 'monospace, monospace';
      ta.style.fontSize = '13px';
      ta.setAttribute('aria-label', 'Copy text area');
      const controls = d.createElement('div');
      controls.style.display = 'flex';
      controls.style.gap = '8px';
      controls.style.justifyContent = 'flex-end';
      const selectBtn = d.createElement('button');
      selectBtn.type = 'button';
      selectBtn.textContent = 'Select All';
      selectBtn.addEventListener('click', () => { try { ta.focus(); ta.select(); } catch (_) {} });
      const copyBtn = d.createElement('button');
      copyBtn.type = 'button';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        copyToClipboard(ta.value).then(() => {
          showToast('Copied to clipboard', { type: 'success' });
          overlay.remove();
        }).catch(() => {
          showToast('Copy failed', { type: 'warn' });
        });
      });
      const downloadBtn = d.createElement('button');
      downloadBtn.type = 'button';
      downloadBtn.textContent = 'Download';
      downloadBtn.addEventListener('click', () => {
        try {
          const blob = new Blob([ta.value], { type: 'text/plain;charset=utf-8' });
          downloadBlob(blob, (title || 'export') + '.txt');
          showToast('Downloaded', { type: 'success' });
          overlay.remove();
        } catch (e) { showToast('Download failed', { type: 'warn' }); }
      });
      controls.appendChild(selectBtn);
      controls.appendChild(copyBtn);
      controls.appendChild(downloadBtn);
      panel.appendChild(hdr);
      panel.appendChild(ta);
      panel.appendChild(controls);
      overlay.appendChild(panel);
      d.body.appendChild(overlay);
      try { ta.focus(); ta.select(); } catch (_) {}
      return overlay;
    } catch (e) { try { alert(String(text || '')); } catch (_) {} return null; }
  }

  // Clipboard + download helpers (unchanged semantics)
  function copyToClipboard(text) {
    return new Promise((resolve, reject) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(resolve).catch(() => {
          tryLegacyCopy(text).then(resolve).catch(reject);
        });
        return;
      }
      tryLegacyCopy(text).then(resolve).catch(reject);
    });
  }
  function tryLegacyCopy(t) {
    return new Promise((resolve, reject) => {
      try {
        const ta = d.createElement('textarea');
        ta.value = t;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        d.body.appendChild(ta);
        ta.select();
        const ok = d.execCommand ? d.execCommand('copy') : document.execCommand('copy');
        d.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error('execCommand failed'));
      } catch (err) {
        try { console.warn('tv:copyToClipboard:legacy failed', err); } catch (_) {}
        reject(err);
      }
    });
  }
  function sanitizeFileName(name) {
    try {
      if (!name) return 'download';
      return String(name).trim().replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 200) || 'download';
    } catch (e) { return 'download'; }
  }
  function downloadBlob(blob, filename) {
    try {
      const url = URL.createObjectURL(blob);
      const a = d.createElement('a');
      a.href = url;
      a.download = sanitizeFileName(filename);
      d.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      try { console.error('downloadBlob failed', e); } catch (_) {}
      return false;
    }
  }

  // -----------------------------
  // DOM utilities used repeatedly
  // -----------------------------
  function getSearchEl() {
    return q('#searchBox') || q('#searchInput') || q('#search') || null;
  }
  function getTableFromButton(btn) {
    try {
      const wrapper = btn && (btn.closest('.table-wrapper') || btn.closest('.table-container') || btn.closest('[data-table-id]'));
      return wrapper ? wrapper.querySelector('table') : null;
    } catch (e) { return null; }
  }
  function safeGetTBody(table) {
    if (!table) return null;
    return (table.tBodies && table.tBodies[0]) || null;
  }

  // -----------------------------
  // Row UID snapshot logic (hardened)
  // -----------------------------
  let originalRowOrders = {}; // map tableKey -> [uids...]
  let _tv_row_uid_counter = 1;
  let sortStates = {}; // map tableKey -> [states...]

  // Create/get stable per-table key. Prefer data-table-id if present otherwise derive index key.
  function _tableKeyFor(table, idxFallback) {
    if (!table) return String(idxFallback || 0);
    const wrapper = table.closest && table.closest('.table-wrapper');
    const dataId = wrapper && wrapper.getAttribute && wrapper.getAttribute('data-table-id');
    if (dataId) return 'tid:' + dataId;
    if (table.id) return 'tableid:' + table.id;
    // fallback to index into current DOM at call time (best-effort)
    const tables = qa('.table-container table');
    const idx = tables.indexOf(table);
    if (idx !== -1) return 'idx:' + idx;
    return 'ref:' + (idxFallback || 0);
  }

  function _ensureRowUidsAndSnapshot(table, tableIdx) {
    try {
      const tbody = safeGetTBody(table) || table;
      if (!tbody) return;
      const rows = Array.from(tbody.rows || []);
      const key = _tableKeyFor(table, tableIdx);
      const order = [];
      rows.forEach((r) => {
        if (!r.dataset.tvUid) {
          r.dataset.tvUid = 'tvuid-' + (_tv_row_uid_counter++);
        }
        order.push(r.dataset.tvUid);
      });
      originalRowOrders[key] = order;
    } catch (e) { /* silent */ }
  }

  // Allow explicit rescan to recompute snapshots and sortStates (safe opt-in)
  function rescanSnapshots() {
    try {
      qa('.table-container table').forEach((table, idx) => {
        _ensureRowUidsAndSnapshot(table, idx);
        const key = _tableKeyFor(table, idx);
        sortStates[key] = Array(table.rows[0]?.cells.length || 0).fill(0);
      });
      try { updateRowCounts(); } catch (_) {}
    } catch (e) { /* silent */ }
  }
  // Expose opt-in API (non-invasive)
  w.tvRescanSnapshots = rescanSnapshots;

  // -----------------------------
  // Header sort UI update (kept same output)
  // -----------------------------
  function updateHeaderSortUIByTable(table, key) {
    try {
      if (!table || !table.tHead) return;
      const ths = table.tHead.rows[0].cells;
      for (let c = 0; c < ths.length; c++) {
        const btn = ths[c].querySelector('.sort-btn');
        if (!btn) continue;
        btn.classList.remove('sort-state-0', 'sort-state-1', 'sort-state-2');
        const state = (sortStates[key] && sortStates[key][c]) || 0;
        btn.classList.add('sort-state-' + state);
        if (state === 1) ths[c].setAttribute('aria-sort', 'ascending');
        else if (state === 2) ths[c].setAttribute('aria-sort', 'descending');
        else ths[c].setAttribute('aria-sort', 'none');
        const iconSpan = btn.querySelector('.sort-icon');
        if (iconSpan) {
          if (state === 0) {
            iconSpan.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14l5-5 5 5"></path><path d="M7 10l5 5 5-5"></path></svg>';
          } else if (state === 1) {
            iconSpan.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6"></path><path d="M5 12l7-7 7 7"></path></svg>';
          } else {
            iconSpan.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v13"></path><path d="M19 12l-7 7-7-7"></path></svg>';
          }
        }
      }
    } catch (e) { /* silent */ }
  }

  function updateHeaderSortUI(tableIdx) {
    try {
      const tables = qa('.table-container table');
      const table = tables[tableIdx];
      if (!table) return;
      const key = _tableKeyFor(table, tableIdx);
      updateHeaderSortUIByTable(table, key);
    } catch (e) { /* silent */ }
  }

  // -----------------------------
  // Sorting (preserve semantics)
  // - uses stable mapping to preserve IDs
  // - uses Intl.Collator if available for consistent localeCompare
  // -----------------------------
  const collator = (function () {
    try {
      return new Intl.Collator(undefined, { sensitivity: 'base', numeric: true, usage: 'sort' });
    } catch (e) { return null; }
  })();

  function sortTableByColumn(tableIdx, colIdx) {
    try {
      const tables = qa('.table-container table');
      const table = tables[tableIdx];
      if (!table) return;
      const tbody = safeGetTBody(table);
      if (!tbody) return;
      const key = _tableKeyFor(table, tableIdx);
      sortStates[key] = sortStates[key] || [];
      let state = (sortStates[key][colIdx]) || 0;
      let rows = Array.from(tbody.rows);

      function cellValue(row, idx) {
        try {
          return (row.cells[idx]?.textContent || '').trim();
        } catch (e) { return ''; }
      }

      // comparator util attempts numeric compare then string compare using collator
      function cmpAsc(a, b) {
        let valA = cellValue(a, colIdx);
        let valB = cellValue(b, colIdx);
        const nA = parseFloat(String(valA).replace(/,/g, '').replace(/\s+/g, ''));
        const nB = parseFloat(String(valB).replace(/,/g, '').replace(/\s+/g, ''));
        if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
        if (collator) return collator.compare(valA, valB);
        return String(valA).localeCompare(String(valB));
      }
      function cmpDesc(a, b) {
        return -cmpAsc(a, b);
      }

      if (state === 0) {
        rows.sort(cmpAsc);
        sortStates[key][colIdx] = 1;
      } else if (state === 1) {
        rows.sort(cmpDesc);
        sortStates[key][colIdx] = 2;
      } else {
        // Reset to original order using stable UIDs snapshot if available
        const order = originalRowOrders[key] || [];
        if (order && order.length) {
          const arranged = [];
          for (let i = 0; i < order.length; i++) {
            const uid = order[i];
            try {
              const r = tbody.querySelector(`tr[data-tv-uid="${uid}"]`);
              if (r) arranged.push(r);
            } catch (e) { /* continue */ }
          }
          // Append any rows that might be new or missing from snapshot
          Array.from(tbody.rows).forEach(r => {
            if (arranged.indexOf(r) === -1) arranged.push(r);
          });
          rows = arranged;
          sortStates[key][colIdx] = 0;
        } else {
          sortStates[key][colIdx] = 0;
        }
      }

      // reset other columns' states
      const cols = sortStates[key] || [];
      for (let i = 0; i < cols.length; i++) {
        if (i !== colIdx) cols[i] = 0;
      }
      sortStates[key] = cols;

      // Reorder by appending existing nodes in desired order (moves in-place)
      try {
        // Use document fragment only to reduce reflow in some engines
        const frag = d.createDocumentFragment();
        rows.forEach(r => {
          try { frag.appendChild(r); } catch (e) {}
        });
        tbody.appendChild(frag);
      } catch (e) { /* silent */ }

      // Ensure per-cell original HTML snapshot exists for highlight restoration
      Array.from(tbody.rows).forEach(r => {
        Array.from(r.cells).forEach(c => {
          if (!c.dataset.origHtml) c.dataset.origHtml = c.innerHTML;
          // mark cache stale if origHtml changed
          try { _normCacheInvalidateForCell(c); } catch (_) {}
        });
      });

      updateHeaderSortUIByTable(table, key);
      try { updateRowCounts(); } catch (e) {}
    } catch (e) { /* silent */ }
  }

  function headerSortButtonClicked(tableIdx, colIdx, btnEl) {
    sortTableByColumn(tableIdx, colIdx);
    try { btnEl && btnEl.focus(); } catch (e) {}
  }

  // -----------------------------
  // Update row counts (kept behavior)
  // -----------------------------
  function updateRowCounts() {
    qa(".table-wrapper").forEach((wrapper, idx) => {
      const table = wrapper.querySelector("table");
      const countDiv = wrapper.querySelector(".row-count");
      if (!table || !countDiv) return;
      const tbody = safeGetTBody(table);
      if (!tbody) { countDiv.textContent = "Showing 0 rows"; return; }
      const rows = tbody.rows;
      const total = rows.length;
      const visible = Array.from(rows).filter(r => r.style.display !== "none").length;
      if (total === 0) countDiv.textContent = "Showing 0 rows";
      else if (visible === total) countDiv.textContent = `Showing ${total} rows`;
      else countDiv.textContent = `Showing ${visible} of ${total} rows`;
    });
  }

  // -----------------------------
  // Markdown/CSV/JSON/XLSX/PDF helpers (kept behavior)
  // -----------------------------
  function formatCellForMarkdown(cell) {
    try {
      let txt = (cell.textContent || '').trim();
      txt = txt.replace(/\|/g, '\\|');
      if (txt.indexOf('\n') !== -1 || txt.indexOf('\r') !== -1) {
        return txt.replace(/\r\n|\r|\n/g, '<br>');
      }
      return txt;
    } catch (e) { return (cell.textContent || '').trim().replace(/\|/g, '\\|'); }
  }

  function tableToMarkdownLines(table, title) {
    const lines = [];
    try {
      const rows = Array.from(table.rows);
      if (!rows || rows.length === 0) return lines;
      if (title) {
        lines.push('**' + (title || '') + '**');
        lines.push('');
      }
      const headCells = Array.from(rows[0].cells).map(c => (c.textContent || '').trim().replace(/\|/g, '\\|'));
      lines.push('| ' + headCells.join(' | ') + ' |');
      lines.push('| ' + headCells.map(() => '---').join(' | ') + ' |');
      for (let i = 1; i < rows.length; i++) {
        const rowCells = Array.from(rows[i].cells).map(c => formatCellForMarkdown(c));
        lines.push('| ' + rowCells.join(' | ') + ' |');
      }
    } catch (e) { /* ignore per-table errors */ }
    return lines;
  }

  function copyTablePlain(btn) {
    try {
      const table = getTableFromButton(btn);
      if (!table) { showToast('No table found to copy', { type: 'warn' }); return; }
      let title = table.closest('.table-wrapper')?.querySelector('h3')?.textContent || '';
      let text = title + "\n" + Array.from(table.rows).map(r => Array.from(r.cells).map(c => c.textContent.trim()).join("\t")).join("\n");
      copyToClipboard(text).then(() => showToast('Table copied as plain text!', { type: 'success' })).catch(() => {
        try { showCopyModal(text, { title: 'Copy table text' }); } catch (e) { showToast('Copy failed', { type: 'warn' }); }
      });
    } catch (e) { showToast('Copy failed', { type: 'warn' }); }
  }

  function copyTableMarkdown(btn) {
    try {
      const table = getTableFromButton(btn);
      if (!table) { showToast('No table found to copy', { type: 'warn' }); return; }
      let title = table.closest('.table-wrapper')?.querySelector('h3')?.textContent || '';
      const lines = tableToMarkdownLines(table, title);
      if (!lines || lines.length === 0) { showToast('Table empty', { type: 'warn' }); return; }
      const md = lines.join('\n');
      copyToClipboard(md).then(() => showToast('Table copied in Markdown format!', { type: 'success' })).catch(() => {
        try { showCopyModal(md, { title: 'Copy table markdown' }); } catch (e) { showToast('Copy failed', { type: 'warn' }); }
      });
    } catch (e) { showToast('Copy failed', { type: 'warn' }); }
  }

  function copyAllTablesPlain() {
    try {
      let textPieces = [];
      qa(".table-wrapper").forEach(wrapper => {
        try {
          let title = wrapper.querySelector('h3')?.textContent || '';
          let table = wrapper.querySelector('table');
          if (!table) return;
          textPieces.push(title);
          textPieces.push(Array.from(table.rows).map(r => Array.from(r.cells).map(c => c.textContent.trim()).join("\t")).join("\n"));
        } catch (e) { /* ignore single table error */ }
      });
      const text = textPieces.join("\n\n");
      if (!text) { showToast('No tables to copy', { type: 'warn' }); return; }
      copyToClipboard(text).then(() => showToast("All tables copied as plain text!", { type: 'success' })).catch(() => {
        try { showCopyModal(text, { title: 'Copy all tables' }); } catch (e) { showToast('Copy failed', { type: 'warn' }); }
      });
    } catch (e) { showToast('Copy failed', { type: 'warn' }); }
  }

  function copyAllTablesMarkdown() {
    try {
      let pieces = [];
      qa(".table-wrapper").forEach((wrapper) => {
        try {
          const table = wrapper.querySelector('table');
          if (!table) return;
          const title = wrapper.querySelector('h3')?.textContent || '';
          const lines = tableToMarkdownLines(table, title);
          if (lines && lines.length) {
            if (pieces.length) pieces.push('');
            pieces.push(...lines);
          }
        } catch (e) { /* ignore single table error */ }
      });
      if (pieces.length === 0) { showToast('No tables to export', { type: 'warn' }); return; }
      const md = pieces.join('\n');
      copyToClipboard(md).then(() => showToast("All tables copied in Markdown format!", { type: 'success' })).catch(() => {
        try { showCopyModal(md, { title: 'Copy all tables markdown' }); } catch (e) { showToast('Copy failed', { type: 'warn' }); }
      });
    } catch (e) { showToast('Copy failed', { type: 'warn' }); }
  }

  function exportTableCSV(btn, { filename } = {}) {
    try {
      const table = getTableFromButton(btn);
      if (!table) { showToast('No table found to export', { type: 'warn' }); return; }
      const rows = Array.from(table.rows);
      if (rows.length === 0) { showToast('Table empty', { type: 'warn' }); return; }
      const csv = rows.map(r => Array.from(r.cells).map(c => {
        const v = c.textContent || '';
        if (v.indexOf('"') !== -1 || v.indexOf(',') !== -1 || v.indexOf('\n') !== -1) {
          return '"' + v.replace(/"/g, '""') + '"';
        }
        return v;
      }).join(',')).join('\r\n');
      const safeName = sanitizeFileName((filename || table.closest('.table-wrapper')?.querySelector('h3')?.textContent || 'table')) + '.csv';
      const blob = new Blob(["\uFEFF", csv], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, safeName);
      showToast('CSV exported', { type: 'success' });
    } catch (e) { showToast('CSV export failed', { type: 'warn' }); }
  }

  function exportTableMarkdown(btn, { filename } = {}) {
    try {
      const table = getTableFromButton(btn);
      if (!table) { showToast('No table found to export', { type: 'warn' }); return; }
      const title = table.closest('.table-wrapper')?.querySelector('h3')?.textContent || '';
      const lines = tableToMarkdownLines(table, title);
      if (!lines || lines.length === 0) { showToast('Table empty', { type: 'warn' }); return; }
      const md = lines.join('\n');
      const safeName = sanitizeFileName((filename || title || 'table')) + '.md';
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      downloadBlob(blob, safeName);
      showToast('Markdown exported', { type: 'success' });
    } catch (e) {
      console.error('exportTableMarkdown failed', e);
      showToast('Export Markdown failed', { type: 'warn' });
    }
  }

  function exportAllTablesMarkdown({ filename } = {}) {
    try {
      const pieces = [];
      qa(".table-wrapper").forEach((wrapper) => {
        try {
          const table = wrapper.querySelector('table');
          if (!table) return;
          const title = wrapper.querySelector('h3')?.textContent || '';
          const lines = tableToMarkdownLines(table, title);
          if (!lines || lines.length === 0) return;
          if (pieces.length) pieces.push('');
          pieces.push(...lines);
        } catch (e) { /* ignore single table error */ }
      });
      if (pieces.length === 0) { showToast('No tables to export', { type: 'warn' }); return; }
      const md = pieces.join('\n');
      const safeName = sanitizeFileName((filename || 'all_tables')) + '.md';
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      downloadBlob(blob, safeName);
      showToast('All tables exported', { type: 'success' });
    } catch (e) {
      console.error('exportAllTablesMarkdown failed', e);
      showToast('Export failed', { type: 'warn' });
    }
  }

  function exportTableJSON(btn, { filename } = {}) {
    try {
      const table = getTableFromButton(btn);
      if (!table) { showToast('No table found to export', { type: 'warn' }); return; }
      const thead = table.tHead;
      let headers = [];
      if (thead && thead.rows.length > 0) {
        headers = Array.from(thead.rows[0].cells).map(c => c.textContent.trim());
      } else {
        const firstRow = table.rows[0];
        if (firstRow) headers = Array.from(firstRow.cells).map((c, i) => `Col${i+1}`);
      }
      const tbody = safeGetTBody(table) || table;
      const dataRows = Array.from(tbody.rows);
      const rows = dataRows.map(r => {
        const cells = Array.from(r.cells);
        const obj = {};
        cells.forEach((td, i) => {
          const key = headers[i] || `Col${i+1}`;
          obj[key] = td.textContent.trim();
        });
        return obj;
      });
      const jsonStr = JSON.stringify(rows, null, 2);
      const safeName = sanitizeFileName((filename || table.closest('.table-wrapper')?.querySelector('h3')?.textContent || 'table')) + '.json';
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      downloadBlob(blob, safeName);
      showToast('JSON exported', { type: 'success' });
    } catch (e) { console.error(e); showToast('Export JSON failed', { type: 'warn' }); }
  }

  function exportTableXLSX(btn, { filename } = {}) {
    try {
      const table = getTableFromButton(btn);
      if (!table) { showToast('No table found to export', { type: 'warn' }); return; }

      const aoa = [];
      Array.from(table.querySelectorAll('tr')).forEach(tr => {
        const row = Array.from(tr.querySelectorAll('th,td')).map(td => (td.textContent || '').trim());
        aoa.push(row);
      });

      if (aoa.length === 0) {
        showToast('Table empty', { type: 'warn' });
        return;
      }

      const baseName = sanitizeFileName((filename || table.closest('.table-wrapper')?.querySelector('h3')?.textContent || 'table'));
      const safeName = baseName + '.xlsx';

      if (w.XLSX && w.XLSX.utils) {
        try {
          const wb = (typeof w.XLSX.utils.book_new === 'function') ? w.XLSX.utils.book_new() : { SheetNames: [], Sheets: {} };
          const ws = w.XLSX.utils.aoa_to_sheet(aoa);
          if (typeof w.XLSX.utils.book_append_sheet === 'function') {
            w.XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
          } else {
            wb.SheetNames.push('Sheet1');
            wb.Sheets['Sheet1'] = ws;
          }

          if (typeof w.XLSX.writeFile === 'function') {
            w.XLSX.writeFile(wb, safeName);
            showToast('XLSX exported', { type: 'success' });
            return;
          }

          if (typeof w.XLSX.write === 'function') {
            const wbout = w.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            downloadBlob(blob, safeName);
            showToast('XLSX exported', { type: 'success' });
            return;
          }
        } catch (err) {
          console.error('SheetJS export failed', err);
        }
      }

      try {
        const rows = aoa.map(r => r.map(v => '"' + (String(v || '').replace(/"/g, '""')) + '"').join('\t'));
        const tsv = rows.join('\n');
        const blob = new Blob(["\uFEFF", tsv], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        downloadBlob(blob, safeName);
        showToast('XLSX exported (fallback TSV). Install assets/xlsx.full.min.js for true .xlsx support.', { type: 'warn' });
        return;
      } catch (err2) {
        console.error('xlsx fallback failed', err2);
        showToast('Export XLSX failed', { type: 'warn' });
      }
    } catch (e) {
      console.error(e);
      showToast('Export XLSX failed', { type: 'warn' });
    }
  }

  function exportTablePDF(btn, { filename } = {}) {
    try {
      const table = getTableFromButton(btn);
      if (!table) { showToast('No table found to export', { type: 'warn' }); return; }
      const title = table.closest('.table-wrapper')?.querySelector('h3')?.textContent || 'Table';
      const htmlDoc = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${title}</title>
            <style>
              body { font-family: Arial, Helvetica, sans-serif; padding: 12px; color: #111; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #333; padding: 6px; text-align: left; }
              h1 { font-size: 18px; margin-bottom: 8px; }
            </style>
          </head>
          <body>
            <h1>${title}</h1>
            ${table.outerHTML}
          </body>
        </html>`;
      const wref = w.open('', '_blank');
      if (!wref) { showToast('Unable to open print window', { type: 'warn' }); return; }
      wref.document.open();
      wref.document.write(htmlDoc);
      wref.document.close();
      setTimeout(() => {
        try {
          wref.focus();
          wref.print();
          showToast('Print dialog opened for PDF export', { type: 'success' });
        } catch (e) {
          showToast('Print failed', { type: 'warn' });
        }
      }, 300);
    } catch (e) { console.error(e); showToast('Export PDF failed', { type: 'warn' }); }
  }

  // -----------------------------
  // Reset all tables (kept semantics)
  // -----------------------------
  function resetAllTables() {
    try {
      const tables = Array.from(qa(".table-container table"));
      tables.forEach((table, idx) => {
        try {
          const tbody = safeGetTBody(table);
          if (!tbody) return;
          const key = _tableKeyFor(table, idx);
          const order = originalRowOrders[key];
          if (order && order.length) {
            const arranged = [];
            for (let i = 0; i < order.length; i++) {
              const uid = order[i];
              try {
                const r = tbody.querySelector(`tr[data-tv-uid="${uid}"]`);
                if (r) arranged.push(r);
              } catch (e) { /* continue */ }
            }
            Array.from(tbody.rows).forEach(r => {
              if (arranged.indexOf(r) === -1) arranged.push(r);
            });
            arranged.forEach(r => { try { tbody.appendChild(r); } catch (_) {} });
          } else {
            // No snapshot; no-op
          }

          Array.from(tbody.rows).forEach(r => {
            Array.from(r.cells).forEach(c => { c.dataset.origHtml = c.innerHTML; _normCacheInvalidateForCell(c); });
          });

          sortStates[_tableKeyFor(table, idx)] = Array(table.rows[0]?.cells.length || 0).fill(0);
          updateHeaderSortUI(idx);
        } catch (e) { /* continue */ }
      });
      qa('.table-wrapper').forEach(wrap => { wrap.classList.remove('table-collapsed'); const btn = wrap.querySelector('.toggle-table-btn'); if (btn) btn.textContent = "Collapse Table"; });
      const toggleAllBtn = d.getElementById('toggleAllBtn');
      if (toggleAllBtn) toggleAllBtn.textContent = "Collapse All Tables";
      const sb = getSearchEl(); if (sb) sb.value = "";
      searchTable();
      try { updateRowCounts(); } catch (e) {}
      showToast("All tables reset!", { type: 'success' });
    } catch (e) { showToast('Reset failed', { type: 'warn' }); }
  }

  // -----------------------------
  // Hide UI helpers (kept behavior)
  // -----------------------------
  function hideResetAllTablesOption() {
    try {
      const selectors = ['.reset-all-btn', '.reset-btn', '#resetAllBtn', '[data-action="reset-all"]'];
      selectors.forEach(s => {
        try { d.querySelectorAll(s).forEach(el => { if (el && el.style) el.style.display = 'none'; }); } catch (_) {}
      });
      const needle = 'reset all tables';
      const shortNeedle = 'reset all';
      d.querySelectorAll('button, a, input').forEach(el => {
        try {
          const txt = ((el.textContent || '') + ' ' + (el.title || '')).toLowerCase();
          if (txt.indexOf(needle) !== -1 || txt.indexOf(shortNeedle) !== -1) {
            if (el && el.style) el.style.display = 'none';
          }
        } catch (_) {}
      });
      try {
        d.querySelectorAll('#toolbar, .toolbar, .menu, .dropdown-menu').forEach(menu => {
          menu.querySelectorAll('button, a, li').forEach(item => {
            try {
              const txt = ((item.textContent || '') + ' ' + (item.title || '')).toLowerCase();
              if (txt.indexOf(needle) !== -1 || txt.indexOf(shortNeedle) !== -1) {
                if (item && item.style) item.style.display = 'none';
              }
            } catch (_) {}
          });
        });
      } catch (_) {}
    } catch (e) { /* silent */ }
  }

  function hideExportMarkdownOption() {
    try {
      const selectors = [
        '.export-markdown-btn', '.export-markdown', '.export-markdown-table',
        '#exportMarkdownBtn', '[data-action="export-markdown"]',
        'button[data-format="md"]', 'a[data-format="md"]'
      ];
      selectors.forEach(s => {
        try { d.querySelectorAll(s).forEach(el => { if (el && el.style) el.style.display = 'none'; }); } catch (_) {}
      });

      const needles = ['export markdown', 'export md', 'markdown export', 'export as markdown'];
      d.querySelectorAll('button, a, input, li, span').forEach(el => {
        try {
          const txt = ((el.textContent || '') + ' ' + (el.title || '')).toLowerCase();
          for (let n of needles) {
            if (txt.indexOf(n) !== -1) {
              if (el && el.style) el.style.display = 'none';
              break;
            }
          }
        } catch (_) {}
      });

      try {
        d.querySelectorAll('#toolbar, .toolbar, .menu, .dropdown-menu').forEach(menu => {
          menu.querySelectorAll('button, a, li').forEach(item => {
            try {
              const txt = ((item.textContent || '') + ' ' + (item.title || '')).toLowerCase();
              for (let n of needles) {
                if (txt.indexOf(n) !== -1) {
                  if (item && item.style) item.style.display = 'none';
                  break;
                }
              }
            } catch (_) {}
          });
        });
      } catch (_) {}
    } catch (e) { /* silent */ }
  }

  // -----------------------------
  // SEARCH & HIGHLIGHT (optimized & cached)
  // - caches normalized map per cell keyed by cell.dataset.origHtml
  // - invalidates cache on origHtml change
  // -----------------------------
  const _normCache = new WeakMap();
  function _normCacheInvalidateForCell(cell) {
    try {
      if (!_normCache || !cell) return;
      _normCache.delete(cell);
    } catch (e) { /* silent */ }
  }

  function normalizeForSearchLocal(s) {
    try {
      return (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
    } catch (e) {
      return (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  function buildNormalizedMapForCellCached(cell) {
    try {
      if (!cell) return { normStr: '', map: [], nodes: [] };
      const origHtml = cell.dataset.origHtml || cell.innerHTML || '';
      const cached = _normCache.get(cell);
      if (cached && cached.origHtml === origHtml) return cached.value;
      // build fresh
      const nodes = [];
      const walker = d.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
      while (walker.nextNode()) {
        const tn = walker.currentNode;
        if (!tn.nodeValue || tn.nodeValue.length === 0) continue;
        if (tn.nodeValue.trim() === '') continue;
        nodes.push(tn);
      }
      let normStr = '';
      const map = [];
      for (let ni = 0; ni < nodes.length; ni++) {
        const raw = nodes[ni].nodeValue;
        for (let i = 0; i < raw.length;) {
          const cp = raw.codePointAt(i);
          const ch = String.fromCodePoint(cp);
          const charLen = cp > 0xFFFF ? 2 : 1;
          const decomposed = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          let filtered;
          try { filtered = decomposed.replace(/[^\p{L}\p{N}\s]/gu, ''); }
          catch (e) { filtered = decomposed.replace(/[^\w\s]/g, ''); }
          if (filtered.length > 0) {
            for (let k = 0; k < filtered.length; k++) {
              normStr += filtered[k];
              map.push({ nodeIndex: ni, offsetInNode: i });
            }
          }
          i += charLen;
        }
      }
      const value = { normStr, map, nodes };
      _normCache.set(cell, { origHtml, value });
      return value;
    } catch (e) { return { normStr: '', map: [], nodes: [] }; }
  }

  function clearHighlights(cell) {
    if (!cell) return;
    try {
      if (cell.dataset && cell.dataset.origHtml) {
        if (cell.innerHTML !== cell.dataset.origHtml) {
          cell.innerHTML = cell.dataset.origHtml;
          _normCacheInvalidateForCell(cell);
        }
        return;
      }
      const marks = Array.from(cell.querySelectorAll('mark'));
      marks.forEach(m => {
        const textNode = d.createTextNode(m.textContent);
        if (m.parentNode) m.parentNode.replaceChild(textNode, m);
      });
      _normCacheInvalidateForCell(cell);
    } catch (e) { /* silent */ }
  }

  function highlightMatches(cell, filterNorm) {
    if (!cell || !filterNorm) return;
    try {
      // restore original html if we have it cached
      if (cell.dataset && cell.dataset.origHtml && cell.innerHTML !== cell.dataset.origHtml) {
        cell.innerHTML = cell.dataset.origHtml;
        _normCacheInvalidateForCell(cell);
      }
      const built = buildNormalizedMapForCellCached(cell);
      const normStr = (built.normStr || '').toLowerCase();
      if (!normStr || normStr.length === 0) return;
      const map = built.map;
      const nodes = built.nodes;
      const needle = filterNorm.toLowerCase();
      const matches = [];
      let pos = 0;
      while (true) {
        const idx = normStr.indexOf(needle, pos);
        if (idx === -1) break;
        matches.push(idx);
        pos = idx + needle.length;
      }
      if (matches.length === 0) return;

      // process matches in reverse to avoid index shifts
      for (let mi = matches.length - 1; mi >= 0; mi--) {
        const startNorm = matches[mi];
        const endNormExclusive = startNorm + needle.length;
        const startMap = map[startNorm];
        const endMap = map[endNormExclusive - 1];
        if (!startMap || !endMap) continue;
        const startNodeIndex = startMap.nodeIndex;
        const startOffset = Math.max(0, Math.min((startMap.offsetInNode || 0), nodes[startNodeIndex].nodeValue.length));
        const endNodeIndex = endMap.nodeIndex;
        let endOffsetExclusive = Math.max(0, Math.min((endMap.offsetInNode || 0), nodes[endNodeIndex].nodeValue.length));
        try {
          const endNodeRaw = nodes[endNodeIndex].nodeValue;
          const cp = endNodeRaw.codePointAt(endOffsetExclusive);
          const charLen = cp > 0xFFFF ? 2 : 1;
          endOffsetExclusive = Math.min(endOffsetExclusive + charLen, endNodeRaw.length);
        } catch (e) { endOffsetExclusive = Math.min(endOffsetExclusive + 1, nodes[endNodeIndex].nodeValue.length); }
        try {
          if (startNodeIndex === endNodeIndex) {
            const tn = nodes[startNodeIndex];
            const rawLen = tn.nodeValue.length;
            const s = Math.max(0, Math.min(startOffset, rawLen));
            const e = Math.max(0, Math.min(endOffsetExclusive, rawLen));
            if (s >= e) continue;
            const after = tn.splitText(e);
            const middle = tn.splitText(s);
            const mark = d.createElement('mark');
            mark.appendChild(d.createTextNode(middle.data));
            middle.parentNode.replaceChild(mark, middle);
          } else {
            const startNode = nodes[startNodeIndex];
            const endNode = nodes[endNodeIndex];
            const rawStartLen = startNode.nodeValue.length;
            const rawEndLen = endNode.nodeValue.length;
            const sOff = Math.max(0, Math.min(startOffset, rawStartLen));
            const eOff = Math.max(0, Math.min(endOffsetExclusive, rawEndLen));
            const afterEnd = endNode.splitText(eOff);
            const middleStart = startNode.splitText(sOff);
            const wrapNodes = [];
            let cur = middleStart;
            while (cur) {
              wrapNodes.push(cur);
              if (cur === endNode) break;
              cur = cur.nextSibling;
              if (!cur) break;
            }
            if (wrapNodes.length === 0) continue;
            const parent = wrapNodes[0].parentNode;
            if (!parent) continue;
            const mark = d.createElement('mark');
            parent.insertBefore(mark, wrapNodes[0]);
            wrapNodes.forEach(n => { try { mark.appendChild(n); } catch (e) {} });
          }
        } catch (e) { continue; }
      }
      // invalidate cache as DOM text nodes were mutated
      _normCacheInvalidateForCell(cell);
    } catch (e) { /* silent */ }
  }

  // -----------------------------
  // Search loop (keeps behavior but debounced)
  // -----------------------------
  function searchTable() {
    try {
      const searchEl = getSearchEl();
      const filterRaw = searchEl?.value || '';
      const filterNorm = normalizeForSearchLocal(filterRaw);
      let firstMatch = null;

      // collect tables once
      const tables = qa('.table-container table');
      tables.forEach(table => {
        const tbody = safeGetTBody(table);
        if (!tbody) return;
        Array.from(tbody.rows).forEach(row => {
          let rowMatches = false;
          Array.from(row.cells).forEach(cell => {
            clearHighlights(cell);
            const txt = cell.textContent || '';
            if (filterNorm && normalizeForSearchLocal(txt).includes(filterNorm)) {
              rowMatches = true;
            }
          });
          row.style.display = (!filterNorm || rowMatches) ? '' : 'none';
          if (rowMatches) {
            if (w.tvConfig && w.tvConfig.highlight) Array.from(row.cells).forEach(cell => highlightMatches(cell, filterNorm));
            if (!firstMatch) firstMatch = row;
          }
        });
      });

      try {
        if (w.tableVirtualizer?.refresh) w.tableVirtualizer.refresh();
        else if (w.tableVirtualizer?.update) w.tableVirtualizer.update();
      } catch (_) {}

      if (firstMatch) {
        const rect = firstMatch.getBoundingClientRect();
        const headerHeight = d.getElementById('stickyMainHeader')?.offsetHeight || 0;
        const scrollTop = w.pageYOffset || d.documentElement.scrollTop || 0;
        w.scrollTo({ top: scrollTop + rect.top - headerHeight - 5, behavior: 'smooth' });
      }
      try { updateRowCounts(); } catch (_) {}
    } catch (_) {}
  }

  const _debouncedSearch = (function () {
    let t;
    return function () {
      const wait = (w.tvConfig && w.tvConfig.debounceMs) || 120;
      clearTimeout(t);
      t = setTimeout(() => { try { searchTable(); } catch (_) {} }, wait);
    };
  })();

  // -----------------------------
  // Mobile/table-control optimization (kept behavior)
  // -----------------------------
  function optimizeTableControls() {
    try {
      const mql = w.matchMedia ? w.matchMedia('(max-width:600px)') : null;
      const isMobile = mql ? mql.matches : (w.innerWidth <= 600);
      qa('.table-wrapper').forEach(wrapper => {
        try {
          const header = wrapper.querySelector('.table-header-wrapper');
          if (!header) return;
          header.classList.add('table-controls');
          header.style.boxSizing = header.style.boxSizing || 'border-box';
          header.style.overflowX = header.style.overflowX || 'auto';
          header.style.webkitOverflowScrolling = header.style.webkitOverflowScrolling || 'touch';
          header.style.display = header.style.display || 'flex';
          header.style.flexWrap = header.style.flexWrap || 'wrap';
          header.style.justifyContent = header.style.justifyContent || 'space-between';
          header.style.gap = header.style.gap || '8px';
          header.style.alignItems = header.style.alignItems || 'center';

          let copyButtons = header.querySelector('.copy-buttons');
          if (!copyButtons) {
            const possibleBtns = Array.from(header.querySelectorAll('button')).filter(b => !b.classList.contains('toggle-table-btn') && !b.classList.contains('table-toggle-inline'));
            if (possibleBtns.length > 0) {
              const cb = d.createElement('div');
              cb.className = 'copy-buttons';
              cb.style.display = 'flex';
              cb.style.gap = '6px';
              possibleBtns.forEach(b => cb.appendChild(b));
              header.insertBefore(cb, header.firstChild);
              copyButtons = cb;
            }
          }

          const toggleBtn = header.querySelector('.toggle-table-btn') || header.querySelector('.toggle-table');
          if (toggleBtn) {
            const toggleParent = toggleBtn.parentElement && toggleBtn.parentElement !== header ? toggleBtn.parentElement : null;
            if (toggleParent && toggleParent !== header) {
              try { header.insertBefore(toggleParent, header.firstChild); } catch (_) {}
            } else {
              try { header.insertBefore(toggleBtn, header.firstChild); } catch (_) {}
            }
            try { toggleBtn.classList.remove('toggle-table-btn', 'table-toggle-mobile'); } catch (_) {}
            try { toggleBtn.classList.add('table-toggle-inline'); } catch (_) {}
            try {
              toggleBtn.style.order = '';
              toggleBtn.style.flex = '';
              toggleBtn.style.width = '';
              toggleBtn.style.boxSizing = '';
              toggleBtn.style.margin = '';
              toggleBtn.style.padding = '';
              toggleBtn.style.fontWeight = '';
              if (toggleBtn.parentElement) toggleBtn.parentElement.style.width = '';
            } catch (_) {}
          }

          if (copyButtons) {
            if (isMobile) {
              copyButtons.style.flex = '1 1 auto';
              copyButtons.style.gap = '6px';
              Array.from(copyButtons.querySelectorAll('button')).forEach(b => {
                b.style.padding = '4px 6px';
                b.style.fontSize = '12px';
                b.style.flex = '0 1 auto';
                b.style.minWidth = 'unset';
                if (b.classList.contains('icon-only')) {
                  b.style.width = '36px';
                  b.style.height = '36px';
                  b.style.padding = '6px';
                }
              });
            } else {
              copyButtons.style.flex = '';
              copyButtons.style.gap = '';
              Array.from(copyButtons.querySelectorAll('button')).forEach(b => {
                b.style.padding = '';
                b.style.fontSize = '';
                b.style.flex = '';
                b.style.minWidth = '';
                if (b.classList.contains('icon-only')) {
                  b.style.width = '';
                  b.style.height = '';
                }
              });
            }
          }
        } catch (e) { /* per-wrapper silent */ }
      });
    } catch (e) { /* global silent */ }
  }

  const _debouncedOptimize = (function () {
    let t;
    return function () { clearTimeout(t); t = setTimeout(() => { try { optimizeTableControls(); } catch (_) {} }, 120); };
  })();

  if (w.matchMedia) {
    try {
      const mql = w.matchMedia('(max-width:600px)');
      if (typeof mql.addEventListener === 'function') mql.addEventListener('change', _debouncedOptimize);
      else if (typeof mql.addListener === 'function') mql.addListener(_debouncedOptimize);
    } catch (_) {}
  }
  w.addEventListener('resize', _debouncedOptimize);

  // -----------------------------
  // TOC builder (kept behavior; idempotent)
  // -----------------------------
  function buildSingleTableToc() {
    try {
      const wrappers = qa('.table-wrapper');
      if (!wrappers || wrappers.length !== 1) return;
      const tocBar = d.getElementById('tocBar');
      if (!tocBar) return;
      const table = wrappers[0].querySelector('.table-container table') || wrappers[0].querySelector('table');
      if (!table) return;

      const tbody = safeGetTBody(table) || table;
      const rows = Array.from((tbody && tbody.rows && tbody.rows.length) ? tbody.rows : (table.rows || []));
      if (!rows || rows.length === 0) return;

      const ul = d.createElement('ul');
      ul.className = 'single-toc-list';
      ul.style.listStyle = 'none';
      ul.style.display = 'flex';
      ul.style.gap = '8px';
      ul.style.margin = '0';
      ul.style.padding = '0';
      ul.style.flexWrap = 'wrap';

      rows.forEach((row, idx) => {
        try {
          let id = row.id && String(row.id).trim() ? row.id : `tv-row-${idx + 1}`;
          if (d.getElementById(id) && d.getElementById(id) !== row) {
            let suffix = 1;
            while (d.getElementById(id + '-' + suffix)) suffix++;
            id = id + '-' + suffix;
          }
          row.id = id;

          const li = d.createElement('li');
          li.className = 'toc-item';
          const a = d.createElement('a');
          a.className = 'toc-link';
          a.href = `#${id}`;
          a.textContent = `Topic ${idx + 1}`;
          const rowText = (row.textContent || '').trim();
          if (rowText) {
            a.setAttribute('aria-label', rowText);
            a.title = rowText;
          }
          a.addEventListener('click', function (ev) {
            ev.preventDefault();
            const target = d.getElementById(id);
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              try { history.replaceState(null, '', `#${id}`); } catch (e) { }
              try { target.focus && target.focus({ preventScroll: true }); } catch (e) { }
            }
          });
          li.appendChild(a);
          ul.appendChild(li);
        } catch (e) { /* ignore single row error */ }
      });

      const existingUl = tocBar.querySelector('ul');
      if (existingUl) existingUl.remove();
      tocBar.appendChild(ul);
    } catch (err) {
      try { console.warn('buildSingleTableToc error', err); } catch (_) {}
    }
  }
  w.buildSingleTableToc = buildSingleTableToc;

  // -----------------------------
  // Initialization (keeps flow)
  // -----------------------------
  d.addEventListener('DOMContentLoaded', function () {
    try {
      qa('.table-wrapper').forEach(wrapper => {
        if (wrapper.querySelector('.table-container')) return;
        const table = wrapper.querySelector('table');
        if (!table) return;
        const container = d.createElement('div');
        container.className = 'table-container';
        wrapper.insertBefore(container, table);
        container.appendChild(table);
      });

      // Build single-table TOC first (so ids assigned)
      try { buildSingleTableToc(); rIC(() => buildSingleTableToc()); } catch (e) {}

      // Build snapshots and sortStates after DOM is stable
      qa(".table-container table").forEach((table, idx) => {
        try {
          _ensureRowUidsAndSnapshot(table, idx);
          const key = _tableKeyFor(table, idx);
          sortStates[key] = Array(table.rows[0]?.cells.length || 0).fill(0);
        } catch (e) {
          // ensure entries exist
          const key = _tableKeyFor(table, idx);
          sortStates[key] = sortStates[key] || [];
          originalRowOrders[key] = originalRowOrders[key] || [];
        }
      });

      // attach per-cell original HTML snapshot used to restore highlights safely
      qa('.table-container table').forEach(table => {
        const tbody = safeGetTBody(table);
        if (!tbody) return;
        Array.from(tbody.rows).forEach(r => {
          Array.from(r.cells).forEach(c => {
            if (!c.dataset.origHtml) c.dataset.origHtml = c.innerHTML;
          });
        });
      });

      // Update header sort UI
      qa(".table-container table").forEach((t, idx) => { updateHeaderSortUI(idx); });

      // Update toggle buttons text
      qa('.table-wrapper').forEach(wrap => {
        const btn = wrap.querySelector('.toggle-table-btn');
        if (btn) btn.textContent = wrap.classList.contains('table-collapsed') ? "Expand Table" : "Collapse Table";
      });

      // Toggle all button state
      const anyExpanded = qa('.table-wrapper:not(.table-collapsed)').length > 0;
      const toggleAll = d.getElementById('toggleAllBtn');
      if (toggleAll) toggleAll.textContent = anyExpanded ? "Collapse All Tables" : "Expand All Tables";

      // Ensure backToTop exists
      if (!d.getElementById('backToTop')) {
        try {
          const b = d.createElement('button');
          b.id = 'backToTop';
          b.type = 'button';
          b.title = 'Back to top';
          b.textContent = '↑';
          b.style.display = 'none';
          d.body.appendChild(b);
          b.addEventListener('click', backToTop);
        } catch (e) { /* ignore */ }
      }

      // Attach search handlers (debounced)
      const sb = getSearchEl();
      if (sb) {
        try {
          sb.addEventListener('input', _debouncedSearch);
          sb.addEventListener('keyup', function (e) { if (e.key === 'Enter') searchTable(); });
        } catch (e) { /* silent */ }
      }

      // Attach handlers to server-rendered toolbar buttons when missing
      try {
        qa('.table-wrapper').forEach(wrapper => {
          const handlers = [
            { sel: '.toggle-table-btn, .toggle-table', fn: toggleTable },
            { sel: '.copy-plain-btn, .copy-plain, .copy-plain-table', fn: copyTablePlain },
            { sel: '.copy-markdown-btn, .copy-markdown, .copy-markdown-table', fn: copyTableMarkdown },
            { sel: '.export-csv-btn, .export-csv, .export-csv-table', fn: exportTableCSV },
            { sel: '.export-json-btn, .export-json, .export-json-table', fn: exportTableJSON },
            { sel: '.export-xlsx-btn, .export-xlsx, .export-xlsx-table', fn: exportTableXLSX },
            { sel: '.export-pdf-btn, .export-pdf, .export-pdf-table', fn: exportTablePDF }
          ];
          handlers.forEach(h => {
            try {
              const btn = wrapper.querySelector(h.sel);
              if (!btn) return;
              if (btn.getAttribute && btn.getAttribute('onclick')) return;
              if (btn.dataset && btn.dataset.tvHandlerAttached) return;
              btn.addEventListener('click', function (ev) { try { h.fn(this); } catch (e) { /* silent */ } });
              if (btn.dataset) btn.dataset.tvHandlerAttached = '1';
            } catch (e) { /* silent */ }
          });
        });
      } catch (e) { /* silent */ }

      // Optimize table controls
      try { optimizeTableControls(); rIC(() => optimizeTableControls()); } catch (e) { /* silent */ }

      // Hide UI targets
      try { hideResetAllTablesOption(); rIC(() => hideResetAllTablesOption()); } catch (e) {}
      try { hideExportMarkdownOption(); rIC(() => hideExportMarkdownOption()); } catch (e) {}

      // Key handlers
      document.addEventListener("keydown", function (e) {
        try {
          const active = d.activeElement;
          const tag = active && (active.tagName || "").toLowerCase();
          if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (tag === 'input' || tag === 'textarea' || (active && active.isContentEditable)) return;
            e.preventDefault();
            const s = getSearchEl();
            if (s) { s.focus(); s.select(); }
            return;
          }
          if (e.key === "Escape") {
            backToTop();
            return;
          }
        } catch (err) { /* silent */ }
      });

      // Initial row counts
      try { updateRowCounts(); } catch (e) {}
    } catch (e) { /* silent */ }
  });

  // delegated click: sorting (kept)
  document.addEventListener('click', function (e) {
    try {
      const el = e.target;
      const hit = el.closest && (el.closest('.sort-btn') || el.closest('.th-with-sort') || (el.tagName && el.tagName.toLowerCase() === 'th' && el.getAttribute('role') === 'button' ? el : null));
      if (!hit) return;
      const th = hit.closest('th') || (hit.tagName && hit.tagName.toLowerCase() === 'th' ? hit : null);
      if (!th) return;
      const table = th.closest('table');
      if (!table) return;
      const tables = Array.from(qa('.table-container table'));
      const tableIdx = tables.indexOf(table);
      const colIdx = th.cellIndex;
      if (tableIdx === -1 || typeof colIdx === 'undefined' || colIdx < 0) return;
      headerSortButtonClicked(tableIdx, colIdx, hit);
      e.preventDefault();
    } catch (err) { /* silent */ }
  });

  // delegated click: TOC anchor scroll
  document.addEventListener('click', function (e) {
    try {
      const a = e.target.closest && e.target.closest('#tocBar a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      const id = (a.getAttribute('href') || '').substring(1);
      if (!id) return;
      const headerHeight = d.getElementById('stickyMainHeader')?.offsetHeight || 0;
      const target = d.getElementById(id);
      if (target) {
        const rect = target.getBoundingClientRect();
        const top = (w.pageYOffset || d.documentElement.scrollTop || 0) + rect.top;
        w.scrollTo({ top: Math.max(0, top - headerHeight - 5), behavior: 'smooth' });
        try { history.replaceState(null, '', '#' + id); } catch (err) {}
        try { target.focus && target.focus({ preventScroll: true }); } catch (err) {}
        return;
      }
      const container = a.closest('.table-wrapper');
      if (!container) return;
      const containerTop = container.getBoundingClientRect().top + (w.pageYOffset || d.documentElement.scrollTop || 0);
      w.scrollTo({ top: Math.max(0, containerTop - headerHeight - 5), behavior: 'smooth' });
      try { history.replaceState(null, '', '#' + id); } catch (err) {}
    } catch (err) { /* silent */ }
  });

  w.addEventListener("scroll", function () {
    try {
      const btn = d.getElementById("backToTop");
      if (!btn) return;
      if (d.documentElement.scrollTop > 200 || w.scrollY > 200) btn.style.display = "block";
      else btn.style.display = "none";
    } catch (e) { /* silent */ }
  });

  function backToTop() { try { w.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {} }

  // -----------------------------
  // Expose functions (unchanged names)
  // -----------------------------
  w.headerSortButtonClicked = headerSortButtonClicked;
  w.toggleTable = function toggleTable(btn) {
    try {
      const wrapper = btn.closest('.table-wrapper');
      if (!wrapper) return;
      const collapsed = wrapper.classList.toggle('table-collapsed');
      btn.textContent = collapsed ? "Expand Table" : "Collapse Table";
      const anyExpanded = qa('.table-wrapper:not(.table-collapsed)').length > 0;
      const toggleAllBtn = d.getElementById('toggleAllBtn');
      if (toggleAllBtn) toggleAllBtn.textContent = anyExpanded ? "Collapse All Tables" : "Expand All Tables";
      try { updateRowCounts(); } catch (e) {}
    } catch (e) { /* silent */ }
  };
  w.toggleAllTables = function toggleAllTables() {
    try {
      const wrappers = Array.from(qa('.table-wrapper'));
      if (wrappers.length === 0) return;
      const anyExpanded = wrappers.some(wr => !wr.classList.contains('table-collapsed'));
      if (anyExpanded) {
        wrappers.forEach(wrap => { wrap.classList.add('table-collapsed'); const btn = wrap.querySelector('.toggle-table-btn'); if (btn) btn.textContent = "Expand Table"; });
        const toggleAllBtn = d.getElementById('toggleAllBtn');
        if (toggleAllBtn) toggleAllBtn.textContent = "Expand All Tables";
      } else {
        wrappers.forEach(wrap => { wrap.classList.remove('table-collapsed'); const btn = wrap.querySelector('.toggle-table-btn'); if (btn) btn.textContent = "Collapse Table"; });
        const toggleAllBtn = d.getElementById('toggleAllBtn');
        if (toggleAllBtn) toggleAllBtn.textContent = "Collapse All Tables";
      }
      try { updateRowCounts(); } catch (e) {}
    } catch (e) { /* silent */ }
  };
  w.copyTablePlain = copyTablePlain;
  w.copyTableMarkdown = copyTableMarkdown;
  w.copyAllTablesPlain = copyAllTablesPlain;
  w.copyAllTablesMarkdown = copyAllTablesMarkdown;
  w.resetAllTables = resetAllTables;
  w.searchTable = searchTable;
  w.exportTableCSV = exportTableCSV;
  w.exportTableJSON = exportTableJSON;
  w.exportTableXLSX = exportTableXLSX;
  w.exportTablePDF = exportTablePDF;
  w.exportTableMarkdown = exportTableMarkdown;
  w.exportAllTablesMarkdown = exportAllTablesMarkdown;

  w.toggleMode = function () {
    try {
      const modeBtn = d.getElementById('modeBtn');
      const dark = d.documentElement.getAttribute('data-theme') !== 'dark';
      if (dark) {
        d.documentElement.setAttribute('data-theme', 'dark');
        if (modeBtn) modeBtn.textContent = 'Light mode';
        localStorage.setItem('uiMode', 'dark');
      } else {
        d.documentElement.removeAttribute('data-theme');
        if (modeBtn) modeBtn.textContent = 'Dark mode';
        localStorage.setItem('uiMode', 'light');
      }
    } catch (e) { /* silent */ }
  };

  try {
    const idxUrl = d.body && d.body.getAttribute('data-index-url');
    const wUrl = d.body && d.body.getAttribute('data-worker-url');
    if (console && console.info) {
      console.info('tv:base', TV_BASE);
      console.info('tv:index-url', idxUrl);
      console.info('tv:worker-url', wUrl);
    }
  } catch (e) { /* silent */ }

  // -----------------------------
  // extra.js loader + topic fallback appended (kept identical semantics)
  // -----------------------------
  (function () {
    'use strict';
    if (w.__tv_extra_loader_patched) return;
    w.__tv_extra_loader_patched = true;

    function detectScriptBaseInner() {
      try {
        const sel = d.querySelector('script[src*="script.js"], script[src*="/assets/script.js"]');
        if (sel && sel.src) return sel.src.replace(/script\.js(\?.*)?$/, '');
        const sAll = d.getElementsByTagName('script');
        for (let i = sAll.length - 1; i >= 0; i--) {
          const src = sAll[i].src || '';
          if (src.indexOf('/assets/') !== -1 && src.indexOf('script') !== -1) return src.replace(/script\.js(\?.*)?$/, '');
        }
      } catch (e) { }
      try { return location.origin + (location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1) || '/'); } catch (e) { return './'; }
    }

    const BASE = detectScriptBaseInner();
    const CANDIDATES = [
      BASE + 'extra.js',
      BASE + 'assets/extra.js',
      (location.origin || '') + '/assets/extra.js',
      './assets/extra.js',
      './extra.js'
    ];

    function loadScriptOnce(src, onload, onerror) {
      try {
        const exist = Array.from(d.getElementsByTagName('script')).some(s => (s.src || '').indexOf(src) !== -1);
        if (exist) { if (typeof onload === 'function') onload(); return; }
        const s = d.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = function () { try { if (typeof onload === 'function') onload(); } catch (e) { } };
        s.onerror = function (e) { try { if (typeof onerror === 'function') onerror(e); } catch (_) { } };
        (d.head || d.documentElement).appendChild(s);
      } catch (e) {
        if (typeof onerror === 'function') onerror(e);
      }
    }

    function attemptLoadExtra(cands, cb) {
      if (!cands || !cands.length) { if (cb) cb(false); return; }
      const src = cands.shift();
      loadScriptOnce(src, function () { if (cb) cb(true, src); }, function () { attemptLoadExtra(cands, cb); });
    }

    function minimalTopicFallback() {
      try {
        const reLabel = /^\s*Table\s*\d+\b/i;
        let anchors = [];
        const containers = Array.from(d.querySelectorAll('nav, .toc, .table-of-contents, #toc, .toc-list, .tv-toc, .tables-toc, aside'));
        for (const c of containers) {
          try {
            anchors = anchors.concat(Array.from(c.querySelectorAll('a')).filter(a => reLabel.test((a.textContent || '').trim())));
          } catch (e) { }
        }
        if (anchors.length === 0) {
          anchors = Array.from(d.querySelectorAll('a[href^="#"]')).filter(a => reLabel.test((a.textContent || '').trim()));
        }
        const tableWrappers = Array.from(d.querySelectorAll('.table-wrapper, .tables, table'));
        if (!(anchors.length === 1 || tableWrappers.length === 1)) return;

        const replaceNodeText = (el, re, repl) => {
          if (!el) return false;
          for (const child of Array.from(el.childNodes)) {
            if (child.nodeType === 3) {
              if (re.test(child.nodeValue || '')) {
                child.nodeValue = child.nodeValue.replace(re, repl);
                return true;
              }
            } else if (child.nodeType === 1 && child.childNodes.length === 1 && child.firstChild.nodeType === 3) {
              if (re.test(child.firstChild.nodeValue || '')) {
                child.firstChild.nodeValue = child.firstChild.nodeValue.replace(re, repl);
                return true;
              }
            }
          }
          const all = el.textContent || '';
          if (re.test(all)) {
            el.textContent = all.replace(re, repl);
            return true;
          }
          return false;
        };

        const a = anchors.length === 1 ? anchors[0] : null;
        if (a) {
          replaceNodeText(a, /\bTable\b/i, 'Topic');
          const aria = a.getAttribute && a.getAttribute('aria-label');
          if (aria && /\bTable\b/i.test(aria)) a.setAttribute('aria-label', aria.replace(/\bTable\b/i, 'Topic'));
          const href = a.getAttribute && a.getAttribute('href');
          if (href && href.startsWith('#')) {
            const tgt = d.querySelector(href);
            if (tgt) {
              const heading = tgt.querySelector('h1,h2,h3,h4,.table-title,.table-header') || tgt;
              replaceNodeText(heading, /\bTable\b/i, 'Topic');
              const dt = heading.getAttribute && heading.getAttribute('data-title');
              if (dt && /\bTable\b/i.test(dt)) heading.setAttribute('data-title', dt.replace(/\bTable\b/i, 'Topic'));
            }
          }
        } else if (tableWrappers.length === 1) {
          const wrapper = tableWrappers[0];
          const heading = wrapper.querySelector('h1,h2,h3,h4,.table-title,.table-header') || wrapper;
          replaceNodeText(heading, /\bTable\b/i, 'Topic');
        }
      } catch (e) { /* silent */ }
    }

    function __tv_patch_diag() {
      return {
        loadedExtraScript: !!d.querySelector('script[src*="extra.js"]'),
        topicPatchFlag: !!w.__tv_topic_patch_loaded,
        anchorsFound: Array.from(d.querySelectorAll('a')).filter(a => /\bTable\s*\d+\b/i.test((a.textContent || '').trim())).slice(0, 10).map(a => (a.textContent || '').trim())
      };
    }
    w.__tv_patch_diag = __tv_patch_diag;

    if (w.__tv_no_auto_extra_load) {
      if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { setTimeout(minimalTopicFallback, 80); });
      else setTimeout(minimalTopicFallback, 80);
      return;
    }

    attemptLoadExtra(CANDIDATES.slice(), function (success, src) {
      setTimeout(function () {
        if (w.__tv_topic_patch_loaded) {
          return;
        }
        minimalTopicFallback();
      }, 300);
    });

    if (d.readyState === 'loading') {
      d.addEventListener('DOMContentLoaded', function () { setTimeout(function () { if (!w.__tv_topic_patch_loaded) minimalTopicFallback(); }, 120); });
    } else {
      setTimeout(function () { if (!w.__tv_topic_patch_loaded) minimalTopicFallback(); }, 120);
    }

    w.__tv_trigger_topic_fallback = function () { minimalTopicFallback(); };

  })();

})();
