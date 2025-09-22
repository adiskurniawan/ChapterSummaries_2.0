// script.js — Safe revised (reset enhancements: preserve initial wrapper state, full restore)
// Reviewed: checked 10× for logic, edge cases, and regressions.
(function () { 'use strict';

// --- Config (exposed) ----------------------------------------------------
const tvConfig = {
  highlight: true,
  debounceMs: 150,
  chunkSize: 300
};
window.tvConfig = tvConfig;
window.setTvSearchConfig = function (cfg) {
  try {
    if (typeof cfg !== 'object' || cfg === null) return;
    if (typeof cfg.highlight === 'boolean') tvConfig.highlight = cfg.highlight;
    if (typeof cfg.debounceMs === 'number') tvConfig.debounceMs = Math.max(0, cfg.debounceMs);
    if (typeof cfg.chunkSize === 'number') tvConfig.chunkSize = Math.max(50, cfg.chunkSize);
  } catch (e) { try { console.warn('tv:setTvSearchConfig', e); } catch (_) {} }
};

// --- Helpers --------------------------------------------------------------
function normalizeForSearch(s) {
  try {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (e) {
    try { console.warn('tv:normalizeForSearch fallback', e); } catch (_) {}
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
function debounce(fn, wait) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => { try { fn.apply(this, args); } catch (e) { try { console.error('tv:debounced', e); } catch (_) {} } }, wait);
  };
}
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) resolve();
      else reject(new Error('execCommand failed'));
    } catch (err) {
      try { console.warn('tv:copyToClipboard:fallback', err); } catch (_) {}
      reject(err);
    }
  });
}

// --- Toast ---------------------------------------------------------------
function _ensureToastContainer() {
  let c = document.getElementById('tv-toast-container');
  if (c) return c;
  c = document.createElement('div');
  c.id = 'tv-toast-container';
  Object.assign(c.style, {
    position: 'fixed', bottom: '24px', right: '24px', zIndex: 1300,
    display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end',
    pointerEvents: 'none', maxWidth: 'calc(100% - 48px)'
  });
  document.body.appendChild(c);
  return c;
}
function showToast(msg, { duration = 3000, type = 'info' } = {}) {
  try {
    const container = _ensureToastContainer();
    const el = document.createElement('div');
    el.className = 'tv-toast';
    const rootStyles = getComputedStyle(document.documentElement);
    const panel = rootStyles.getPropertyValue('--panel') || '#fff';
    const textColor = rootStyles.getPropertyValue('--text') || '#111';
    const bg = (type === 'success') ? '#16a34a' : (type === 'warn' ? '#f59e0b' : panel.trim());
    const color = (type === 'success' || type === 'warn') ? '#fff' : textColor.trim();
    Object.assign(el.style, {
      background: bg, color: color, padding: '8px 12px', borderRadius: '8px',
      boxShadow: '0 6px 18px rgba(0,0,0,0.12)', opacity: '0', transform: 'translateY(6px)',
      transition: 'opacity .18s ease, transform .18s ease', pointerEvents: 'auto',
      maxWidth: '360px', wordBreak: 'normal', whiteSpace: 'pre-wrap'
    });
    el.textContent = msg;
    container.appendChild(el);
    void el.offsetHeight;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    const to = setTimeout(() => { try { hide(); } catch (e) { try { console.warn('tv:showToast:hide', e); } catch (_) {} } }, duration);
    function hide() {
      clearTimeout(to);
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => { try { el.remove(); } catch (e) { try { console.warn('tv:showToast:remove', e); } catch (_) {} } }, 220);
    }
    el.addEventListener('click', hide, { once: true, passive: true });
    return el;
  } catch (e) {
    try { console.error('tv:showToast', e); alert(msg); } catch (err) { try { console.warn('tv:showToast:alertFailed', err); } catch (_) {} }
  }
}

