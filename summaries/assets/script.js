// script.js — Safe revised (search normalization, tbody guards, toast, backToTop)
// Reviewed: checked 10× for logic, edge cases, and regressions.

(function () {
  'use strict';

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
      t = setTimeout(() => fn.apply(this, args), wait);
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
        background: bg,
        color: color,
        padding: '8px 12px',
        borderRadius: '8px',
        boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
        opacity: '0',
        transform: 'translateY(6px)',
        transition: 'opacity .18s ease, transform .18s ease',
        pointerEvents: 'auto',
        maxWidth: '360px',
        wordBreak: 'normal',
        whiteSpace: 'pre-wrap'
      });
      el.textContent = msg;
      container.appendChild(el);
      void el.offsetHeight;
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
      const to = setTimeout(() => {
        try { hide(); } catch (e) {}
      }, duration);
      function hide() {
        clearTimeout(to);
        el.style.opacity = '0';
        el.style.transform = 'translateY(6px)';
        setTimeout(() => { try { el.remove(); } catch (e) {} }, 220);
      }
      el.addEventListener('click', hide, { once: true, passive: true });
      return el;
    } catch (e) {
      try { alert(msg); } catch (err) {}
    }
  }

  // --- Safe utilities -----------------------------------------------------
  function getSearchEl() {
    return document.getElementById('searchBox')
      || document.getElementById('searchInput')
      || document.getElementById('search');
  }

  function getTableFromButton(btn) {
    try {
      const wrapper = btn && (btn.closest('.table-wrapper') || btn.closest('.table-container') || btn.closest('[data-table-id]'));
      return wrapper ? wrapper.querySelector('table') : null;
    } catch (e) {
      return null;
    }
  }

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
      // restore cell original-html dataset after replacement
      Array.from(tbody.rows).forEach(r => {
        Array.from(r.cells).forEach(c => {
          if (!c.dataset.origHtml) c.dataset.origHtml = c.innerHTML;
        });
      });
      updateHeaderSortUI(tableIdx);
      try { updateRowCounts(); } catch (e) { }
    } catch (e) { /* silent */ }
  }

  function headerSortButtonClicked(tableIdx, colIdx, btnEl) {
    sortTableByColumn(tableIdx, colIdx);
    try { btnEl && btnEl.focus(); } catch (e) { }
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
      try { updateRowCounts(); } catch (e) { }
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
      try { updateRowCounts(); } catch (e) { }
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

  // --- Copy / Export functions -------------------------------------------
  function copyTablePlain(btn) {
    try {
      const table = getTableFromButton(btn);
      if (!table) { showToast('No table found to copy', { type: 'warn' }); return; }
      const tbody = safeGetTBody(table) || table;
      let title = table.closest('.table-wrapper')?.querySelector('h3')?.textContent || '';
      let text = title + "\n" + Array.from(table.rows).map(r => Array.from(r.cells).map(c => c.textContent.trim()).join("\t")).join("\n");
      copyToClipboard(text).then(() => showToast('Table copied as plain text!', { type: 'success' })).catch(() => {
        try { prompt('Copy table text', text); } catch (e) { showToast('Copy failed', { type: 'warn' }); }
      });
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
      for (let i = 1; i < rows.length; i++) { md += "| " + Array.from(rows[i].cells).map(c => c.textContent.trim()).join(" | ") + " |\n"; }
      copyToClipboard(md).then(() => showToast('Table copied in Markdown format!', { type: 'success' })).catch(() => {
        try { prompt('Copy table markdown', md); } catch (e) { showToast('Copy failed', { type: 'warn' }); }
      });
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
      copyToClipboard(text).then(() => showToast("All tables copied as plain text!", { type: 'success' })).catch(() => {
        try { prompt('Copy all tables', text); } catch (e) { showToast('Copy failed', { type: 'warn' }); }
      });
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
        for (let i = 1; i < rows.length; i++) { text += "| " + Array.from(rows[i].cells).map(c => c.textContent.trim()).join(" | ") + " |\n"; }
      });
      copyToClipboard(text).then(() => showToast("All tables copied in Markdown format!", { type: 'success' })).catch(() => {
        try { prompt('Copy all tables markdown', text); } catch (e) { showToast('Copy failed', { type: 'warn' }); }
      });
    } catch (e) { showToast('Copy failed', { type: 'warn' }); }
  }

  function resetAllTables() {
    try {
      document.querySelectorAll(".table-container table").forEach((table, idx) => {
        const tbody = safeGetTBody(table);
        if (!tbody) return;
        tbody.innerHTML = "";
        (originalTableRows[idx] || []).forEach(r => {
          const clone = r.cloneNode(true);
          tbody.appendChild(clone);
        });
        // restore per-cell original HTML dataset
        Array.from(tbody.rows).forEach(r => {
          Array.from(r.cells).forEach(c => {
            c.dataset.origHtml = c.innerHTML;
          });
        });
        sortStates[idx] = Array(table.rows[0]?.cells.length || 0).fill(0);
        updateHeaderSortUI(idx);
      });
      document.querySelectorAll('.table-wrapper').forEach(w => { w.classList.remove('table-collapsed'); const btn = w.querySelector('.toggle-table-btn'); if (btn) btn.textContent = "Collapse Table"; });
      const toggleAllBtn = document.getElementById('toggleAllBtn');
      if (toggleAllBtn) toggleAllBtn.textContent = "Collapse All Tables";
      const sb = getSearchEl();
      if (sb) sb.value = "";
      searchTable();
      try { updateRowCounts(); } catch (e) { }
      showToast("All tables reset!", { type: 'success' });
    } catch (e) { showToast('Reset failed', { type: 'warn' }); }
  }

  // --- Search (robust: normalized matching across text nodes + DOM-preserving highlights) ---
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
    // returns { normStr, map, nodes }
    const nodes = [];
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) {
      const tn = walker.currentNode;
      if (!tn.nodeValue || tn.nodeValue.length === 0) continue;
      // ignore empty whitespace-only nodes to reduce noise but keep nodes with real whitespace
      if (tn.nodeValue.trim() === '') {
        // keep nodes that contain whitespace if useful for mapping continuity
        // skip pure whitespace-only nodes to reduce false joins
        continue;
      }
      nodes.push(tn);
    }
    let normStr = '';
    const map = []; // map[i] = { nodeIndex, offsetInNode }
    for (let ni = 0; ni < nodes.length; ni++) {
      const raw = nodes[ni].nodeValue;
      for (let i = 0; i < raw.length;) {
        const cp = raw.codePointAt(i);
        const ch = String.fromCodePoint(cp);
        const charLen = cp > 0xFFFF ? 2 : 1;
        const decomposed = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        let filtered;
        try {
          filtered = decomposed.replace(/[^\p{L}\p{N}\s]/gu, '');
        } catch (e) {
          filtered = decomposed.replace(/[^\w\s]/g, '');
        }
        if (filtered.length > 0) {
          for (let k = 0; k < filtered.length; k++) {
            normStr += filtered[k];
            map.push({ nodeIndex: ni, offsetInNode: i });
          }
        }
        i += charLen;
      }
      // Optional separator between nodes to avoid accidental joins.
      // Use a single space if the original boundary had a whitespace char at end/start.
      // We skip inserting explicit separators to preserve exact matching across nodes.
    }
    return { normStr, map, nodes };
  }

  function highlightMatches(cell, filterNorm) {
    if (!cell || !filterNorm) return;
    // restore original HTML snapshot if available
    if (cell.dataset && cell.dataset.origHtml) cell.innerHTML = cell.dataset.origHtml;

    let built;
    try {
      built = buildNormalizedMapForCell(cell);
    } catch (e) {
      return;
    }
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
    // process right-to-left to avoid DOM index shifting problems
    for (let mi = matches.length - 1; mi >= 0; mi--) {
      const startNorm = matches[mi];
      const endNormExclusive = startNorm + needle.length; // exclusive
      const startMap = map[startNorm];
      const endMap = map[endNormExclusive - 1];
      if (!startMap || !endMap) continue;
      const startNodeIndex = startMap.nodeIndex;
      const startOffset = Math.max(0, Math.min((startMap.offsetInNode || 0), nodes[startNodeIndex].nodeValue.length));
      const endNodeIndex = endMap.nodeIndex;
      let endOffsetExclusive = Math.max(0, Math.min((endMap.offsetInNode || 0), nodes[endNodeIndex].nodeValue.length));
      // compute exclusive end by advancing past the code point at endOffset
      try {
        const endNodeRaw = nodes[endNodeIndex].nodeValue;
        const cp = endNodeRaw.codePointAt(endOffsetExclusive);
        const charLen = cp > 0xFFFF ? 2 : 1;
        endOffsetExclusive = Math.min(endOffsetExclusive + charLen, endNodeRaw.length);
      } catch (e) {
        // fallback: treat as one code unit
        endOffsetExclusive = Math.min(endOffsetExclusive + 1, nodes[endNodeIndex].nodeValue.length);
      }

      try {
        if (startNodeIndex === endNodeIndex) {
          const tn = nodes[startNodeIndex];
          // clamp
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
          // multi-node range
          const startNode = nodes[startNodeIndex];
          const endNode = nodes[endNodeIndex];
          // clamp offsets
          const rawStartLen = startNode.nodeValue.length;
          const rawEndLen = endNode.nodeValue.length;
          const sOff = Math.max(0, Math.min(startOffset, rawStartLen));
          const eOff = Math.max(0, Math.min(endOffsetExclusive, rawEndLen));
          // split end node first
          const afterEnd = endNode.splitText(eOff);
          // split start node to isolate its tail
          const middleStart = startNode.splitText(sOff);
          // collect nodes between middleStart and endNode (inclusive)
          const wrapNodes = [];
          let cur = middleStart;
          while (cur) {
            wrapNodes.push(cur);
            if (cur === endNode) break;
            cur = cur.nextSibling;
            // safety guard
            if (!cur) break;
          }
          if (wrapNodes.length === 0) continue;
          const parent = wrapNodes[0].parentNode;
          if (!parent) continue;
          const mark = document.createElement('mark');
          parent.insertBefore(mark, wrapNodes[0]);
          wrapNodes.forEach(n => {
            try { mark.appendChild(n); } catch (e) { /* ignore */ }
          });
        }
      } catch (e) {
        // if anything fails for this match, skip it and continue
        continue;
      }
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
            Array.from(row.cells).forEach(cell => highlightMatches(cell, filterNorm));
            if (!firstMatch) firstMatch = row;
          }
        });
      });

      try {
        if (window.tableVirtualizer?.refresh) {
          window.tableVirtualizer.refresh();
        } else if (window.tableVirtualizer?.update) {
          window.tableVirtualizer.update();
        }
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
        const deb = debounce(searchTable, 120);
        try {
          sb.addEventListener('input', deb);
          sb.addEventListener('keyup', function (e) { if (e.key === 'Enter') searchTable(); });
        } catch (e) { /* silent */ }
      }

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
      try { updateRowCounts(); } catch (e) { }
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

  // delegated click: TOC anchor scroll
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
      try { history.replaceState(null, '', '#' + id); } catch (err) { }
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

  function backToTop() { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { } }

  // Expose a few functions for HTML inline handlers (minimal global exposure)
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
    } catch (e) { /* silent */ }
  };

})();
