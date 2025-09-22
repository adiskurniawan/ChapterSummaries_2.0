// assets/script.js — Fixed: never inject copy buttons, still create/export CSV/MD if missing.
// Reviewed carefully.

(function () {
  'use strict';

  const tvConfig = { highlight: true, debounceMs: 150, chunkSize: 300 };
  window.tvConfig = tvConfig;
  window.setTvSearchConfig = function (cfg) {
    try {
      if (typeof cfg !== 'object' || cfg === null) return;
      if (typeof cfg.highlight === 'boolean') tvConfig.highlight = cfg.highlight;
      if (typeof cfg.debounceMs === 'number') tvConfig.debounceMs = Math.max(0, cfg.debounceMs);
      if (typeof cfg.chunkSize === 'number') tvConfig.chunkSize = Math.max(50, cfg.chunkSize);
    } catch (e) { /* silent */ }
  };

  function normalizeForSearch(s) {
    try {
      return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
    } catch (e) {
      return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    }
  }
  function debounce(fn, wait) { let t; return function (...args) { clearTimeout(t); t = setTimeout(() => { try { fn.apply(this, args); } catch (e) {} }, wait); }; }

  function copyToClipboard(text) {
    return new Promise((resolve, reject) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(resolve).catch(() => tryLegacyCopy(text).then(resolve).catch(reject));
        return;
      }
      tryLegacyCopy(text).then(resolve).catch(reject);
    });
  }
  function tryLegacyCopy(t) {
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error('execCommand failed'));
      } catch (err) { try { console.warn('tv:copyToClipboard:legacy failed', err); } catch (_) {} reject(err); }
    });
  }

  let _toastQueue = []; let _activeToast = null; let _toastIdCounter = 0;
  function _ensureToastContainer() {
    try {
      let c = document.getElementById('tv-toast-container');
      if (c) return c;
      c = document.createElement('div');
      c.id = 'tv-toast-container';
      c.setAttribute('role', 'status');
      c.setAttribute('aria-live', 'polite');
      c.setAttribute('aria-atomic', 'true');
      Object.assign(c.style, { position: 'fixed', bottom: '24px', right: '24px', zIndex: 1300, display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end', pointerEvents: 'none', maxWidth: 'calc(100% - 48px)' });
      document.body.appendChild(c);
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
      const el = document.createElement('div');
      el.className = 'tv-toast';
      el.setAttribute('data-toast-id', item.id);
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.tabIndex = -1;
      Object.assign(el.style, {
        background: (getComputedStyle(document.documentElement).getPropertyValue('--panel') || '#fff').trim(),
        color: (getComputedStyle(document.documentElement).getPropertyValue('--text') || '#111').trim(),
        padding: '8px 12px', borderRadius: '8px', boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
        opacity: '0', transform: 'translateY(6px)', transition: 'opacity .18s ease, transform .18s ease',
        pointerEvents: 'auto', maxWidth: '360px', wordBreak: 'normal', whiteSpace: 'pre-wrap',
        display: 'flex', alignItems: 'center', gap: '8px'
      });
      if (item.type === 'success') { el.style.background = '#16a34a'; el.style.color = '#fff'; }
      else if (item.type === 'warn') { el.style.background = '#f59e0b'; el.style.color = '#fff'; }
      else if (item.type === 'error') { el.style.background = '#dc2626'; el.style.color = '#fff'; }
      const textWrap = document.createElement('div'); textWrap.style.flex = '1 1 auto'; textWrap.style.minWidth = '0'; textWrap.textContent = item.msg;
      const closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.ariaLabel = 'Dismiss notification'; closeBtn.title = 'Dismiss'; closeBtn.innerHTML = '✕';
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
        const prevActive = document.activeElement;
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
      if (!_activeToast || !_activeToast.el) { if (el && el.parentNode) el.remove(); setTimeout(_processToastQueue, 100); return; }
      try { clearTimeout(_activeToast.timeoutId); } catch (_) {}
      try { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; } catch (_) {}
      setTimeout(() => { try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (_) {} _activeToast = null; setTimeout(_processToastQueue, 80); }, 220);
    } catch (e) { _activeToast = null; setTimeout(_processToastQueue, 80); }
  }
  function _dismissToastById(id) {
    try {
      if (_activeToast && _activeToast.id === id && _activeToast.el) { _hideActiveToast(_activeToast.el, true); return; }
      for (let i = 0; i < _toastQueue.length; i++) { if (_toastQueue[i].id === id) { _toastQueue.splice(i, 1); return; } }
    } catch (e) { /* silent */ }
  }

  function showCopyModal(text, { title = 'Copy text' } = {}) {
    try {
      const existing = document.getElementById('tv-copy-modal');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'tv-copy-modal';
      Object.assign(overlay.style, { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.45)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' });
      const panel = document.createElement('div');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.tabIndex = -1;
      const rootStyles = getComputedStyle(document.documentElement);
      const panelBg = rootStyles.getPropertyValue('--panel') || '#fff';
      const textColor = rootStyles.getPropertyValue('--text') || '#111';
      Object.assign(panel.style, { background: panelBg.trim(), color: textColor.trim(), borderRadius: '8px', boxShadow: '0 12px 40px rgba(0,0,0,0.35)', maxWidth: 'min(90%,1000px)', width: '100%', maxHeight: '80vh', overflow: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' });
      const hdr = document.createElement('div'); hdr.style.display = 'flex'; hdr.style.justifyContent = 'space-between'; hdr.style.alignItems = 'center';
      const h = document.createElement('strong'); h.textContent = title || 'Copy';
      const closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.textContent = 'Close';
      Object.assign(closeBtn.style, { marginLeft: '8px' });
      closeBtn.addEventListener('click', () => overlay.remove());
      hdr.appendChild(h); hdr.appendChild(closeBtn);
      const ta = document.createElement('textarea'); ta.value = text || ''; ta.readOnly = false; ta.style.width = '100%'; ta.style.height = '320px'; ta.style.resize = 'vertical'; ta.style.whiteSpace = 'pre-wrap'; ta.style.fontFamily = 'monospace, monospace'; ta.style.fontSize = '13px'; ta.setAttribute('aria-label', 'Copy text area');
      const controls = document.createElement('div'); controls.style.display = 'flex'; controls.style.gap = '8px'; controls.style.justifyContent = 'flex-end';
      const selectBtn = document.createElement('button'); selectBtn.type = 'button'; selectBtn.textContent = 'Select All'; selectBtn.addEventListener('click', () => { try { ta.focus(); ta.select(); } catch (_) {} });
      const copyBtn = document.createElement('button'); copyBtn.type = 'button'; copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        copyToClipboard(ta.value).then(() => { showToast('Copied to clipboard', { type: 'success' }); overlay.remove(); }).catch(() => { showToast('Copy failed', { type: 'warn' }); });
      });
      const downloadBtn = document.createElement('button'); downloadBtn.type = 'button'; downloadBtn.textContent = 'Download';
      downloadBtn.addEventListener('click', () => {
        try {
          const blob = new Blob([ta.value], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = (title || 'export').replace(/[\/\\:*?"<>|]/g, '_') + '.txt';
          document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); showToast('Downloaded', { type: 'success' }); overlay.remove();
        } catch (e) { showToast('Download failed', { type: 'warn' }); }
      });
      controls.appendChild(selectBtn); controls.appendChild(copyBtn); controls.appendChild(downloadBtn);
      panel.appendChild(hdr); panel.appendChild(ta); panel.appendChild(controls); overlay.appendChild(panel); document.body.appendChild(overlay);
      try { ta.focus(); ta.select(); } catch (_) {}
      return overlay;
    } catch (e) { try { alert(String(text || '')); } catch (_) {} return null; }
  }

  function getSearchEl() { return document.getElementById('searchBox') || document.getElementById('searchInput') || document.getElementById('search'); }
  function getTableFromButton(btn) {
    try {
      const wrapper = btn && (btn.closest('.table-wrapper') || btn.closest('.table-container') || btn.closest('[data-table-id]'));
      return wrapper ? wrapper.querySelector('table') : null;
    } catch (e) { return null; }
  }

  let originalTableRows = []; let sortStates = [];
  function safeGetTBody(table) { if (!table) return null; return (table.tBodies && table.tBodies[0]) || null; }

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
          if (state === 0) iconSpan.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 14l5-5 5 5"></path><path d="M7 10l5 5 5-5"></path></svg>';
          else if (state === 1) iconSpan.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V6"></path><path d="M5 12l7-7 7 7"></path></svg>';
          else iconSpan.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v13"></path><path d="M19 12l-7 7-7-7"></path></svg>';
        }
      }
    } catch (e) {}
  }

  function sortTableByColumn(tableIdx, colIdx) {
    try {
      const table = document.querySelectorAll(".table-container table")[tableIdx];
      if (!table) return;
      const tbody = safeGetTBody(table);
      if (!tbody) return;
      let state = (sortStates[tableIdx] && sortStates[tableIdx][colIdx]) || 0;
      let rows = Array.from(tbody.rows);
      if (state === 0) {
        rows.sort((a, b) => {
          let valA = a.cells[colIdx]?.textContent.trim() || '';
          let valB = b.cells[colIdx]?.textContent.trim() || '';
          let numA = parseFloat(valA.replace(/,/g, '')); let numB = parseFloat(valB.replace(/,/g, ''));
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return valA.localeCompare(valB);
        });
        sortStates[tableIdx] = sortStates[tableIdx] || []; sortStates[tableIdx][colIdx] = 1;
      } else if (state === 1) {
        rows.sort((a, b) => {
          let valA = a.cells[colIdx]?.textContent.trim() || '';
          let valB = b.cells[colIdx]?.textContent.trim() || '';
          let numA = parseFloat(valA.replace(/,/g, '')); let numB = parseFloat(valB.replace(/,/g, ''));
          if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
          return valB.localeCompare(valA);
        });
        sortStates[tableIdx] = sortStates[tableIdx] || []; sortStates[tableIdx][colIdx] = 2;
      } else {
        rows = (originalTableRows[tableIdx] || []).map(r => r.cloneNode(true));
        sortStates[tableIdx] = sortStates[tableIdx] || []; sortStates[tableIdx][colIdx] = 0;
      }
      for (let i = 0; i < (sortStates[tableIdx] || []).length; i++) { if (i !== colIdx) sortStates[tableIdx][i] = 0; }
      tbody.innerHTML = ""; rows.forEach(r => tbody.appendChild(r));
      Array.from(tbody.rows).forEach(r => Array.from(r.cells).forEach(c => { if (!c.dataset.origHtml) c.dataset.origHtml = c.innerHTML; }));
      updateHeaderSortUI(tableIdx);
      try { updateRowCounts(); } catch (e) {}
    } catch (e) {}
  }
  function headerSortButtonClicked(tableIdx, colIdx, btnEl) { sortTableByColumn(tableIdx, colIdx); try { btnEl && btnEl.focus(); } catch (e) {} }

  function toggleTable(btn) {
    try {
      const wrapper = btn.closest('.table-wrapper');
      if (!wrapper) return;
      const collapsed = wrapper.classList.toggle('table-collapsed');
      btn.textContent = collapsed ? "Expand Table" : "Collapse Table";
      const anyExpanded = document.querySelectorAll('.table-wrapper:not(.table-collapsed)').length > 0;
      const toggleAllBtn = document.getElementById('toggleAllBtn');
      if (toggleAllBtn) toggleAllBtn.textContent = anyExpanded ? "Collapse All Tables" : "Expand All Tables";
      try { updateRowCounts(); } catch (e) {}
    } catch (e) {}
  }
  function toggleAllTables() {
    try {
      const wrappers = Array.from(document.querySelectorAll('.table-wrapper'));
      if (wrappers.length === 0) return;
      const anyExpanded = wrappers.some(w => !w.classList.contains('table-collapsed'));
      if (anyExpanded) { wrappers.forEach(w => { w.classList.add('table-collapsed'); const btn = w.querySelector('.toggle-table-btn'); if (btn) btn.textContent = "Expand Table"; }); const toggleAllBtn = document.getElementById('toggleAllBtn'); if (toggleAllBtn) toggleAllBtn.textContent = "Expand All Tables"; }
      else { wrappers.forEach(w => { w.classList.remove('table-collapsed'); const btn = w.querySelector('.toggle-table-btn'); if (btn) btn.textContent = "Collapse Table"; }); const toggleAllBtn = document.getElementById('toggleAllBtn'); if (toggleAllBtn) toggleAllBtn.textContent = "Collapse All Tables"; }
      try { updateRowCounts(); } catch (e) {}
    } catch (e) {}
  }

  function updateRowCounts() {
    document.querySelectorAll(".table-wrapper").forEach((wrapper, idx) => {
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

  function copyTablePlain(btn) {
    try {
      const table = getTableFromButton(btn);
      if (!table) { showToast('No table found to copy', { type: 'warn' }); return; }
      const tbody = safeGetTBody(table) || table;
      let title = table.closest('.table-wrapper')?.querySelector('h3')?.textContent || '';
      let text = title + "\n" + Array.from(table.rows).map(r => Array.from(r.cells).map(c => c.textContent.trim()).join("\t")).join("\n");
      copyToClipboard(text).then(() => showToast('Table copied as plain text!', { type: 'success' })).catch(() => { try { showCopyModal(text, { title: 'Copy table text' }); } catch (e) { showToast('Copy failed', { type: 'warn' }); } });
    } catch (e) { showToast('Copy failed', { type: 'warn' }); }
  }
  function copyTableMarkdown(btn) {
    try {
      const table = getTableFromButton(btn);
      if (!table) { showToast('No table found to copy', { type: 'warn' }); return; }
      let title = table.closest('.table-wrapper')?.querySelector('h3')?.textContent || '';
      let rows = Array.from(table.rows);
      if (rows.length === 0) return;
      let head = Array.from(rows[0].cells).map(c => c.textContent.trim()).join(" | ");
      let md = "**" + title + "**\n| " + head + " |\n| " + Array.from(rows[0].cells).map(() => '---').join(" | ") + " |\n";
      for (let i = 1; i < rows.length; i++) md += "| " + Array.from(rows[i].cells).map(c => c.textContent.trim()).join(" | ") + " |\n";
      copyToClipboard(md).then(() => showToast('Table copied in Markdown format!', { type: 'success' })).catch(() => { try { showCopyModal(md, { title: 'Copy table markdown' }); } catch (e) { showToast('Copy failed', { type: 'warn' }); } });
    } catch (e) { showToast('Copy failed', { type: 'warn' }); }
  }
  function copyAllTablesPlain() {
    try {
      let text = "";
      document.querySelectorAll(".table-wrapper").forEach(wrapper => {
        let title = wrapper.querySelector('h3')?.textContent || '';
        let table = wrapper.querySelector('table');
        if (!table) return;
        text += title + "\n" + Array.from(table.rows).map(r => Array.from(r.cells).map(c => c.textContent.trim()).join("\t")).join("\n") + "\n";
      });
      copyToClipboard(text).then(() => showToast("All tables copied as plain text!", { type: 'success' })).catch(() => { try { showCopyModal(text, { title: 'Copy all tables' }); } catch (e) { showToast('Copy failed', { type: 'warn' }); } });
    } catch (e) { showToast('Copy failed', { type: 'warn' }); }
  }
  function copyAllTablesMarkdown() {
    try {
      let text = "";
      document.querySelectorAll(".table-wrapper").forEach(wrapper => {
        let title = wrapper.querySelector('h3')?.textContent || '';
        let table = wrapper.querySelector('table');
        if (!table) return;
        let rows = Array.from(table.rows);
        if (rows.length === 0) return;
        let head = Array.from(rows[0].cells).map(c => c.textContent.trim()).join(" | ");
        text += "**" + title + "**\n| " + head + " |\n| " + Array.from(rows[0].cells).map(() => '---').join(" | ") + " |\n";
        for (let i = 1; i < rows.length; i++) text += "| " + Array.from(rows[i].cells).map(c => c.textContent.trim()).join(" | ") + " |\n";
      });
      copyToClipboard(text).then(() => showToast("All tables copied in Markdown format!", { type: 'success' })).catch(() => { try { showCopyModal(text, { title: 'Copy all tables markdown' }); } catch (e) { showToast('Copy failed', { type: 'warn' }); } });
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
        if (v.indexOf('"') !== -1 || v.indexOf(',') !== -1 || v.indexOf('\n') !== -1) return '"' + v.replace(/"/g, '""') + '"';
        return v;
      }).join(',')).join('\r\n');
      const safeName = (filename || table.closest('.table-wrapper')?.querySelector('h3')?.textContent || 'table').replace(/[\/\\:*?"<>|]/g, '_') + '.csv';
      const blob = new Blob(["\uFEFF", csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = safeName; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      showToast('CSV exported', { type: 'success' });
    } catch (e) { showToast('CSV export failed', { type: 'warn' }); }
  }

  function resetAllTables() {
    try {
      document.querySelectorAll(".table-container table").forEach((table, idx) => {
        const tbody = safeGetTBody(table);
        if (!tbody) return;
        tbody.innerHTML = "";
        (originalTableRows[idx] || []).forEach(r => { const clone = r.cloneNode(true); tbody.appendChild(clone); });
        Array.from(tbody.rows).forEach(r => Array.from(r.cells).forEach(c => { if (!c.dataset.origHtml) c.dataset.origHtml = c.innerHTML; }));
        sortStates[idx] = Array(table.rows[0]?.cells.length || 0).fill(0);
        updateHeaderSortUI(idx);
      });
      document.querySelectorAll('.table-wrapper').forEach(w => { w.classList.remove('table-collapsed'); const btn = w.querySelector('.toggle-table-btn'); if (btn) btn.textContent = "Collapse Table"; });
      const toggleAllBtn = document.getElementById('toggleAllBtn'); if (toggleAllBtn) toggleAllBtn.textContent = "Collapse All Tables";
      const sb = getSearchEl(); if (sb) sb.value = "";
      searchTable();
      try { updateRowCounts(); } catch (e) {}
      showToast("All tables reset!", { type: 'success' });
    } catch (e) { showToast('Reset failed', { type: 'warn' }); }
  }

  function clearHighlights(cell) {
    if (!cell) return;
    if (cell.dataset && cell.dataset.origHtml) { cell.innerHTML = cell.dataset.origHtml; return; }
    const marks = Array.from(cell.querySelectorAll('mark'));
    marks.forEach(m => { const textNode = document.createTextNode(m.textContent); if (m.parentNode) m.parentNode.replaceChild(textNode, m); });
  }
  function buildNormalizedMapForCell(cell) {
    const nodes = []; const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) {
      const tn = walker.currentNode;
      if (!tn.nodeValue || tn.nodeValue.length === 0) continue;
      if (tn.nodeValue.trim() === '') continue;
      nodes.push(tn);
    }
    let normStr = ''; const map = [];
    for (let ni = 0; ni < nodes.length; ni++) {
      const raw = nodes[ni].nodeValue;
      for (let i = 0; i < raw.length;) {
        const cp = raw.codePointAt(i); const ch = String.fromCodePoint(cp); const charLen = cp > 0xFFFF ? 2 : 1;
        const decomposed = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        let filtered;
        try { filtered = decomposed.replace(/[^\p{L}\p{N}\s]/gu, ''); } catch (e) { filtered = decomposed.replace(/[^\w\s]/g, ''); }
        if (filtered.length > 0) { for (let k = 0; k < filtered.length; k++) { normStr += filtered[k]; map.push({ nodeIndex: ni, offsetInNode: i }); } }
        i += charLen;
      }
    }
    return { normStr, map, nodes };
  }
  function highlightMatches(cell, filterNorm) {
    if (!cell || !filterNorm) return;
    if (cell.dataset && cell.dataset.origHtml) cell.innerHTML = cell.dataset.origHtml;
    let built;
    try { built = buildNormalizedMapForCell(cell); } catch (e) { return; }
    const normStr = built.normStr.toLowerCase();
    if (!normStr || normStr.length === 0) return;
    const map = built.map; const nodes = built.nodes; const needle = filterNorm.toLowerCase();
    const matches = []; let pos = 0;
    while (true) { const idx = normStr.indexOf(needle, pos); if (idx === -1) break; matches.push(idx); pos = idx + needle.length; }
    if (matches.length === 0) return;
    for (let mi = matches.length - 1; mi >= 0; mi--) {
      const startNorm = matches[mi]; const endNormExclusive = startNorm + needle.length;
      const startMap = map[startNorm]; const endMap = map[endNormExclusive - 1];
      if (!startMap || !endMap) continue;
      const startNodeIndex = startMap.nodeIndex; const startOffset = Math.max(0, Math.min((startMap.offsetInNode || 0), nodes[startNodeIndex].nodeValue.length));
      const endNodeIndex = endMap.nodeIndex;
      let endOffsetExclusive = Math.max(0, Math.min((endMap.offsetInNode || 0), nodes[endNodeIndex].nodeValue.length));
      try { const endNodeRaw = nodes[endNodeIndex].nodeValue; const cp = endNodeRaw.codePointAt(endOffsetExclusive); const charLen = cp > 0xFFFF ? 2 : 1; endOffsetExclusive = Math.min(endOffsetExclusive + charLen, endNodeRaw.length); } catch (e) { endOffsetExclusive = Math.min(endOffsetExclusive + 1, nodes[endNodeIndex].nodeValue.length); }
      try {
        if (startNodeIndex === endNodeIndex) {
          const tn = nodes[startNodeIndex]; const rawLen = tn.nodeValue.length; const s = Math.max(0, Math.min(startOffset, rawLen)); const e = Math.max(0, Math.min(endOffsetExclusive, rawLen));
          if (s >= e) continue;
          const after = tn.splitText(e); const middle = tn.splitText(s);
          const mark = document.createElement('mark'); mark.appendChild(document.createTextNode(middle.data)); middle.parentNode.replaceChild(mark, middle);
        } else {
          const startNode = nodes[startNodeIndex]; const endNode = nodes[endNodeIndex];
          const rawStartLen = startNode.nodeValue.length; const rawEndLen = endNode.nodeValue.length;
          const sOff = Math.max(0, Math.min(startOffset, rawStartLen)); const eOff = Math.max(0, Math.min(endOffsetExclusive, rawEndLen));
          const afterEnd = endNode.splitText(eOff); const middleStart = startNode.splitText(sOff);
          const wrapNodes = []; let cur = middleStart;
          while (cur) { wrapNodes.push(cur); if (cur === endNode) break; cur = cur.nextSibling; if (!cur) break; }
          if (wrapNodes.length === 0) continue;
          const parent = wrapNodes[0].parentNode; if (!parent) continue;
          const mark = document.createElement('mark'); parent.insertBefore(mark, wrapNodes[0]); wrapNodes.forEach(n => { try { mark.appendChild(n); } catch (e) {} });
        }
      } catch (e) { continue; }
    }
  }
  function searchTable() {
    try {
      const searchEl = getSearchEl(); const filterRaw = searchEl?.value || ''; const filterNorm = normalizeForSearch(filterRaw);
      let firstMatch = null;
      document.querySelectorAll('.table-container table').forEach(table => {
        const tbody = safeGetTBody(table); if (!tbody) return;
        Array.from(tbody.rows).forEach(row => {
          let rowMatches = false;
          Array.from(row.cells).forEach(cell => { clearHighlights(cell); const txt = cell.textContent || ''; if (filterNorm && normalizeForSearch(txt).includes(filterNorm)) rowMatches = true; });
          row.style.display = (!filterNorm || rowMatches) ? '' : 'none';
          if (rowMatches) { if (tvConfig.highlight) Array.from(row.cells).forEach(cell => highlightMatches(cell, filterNorm)); if (!firstMatch) firstMatch = row; }
        });
      });
      try { if (window.tableVirtualizer?.refresh) window.tableVirtualizer.refresh(); else if (window.tableVirtualizer?.update) window.tableVirtualizer.update(); } catch (_) {}
      if (firstMatch) { const rect = firstMatch.getBoundingClientRect(); const headerHeight = document.getElementById('stickyMainHeader')?.offsetHeight || 0; const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0; window.scrollTo({ top: scrollTop + rect.top - headerHeight - 5, behavior: 'smooth' }); }
      try { updateRowCounts(); } catch (_) {}
    } catch (_) {}
  }

  // attach handlers without duplicating buttons
  function attachHandlersToWrapper(wrapper) {
    try {
      if (!wrapper) return;
      if (wrapper.dataset && wrapper.dataset.tvHandlersAttached === '1') return;
      const handlers = [
        { sel: '.toggle-table-btn', fn: toggleTable },
        { sel: '.copy-plain-btn', fn: copyTablePlain },
        { sel: '.copy-markdown-btn', fn: copyTableMarkdown },
        { sel: '.export-csv-btn', fn: exportTableCSV },
        { sel: '.export-markdown-btn', fn: copyTableMarkdown }
      ];
      handlers.forEach(h => {
        try {
          const btn = wrapper.querySelector(h.sel);
          if (!btn) return;
          if (btn.getAttribute && btn.getAttribute('onclick')) return;
          if (btn.dataset && btn.dataset.tvHandlerAttached) return;
          btn.addEventListener('click', function () { try { h.fn(this); } catch (e) {} }, { passive: true });
          if (btn.dataset) btn.dataset.tvHandlerAttached = '1';
        } catch (e) {}
      });
      if (wrapper.dataset) wrapper.dataset.tvHandlersAttached = '1';
    } catch (e) {}
  }

  // ensureButtonsInContainer: dedupe existing, attach handlers, only create toggles/exports.
  function ensureButtonsInContainer(wrapper) {
    try {
      if (!wrapper) return;
      let containerEl = wrapper.querySelector('.table-controls') || wrapper.querySelector('.table-toolbar');
      let createdToolbar = false;
      if (!containerEl) {
        containerEl = document.createElement('div');
        containerEl.className = 'table-toolbar';
        containerEl.setAttribute('role', 'group');
        createdToolbar = true;
      }

      const defs = [
        { cls: 'toggle-table-btn', text: 'Collapse Table', aria: 'Collapse or expand table', createIfMissing: true, fn: toggleTable },
        { cls: 'copy-plain-btn', text: 'Copy Plain Table', aria: 'Copy table as plain text', createIfMissing: false, fn: copyTablePlain },
        { cls: 'copy-markdown-btn', text: 'Copy Markdown Table', aria: 'Copy table as markdown', createIfMissing: false, fn: copyTableMarkdown },
        { cls: 'export-csv-btn', text: 'Export CSV', aria: 'Export table as CSV', createIfMissing: true, fn: exportTableCSV },
        { cls: 'export-markdown-btn', text: 'Export Markdown', aria: 'Export table as Markdown', createIfMissing: true, fn: copyTableMarkdown }
      ];

      defs.forEach(d => {
        try {
          const existingAll = Array.from(wrapper.querySelectorAll('.' + d.cls));
          if (existingAll.length > 1) {
            for (let i = 1; i < existingAll.length; i++) { try { existingAll[i].remove(); } catch (_) {} }
          }
          let existing = existingAll.length ? existingAll[0] : (containerEl.querySelector('.' + d.cls) || null);
          if (existing) {
            if (!(existing.dataset && existing.dataset.tvHandlerAttached)) {
              try { existing.addEventListener('click', function () { try { d.fn(this); } catch (e) {} }, { passive: true }); } catch (e) {}
              if (existing.dataset) existing.dataset.tvHandlerAttached = '1';
            }
            if (existing.dataset) existing.dataset.tvCanonical = '1';
            return;
          }
          if (!d.createIfMissing) return;
          const b = document.createElement('button');
          b.type = 'button';
          b.className = d.cls;
          b.textContent = d.text;
          if (d.aria) b.setAttribute('aria-label', d.aria);
          b.addEventListener('click', function () { try { d.fn(this); } catch (e) {} }, { passive: true });
          if (b.dataset) { b.dataset.tvHandlerAttached = '1'; b.dataset.tvCanonical = '1'; }
          containerEl.appendChild(b);
        } catch (e) {}
      });

      if (createdToolbar) {
        const container = wrapper.querySelector('.table-container') || wrapper.querySelector('table');
        if (container) wrapper.insertBefore(containerEl, container);
        else wrapper.appendChild(containerEl);
      }
    } catch (e) {}
  }

  function ensureToolbarAndHandlers(wrapper) {
    try {
      ensureButtonsInContainer(wrapper);
      attachHandlersToWrapper(wrapper);
      if (wrapper.dataset) wrapper.dataset.tvToolbarPresent = '1';
    } catch (e) {}
  }

  const _ensureDebounced = debounce(() => {
    try { document.querySelectorAll('.table-wrapper').forEach(w => ensureToolbarAndHandlers(w)); try { updateRowCounts(); } catch (_) {} } catch (e) {}
  }, 150);

  (function setupObserver() {
    try {
      if (!('MutationObserver' in window)) return;
      const obs = new MutationObserver((mutations) => {
        let found = false;
        for (const m of mutations) { if (m.addedNodes && m.addedNodes.length) { found = true; break; } }
        if (found) _ensureDebounced();
      });
      obs.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  })();

  document.addEventListener('DOMContentLoaded', function () {
    try {
      document.querySelectorAll('.table-wrapper').forEach(wrapper => {
        try {
          if (wrapper.querySelector('.table-container')) return;
          const table = wrapper.querySelector('table');
          if (!table) return;
          const container = document.createElement('div');
          container.className = 'table-container';
          wrapper.insertBefore(container, table);
          container.appendChild(table);
        } catch (e) {}
      });

      document.querySelectorAll(".table-container table").forEach((table, idx) => {
        try { const tbody = safeGetTBody(table); originalTableRows[idx] = tbody ? Array.from(tbody.rows).map(r => r.cloneNode(true)) : []; sortStates[idx] = Array(table.rows[0]?.cells.length || 0).fill(0); } catch (e) { originalTableRows[idx] = originalTableRows[idx] || []; sortStates[idx] = sortStates[idx] || []; }
      });

      document.querySelectorAll('.table-container table').forEach(table => {
        try { const tbody = safeGetTBody(table); if (!tbody) return; Array.from(tbody.rows).forEach(r => Array.from(r.cells).forEach(c => { if (!c.dataset.origHtml) c.dataset.origHtml = c.innerHTML; })); } catch (e) {}
      });

      document.querySelectorAll(".table-container table").forEach((t, idx) => { updateHeaderSortUI(idx); });

      document.querySelectorAll('.table-wrapper').forEach(w => {
        try { const btn = w.querySelector('.toggle-table-btn'); if (btn) btn.textContent = w.classList.contains('table-collapsed') ? "Expand Table" : "Collapse Table"; } catch (e) {}
      });

      const anyExpanded = document.querySelectorAll('.table-wrapper:not(.table-collapsed)').length > 0;
      const toggleAll = document.getElementById('toggleAllBtn');
      if (toggleAll) toggleAll.textContent = anyExpanded ? "Collapse All Tables" : "Expand All Tables";

      if (!document.getElementById('backToTop')) {
        try {
          const b = document.createElement('button'); b.id = 'backToTop'; b.type = 'button'; b.title = 'Back to top'; b.textContent = '↑'; b.style.display = 'none';
          document.body.appendChild(b); b.addEventListener('click', backToTop, { passive: true });
        } catch (e) {}
      }

      const sb = getSearchEl();
      if (sb) {
        const deb = debounce(searchTable, tvConfig.debounceMs || 120);
        try { sb.addEventListener('input', deb); sb.addEventListener('keyup', function (e) { if (e.key === 'Enter') searchTable(); }); } catch (e) {}
      }

      document.querySelectorAll('.table-wrapper').forEach(w => ensureToolbarAndHandlers(w));

      document.addEventListener("keydown", function (e) {
        try {
          const active = document.activeElement;
          const tag = active && (active.tagName || "").toLowerCase();
          if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (tag === 'input' || tag === 'textarea' || (active && active.isContentEditable)) return;
            e.preventDefault();
            const s = getSearchEl();
            if (s) { s.focus(); s.select(); }
            return;
          }
          if (e.key === "Escape") { backToTop(); return; }
        } catch (err) {}
      });

      try { updateRowCounts(); } catch (e) {}
    } catch (e) {}
  });

  document.addEventListener('click', function (e) {
    try {
      const el = e.target;
      const hit = el.closest && (el.closest('.sort-btn') || el.closest('.th-with-sort') || (el.tagName && el.tagName.toLowerCase() === 'th' && el.getAttribute('role') === 'button' ? el : null));
      if (!hit) return;
      const th = hit.closest('th') || (hit.tagName && hit.tagName.toLowerCase() === 'th' ? hit : null);
      if (!th) return;
      const table = th.closest('table');
      if (!table) return;
      const tables = Array.from(document.querySelectorAll('.table-container table'));
      const tableIdx = tables.indexOf(table);
      const colIdx = th.cellIndex;
      if (tableIdx === -1 || typeof colIdx === 'undefined' || colIdx < 0) return;
      headerSortButtonClicked(tableIdx, colIdx, hit);
      e.preventDefault();
    } catch (err) {}
  });

  document.addEventListener('click', function (e) {
    try {
      const a = e.target.closest && e.target.closest('#tocBar a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      const id = a.getAttribute('href').substring(1);
      const container = document.getElementById(id)?.closest('.table-wrapper');
      if (!container) return;
      const headerHeight = document.getElementById('stickyMainHeader')?.offsetHeight || 0;
      const containerTop = container.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo({ top: containerTop - headerHeight - 5, behavior: 'smooth' });
      try { history.replaceState(null, '', '#' + id); } catch (err) {}
    } catch (err) {}
  });

  window.addEventListener("scroll", function () {
    try {
      const btn = document.getElementById("backToTop");
      if (!btn) return;
      if (document.documentElement.scrollTop > 200 || window.scrollY > 200) btn.style.display = "block";
      else btn.style.display = "none";
    } catch (e) {}
  });
  function backToTop() { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {} }

  window.headerSortButtonClicked = headerSortButtonClicked;
  window.toggleTable = toggleTable;
  window.toggleAllTables = toggleAllTables;
  window.copyTablePlain = copyTablePlain;
  window.copyTableMarkdown = copyTableMarkdown;
  window.copyAllTablesPlain = copyAllTablesPlain;
  window.copyAllTablesMarkdown = copyAllTablesMarkdown;
  window.resetAllTables = resetAllTables;
  window.searchTable = searchTable;
  window.exportTableCSV = exportTableCSV;

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
    } catch (e) {}
  };

})();