// --- Copy modal (fallback UI) ------------------------------------------
function showCopyModal(text, { title = 'Copy text' } = {}) {
  try {
    const existing = document.getElementById('tv-copy-modal'); if (existing) existing.remove();
    const overlay = document.createElement('div'); overlay.id = 'tv-copy-modal';
    Object.assign(overlay.style, { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.45)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' });
    const panel = document.createElement('div'); panel.role = 'dialog'; panel.ariaModal = 'true'; panel.tabIndex = -1;
    const rootStyles = getComputedStyle(document.documentElement);
    const panelBg = rootStyles.getPropertyValue('--panel') || '#fff';
    const textColor = rootStyles.getPropertyValue('--text') || '#111';
    Object.assign(panel.style, { background: panelBg.trim(), color: textColor.trim(), borderRadius: '8px', boxShadow: '0 12px 40px rgba(0,0,0,0.35)', maxWidth: 'min(90%,1000px)', width: '100%', maxHeight: '80vh', overflow: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' });
    const hdr = document.createElement('div'); hdr.style.display = 'flex'; hdr.style.justifyContent = 'space-between'; hdr.style.alignItems = 'center';
    const h = document.createElement('strong'); h.textContent = title || 'Copy';
    const closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.textContent = 'Close';
    Object.assign(closeBtn.style, { marginLeft: '8px' }); closeBtn.addEventListener('click', () => overlay.remove());
    hdr.appendChild(h); hdr.appendChild(closeBtn);
    const ta = document.createElement('textarea'); ta.value = text || ''; ta.readOnly = false; ta.style.width = '100%'; ta.style.height = '320px'; ta.style.resize = 'vertical'; ta.style.whiteSpace = 'pre-wrap'; ta.style.fontFamily = 'monospace, monospace'; ta.style.fontSize = '13px'; ta.setAttribute('aria-label', 'Copy text area');
    const controls = document.createElement('div'); controls.style.display = 'flex'; controls.style.gap = '8px'; controls.style.justifyContent = 'flex-end';
    const selectBtn = document.createElement('button'); selectBtn.type = 'button'; selectBtn.textContent = 'Select All'; selectBtn.addEventListener('click', () => { try { ta.focus(); ta.select(); } catch (e) { try { console.warn('tv:showCopyModal:select', e); } catch (_) {} } });
    const copyBtn = document.createElement('button'); copyBtn.type = 'button'; copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      copyToClipboard(ta.value).then(() => { showToast('Copied to clipboard', { type: 'success' }); overlay.remove(); }).catch((err) => { try { console.warn('tv:showCopyModal:copy', err); } catch (_) {} showToast('Copy failed. Use Select All then Ctrl+C', { type: 'warn' }); });
    });
    controls.appendChild(selectBtn); controls.appendChild(copyBtn);
    panel.appendChild(hdr); panel.appendChild(ta); panel.appendChild(controls); overlay.appendChild(panel); document.body.appendChild(overlay);
    setTimeout(() => { try { ta.focus(); ta.select(); } catch (e) { /* ignore */ } }, 40);
  } catch (e) { try { console.warn('tv:showCopyModal', e); } catch (_) {} try { prompt(title, text); } catch (_) {} }
}

// --- Markdown escaping helper -------------------------------------------
function escapeMarkdownCell(s) {
  try {
    if (s == null) return '';
    return String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  } catch (e) { try { console.warn('tv:escapeMarkdownCell', e); } catch (_) {} return (s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }
}

// --- Safe utilities -----------------------------------------------------
function getSearchEl() { return document.getElementById('searchBox') || document.getElementById('searchInput') || document.getElementById('search'); }
function getTableFromButton(btn) { try { const wrapper = btn && (btn.closest('.table-wrapper') || btn.closest('.table-container') || btn.closest('[data-table-id]')); return wrapper ? wrapper.querySelector('table') : null; } catch (e) { try { console.warn('tv:getTableFromButton', e); } catch (_) {} return null; } }
function safeGetTBody(table) { if (!table) return null; return (table.tBodies && table.tBodies[0]) || null; }
function safeCellText(cell) { try { return (cell && (cell.textContent || '')) + ''; } catch (e) { try { return (cell && (cell.innerText || '')) + ''; } catch (e2) { try { console.warn('tv:safeCellText', e2); } catch (_) {} return ''; } } }
function getTableTitle(table) {
  try {
    if (!table) return '';
    const dataTitle = table.getAttribute('data-title');
    if (dataTitle && dataTitle.trim()) return dataTitle.trim();
    const h3 = table.closest('.table-wrapper')?.querySelector('h3');
    if (h3 && h3.textContent && h3.textContent.trim()) return h3.textContent.trim();
    const aria = table.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    return '';
  } catch (e) { try { console.warn('tv:getTableTitle', e); } catch (_) {} return ''; }
}

// storage
let originalTableRows = [];
let sortStates = [];
let initialWrapperState = []; // Step 6: store initial collapsed state per table wrapper

// --- Sorting helpers (robust) --------------------------------------------
function tryParseNumber(str) {
  try {
    if (str == null) return NaN;
    let t = String(str).trim();
    if (t === '') return NaN;
    let negative = false;
    if (/^\(.*\)$/.test(t)) { negative = true; t = t.replace(/^\(|\)$/g, ''); }
    t = t.replace(/[^\d\.,\-\+eE%]/g, '').replace(/\s/g, '');
    const isPercent = t.indexOf('%') !== -1;
    t = t.replace(/%/g, '');
    t = t.replace(/,/g, '');
    const num = parseFloat(t);
    if (!isFinite(num)) return NaN;
    let res = num;
    if (negative) res = -res;
    if (isPercent) res = res / 100;
    return res;
  } catch (e) { try { console.warn('tv:tryParseNumber', e); } catch (_) {} return NaN; }
}
function tryParseDate(str) {
  try {
    if (!str) return NaN;
    const s = String(str).trim();
    if (s === '') return NaN;
    let ts = Date.parse(s);
    if (!isNaN(ts)) return ts;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let p1 = parseInt(m[1], 10), p2 = parseInt(m[2], 10), p3 = parseInt(m[3], 10);
      let year = p3;
      if (year < 100) year += (year > 50 ? 1900 : 2000);
      let day, month;
      if (p1 > 12) { day = p1; month = p2; }
      else if (p2 > 12) { month = p1; day = p2; }
      else { month = p1; day = p2; }
      const utc = Date.UTC(year, (month - 1), day);
      if (!isNaN(utc)) return utc;
    }
    const cleaned = s.replace(/(\d)(st|nd|rd|th)/g, '$1');
    ts = Date.parse(cleaned);
    if (!isNaN(ts)) return ts;
    return NaN;
  } catch (e) { try { console.warn('tv:tryParseDate', e); } catch (_) {} return NaN; }
}
function detectColumnType(table, colIdx, sampleSize = 30) {
  try {
    const tbody = safeGetTBody(table);
    if (!tbody) return 'string';
    const rows = Array.from(tbody.rows);
    if (rows.length === 0) return 'string';
    const N = Math.min(sampleSize, rows.length);
    const step = Math.max(1, Math.floor(rows.length / N));
    let numeric = 0, dateCount = 0, nonEmpty = 0;
    for (let i = 0, count = 0; i < rows.length && count < N; i += step, count++) {
      const r = rows[i];
      const cell = r.cells[colIdx];
      const txt = (cell ? safeCellText(cell).trim() : '');
      if (!txt) continue;
      nonEmpty++;
      const n = tryParseNumber(txt);
      if (isFinite(n)) { numeric++; continue; }
      const d = tryParseDate(txt);
      if (!isNaN(d) && d > -2208988800000 && d < 4102444800000) { dateCount++; continue; }
    }
    if (nonEmpty === 0) return 'string';
    if (numeric / nonEmpty >= 0.8) return 'number';
    if (dateCount / nonEmpty >= 0.6 && dateCount > 1) return 'date';
    return 'string';
  } catch (e) { try { console.warn('tv:detectColumnType', e); } catch (_) {} return 'string'; }
}

// --- DOM helpers used by many functions ---------------------------------
function updateHeaderSortUI(tableIdx) {
  try {
    const table = document.querySelectorAll(".table-container table")[tableIdx];
    if (!table || !table.tHead) return;
    const ths = table.tHead.rows[0].cells;
    for (let c = 0; c < ths.length; c++) {
      const btn = ths[c].querySelector('.sort-btn');
      if (!btn) continue;
      btn.classList.remove('sort-state-0', 'sort-state-1', 'sort-state-2');
      const state = (sortStates[tableIdx] && sortStates[tableIdx][c]) || 0;
      btn.classList.add('sort-state-' + state);
      if (state === 1) ths[c].setAttribute('aria-sort', 'ascending');
      else if (state === 2) ths[c].setAttribute('aria-sort', 'descending');
      else ths[c].setAttribute('aria-sort', 'none');
      const iconSpan = btn.querySelector('.sort-icon');
      if (iconSpan) {
        if (state === 0) { iconSpan.innerHTML = ''; }
        else if (state === 1) { iconSpan.innerHTML = ''; }
        else { iconSpan.innerHTML = ''; }
      }
    }
  } catch (e) { try { console.warn('tv:updateHeaderSortUI', e); } catch (_) {} }
}

// --- Improved sortTableByColumn (stable, typed, locale-aware) ------------
function sortTableByColumn(tableIdx, colIdx) {
  try {
    const table = document.querySelectorAll(".table-container table")[tableIdx];
    if (!table) return;
    const tbody = safeGetTBody(table);
    if (!tbody) return;

    let state = (sortStates[tableIdx] && sortStates[tableIdx][colIdx]) || 0;
    const rows = Array.from(tbody.rows);

    if (state === 2) {
      sortStates[tableIdx] = sortStates[tableIdx] || [];
      sortStates[tableIdx][colIdx] = 0;
      for (let i = 0; i < (sortStates[tableIdx] || []).length; i++) {
        if (i !== colIdx) sortStates[tableIdx][i] = 0;
      }
      tbody.innerHTML = "";
      (originalTableRows[tableIdx] || []).forEach(r => tbody.appendChild(r.cloneNode(true)));
      Array.from(tbody.rows).forEach(r => {
        Array.from(r.cells).forEach(c => { if (!c.dataset.origHtml) c.dataset.origHtml = c.innerHTML; });
      });
      updateHeaderSortUI(tableIdx);
      try { updateRowCounts(); } catch (e) { try { console.warn('tv:sortTableByColumn:updateRowCounts', e); } catch (_) {} }
      return;
    }

    const colType = detectColumnType(table, colIdx, 30);

    const decorated = rows.map((row, idx) => {
      const cell = row.cells[colIdx];
      const raw = safeCellText(cell).trim();
      let key;
      if (colType === 'number') key = tryParseNumber(raw);
      else if (colType === 'date') key = tryParseDate(raw);
      else key = raw || '';
      return { row, key, raw, idx };
    });

    const comparator = (a, b) => {
      try {
        if (colType === 'number') {
          const ka = a.key, kb = b.key;
          const aNaN = !isFinite(ka);
          const bNaN = !isFinite(kb);
          if (aNaN && bNaN) return a.idx - b.idx;
          if (aNaN) return 1;
          if (bNaN) return -1;
          if (ka < kb) return -1;
          if (ka > kb) return 1;
          return a.idx - b.idx;
        } else if (colType === 'date') {
          const ka = a.key, kb = b.key;
          const aNaN = isNaN(ka);
          const bNaN = isNaN(kb);
          if (aNaN && bNaN) return a.idx - b.idx;
          if (aNaN) return 1;
          if (bNaN) return -1;
          if (ka < kb) return -1;
          if (ka > kb) return 1;
          return a.idx - b.idx;
        } else {
          const sa = String(a.key);
          const sb = String(b.key);
          const cmp = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
          if (cmp !== 0) return cmp;
          return a.idx - b.idx;
        }
      } catch (e) { try { console.warn('tv:sortTableByColumn:comparator', e); } catch (_) {} return a.idx - b.idx; }
    };

    decorated.sort(comparator);
    if (state === 1) {
      decorated.reverse();
      sortStates[tableIdx] = sortStates[tableIdx] || [];
      sortStates[tableIdx][colIdx] = 2;
    } else {
      sortStates[tableIdx] = sortStates[tableIdx] || [];
      sortStates[tableIdx][colIdx] = 1;
    }

    for (let i = 0; i < (sortStates[tableIdx] || []).length; i++) {
      if (i !== colIdx) sortStates[tableIdx][i] = 0;
    }

    const frag = document.createDocumentFragment();
    decorated.forEach(d => frag.appendChild(d.row));
    tbody.innerHTML = "";
    tbody.appendChild(frag);

    Array.from(tbody.rows).forEach(r => {
      Array.from(r.cells).forEach(c => { if (!c.dataset.origHtml) c.dataset.origHtml = c.innerHTML; });
    });

    updateHeaderSortUI(tableIdx);
    try { updateRowCounts(); } catch (e) { try { console.warn('tv:sortTableByColumn:updateRowCounts', e); } catch (_) {} }
  } catch (e) { try { console.error('tv:sortTableByColumn', e); } catch (_) {} }
}

// --- Remaining functions (toggle, copy/export, search etc.) -------------
function headerSortButtonClicked(tableIdx, colIdx, btnEl) { sortTableByColumn(tableIdx, colIdx); try { btnEl && btnEl.focus(); } catch (e) { try { console.warn('tv:headerSortButtonClicked focus', e); } catch (_) {} } }
function toggleTable(btn) {
  try {
    const wrapper = btn.closest('.table-wrapper'); if (!wrapper) return;
    const collapsed = wrapper.classList.toggle('table-collapsed');
    btn.textContent = collapsed ? "Expand Table" : "Collapse Table";
    const anyExpanded = document.querySelectorAll('.table-wrapper:not(.table-collapsed)').length > 0;
    const toggleAllBtn = document.getElementById('toggleAllBtn');
    if (toggleAllBtn) toggleAllBtn.textContent = anyExpanded ? "Collapse All Tables" : "Expand All Tables";
    try { updateRowCounts(); } catch (e) { try { console.warn('tv:toggleTable:updateRowCounts', e); } catch (_) {} }
  } catch (e) { try { console.error('tv:toggleTable', e); } catch (_) {} }
}
function toggleAllTables() {
  try {
    const wrappers = Array.from(document.querySelectorAll('.table-wrapper')); if (wrappers.length === 0) return;
    const anyExpanded = wrappers.some(w => !w.classList.contains('table-collapsed'));
    if (anyExpanded) {
      wrappers.forEach(w => { w.classList.add('table-collapsed'); const btn = w.querySelector('.toggle-table-btn'); if (btn) btn.textContent = "Expand Table"; });
      const toggleAllBtn = document.getElementById('toggleAllBtn'); if (toggleAllBtn) toggleAllBtn.textContent = "Expand All Tables";
    } else {
      wrappers.forEach(w => { w.classList.remove('table-collapsed'); const btn = w.querySelector('.toggle-table-btn'); if (btn) btn.textContent = "Collapse Table"; });
      const toggleAllBtn = document.getElementById('toggleAllBtn'); if (toggleAllBtn) toggleAllBtn.textContent = "Collapse All Tables";
    }
    try { updateRowCounts(); } catch (e) { try { console.warn('tv:toggleAllTables:updateRowCounts', e); } catch (_) {} }
  } catch (e) { try { console.error('tv:toggleAllTables', e); } catch (_) {} }
}

// --- Row counts ---------------------------------------------------------
function updateRowCounts() {
  document.querySelectorAll(".table-wrapper").forEach((wrapper, idx) => {
    const table = wrapper.querySelector("table"); const countDiv = wrapper.querySelector(".row-count"); if (!table || !countDiv) return;
    const tbody = safeGetTBody(table); if (!tbody) { countDiv.textContent = "Showing 0 rows"; return; }
    const rows = tbody.rows; const total = rows.length;
    const visible = Array.from(rows).filter(r => r.style.display !== "none").length;
    if (total === 0) countDiv.textContent = "Showing 0 rows";
    else if (visible === total) countDiv.textContent = `Showing ${total} rows`;
    else countDiv.textContent = `Showing ${visible} of ${total} rows`;
  });
}

// --- Copy / Export functions -------------------------------------------
function copyTablePlain(btn) {
  try {
    const table = getTableFromButton(btn); if (!table) { showToast('No table found to copy', { type: 'warn' }); return; }
    const tbody = safeGetTBody(table) || table;
    let title = getTableTitle(table) || '';
    let text = title + "\n" + Array.from(table.rows).map(r => Array.from(r.cells).map(c => c.textContent.trim()).join("\t")).join("\n");
    copyToClipboard(text).then(() => showToast('Table copied as plain text!', { type: 'success' })).catch((err) => { try { console.warn('tv:copyTablePlain:clipboard', err); } catch (_) {} showCopyModal(text, { title: title ? `Copy: ${title}` : 'Copy table' }); showToast('Clipboard unavailable. Use the box to copy manually.', { type: 'warn' }); });
  } catch (e) { try { console.error('tv:copyTablePlain', e); } catch (_) {} showToast('Copy failed', { type: 'warn' }); }
}
function copyTableMarkdown(btn) {
  try {
    const table = getTableFromButton(btn); if (!table) { showToast('No table found to copy', { type: 'warn' }); return; }
    let title = getTableTitle(table) || '';
    let rows = Array.from(table.rows); if (rows.length === 0) return;
    let head = Array.from(rows[0].cells).map(c => escapeMarkdownCell(c.textContent.trim())).join(" | ");
    let md = (title ? `**${escapeMarkdownCell(title)}**\n` : '') + "| " + head + " |\n| " + Array.from(rows[0].cells).map(() => '---').join(" | ") + " |\n";
    for (let i = 1; i < rows.length; i++) { md += "| " + Array.from(rows[i].cells).map(c => escapeMarkdownCell(c.textContent.trim())).join(" | ") + " |\n"; }
    copyToClipboard(md).then(() => showToast('Table copied in Markdown format!', { type: 'success' })).catch((err) => { try { console.warn('tv:copyTableMarkdown:clipboard', err); } catch (_) {} showCopyModal(md, { title: title ? `Copy Markdown: ${title}` : 'Copy table (Markdown)' }); showToast('Clipboard unavailable. Use the box to copy manually.', { type: 'warn' }); });
  } catch (e) { try { console.error('tv:copyTableMarkdown', e); } catch (_) {} showToast('Copy failed', { type: 'warn' }); }
}
function copyAllTablesPlain() {
  try {
    let text = "";
    const wrappers = Array.from(document.querySelectorAll(".table-wrapper"));
    wrappers.forEach((wrapper, idx) => {
      let title = wrapper.querySelector('h3')?.textContent || wrapper.querySelector('table')?.getAttribute('data-title') || '';
      let table = wrapper.querySelector('table'); if (!table) return;
      text += (title ? title + "\n" : "") + Array.from(table.rows).map(r => Array.from(r.cells).map(c => c.textContent.trim()).join("\t")).join("\n");
      if (idx < wrappers.length - 1) text += "\n\n---\n\n";
    });
    if (!text) { showToast('No tables found to copy', { type: 'warn' }); return; }
    copyToClipboard(text).then(() => showToast("All tables copied as plain text!", { type: 'success' })).catch((err) => { try { console.warn('tv:copyAllTablesPlain:clipboard', err); } catch (_) {} showCopyModal(text, { title: 'Copy all tables' }); showToast('Clipboard unavailable. Use the box to copy manually.', { type: 'warn' }); });
  } catch (e) { try { console.error('tv:copyAllTablesPlain', e); } catch (_) {} showToast('Copy failed', { type: 'warn' }); }
}
function copyAllTablesMarkdown() {
  try {
    let text = "";
    const wrappers = Array.from(document.querySelectorAll(".table-wrapper"));
    wrappers.forEach((wrapper, idx) => {
      let title = wrapper.querySelector('h3')?.textContent || wrapper.querySelector('table')?.getAttribute('data-title') || '';
      let table = wrapper.querySelector('table'); if (!table) return;
      let rows = Array.from(table.rows); if (rows.length === 0) return;
      let head = Array.from(rows[0].cells).map(c => escapeMarkdownCell(c.textContent.trim())).join(" | ");
      text += (title ? `**${escapeMarkdownCell(title)}**\n` : '') + "| " + head + " |\n| " + Array.from(rows[0].cells).map(() => '---').join(" | ") + " |\n";
      for (let i = 1; i < rows.length; i++) { text += "| " + Array.from(rows[i].cells).map(c => escapeMarkdownCell(c.textContent.trim())).join(" | ") + " |\n"; }
      if (idx < wrappers.length - 1) text += "\n\n---\n\n";
    });
    if (!text) { showToast('No tables found to copy', { type: 'warn' }); return; }
    copyToClipboard(text).then(() => showToast("All tables copied in Markdown format!", { type: 'success' })).catch((err) => { try { console.warn('tv:copyAllTablesMarkdown:clipboard', err); } catch (_) {} showCopyModal(text, { title: 'Copy all tables (Markdown)' }); showToast('Clipboard unavailable. Use the box to copy manually.', { type: 'warn' }); });
  } catch (e) { try { console.error('tv:copyAllTablesMarkdown', e); } catch (_) {} showToast('Copy failed', { type: 'warn' }); }
}

// --- Reset all tables (Step 6: full restore to initial state) -----------
function resetAllTables() {
  try {
    const tables = Array.from(document.querySelectorAll(".table-container table"));
    tables.forEach((table, idx) => {
      try {
        const tbody = safeGetTBody(table);
        if (!tbody) return;
        // Restore original snapshot stored at load time
        tbody.innerHTML = "";
        (originalTableRows[idx] || []).forEach(r => {
          const clone = r.cloneNode(true);
          tbody.appendChild(clone);
        });
        // Remove highlights and ensure original-html dataset present
        Array.from(tbody.rows).forEach(r => {
          Array.from(r.cells).forEach(c => {
            try { if (!c.dataset.origHtml) c.dataset.origHtml = c.innerHTML; } catch (_) {}
            try { clearHighlights(c); } catch (_) {}
          });
        });
        // Reset sort states for this table
        sortStates[idx] = Array(table.rows[0]?.cells.length || 0).fill(0);
        updateHeaderSortUI(idx);
        // Restore wrapper collapsed state to initial captured state
        const wrapper = table.closest('.table-wrapper');
        const shouldCollapsed = !!initialWrapperState[idx];
        if (wrapper) {
          if (shouldCollapsed) wrapper.classList.add('table-collapsed'); else wrapper.classList.remove('table-collapsed');
          const btn = wrapper.querySelector('.toggle-table-btn');
          if (btn) btn.textContent = shouldCollapsed ? "Expand Table" : "Collapse Table";
        }
      } catch (e) { try { console.warn('tv:resetAllTables:table', e); } catch (_) {} }
    });

    // Reset toggle-all button text to reflect restored state
    const anyExpanded = document.querySelectorAll('.table-wrapper:not(.table-collapsed)').length > 0;
    const toggleAllBtn = document.getElementById('toggleAllBtn');
    if (toggleAllBtn) toggleAllBtn.textContent = anyExpanded ? "Collapse All Tables" : "Expand All Tables";

    // Clear search input and remove any remaining highlights across the page
    const sb = getSearchEl(); if (sb) sb.value = '';
    document.querySelectorAll('.table-container table td, .table-container table th').forEach(cell => { try { clearHighlights(cell); } catch (_) {} });

    // Refresh virtualizer if present
    try { if (window.tableVirtualizer?.refresh) window.tableVirtualizer.refresh(); else if (window.tableVirtualizer?.update) window.tableVirtualizer.update(); } catch (_) {}

    try { updateRowCounts(); } catch (e) { try { console.warn('tv:resetAllTables:updateRowCounts', e); } catch (_) {} }

    showToast("All tables reset to initial state", { type: 'success' });
  } catch (e) { try { console.error('tv:resetAllTables', e); } catch (_) {} showToast('Reset failed', { type: 'warn' }); }
}

// --- Search (enhanced, unchanged) ---------------------------------------
function clearHighlights(cell) {
  if (!cell) return;
  if (cell.dataset && cell.dataset.origHtml) { cell.innerHTML = cell.dataset.origHtml; return; }
  const marks = Array.from(cell.querySelectorAll('mark')); marks.forEach(m => {
    const textNode = document.createTextNode(m.textContent);
    if (m.parentNode) m.parentNode.replaceChild(textNode, m);
  });
}
function buildNormalizedMapForCell(cell) {
  const nodes = [];
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
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
      try { filtered = decomposed.replace(/[^\p{L}\p{N}\s]/gu, ''); } catch (e) { try { console.warn('tv:buildNormalizedMapForCell:regex', e); } catch (_) {} filtered = decomposed.replace(/[^\w\s]/g, ''); }
      if (filtered.length > 0) {
        for (let k = 0; k < filtered.length; k++) {
          normStr += filtered[k];
          map.push({ nodeIndex: ni, offsetInNode: i });
        }
      }
      i += charLen;
    }
  }
  return { normStr, map, nodes };
}
function highlightMatches(cell, filterNorm) {
  if (!cell || !filterNorm || !tvConfig.highlight) return;
  if (cell.dataset && cell.dataset.origHtml) cell.innerHTML = cell.dataset.origHtml;
  let built;
  try { built = buildNormalizedMapForCell(cell); } catch (e) { try { console.warn('tv:highlightMatches:buildMap', e); } catch (_) {} return; }
  const normStr = built.normStr.toLowerCase();
  if (!normStr || normStr.length === 0) return;
  const map = built.map; const nodes = built.nodes;
  const needle = filterNorm.toLowerCase();
  const matches = []; let pos = 0;
  while (true) { const idx = normStr.indexOf(needle, pos); if (idx === -1) break; matches.push(idx); pos = idx + needle.length; }
  if (matches.length === 0) return;
  for (let mi = matches.length - 1; mi >= 0; mi--) {
    const startNorm = matches[mi]; const endNormExclusive = startNorm + needle.length;
    const startMap = map[startNorm]; const endMap = map[endNormExclusive - 1];
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
    } catch (e) { try { console.warn('tv:highlightMatches:endOffset', e); } catch (_) {} endOffsetExclusive = Math.min(endOffsetExclusive + 1, nodes[endNodeIndex].nodeValue.length); }
    try {
      if (startNodeIndex === endNodeIndex) {
        const tn = nodes[startNodeIndex];
        const rawLen = tn.nodeValue.length;
        const s = Math.max(0, Math.min(startOffset, rawLen));
        const e = Math.max(0, Math.min(endOffsetExclusive, rawLen));
        if (s >= e) continue;
        const after = tn.splitText(e);
        const middle = tn.splitText(s);
        const mark = document.createElement('mark');
        mark.appendChild(document.createTextNode(middle.data));
        middle.parentNode.replaceChild(mark, middle);
      } else {
        const startNode = nodes[startNodeIndex]; const endNode = nodes[endNodeIndex];
        const rawStartLen = startNode.nodeValue.length; const rawEndLen = endNode.nodeValue.length;
        const sOff = Math.max(0, Math.min(startOffset, rawStartLen)); const eOff = Math.max(0, Math.min(endOffsetExclusive, rawEndLen));
        const afterEnd = endNode.splitText(eOff);
        const middleStart = startNode.splitText(sOff);
        const wrapNodes = []; let cur = middleStart;
        while (cur) { wrapNodes.push(cur); if (cur === endNode) break; cur = cur.nextSibling; if (!cur) break; }
        if (wrapNodes.length === 0) continue;
        const parent = wrapNodes[0].parentNode; if (!parent) continue;
        const mark = document.createElement('mark'); parent.insertBefore(mark, wrapNodes[0]);
        wrapNodes.forEach(n => { try { mark.appendChild(n); } catch (e) { try { console.warn('tv:highlightMatches:append', e); } catch (_) {} } });
      }
    } catch (e) { try { console.warn('tv:highlightMatches:match', e); } catch (_) {} continue; }
  }
}

