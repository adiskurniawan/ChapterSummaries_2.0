// assets/script.js — Fully revised, with mobile-friendly header normalization.
// Merged, carefully checked (queued toasts, robust clipboard, copy modal, CSV export, stable sorting, normalized search)
// Revised: do NOT inject per-table toolbar; attach safe handlers to server-rendered buttons when missing.
// Added: normalize .table-header-wrapper -> .table-controls and move toggle button to front for mobile visibility.

(function () {
  'use strict';

  // --- Public config -------------------------------------------------------
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
      t = setTimeout(() => {
        try { fn.apply(this, args); } catch (e) { /* silent */ }
      }, wait);
    };
  }

  // --- Clipboard with robust fallback -------------------------------------
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
      } catch (err) {
        try { console.warn('tv:copyToClipboard:legacy failed', err); } catch (_) {}
        reject(err);
      }
    });
  }

  // --- Download helper & filename sanitize --------------------------------
  function sanitizeFileName(name) {
    try {
      if (!name) return 'download';
      return String(name).trim().replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 200) || 'download';
    } catch (e) { return 'download'; }
  }

  function downloadBlob(blob, filename) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sanitizeFileName(filename);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      try { console.error('downloadBlob failed', e); } catch (_) {}
      return false;
    }
  }

  // --- Toast / Notification system (queued, accessible, adaptive) ----------
  let _toastQueue = [];
  let _activeToast = null;
  let _toastIdCounter = 0;

  function _ensureToastContainer() {
    try {
      let c = document.getElementById('tv-toast-container');
      if (c) return c;
      c = document.createElement('div');
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
      const textWrap = document.createElement('div');
      textWrap.style.flex = '1 1 auto';
      textWrap.style.minWidth = '0';
      textWrap.textContent = item.msg;
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.ariaLabel = 'Dismiss notification';
      closeBtn.title = 'Dismiss';
      closeBtn.innerHTML = '✕';
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

  // --- Copy modal (fallback UI) ------------------------------------------
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
      const hdr = document.createElement('div');
      hdr.style.display = 'flex';
      hdr.style.justifyContent = 'space-between';
      hdr.style.alignItems = 'center';
      const h = document.createElement('strong');
      h.textContent = title || 'Copy';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = 'Close';
      Object.assign(closeBtn.style, { marginLeft: '8px' });
      closeBtn.addEventListener('click', () => overlay.remove());
      hdr.appendChild(h);
      hdr.appendChild(closeBtn);
      const ta = document.createElement('textarea');
      ta.value = text || '';
      ta.readOnly = false;
      ta.style.width = '100%';
      ta.style.height = '320px';
      ta.style.resize = 'vertical';
      ta.style.whiteSpace = 'pre-wrap';
      ta.style.fontFamily = 'monospace, monospace';
      ta.style.fontSize = '13px';
      ta.setAttribute('aria-label', 'Copy text area');
      const controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.gap = '8px';
      controls.style.justifyContent = 'flex-end';
      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.textContent = 'Select All';
      selectBtn.addEventListener('click', () => { try { ta.focus(); ta.select(); } catch (_) {} });
      const copyBtn = document.createElement('button');
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
      const downloadBtn = document.createElement('button');
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
      document.body.appendChild(overlay);
      try { ta.focus(); ta.select(); } catch (_) {}
      return overlay;
    } catch (e) { try { alert(String(text || '')); } catch (_) {} return null; }
  }

  // --- Safe utilities -----------------------------------------------------
  function getSearchEl() {
    return document.getElementById('searchBox') || document.getElementById('searchInput') || document.getElementById('search');
  }

  function getTableFromButton(btn) {
    try {
      const wrapper = btn && (btn.closest('.table-wrapper') || btn.closest('.table-container') || btn.closest('[data-table-id]'));
      return wrapper ? wrapper.querySelector('table') : null;
    } catch (e) { return null; }
  }

  // --- Single-table TOC logic (only applied when exactly one table exists) -
  function buildSingleTableToc() {
    try {
      const wrappers = document.querySelectorAll('.table-wrapper');
      if (!wrappers || wrappers.length !== 1) return; // only when exactly one table
      const tocBar = document.getElementById('tocBar');
      if (!tocBar) return;
      const table = wrappers[0].querySelector('.table-container table') || wrappers[0].querySelector('table');
      if (!table) return;

      // prefer tbody rows; fall back to all rows if tbody missing
      const tbody = safeGetTBody(table) || table;
      const rows = Array.from((tbody && tbody.rows && tbody.rows.length) ? tbody.rows : (table.rows || []));
      if (!rows || rows.length === 0) return;

      const ul = document.createElement('ul');
      ul.className = 'single-toc-list';
      ul.style.listStyle = 'none';
      ul.style.display = 'flex';
      ul.style.gap = '8px';
      ul.style.margin = '0';
      ul.style.padding = '0';
      ul.style.flexWrap = 'wrap';

      rows.forEach((row, idx) => {
        try {
          // stable id assignment for each row
          let id = row.id && String(row.id).trim() ? row.id : `tv-row-${idx+1}`;
          if (document.getElementById(id) && document.getElementById(id) !== row) {
            let suffix = 1;
            while (document.getElementById(id + '-' + suffix)) suffix++;
            id = id + '-' + suffix;
          }
          row.id = id;

          const li = document.createElement('li');
          li.className = 'toc-item';
          const a = document.createElement('a');
          a.className = 'toc-link';
          a.href = `#${id}`;
          a.textContent = `Topic ${idx+1}`;
          const rowText = (row.textContent || '').trim();
          if (rowText) {
            a.setAttribute('aria-label', rowText);
            a.title = rowText;
          }
          a.addEventListener('click', function (ev) {
            ev.preventDefault();
            const target = document.getElementById(id);
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
  window.buildSingleTableToc = buildSingleTableToc;

  // storage
  let originalTableRows = [];
  let sortStates = [];

  // --- DOM helpers used by many functions ---------------------------------
  function safeGetTBody(table) {
    if (!table) return null;
    return (table.tBodies && table.tBodies[0]) || null;
  }

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

  // --- Sorting and toggles ------------------------------------------------
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
        sortStates[tableIdx] = sortStates[tableIdx] || [];
        sortStates[tableIdx][colIdx] = 1;
      } else if (state === 1) {
        rows.sort((a, b) => {
          let valA = a.cells[colIdx]?.textContent.trim() || '';
          let valB = b.cells[colIdx]?.textContent.trim() || '';
          let numA = parseFloat(valA.replace(/,/g, '')); let numB = parseFloat(valB.replace(/,/g, ''));
          if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
          return valB.localeCompare(valA);
        });
        sortStates[tableIdx] = sortStates[tableIdx] || [];
        sortStates[tableIdx][colIdx] = 2;
      } else {
        rows = (originalTableRows[tableIdx] || []).map(r => r.cloneNode(true));
        sortStates[tableIdx] = sortStates[tableIdx] || [];
        sortStates[tableIdx][colIdx] = 0;
      }
      for (let i = 0; i < (sortStates[tableIdx] || []).length; i++) {
        if (i !== colIdx) sortStates[tableIdx][i] = 0;
      }
      tbody.innerHTML = "";
      rows.forEach(r => tbody.appendChild(r));
      Array.from(tbody.rows).forEach(r => {
        Array.from(r.cells).forEach(c => {
          if (!c.dataset.origHtml) c.dataset.origHtml = c.innerHTML;
        });
      });
      updateHeaderSortUI(tableIdx);
      try { updateRowCounts(); } catch (e) {}
    } catch (e) { /* silent */ }
  }

  function headerSortButtonClicked(tableIdx, colIdx, btnEl) {
    sortTableByColumn(tableIdx, colIdx);
    try { btnEl && btnEl.focus(); } catch (e) {}
  }

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
    } catch (e) { /* silent */ }
  }

  function toggleAllTables() {
    try {
      const wrappers = Array.from(document.querySelectorAll('.table-wrapper'));
      if (wrappers.length === 0) return;
      const anyExpanded = wrappers.some(w => !w.classList.contains('table-collapsed'));
      if (anyExpanded) {
        wrappers.forEach(w => { w.classList.add('table-collapsed'); const btn = w.querySelector('.toggle-table-btn'); if (btn) btn.textContent = "Expand Table"; });
        const toggleAllBtn = document.getElementById('toggleAllBtn');
        if (toggleAllBtn) toggleAllBtn.textContent = "Expand All Tables";
      } else {
        wrappers.forEach(w => { w.classList.remove('table-collapsed'); const btn = w.querySelector('.toggle-table-btn'); if (btn) btn.textContent = "Collapse Table"; });
        const toggleAllBtn = document.getElementById('toggleAllBtn');
        if (toggleAllBtn) toggleAllBtn.textContent = "Collapse All Tables";
      }
      try { updateRowCounts(); } catch (e) {}
    } catch (e) { /* silent */ }
  }

  // --- Row counts ---------------------------------------------------------
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

  // --- Copy / Export helper: centralize table extraction ------------------
  function formatCellForMarkdown(cell) {
    try {
      let txt = (cell.textContent || '').trim();
      txt = txt.replace(/\|/g, '\\|');
      // Only convert newlines to <br> if the cell actually contains newlines.
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
      const tbody = safeGetTBody(table) || table;
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
      document.querySelectorAll(".table-wrapper").forEach(wrapper => {
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
      document.querySelectorAll(".table-wrapper").forEach((wrapper) => {
        try {
          const table = wrapper.querySelector('table');
          if (!table) return;
          const title = wrapper.querySelector('h3')?.textContent || '';
          const lines = tableToMarkdownLines(table, title);
          if (lines && lines.length) {
            if (pieces.length) pieces.push(''); // blank line between tables
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

  // --- New export functions (Markdown, JSON, XLSX, PDF) ------------------
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
      document.querySelectorAll(".table-wrapper").forEach((wrapper) => {
        try {
          const table = wrapper.querySelector('table');
          if (!table) return;
          const title = wrapper.querySelector('h3')?.textContent || '';
          const lines = tableToMarkdownLines(table, title);
          if (!lines || lines.length === 0) return;
          if (pieces.length) pieces.push(''); // blank line between tables
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

      // Build array-of-arrays from table rows
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

      // If SheetJS is available, create a real .xlsx
      if (window.XLSX && window.XLSX.utils) {
        try {
          const wb = (typeof window.XLSX.utils.book_new === 'function') ? window.XLSX.utils.book_new() : { SheetNames: [], Sheets: {} };
          const ws = window.XLSX.utils.aoa_to_sheet(aoa);
          if (typeof window.XLSX.utils.book_append_sheet === 'function') {
            window.XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
          } else {
            wb.SheetNames.push('Sheet1');
            wb.Sheets['Sheet1'] = ws;
          }

          if (typeof window.XLSX.writeFile === 'function') {
            window.XLSX.writeFile(wb, safeName);
            showToast('XLSX exported', { type: 'success' });
            return;
          }

          // fallback write to ArrayBuffer then download
          if (typeof window.XLSX.write === 'function') {
            const wbout = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            downloadBlob(blob, safeName);
            showToast('XLSX exported', { type: 'success' });
            return;
          }
        } catch (err) {
          console.error('SheetJS export failed', err);
          // fall through to fallback
        }
      }

      // Fallback: TSV content but saved with .xlsx extension; warn user
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
      const w = window.open('', '_blank');
      if (!w) { showToast('Unable to open print window', { type: 'warn' }); return; }
      w.document.open();
      w.document.write(htmlDoc);
      w.document.close();
      setTimeout(() => {
        try {
          w.focus();
          w.print();
          showToast('Print dialog opened for PDF export', { type: 'success' });
        } catch (e) {
          showToast('Print failed', { type: 'warn' });
        }
      }, 300);
    } catch (e) { console.error(e); showToast('Export PDF failed', { type: 'warn' }); }
  }

  function resetAllTables() {
    try {
      const tables = Array.from(document.querySelectorAll(".table-container table"));
      tables.forEach((table, idx) => {
        try {
          const tbody = safeGetTBody(table);
          if (!tbody) return;
          tbody.innerHTML = "";
          // restore using stored originalTableRows clones
          (originalTableRows[idx] || []).forEach(r => {
            const clone = r.cloneNode(true);
            tbody.appendChild(clone);
          });
          Array.from(tbody.rows).forEach(r => {
            Array.from(r.cells).forEach(c => { c.dataset.origHtml = c.innerHTML; });
          });
          sortStates[idx] = Array(table.rows[0]?.cells.length || 0).fill(0);
          updateHeaderSortUI(idx);
        } catch (e) { /* continue */ }
      });
      document.querySelectorAll('.table-wrapper').forEach(w => { w.classList.remove('table-collapsed'); const btn = w.querySelector('.toggle-table-btn'); if (btn) btn.textContent = "Collapse Table"; });
      const toggleAllBtn = document.getElementById('toggleAllBtn');
      if (toggleAllBtn) toggleAllBtn.textContent = "Collapse All Tables";
      const sb = getSearchEl(); if (sb) sb.value = "";
      searchTable();
      try { updateRowCounts(); } catch (e) {}
      showToast("All tables reset!", { type: 'success' });
    } catch (e) { showToast('Reset failed', { type: 'warn' }); }
  }

  // --- Search & highlight (robust) ---------------------------------------
  function clearHighlights(cell) {
    if (!cell) return;
    if (cell.dataset && cell.dataset.origHtml) {
      cell.innerHTML = cell.dataset.origHtml;
      return;
    }
    const marks = Array.from(cell.querySelectorAll('mark'));
    marks.forEach(m => {
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
    return { normStr, map, nodes };
  }

  function highlightMatches(cell, filterNorm) {
    if (!cell || !filterNorm) return;
    if (cell.dataset && cell.dataset.origHtml) cell.innerHTML = cell.dataset.origHtml;
    let built;
    try { built = buildNormalizedMapForCell(cell); } catch (e) { return; }
    const normStr = built.normStr.toLowerCase();
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
          const mark = document.createElement('mark');
          mark.appendChild(document.createTextNode(middle.data));
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
          const mark = document.createElement('mark');
          parent.insertBefore(mark, wrapNodes[0]);
          wrapNodes.forEach(n => { try { mark.appendChild(n); } catch (e) {} });
        }
      } catch (e) { continue; }
    }
  }

  function searchTable() {
    try {
      const searchEl = getSearchEl();
      const filterRaw = searchEl?.value || '';
      const filterNorm = normalizeForSearch(filterRaw);
      let firstMatch = null;
      document.querySelectorAll('.table-container table').forEach(table => {
        const tbody = safeGetTBody(table);
        if (!tbody) return;
        Array.from(tbody.rows).forEach(row => {
          let rowMatches = false;
          Array.from(row.cells).forEach(cell => {
            clearHighlights(cell);
            const txt = cell.textContent || '';
            if (filterNorm && normalizeForSearch(txt).includes(filterNorm)) {
              rowMatches = true;
            }
          });
          row.style.display = (!filterNorm || rowMatches) ? '' : 'none';
          if (rowMatches) {
            if (tvConfig.highlight) Array.from(row.cells).forEach(cell => highlightMatches(cell, filterNorm));
            if (!firstMatch) firstMatch = row;
          }
        });
      });
      try {
        if (window.tableVirtualizer?.refresh) window.tableVirtualizer.refresh();
        else if (window.tableVirtualizer?.update) window.tableVirtualizer.update();
      } catch (_) {}
      if (firstMatch) {
        const rect = firstMatch.getBoundingClientRect();
        const headerHeight = document.getElementById('stickyMainHeader')?.offsetHeight || 0;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
        window.scrollTo({ top: scrollTop + rect.top - headerHeight - 5, behavior: 'smooth' });
      }
      try { updateRowCounts(); } catch (_) {}
    } catch (_) {}
  }

  // --- Attach handlers and initial DOM setup ------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    try {
      // Wrap tables in .table-container if missing
      document.querySelectorAll('.table-wrapper').forEach(wrapper => {
        if (wrapper.querySelector('.table-container')) return;
        const table = wrapper.querySelector('table');
        if (!table) return;
        const container = document.createElement('div');
        container.className = 'table-container';
        wrapper.insertBefore(container, table);
        container.appendChild(table);
      });

      // === NEW: normalize header wrappers -> .table-controls & prioritize toggle
      // This is a minimal, conservative DOM adjustment so existing server-rendered HTML
      // (which uses .table-header-wrapper) benefits from the mobile CSS rules that target
      // .table-controls. We move the toggle button to the start of the header wrapper so it
      // remains visible on narrow screens. This change is intentionally non-destructive.
      try {
        document.querySelectorAll('.table-header-wrapper').forEach(hw => {
          try {
            if (!hw.classList.contains('table-controls')) hw.classList.add('table-controls');
            const copyBtns = hw.querySelector('.copy-buttons');
            const toggleBtn = hw.querySelector('.toggle-table-btn');
            if (toggleBtn) {
              // move toggle before copy-buttons or to first position
              if (copyBtns && toggleBtn.parentNode === hw) hw.insertBefore(toggleBtn, copyBtns);
              else if (hw.firstChild !== toggleBtn) hw.insertBefore(toggleBtn, hw.firstChild);
              // mark as adjusted so we don't accidentally re-move it later
              toggleBtn.dataset.tvPriorityMoved = '1';
            }
            if (copyBtns) copyBtns.classList.add('copy-buttons');
          } catch (e) { /* silent per-header */ }
        });
      } catch (e) { /* silent */ }

      // Build snapshots and sortStates after DOM is stable
      document.querySelectorAll(".table-container table").forEach((table, idx) => {
        try {
          const tbody = safeGetTBody(table);
          originalTableRows[idx] = tbody ? Array.from(tbody.rows).map(r => r.cloneNode(true)) : [];
          sortStates[idx] = Array(table.rows[0]?.cells.length || 0).fill(0);
        } catch (e) {
          originalTableRows[idx] = originalTableRows[idx] || [];
          sortStates[idx] = sortStates[idx] || [];
        }
      });

      // attach per-cell original HTML snapshot used to restore highlights safely
      document.querySelectorAll('.table-container table').forEach(table => {
        const tbody = safeGetTBody(table);
        if (!tbody) return;
        Array.from(tbody.rows).forEach(r => {
          Array.from(r.cells).forEach(c => {
            if (!c.dataset.origHtml) c.dataset.origHtml = c.innerHTML;
          });
        });
      });

      // Update header sort UI
      document.querySelectorAll(".table-container table").forEach((t, idx) => { updateHeaderSortUI(idx); });

      // Update toggle buttons text
      document.querySelectorAll('.table-wrapper').forEach(w => {
        const btn = w.querySelector('.toggle-table-btn');
        if (btn) btn.textContent = w.classList.contains('table-collapsed') ? "Expand Table" : "Collapse Table";
      });

      // Toggle all button state
      const anyExpanded = document.querySelectorAll('.table-wrapper:not(.table-collapsed)').length > 0;
      const toggleAll = document.getElementById('toggleAllBtn');
      if (toggleAll) toggleAll.textContent = anyExpanded ? "Collapse All Tables" : "Expand All Tables";

      // Ensure backToTop exists
      if (!document.getElementById('backToTop')) {
        try {
          const b = document.createElement('button');
          b.id = 'backToTop';
          b.type = 'button';
          b.title = 'Back to top';
          b.textContent = '↑';
          b.style.display = 'none';
          document.body.appendChild(b);
          b.addEventListener('click', backToTop);
        } catch (e) { /* ignore */ }
      }

      // Attach search handlers (debounced)
      const sb = getSearchEl();
      if (sb) {
        const deb = debounce(searchTable, tvConfig.debounceMs || 120);
        try {
          sb.addEventListener('input', deb);
          sb.addEventListener('keyup', function (e) { if (e.key === 'Enter') searchTable(); });
        } catch (e) { /* silent */ }
      }

      // Attach handlers to server-rendered toolbar buttons when missing
      try {
        document.querySelectorAll('.table-wrapper').forEach(wrapper => {
          const handlers = [
            { sel: '.toggle-table-btn, .toggle-table', fn: toggleTable },
            { sel: '.copy-plain-btn, .copy-plain, .copy-plain-table', fn: copyTablePlain },
            { sel: '.copy-markdown-btn, .copy-markdown, .copy-markdown-table', fn: copyTableMarkdown },
            { sel: '.export-csv-btn, .export-csv, .export-csv-table', fn: exportTableCSV },
            { sel: '.export-json-btn, .export-json, .export-json-table', fn: exportTableJSON },
            { sel: '.export-xlsx-btn, .export-xlsx, .export-xlsx-table', fn: exportTableXLSX },
            { sel: '.export-pdf-btn, .export-pdf, .export-pdf-table', fn: exportTablePDF },
            { sel: '.export-markdown-btn, .export-markdown, .export-markdown-table', fn: exportTableMarkdown }
          ];
          handlers.forEach(h => {
            try {
              const btn = wrapper.querySelector(h.sel);
              if (!btn) return;
              // if server provided inline onclick, assume it's wired and skip
              if (btn.getAttribute && btn.getAttribute('onclick')) return;
              if (btn.dataset && btn.dataset.tvHandlerAttached) return;
              btn.addEventListener('click', function (ev) { try { h.fn(this); } catch (e) { /* silent */ } });
              if (btn.dataset) btn.dataset.tvHandlerAttached = '1';
            } catch (e) { /* silent */ }
          });
        });
      } catch (e) { /* silent */ }

      // Build single-table TOC if condition applies
      try { buildSingleTableToc(); setTimeout(buildSingleTableToc, 500); } catch (e) {}

      // Single consolidated keydown handler for "/" and "Escape"
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

  // delegated click: sorting (bind header clicks to sort behavior)
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
    } catch (err) { /* silent */ }
  });

  // delegated click: TOC anchor scroll (fixed: scroll to actual target when present)
  document.addEventListener('click', function (e) {
    try {
      const a = e.target.closest && e.target.closest('#tocBar a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      const id = (a.getAttribute('href') || '').substring(1);
      if (!id) return;

      const headerHeight = document.getElementById('stickyMainHeader')?.offsetHeight || 0;
      const target = document.getElementById(id);

      if (target) {
        // Scroll to the actual element (row, header, etc.) with header offset.
        const rect = target.getBoundingClientRect();
        const top = (window.pageYOffset || document.documentElement.scrollTop || 0) + rect.top;
        window.scrollTo({ top: Math.max(0, top - headerHeight - 5), behavior: 'smooth' });
        try { history.replaceState(null, '', '#' + id); } catch (err) {}
        try { target.focus && target.focus({ preventScroll: true }); } catch (err) {}
        return;
      }

      // Fallback: if element not found, try to scroll to nearest table wrapper
      const container = a.closest('.table-wrapper');
      if (!container) return;
      const containerTop = container.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
      window.scrollTo({ top: Math.max(0, containerTop - headerHeight - 5), behavior: 'smooth' });
      try { history.replaceState(null, '', '#' + id); } catch (err) {}
    } catch (err) { /* silent */ }
  });

  // backToTop visibility on scroll
  window.addEventListener("scroll", function () {
    try {
      const btn = document.getElementById("backToTop");
      if (!btn) return;
      if (document.documentElement.scrollTop > 200 || window.scrollY > 200) btn.style.display = "block";
      else btn.style.display = "none";
    } catch (e) { /* silent */ }
  });

  function backToTop() { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {} }

  // Expose functions used by HTML inline handlers
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
  window.exportTableJSON = exportTableJSON;
  window.exportTableXLSX = exportTableXLSX;
  window.exportTablePDF = exportTablePDF;
  window.exportTableMarkdown = exportTableMarkdown;
  window.exportAllTablesMarkdown = exportAllTablesMarkdown;
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
    } catch (e) { /* silent */ }
  };

})();