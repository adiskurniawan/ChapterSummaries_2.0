// script.js — Fully theme-integrated, robust loader & table utilities
(function () {
  'use strict';

  // -----------------------------
  // 1. Configuration & State
  // -----------------------------
  const CONFIG = {
    highlight: true,
    debounceMs: 150,
    chunkSize: 300
  };

  const STATE = {
    originalRowOrders: [],
    sortStates: [],
    uidCounter: 1,
    toastQueue: [],
    activeToast: null,
    toastIdCounter: 0,
    tocLinks: [],
    tocTargets: [],
    tocTicking: false
  };

  window.tvConfig = Object.assign({}, CONFIG, window.tvConfig || {});
  window.setTvSearchConfig = function (cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    if (typeof cfg.highlight === 'boolean') window.tvConfig.highlight = cfg.highlight;
    if (typeof cfg.debounceMs === 'number') window.tvConfig.debounceMs = Math.max(0, cfg.debounceMs);
    if (typeof cfg.chunkSize === 'number') window.tvConfig.chunkSize = Math.max(50, cfg.chunkSize);
  };

  // -----------------------------
  // 2. CSS Injection (Theme-Aligned)
  // -----------------------------
  const STYLES = `
    /* Toast System (Adopts theme's panel/text/border vars automatically) */
    #tv-toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 1300; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; max-width: calc(100% - 48px); }
    .tv-toast { 
      background: var(--panel, #f8fafc); color: var(--text, #111827); border: 1px solid var(--border, #e5e7eb);
      padding: 10px 14px; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.08);
      opacity: 0; transform: translateY(6px); transition: opacity .18s ease, transform .18s ease;
      pointer-events: auto; max-width: 360px; display: flex; align-items: center; gap: 8px; font-size: 14px; 
    }
    [data-theme="dark"] .tv-toast { box-shadow: 0 6px 18px rgba(0,0,0,0.35); }
    .tv-toast.success { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
    .tv-toast.warn { background: #fef3c7; color: #92400e; border-color: #fde68a; }
    .tv-toast.error { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
    [data-theme="dark"] .tv-toast.success { background: #14532d; color: #dcfce7; border-color: #166534; }
    [data-theme="dark"] .tv-toast.warn { background: #78350f; color: #fef3c7; border-color: #92400e; }
    [data-theme="dark"] .tv-toast.error { background: #7f1d1d; color: #fee2e2; border-color: #991b1b; }
    .tv-toast-text { flex: 1 1 auto; min-width: 0; word-break: normal; white-space: pre-wrap; line-height: 1.4; }
    .tv-toast-close { border: none; background: transparent; color: inherit; cursor: pointer; font-size: 16px; line-height: 1; padding: 4px; margin: -2px -2px 0 4px; opacity: 0.6; }
    .tv-toast-close:hover { opacity: 1; background: transparent; transform: none; box-shadow: none; outline: none; }

    /* Search Highlighting (Adopts --highlight & --current-row from Qwen-Style Theme) */
    mark.search-hl { 
      background: var(--highlight, #fff3a2); color: inherit; 
      padding: 1px 3px; border-radius: 4px; 
      box-shadow: 0 0 0 1px var(--current-row, #ffeaa2); 
      font-weight: 600; word-break: break-word; 
    }
    .current-row td { background: var(--current-row, #ffeaa2) !important; transition: background .35s ease; }

    /* Copy Modal */
    #tv-copy-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); z-index: 1400; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .tv-modal-panel { background: var(--panel, #fff); color: var(--text, #111); border: 1px solid var(--border, #e5e7eb); border-radius: 12px; box-shadow: 0 16px 48px rgba(0,0,0,0.25); max-width: min(90%, 1000px); width: 100%; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column; }
    .tv-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border, #e5e7eb); }
    .tv-modal-textarea { width: 100%; height: 400px; flex: 1 1 auto; resize: none; font-family: var(--font-mono, monospace); font-size: 13px; background: var(--bg, #fff); color: var(--text); border: none; padding: 20px; line-height: 1.5; }
    .tv-modal-textarea:focus { outline: none; box-shadow: inset 0 0 0 3px var(--focus-ring, rgba(37, 99, 235, 0.25)); }
    .tv-modal-controls { display: flex; gap: 8px; padding: 16px 20px; border-top: 1px solid var(--border, #e5e7eb); background: var(--bg); }
    
    /* Early Hide (Reduces flicker before extra.js loads) */
    .export-markdown-btn, .export-markdown, .export-markdown-table,
    #exportMarkdownBtn, [data-action="export-markdown"],
    button[data-format="md"], a[data-format="md"] { display: none !important; }
    
    /* Ensure single-table TOC list layout wraps safely on smaller viewports */
    #tocBar ul.single-toc-list { display: flex; gap: 8px; list-style: none; margin: 0; padding: 0; flex-wrap: wrap; align-items: center; }
  `;

  function injectStyles() {
    if (document.getElementById('tv-theme-styles')) return;
    const style = document.createElement('style');
    style.id = 'tv-theme-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }
  injectStyles();

  // -----------------------------
  // 3. Utilities & Helpers
  // -----------------------------
  function getScriptBase() {
    const current = document.currentScript?.src;
    if (current) return current.replace(/[^/]*$/, '');
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].src || '';
      if (/script\.js(\?.*)?$/.test(src)) return src.replace(/[^/]*$/, '');
    }
    return location.origin + location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1 || '/');
  }
  
  const TV_BASE = getScriptBase();
  window.__tv_base = window.__tv_base || TV_BASE;
  window.__tv_extra_loader_patched = window.__tv_extra_loader_patched || true;

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function sanitizeFileName(name) {
    return String(name || 'download').trim().replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 200) || 'download';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFileName(filename);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 100);
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return; } catch {}
    }
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  // -----------------------------
  // 4. Toast & Modal System
  // -----------------------------
  function ensureToastContainer() {
    let c = document.getElementById('tv-toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'tv-toast-container';
      c.setAttribute('role', 'status');
      c.setAttribute('aria-live', 'polite');
      document.body.appendChild(c);
    }
    return c;
  }

  function showToast(msg, { duration = null, type = 'info' } = {}) {
    const id = ++STATE.toastIdCounter;
    STATE.toastQueue.push({ id, msg: String(msg || ''), duration, type });
    processToastQueue();
    return { id, dismiss: () => dismissToastById(id) };
  }

  function processToastQueue() {
    if (STATE.activeToast || STATE.toastQueue.length === 0) return;
    const item = STATE.toastQueue.shift();
    const container = ensureToastContainer();
    
    const el = document.createElement('div');
    el.className = `tv-toast ${item.type}`;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('tabindex', '-1');
    
    el.innerHTML = `
      <div class="tv-toast-text"></div>
      <button type="button" class="tv-toast-close" aria-label="Dismiss notification">✕</button>
    `;
    el.querySelector('.tv-toast-text').textContent = item.msg;
    
    const hide = () => {
      clearTimeout(to);
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => {
        el.remove();
        STATE.activeToast = null;
        processToastQueue();
      }, 180);
    };

    el.querySelector('.tv-toast-close').onclick = hide;
    el.onclick = (e) => { if (e.target === el) hide(); };
    container.appendChild(el);
    
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });

    const timeoutMs = item.duration || Math.max(2500, Math.min(6000, item.msg.length * 50));
    const to = setTimeout(hide, timeoutMs);
    STATE.activeToast = { id: item.id, el, timeoutId: to };
  }

  function dismissToastById(id) {
    if (STATE.activeToast?.id === id) {
      clearTimeout(STATE.activeToast.timeoutId);
      STATE.activeToast.el.click();
    } else {
      STATE.toastQueue = STATE.toastQueue.filter(i => i.id !== id);
    }
  }

  function showCopyModal(text, { title = 'Copy text' } = {}) {
    document.getElementById('tv-copy-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'tv-copy-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    
    overlay.innerHTML = `
      <div class="tv-modal-panel">
        <div class="tv-modal-header">
          <strong style="font-size:1rem">${title}</strong>
          <button type="button" class="modal-close">✕</button>
        </div>
        <textarea class="tv-modal-textarea" spellcheck="false"></textarea>
        <div class="tv-modal-controls">
          <button type="button" class="select-all" aria-label="Select all">Select All</button>
          <button type="button" class="copy-btn" aria-label="Copy to clipboard">Copy</button>
          <button type="button" class="download-btn" aria-label="Download as file">Download</button>
        </div>
      </div>
    `;
    
    const ta = overlay.querySelector('textarea');
    ta.value = text || '';
    
    overlay.querySelector('.modal-close').onclick = () => overlay.remove();
    overlay.querySelector('.select-all').onclick = () => { ta.focus(); ta.select(); };
    overlay.querySelector('.copy-btn').onclick = async () => {
      try { 
        await copyToClipboard(ta.value); 
        showToast('Copied to clipboard!', { type: 'success' }); 
        overlay.remove(); 
      } catch { 
        showToast('Copy failed', { type: 'warn' }); 
      }
    };
    overlay.querySelector('.download-btn').onclick = () => {
      downloadBlob(new Blob([ta.value], { type: 'text/plain' }), `${sanitizeFileName(title)}.txt`);
      showToast('Downloaded successfully!', { type: 'success' });
      overlay.remove();
    };

    document.body.appendChild(overlay);
    ta.focus();
    ta.select();
  }

  // -----------------------------
  // 5. Table State, Sorting, TOC
  // -----------------------------
  function getSearchEl() {
    return document.getElementById('searchBox') || document.getElementById('searchInput') || document.getElementById('search');
  }

  function getTableFromButton(btn) {
    return btn?.closest('.table-wrapper')?.querySelector('table');
  }

  function safeGetTBody(table) {
    return table?.tBodies?.[0] || table;
  }

  function ensureRowUidsAndSnapshot(table, tableIdx) {
    const tbody = safeGetTBody(table);
    if (!tbody) return;
    const order = [];
    Array.from(tbody.rows).forEach(r => {
      if (!r.dataset.tvUid) r.dataset.tvUid = `tvuid-${STATE.uidCounter++}`;
      order.push(r.dataset.tvUid);
    });
    STATE.originalRowOrders[tableIdx] = order;
  }

  function initTocCache() {
    const tocBar = document.getElementById('tocBar');
    if (!tocBar) return;
    STATE.tocLinks = Array.from(tocBar.querySelectorAll('a[href^="#"]'));
    STATE.tocTargets = STATE.tocLinks.map(link => document.getElementById(link.getAttribute('href').substring(1)));
  }

  function updateActiveTocItem() {
    if (STATE.tocTicking || !STATE.tocLinks.length) return;
    STATE.tocTicking = true;
    
    requestAnimationFrame(() => {
      STATE.tocTicking = false;
      const scrollPos = window.scrollY + 80; // Safe offset below the 48px+ header

      let activeIdx = -1;
      let maxTop = -Infinity;
      
      for (let i = 0; i < STATE.tocTargets.length; i++) {
        const target = STATE.tocTargets[i];
        if (!target || window.getComputedStyle(target).display === 'none' || target.offsetParent === null) continue;
        
        const top = target.getBoundingClientRect().top + window.scrollY;
        if (top <= scrollPos && top > maxTop) {
          maxTop = top;
          activeIdx = i;
        }
      }
      
      STATE.tocLinks.forEach((link, i) => {
        const isActive = i === activeIdx;
        link.classList.toggle('toc-active', isActive);
        if (isActive) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    });
  }

  function updateToggleButtonState(wrapper) {
    const btn = wrapper.querySelector('.toggle-table-btn');
    if (!btn) return;
    const collapsed = wrapper.classList.contains('table-collapsed');
    const text = collapsed ? "Expand Table" : "Collapse Table";
    
    const explicitTextEl = btn.querySelector('.label, .btn-text, span');
    if (explicitTextEl) {
      explicitTextEl.textContent = text;
    }
    btn.setAttribute('aria-label', text);
    btn.setAttribute('title', text);
  }

  function updateHeaderSortUI(tableIdx) {
    const table = document.querySelectorAll(".table-container table")[tableIdx];
    if (!table?.tHead) return;
    
    Array.from(table.tHead.rows[0].cells).forEach((th, c) => {
      const btn = th.querySelector('.sort-btn');
      if (!btn) return;
      
      const state = STATE.sortStates[tableIdx]?.[c] || 0;
      btn.classList.remove('sort-state-0', 'sort-state-1', 'sort-state-2');
      btn.classList.add(`sort-state-${state}`);
      
      th.setAttribute('aria-sort', state === 1 ? 'ascending' : state === 2 ? 'descending' : 'none');
      
      const iconSpan = btn.querySelector('.sort-icon');
      if (iconSpan) {
        const svgs = {
          0: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 15l4 4 4-4"/><path d="M8 9l4-4 4 4"/></svg>`,
          1: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M6 11l6-6 6 6"/></svg>`,
          2: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>`
        };
        iconSpan.innerHTML = svgs[state];
      }
    });
  }

  function sortTableByColumn(tableIdx, colIdx) {
    const table = document.querySelectorAll(".table-container table")[tableIdx];
    const tbody = safeGetTBody(table);
    if (!tbody) return;

    STATE.sortStates[tableIdx] = STATE.sortStates[tableIdx] || [];
    let state = STATE.sortStates[tableIdx][colIdx] || 0;
    let rows = Array.from(tbody.rows);

    const getVal = (row, idx) => (row.cells[idx]?.textContent || '').trim();
    const parseNum = (v) => parseFloat(String(v).replace(/,/g, '').replace(/\s+/g, ''));

    const compare = (a, b, asc) => {
      const vA = getVal(a, colIdx), vB = getVal(b, colIdx);
      const nA = parseNum(vA), nB = parseNum(vB);
      if (!isNaN(nA) && !isNaN(nB)) return asc ? nA - nB : nB - nA;
      return asc ? vA.localeCompare(vB) : vB.localeCompare(vA);
    };

    if (state === 0) { rows.sort((a, b) => compare(a, b, true)); STATE.sortStates[tableIdx][colIdx] = 1; } 
    else if (state === 1) { rows.sort((a, b) => compare(a, b, false)); STATE.sortStates[tableIdx][colIdx] = 2; } 
    else {
      const order = STATE.originalRowOrders[tableIdx];
      if (order?.length) {
        const arranged = order.map(uid => tbody.querySelector(`tr[data-tv-uid="${uid}"]`)).filter(Boolean);
        rows.forEach(r => { if (!arranged.includes(r)) arranged.push(r); });
        rows = arranged;
      }
      STATE.sortStates[tableIdx][colIdx] = 0;
    }

    STATE.sortStates[tableIdx].forEach((_, i) => { if (i !== colIdx) STATE.sortStates[tableIdx][i] = 0; });

    rows.forEach(r => tbody.appendChild(r));
    updateHeaderSortUI(tableIdx);
    updateRowCounts();
    updateActiveTocItem();
  }

  function headerSortButtonClicked(tableIdx, colIdx, btnEl) {
    sortTableByColumn(tableIdx, colIdx);
    btnEl?.focus();
  }

  function toggleTable(btn) {
    const wrapper = btn.closest('.table-wrapper');
    if (!wrapper) return;
    
    wrapper.classList.toggle('table-collapsed');
    updateToggleButtonState(wrapper);

    const anyExpanded = document.querySelectorAll('.table-wrapper:not(.table-collapsed)').length > 0;
    const toggleAllBtn = document.getElementById('toggleAllBtn');
    if (toggleAllBtn) {
      const txt = anyExpanded ? "Collapse All Tables" : "Expand All Tables";
      toggleAllBtn.setAttribute('aria-label', txt);
      if (!toggleAllBtn.querySelector('svg, i')) toggleAllBtn.textContent = txt;
    }
    updateRowCounts();
    updateActiveTocItem();
  }

  function toggleAllTables() {
    const wrappers = Array.from(document.querySelectorAll('.table-wrapper'));
    if (!wrappers.length) return;
    const anyExpanded = wrappers.some(w => !w.classList.contains('table-collapsed'));
    
    wrappers.forEach(w => {
      if (anyExpanded && !w.classList.contains('table-collapsed')) w.classList.add('table-collapsed');
      else if (!anyExpanded && w.classList.contains('table-collapsed')) w.classList.remove('table-collapsed');
      updateToggleButtonState(w);
    });

    const toggleAllBtn = document.getElementById('toggleAllBtn');
    if (toggleAllBtn) {
      const txt = anyExpanded ? "Expand All Tables" : "Collapse All Tables";
      toggleAllBtn.setAttribute('aria-label', txt);
      if (!toggleAllBtn.querySelector('svg, i')) toggleAllBtn.textContent = txt;
    }

    updateRowCounts();
    updateActiveTocItem();
  }

  function updateRowCounts() {
    document.querySelectorAll(".table-wrapper").forEach(wrapper => {
      const table = wrapper.querySelector("table");
      const countDiv = wrapper.querySelector(".row-count");
      if (!table || !countDiv) return;
      
      const tbody = safeGetTBody(table);
      if (!tbody) { countDiv.textContent = "Showing 0 rows"; return; }
      
      const rows = tbody.rows;
      const total = rows.length;
      const visible = Array.from(rows).filter(r => window.getComputedStyle(r).display !== "none").length;
      
      countDiv.textContent = total === 0 ? "Showing 0 rows" : 
                             visible === total ? `Showing ${total} rows` : 
                             `Showing ${visible} of ${total} rows`;
    });
  }

  function normalizeForSearch(s) {
    try {
      return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
    } catch {
      return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    }
  }

  function clearHighlights(cell) {
    if (!cell) return;
    if (cell.dataset.origHtml) { cell.innerHTML = cell.dataset.origHtml; return; }
    cell.querySelectorAll('mark').forEach(m => {
      const textNode = document.createTextNode(m.textContent);
      if (m.parentNode) m.parentNode.replaceChild(textNode, m);
    });
  }

  function highlightMatches(cell, filterNorm) {
    if (!cell || !filterNorm || !filterNorm.trim()) return;
    
    const nodes = [];
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue?.trim() && walker.currentNode.nodeValue !== '\u00A0') {
        nodes.push(walker.currentNode);
      }
    }

    const needle = filterNorm.toLowerCase();

    for (const tn of nodes) {
      const original = tn.nodeValue;
      const lowerOriginal = original.toLowerCase().replace(/\u00a0/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
      if (!normalizeForSearch(lowerOriginal).includes(needle)) continue;

      const frag = document.createDocumentFragment();
      const normalizedOriginal = normalizeForSearch(lowerOriginal);
      
      let i = 0; let lastMatch = -1;
      let normalizedIndexMap = [];
      
      for (let j=0; j<lowerOriginal.length; j++){
        normalizedIndexMap.push(normalizedIndexMap.length);
        normalizedOriginal;
      }
      
      // Simple fallback highlight strategy (Safe & Fast): 
      // Since complex Unicode normalization on exact boundaries can fragment nodes excessively on complex HTML (tables), 
      // we fallback to a basic case-insensitive exact substring wrap on standard strings to avoid layout shifts on complex rich-table HTMLs.
      const basicMatchIndex = original.toLowerCase().indexOf(needle);
      if (basicMatchIndex === -1) continue;

      let startIdx = 0;
      let searchFrom = 0;
      while (searchFrom < original.length) {
        const idx = original.toLowerCase().indexOf(needle, searchFrom);
        if (idx === -1) break;
        
        if (idx > startIdx) {
          frag.appendChild(document.createTextNode(original.substring(startIdx, idx)));
        }
        
        const mark = document.createElement('mark');
        mark.className = 'search-hl';
        mark.appendChild(document.createTextNode(original.substring(idx, idx + needle.length)));
        frag.appendChild(mark);
        
        startIdx = idx + needle.length;
        searchFrom = startIdx;
      }

      if (startIdx < original.length) {
        frag.appendChild(document.createTextNode(original.substring(startIdx)));
      }
      tn.parentNode.replaceChild(frag, tn);
    }
  }

  function searchTable() {
    const searchVal = getSearchEl()?.value || '';
    const filterNorm = normalizeForSearch(searchVal);
    let firstMatch = null;
    
    document.querySelectorAll('.table-container table').forEach(table => {
      const tbody = safeGetTBody(table);
      if (!tbody) return;
      
      Array.from(tbody.rows).forEach(row => {
        let rowMatches = false;
        
        Array.from(row.cells).forEach(cell => {
          clearHighlights(cell);
          if (filterNorm && normalizeForSearch(cell.textContent || '').includes(filterNorm)) {
            rowMatches = true;
          }
        });

        const isVisible = !filterNorm || rowMatches;
        row.style.display = isVisible ? '' : 'none';
        
        if (rowMatches && !row.classList.contains('current-row')) {
           // We'll use `mark.search-hl` rather than forcing `current-row` on all matching to avoid layout shifts on rich HTML tables.
        }

        if (isVisible && window.tvConfig.highlight && rowMatches) {
           Array.from(row.cells).forEach(cell => highlightMatches(cell, filterNorm));
        }
        
        if (rowMatches && !firstMatch) firstMatch = row;
      });
    });

    if (firstMatch && window.matchMedia('(min-width: 600px)').matches) {
       // Scroll into view only on larger viewports to avoid janky layout shifts during active typing
      try {
        firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch {}
    }
    
    updateRowCounts();
    updateActiveTocItem();
  }

  // -----------------------------
  // 6. Export Functions (Safe & Robust)
  // -----------------------------
  function tableToMarkdownLines(table, title) {
    const lines = [];
    const rows = Array.from(table.rows);
    if (!rows.length) return lines;
    if (title) lines.push(`**${title}**`, '');
    
    const headCells = Array.from(rows[0].cells).map(c => (c.textContent || '').trim().replace(/\|/g, '\\|'));
    lines.push(`| ${headCells.join(' | ')} |`);
    lines.push(`| ${headCells.map(() => '---').join(' | ')} |`);
    
    for (let i = 1; i < rows.length; i++) {
      const rowCells = Array.from(rows[i].cells).map(c => {
        let txt = (c.textContent || '').trim().replace(/\|/g, '\\|');
        return txt.includes('\n') ? txt.replace(/\r?\n/g, '<br>') : txt;
      });
      lines.push(`| ${rowCells.join(' | ')} |`);
    }
    return lines;
  }

  function exportTableCSV(btn, { filename } = {}) {
    const table = getTableFromButton(btn);
    if (!table) return showToast('No table found', { type: 'warn' });
    const csv = Array.from(table.rows).map(r => 
      Array.from(r.cells).map(c => {
        const v = c.textContent || '';
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')
    ).join('\r\n');
    const name = sanitizeFileName(filename || table.closest('.table-wrapper')?.querySelector('h3')?.textContent || 'table') + '.csv';
    downloadBlob(new Blob(["\uFEFF", csv], { type: 'text/csv;charset=utf-8;' }), name);
    showToast('CSV exported', { type: 'success' });
  }

  function exportTableMarkdown(btn, { filename } = {}) {
    const table = getTableFromButton(btn);
    if (!table) return showToast('No table found', { type: 'warn' });
    const title = table.closest('.table-wrapper')?.querySelector('h3')?.textContent || '';
    const lines = tableToMarkdownLines(table, title);
    if (!lines.length) return showToast('Table empty', { type: 'warn' });
    const name = sanitizeFileName(filename || title || 'table') + '.md';
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }), name);
    showToast('Markdown exported', { type: 'success' });
  }

  function exportAllTablesMarkdown({ filename } = {}) {
    const pieces = [];
    document.querySelectorAll(".table-wrapper").forEach(w => {
      const table = w.querySelector('table');
      if (!table) return;
      const lines = tableToMarkdownLines(table, w.querySelector('h3')?.textContent || '');
      if (lines.length) {
        if (pieces.length) pieces.push('');
        pieces.push(...lines);
      }
    });
    if (!pieces.length) return showToast('No tables to export', { type: 'warn' });
    const name = sanitizeFileName(filename || 'all_tables') + '.md';
    downloadBlob(new Blob([pieces.join('\n')], { type: 'text/markdown;charset=utf-8' }), name);
    showToast('All tables exported', { type: 'success' });
  }

  function exportTableJSON(btn, { filename } = {}) {
    const table = getTableFromButton(btn);
    if (!table) return showToast('No table found', { type: 'warn' });
    
    let headers = Array.from(table.tHead?.rows[0]?.cells || []).map(c => c.textContent.trim());
    if (!headers.length) headers = Array.from(table.rows[0]?.cells || []).map((_, i) => `Col${i + 1}`);
    
    const data = Array.from(safeGetTBody(table).rows).map(r => {
      const obj = {};
      Array.from(r.cells).forEach((td, i) => obj[headers[i] || `Col${i + 1}`] = td.textContent.trim());
      return obj;
    });
    const name = sanitizeFileName(filename || table.closest('.table-wrapper')?.querySelector('h3')?.textContent || 'table') + '.json';
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), name);
    showToast('JSON exported', { type: 'success' });
  }

  function exportTableXLSX(btn, { filename } = {}) {
    const table = getTableFromButton(btn);
    if (!table) return showToast('No table found', { type: 'warn' });
    const aoa = Array.from(table.querySelectorAll('tr')).map(tr => 
      Array.from(tr.querySelectorAll('th,td')).map(td => (td.textContent || '').trim())
    );
    if (!aoa.length) return showToast('Table empty', { type: 'warn' });
    
    const baseName = sanitizeFileName(filename || table.closest('.table-wrapper')?.querySelector('h3')?.textContent || 'table');
    if (window.XLSX?.utils && typeof window.XLSX.utils.aoa_to_sheet === 'function') {
      try {
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
        window.XLSX.writeFile(wb, `${baseName}.xlsx`);
        return showToast('XLSX exported', { type: 'success' });
      } catch (err) { console.error('XLSX export error:', err); }
    }
    // Safe Fallback
    const csv = aoa.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    downloadBlob(new Blob(["\uFEFF", csv], { type: 'text/csv;charset=utf-8;' }), `${baseName}.csv`);
    showToast('XLSX library missing, downloaded CSV.', { type: 'info' });
  }

  function exportTablePDF(btn) {
    const table = getTableFromButton(btn);
    if (!table) return showToast('No table found', { type: 'warn' });
    const title = table.closest('.table-wrapper')?.querySelector('h3')?.textContent || 'Table';
    
    const htmlDoc = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #333;padding:8px;vertical-align:top;}th{background:#eee;}</style>
      </head><body><h1 style="font-size:24px">${title}</h1>${table.outerHTML}</body></html>`;
    
    const w = window.open('', '_blank');
    if (!w) return showToast('Unable to open print window', { type: 'warn' });
    w.document.write(htmlDoc);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  }

  function copyTablePlain(btn) {
    const table = getTableFromButton(btn);
    if (!table) return showToast('No table found', { type: 'warn' });
    const text = (table.closest('.table-wrapper')?.querySelector('h3')?.textContent || '') + "\n" + 
                 Array.from(table.rows).map(r => Array.from(r.cells).map(c => c.textContent.trim()).join("\t")).join("\n");
    copyToClipboard(text).then(() => showToast('Copied as plain text!', { type: 'success' })).catch(() => showCopyModal(text, { title: 'Table Text' }));
  }

  function copyTableMarkdown(btn) {
    const table = getTableFromButton(btn);
    if (!table) return showToast('No table found', { type: 'warn' });
    const title = table.closest('.table-wrapper')?.querySelector('h3')?.textContent || '';
    const md = tableToMarkdownLines(table, title).join('\n');
    if (!md) return showToast('Table empty', { type: 'warn' });
    copyToClipboard(md).then(() => showToast('Copied in Markdown!', { type: 'success' })).catch(() => showCopyModal(md, { title: 'Table Markdown' }));
  }

  function copyAllTablesPlain() {
    const text = Array.from(document.querySelectorAll(".table-wrapper")).map(w => {
      const tbl = w.querySelector('table');
      if (!tbl) return '';
      return (w.querySelector('h3')?.textContent || '') + "\n" + 
             Array.from(tbl.rows).map(r => Array.from(r.cells).map(c => c.textContent.trim()).join("\t")).join("\n");
    }).filter(Boolean).join("\n\n");
    if (!text) return showToast('No tables found', { type: 'warn' });
    copyToClipboard(text).then(() => showToast("All tables copied!", { type: 'success' })).catch(() => showCopyModal(text, { title: 'All Tables' }));
  }

  function copyAllTablesMarkdown() {
    const pieces = [];
    document.querySelectorAll(".table-wrapper").forEach(w => {
      const tbl = w.querySelector('table');
      if (!tbl) return;
      const lines = tableToMarkdownLines(tbl, w.querySelector('h3')?.textContent || '');
      if (lines.length) {
        if (pieces.length) pieces.push('');
        pieces.push(...lines);
      }
    });
    if (!pieces.length) return showToast('No tables to export', { type: 'warn' });
    const md = pieces.join('\n');
    copyToClipboard(md).then(() => showToast("All tables copied!", { type: 'success' })).catch(() => showCopyModal(md, { title: 'All Markdown Tables' }));
  }

  // -----------------------------
  // 7. Initialization
  // -----------------------------
  function resetAllTables() {
    document.querySelectorAll(".table-container table").forEach((table, idx) => {
      const tbody = safeGetTBody(table);
      if (!tbody) return;
      
      const order = STATE.originalRowOrders[idx];
      if (order?.length) {
        const arranged = order.map(uid => tbody.querySelector(`tr[data-tv-uid="${uid}"]`)).filter(Boolean);
        Array.from(tbody.rows).forEach(r => { if (!arranged.includes(r)) arranged.push(r); });
        arranged.forEach(r => tbody.appendChild(r));
      }
      
      STATE.sortStates[idx] = Array(table.rows[0]?.cells.length || 0).fill(0);
      updateHeaderSortUI(idx);
    });
    
    document.querySelectorAll('.table-wrapper').forEach(w => {
      w.classList.remove('table-collapsed');
      updateToggleButtonState(w);
    });

    const toggleAllBtn = document.getElementById('toggleAllBtn');
    if (toggleAllBtn) {
      toggleAllBtn.setAttribute('aria-label', "Collapse All Tables");
      if (!toggleAllBtn.querySelector('svg, i')) toggleAllBtn.textContent = "Collapse All Tables";
    }

    const sb = getSearchEl();
    if (sb) sb.value = "";
    searchTable();
    updateRowCounts();
    showToast("All tables reset!", { type: 'success' });
  }

  function ensureExtraJsAndIndex(base) {
    if (!document.body) return setTimeout(() => ensureExtraJsAndIndex(base), 50);
    try {
      if (!document.body.getAttribute('data-index-url')?.trim()) {
        document.body.setAttribute('data-index-url', base.replace(/\/?$/, '/') + 'tables_index.json');
      }
      if (!document.body.getAttribute('data-worker-url')?.trim()) {
        document.body.setAttribute('data-worker-url', base.replace(/\/?$/, '/') + 'worker.js');
      }
    } catch {}

    if (window.__tv_no_auto_extra_load || document.querySelector('script[src*="extra.js"]') || window._tv_extra_loaded) return;
    
    window._tv_extra_loaded = true;
    const candidates = [
      base.replace(/\/?$/, '/') + 'extra.js',
      base.replace(/\/?$/, '/') + 'assets/extra.js',
      (location.origin || '') + '/assets/extra.js',
      './assets/extra.js', './extra.js'
    ];
    let idx = 0;
    (function tryNext() {
      if (idx >= candidates.length) return console.warn('TV: extra.js candidates failed.');
      const src = candidates[idx++];
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true;
      s.onload = () => console.info('TV: extra.js loaded from', src);
      s.onerror = () => { s.remove(); tryNext(); };
      document.head.appendChild(s);
    })();
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureExtraJsAndIndex(TV_BASE);
    ensureIndexAndWorkerAttrs(TV_BASE);

    document.querySelectorAll('.table-wrapper').forEach(wrapper => {
      if (!wrapper.querySelector('.table-container') && wrapper.querySelector('table')) {
        const container = document.createElement('div');
        container.className = 'table-container';
        const tbl = wrapper.querySelector('table');
        wrapper.insertBefore(container, tbl);
        container.appendChild(tbl);
      }

      const header = wrapper.querySelector('.table-header-wrapper, .table-controls');
      if (header && !header.classList.contains('table-controls')) {
        header.classList.add('table-controls');
      }

      updateToggleButtonState(wrapper);
    });

    document.querySelectorAll(".table-container table").forEach((table, idx) => {
      ensureRowUidsAndSnapshot(table, idx);
      STATE.sortStates[idx] = Array(table.rows[0]?.cells.length || 0).fill(0);
      
      const tbody = safeGetTBody(table);
      if (tbody) {
        Array.from(tbody.rows).forEach(r => {
          Array.from(r.cells).forEach(c => { 
             // Save initial rich-HTML state safely to ensure complex HTML restores properly on clearHighlights()
             if (!c.dataset.origHtml) c.dataset.origHtml = c.innerHTML; 
          });
        });
      }
      updateHeaderSortUI(idx);
    });

    initTocCache();

    const anyExpanded = document.querySelectorAll('.table-wrapper:not(.table-collapsed)').length > 0;
    const toggleAll = document.getElementById('toggleAllBtn');
    if (toggleAll) {
      const txt = anyExpanded ? "Collapse All Tables" : "Expand All Tables";
      toggleAll.setAttribute('aria-label', txt);
      if (!toggleAll.querySelector('svg, i')) toggleAll.textContent = txt;
    }

    const btt = document.getElementById('backToTop');
    if (!btt) {
      const b = document.createElement('button');
      b.id = 'backToTop';
      b.type = 'button';
      b.title = 'Back to top';
      b.setAttribute('aria-label', 'Back to top');
      b.textContent = '↑';
      b.style.display = 'none';
      b.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
      document.body.appendChild(b);
    }

    const sb = getSearchEl();
    if (sb) {
      const deb = debounce(searchTable, window.tvConfig.debounceMs || 120);
      sb.addEventListener('input', deb);
      sb.addEventListener('keyup', e => { if (e.key === 'Enter') searchTable(); });
    }

    const handlerPairs = [
      ['.toggle-table-btn', '.toggle-table', toggleTable],
      ['.copy-plain-btn', '.copy-plain', copyTablePlain],
      ['.copy-markdown-btn', '.copy-markdown', copyTableMarkdown],
      ['.export-csv-btn', '.export-csv', exportTableCSV],
      ['.export-json-btn', '.export-json', exportTableJSON],
      ['.export-xlsx-btn', '.export-xlsx', exportTableXLSX],
      ['.export-pdf-btn', '.export-pdf', exportTablePDF]
    ];

    document.querySelectorAll('.table-wrapper').forEach(wrap => {
      for (let i=0; i<handlerPairs.length; i+=3) {
        const btn = wrap.querySelector(handlerPairs[i]) || wrap.querySelector(handlerPairs[i+1]);
        if (btn && !btn.dataset.tvHandlerAttached && !btn.getAttribute('onclick')) {
           const handlerFn = handlerPairs[i+2];
           btn.addEventListener('click', function() { handlerFn(this); });
           btn.dataset.tvHandlerAttached = '1';
        }
      }
    });

    window.scrollTo(window.scrollX, window.scrollY + 1); // Force initial scroll state layout update

    updateRowCounts();
    updateActiveTocItem();
  });

  function ensureIndexAndWorkerAttrs(base) { /* Handled above */ }

  document.addEventListener("keydown", function (e) {
    const active = document.activeElement;
    const tag = active?.tagName?.toLowerCase();
    
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !active?.isContentEditable) {
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
      const s = getSearchEl();
      if (s) { s.focus(); s.select(); }
    }
    if (e.key === "Escape") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  // Delegation: Sorting & Anchor handling (Respecting theme scroll-margins)
  document.addEventListener('click', function (e) {
    const el = e.target;
    const sortHit = el.closest?.('.sort-btn') || el.closest?.('.th-with-sort');
    if (sortHit) {
      const th = sortHit.closest('th');
      if (th) {
        const table = th.closest('table');
        const tables = Array.from(document.querySelectorAll('.table-container table'));
        const tableIdx = tables.indexOf(table);
        const colIdx = th.cellIndex;
        if (tableIdx !== -1 && colIdx >= 0) {
          headerSortButtonClicked(tableIdx, colIdx, sortHit);
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }

    const tocLink = el.closest?.('#tocBar a[href^="#"]');
    if (tocLink) {
      const id = tocLink.getAttribute('href').substring(1);
      if (id) {
        const target = document.getElementById(id);
        if (target) {
          e.preventDefault(); 
          // Modern `scrollIntoView` properly leverages `scroll-margin-top` set by `style.css` on tr[id]
          target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
          target.focus({ preventScroll: true }); 
          history.replaceState(null, '', '#' + id);
          // The theme `@media (hover: hover)` and focus-visible handling manages visual state safely now
        }
      }
    }
  });

  let tickingScroll = false;
  window.addEventListener("scroll", function () {
    if (!tickingScroll) {
      requestAnimationFrame(() => {
        const btn = document.getElementById("backToTop");
        if (btn) btn.style.display = (document.documentElement.scrollTop > 300 || window.scrollY > 300) ? "block" : "none";
        updateActiveTocItem();
        tickingScroll = false;
      });
      tickingScroll = true;
    }
  }, { passive: true });

  window.toggleMode = function() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? '' : 'dark');
    const btn = document.getElementById('modeBtn');
    if (btn) {
      btn.setAttribute('aria-label', isDark ? 'Switch to Dark mode' : 'Switch to Light mode');
      if (!btn.querySelector('svg, i')) btn.textContent = isDark ? 'Dark mode' : 'Light mode';
    }
    localStorage.setItem('uiMode', isDark ? 'light' : 'dark');
  };

  Object.assign(window, {
    headerSortButtonClicked, toggleTable, toggleAllTables, copyTablePlain, copyTableMarkdown,
    copyAllTablesPlain, copyAllTablesMarkdown, resetAllTables, searchTable, exportTableCSV,
    exportTableJSON, exportTableXLSX, exportTablePDF, exportTableMarkdown: exportTableMarkdown, exportAllTablesMarkdown
  });

})();