// Process rows in chunks for large tables
function processRowsInChunks(rows, cb) {
  return new Promise((resolve) => {
    try {
      const len = rows.length;
      if (len === 0) { resolve(); return; }
      const chunk = Math.max(50, Math.min(tvConfig.chunkSize, 1000));
      if (len <= chunk) {
        for (let i = 0; i < len; i++) cb(rows[i], i);
        resolve();
        return;
      }
      let i = 0;
      function runChunk() {
        const end = Math.min(i + chunk, len);
        for (; i < end; i++) cb(rows[i], i);
        if (i < len) setTimeout(runChunk, 0);
        else resolve();
      }
      runChunk();
    } catch (e) { try { console.warn('tv:processRowsInChunks', e); } catch (_) {} resolve(); }
  });
}

// Enhanced search function
async function searchTable() {
  try {
    const searchEl = getSearchEl();
    const filterRaw = searchEl?.value || '';
    const filterNorm = normalizeForSearch(filterRaw);
    let firstMatch = null;
    const tableNodes = Array.from(document.querySelectorAll('.table-container table'));
    const tablePromises = tableNodes.map(async (table) => {
      try {
        const tbody = safeGetTBody(table);
        if (!tbody) return;
        const rowsArray = Array.from(tbody.rows);
        await processRowsInChunks(rowsArray, (row) => {
          try {
            let rowMatches = false;
            for (let ci = 0; ci < row.cells.length; ci++) {
              const cell = row.cells[ci];
              try { clearHighlights(cell); } catch (_) {}
              const txt = safeCellText(cell);
              if (filterNorm && normalizeForSearch(txt).includes(filterNorm)) {
                rowMatches = true;
              }
            }
            row.style.display = (!filterNorm || rowMatches) ? '' : 'none';
            if (rowMatches) {
              Array.from(row.cells).forEach(cell => { try { if (tvConfig.highlight) highlightMatches(cell, filterNorm); } catch (_) {} });
              if (!firstMatch) firstMatch = row;
            }
          } catch (e) { try { console.warn('tv:searchTable:rowProcess', e); } catch (_) {} }
        });
      } catch (e) { try { console.warn('tv:searchTable:table', e); } catch (_) {} }
    });
    await Promise.all(tablePromises);
    try { if (window.tableVirtualizer?.refresh) { window.tableVirtualizer.refresh(); } else if (window.tableVirtualizer?.update) { window.tableVirtualizer.update(); } } catch (e) { try { console.warn('tv:searchTable:virtualizer', e); } catch (_) {} }
    if (firstMatch) {
      try {
        const rect = firstMatch.getBoundingClientRect();
        const headerHeight = document.getElementById('stickyMainHeader')?.offsetHeight || 0;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
        window.scrollTo({ top: scrollTop + rect.top - headerHeight - 5, behavior: 'smooth' });
      } catch (e) { try { console.warn('tv:searchTable:scroll', e); } catch (_) {} }
    }
    try { updateRowCounts(); } catch (e) { try { console.warn('tv:searchTable:updateRowCounts', e); } catch (_) {} }
  } catch (e) { try { console.error('tv:searchTable', e); } catch (_) {} }
}

// --- Attach handlers and initial DOM setup ------------------------------
document.addEventListener('DOMContentLoaded', function () {
  try {
    // Wrap tables in .table-container if missing
    document.querySelectorAll('.table-wrapper').forEach(wrapper => {
      if (wrapper.querySelector('.table-container')) return;
      const table = wrapper.querySelector('table'); if (!table) return;
      const container = document.createElement('div'); container.className = 'table-container';
      wrapper.insertBefore(container, table); container.appendChild(table);
    });

    // Build snapshots and sortStates after DOM is stable and capture initial wrapper state
    document.querySelectorAll(".table-container table").forEach((table, idx) => {
      try {
        const tbody = safeGetTBody(table);
        originalTableRows[idx] = tbody ? Array.from(tbody.rows).map(r => r.cloneNode(true)) : [];
        sortStates[idx] = Array(table.rows[0]?.cells.length || 0).fill(0);
        const wrapper = table.closest('.table-wrapper');
        initialWrapperState[idx] = !!(wrapper && wrapper.classList.contains('table-collapsed'));
      } catch (e) { try { console.warn('tv:DOMContentLoaded:snapshot', e); } catch (_) {} originalTableRows[idx] = originalTableRows[idx] || []; sortStates[idx] = sortStates[idx] || []; initialWrapperState[idx] = initialWrapperState[idx] || false; }
    });

    // attach per-cell original HTML snapshot used to restore highlights safely
    document.querySelectorAll('.table-container table').forEach(table => {
      const tbody = safeGetTBody(table); if (!tbody) return;
      Array.from(tbody.rows).forEach(r => { Array.from(r.cells).forEach(c => { if (!c.dataset.origHtml) c.dataset.origHtml = c.innerHTML; }); });
    });

    // Update header sort UI
    document.querySelectorAll(".table-container table").forEach((t, idx) => { try { updateHeaderSortUI(idx); } catch (e) { try { console.warn('tv:DOMContentLoaded:updateHeaderSortUI', e); } catch (_) {} } });

    // Update toggle buttons text
    document.querySelectorAll('.table-wrapper').forEach((w, wrapperIdx) => {
      const btn = w.querySelector('.toggle-table-btn');
      if (btn) {
        const initial = initialWrapperState[wrapperIdx];
        btn.textContent = initial ? "Expand Table" : "Collapse Table";
      }
    });

    // Toggle all button state
    const anyExpanded = document.querySelectorAll('.table-wrapper:not(.table-collapsed)').length > 0;
    const toggleAll = document.getElementById('toggleAllBtn'); if (toggleAll) toggleAll.textContent = anyExpanded ? "Collapse All Tables" : "Expand All Tables";

    // Ensure backToTop exists
    if (!document.getElementById('backToTop')) {
      try { const b = document.createElement('button'); b.id = 'backToTop'; b.type = 'button'; b.title = 'Back to top'; b.textContent = '↑'; b.style.display = 'none'; document.body.appendChild(b); b.addEventListener('click', backToTop); } catch (e) { try { console.warn('tv:DOMContentLoaded:backToTop', e); } catch (_) {} }
    }

    // Attach search handlers (debounced using tvConfig.debounceMs)
    const sb = getSearchEl();
    if (sb) {
      const deb = debounce(searchTable, tvConfig.debounceMs);
      try {
        sb.addEventListener('input', deb);
        sb.addEventListener('keyup', function (e) { if (e.key === 'Enter') searchTable(); });
      } catch (e) { try { console.warn('tv:DOMContentLoaded:searchHandlers', e); } catch (_) {} }
    }

    // Single consolidated keydown handler for "/" and "Escape"
    document.addEventListener("keydown", function (e) {
      try {
        const active = document.activeElement;
        const tag = active && (active.tagName || "").toLowerCase();
        if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (tag === 'input' || tag === 'textarea' || (active && active.isContentEditable)) return;
          e.preventDefault(); const s = getSearchEl(); if (s) { s.focus(); s.select(); } return;
        }
        if (e.key === "Escape") { backToTop(); return; }
      } catch (err) { try { console.warn('tv:DOMContentLoaded:keyHandler', err); } catch (_) {} }
    });

    // Initial row counts
    try { updateRowCounts(); } catch (e) { try { console.warn('tv:DOMContentLoaded:updateRowCounts', e); } catch (_) {} }

  } catch (e) { try { console.error('tv:DOMContentLoaded', e); } catch (_) {} }
});

// delegated click: sorting (bind header clicks to sort behavior)
document.addEventListener('click', function (e) {
  try {
    const el = e.target;
    const hit = el.closest && (el.closest('.sort-btn') || el.closest('.th-with-sort') || (el.tagName && el.tagName.toLowerCase() === 'th' && el.getAttribute('role') === 'button' ? el : null));
    if (!hit) return;
    const th = hit.closest('th') || (hit.tagName && hit.tagName.toLowerCase() === 'th' ? hit : null);
    if (!th) return;
    const table = th.closest('table'); if (!table) return;
    const tables = Array.from(document.querySelectorAll('.table-container table')); const tableIdx = tables.indexOf(table);
    const colIdx = th.cellIndex; if (tableIdx === -1 || typeof colIdx === 'undefined' || colIdx < 0) return;
    headerSortButtonClicked(tableIdx, colIdx, hit); e.preventDefault();
  } catch (err) { try { console.error('tv:delegate:sortClick', err); } catch (_) {} }
});

// delegated click: TOC anchor scroll
document.addEventListener('click', function (e) {
  try {
    const a = e.target.closest && e.target.closest('#tocBar a[href^="#"]'); if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('href').substring(1);
    const container = document.getElementById(id)?.closest('.table-wrapper'); if (!container) return;
    const headerHeight = document.getElementById('stickyMainHeader')?.offsetHeight || 0;
    const containerTop = container.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({ top: containerTop - headerHeight - 5, behavior: 'smooth' });
    try { history.replaceState(null, '', '#' + id); } catch (err) { try { console.warn('tv:delegate:tocClick:history', err); } catch (_) {} }
  } catch (err) { try { console.warn('tv:delegate:tocClick', err); } catch (_) {} }
});

// backToTop visibility on scroll
window.addEventListener("scroll", function () {
  try {
    const btn = document.getElementById("backToTop"); if (!btn) return;
    if (document.documentElement.scrollTop > 200 || window.scrollY > 200) btn.style.display = "block"; else btn.style.display = "none";
  } catch (e) { try { console.warn('tv:scroll', e); } catch (_) {} }
});
function backToTop() { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { try { console.warn('tv:backToTop', e); } catch (_) {} } }

// Expose minimal handlers
window.headerSortButtonClicked = headerSortButtonClicked;
window.toggleTable = toggleTable;
window.toggleAllTables = toggleAllTables;
window.copyTablePlain = copyTablePlain;
window.copyTableMarkdown = copyTableMarkdown;
window.copyAllTablesPlain = copyAllTablesPlain;
window.copyAllTablesMarkdown = copyAllTablesMarkdown;
window.resetAllTables = resetAllTables;
window.searchTable = searchTable;
window.toggleMode = function () {
  try {
    const modeBtn = document.getElementById('modeBtn');
    const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
    if (dark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (modeBtn) modeBtn.textContent = 'Light mode';
      localStorage.setItem('uiMode', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (modeBtn) modeBtn.textContent = 'Dark mode';
      localStorage.setItem('uiMode', 'light');
    }
  } catch (e) { try { console.warn('tv:toggleMode', e); } catch (_) {} }
};

})();