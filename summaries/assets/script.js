/* assets/script.js — Tables Viewer v2.1
   Minimal, robust interactive bindings. Exposes required globals:
   toggleMode, toggleAllTables, copyAllTablesPlain, copyAllTablesMarkdown,
   resetAllTables, searchTable, copyTablePlain, copyTableMarkdown,
   toggleTable, sortTableByColumn, headerSortButtonClicked, backToTop
*/
(function () {
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    // store original row order for each table
    document.querySelectorAll('.table-wrapper').forEach(function (wrapper) {
      const table = wrapper.querySelector('table') || wrapper.querySelector('.data-table') || wrapper.querySelector('.chat-table');
      if (!table) return;
      const tbody = table.tBodies[0];
      if (!tbody) return;
      Array.from(tbody.rows).forEach(function (tr, i) {
        tr.dataset.origIndex = i;
      });
    });
  }

  // theme toggle
  window.toggleMode = function () {
    const body = document.body;
    const btn = document.getElementById('modeBtn');
    const isDark = body.classList.toggle('dark-mode');
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (btn) btn.textContent = 'Light mode';
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (btn) btn.textContent = 'Dark mode';
    }
  };

  // collapse / expand all tables
  window.toggleAllTables = function () {
    const wrappers = Array.from(document.querySelectorAll('.table-wrapper'));
    if (wrappers.length === 0) return;
    const anyOpen = wrappers.some(w => !w.classList.contains('table-collapsed'));
    wrappers.forEach(w => {
      if (anyOpen) w.classList.add('table-collapsed');
      else w.classList.remove('table-collapsed');
    });
    const btn = document.getElementById('toggleAllBtn');
    if (btn) btn.textContent = anyOpen ? 'Expand All Tables' : 'Collapse All Tables';
  };

  // copy helpers
  async function writeToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard');
        return true;
      }
    } catch (e) {
      // fallthrough to prompt
    }
    try {
      window.prompt('Copy to clipboard (Ctrl+C, Enter)', text);
      return true;
    } catch (e) {
      alert('Copy failed');
      return false;
    }
  }

  function showToast(msg) {
    const id = 'tv-toast';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.position = 'fixed';
      el.style.bottom = '18px';
      el.style.right = '18px';
      el.style.padding = '8px 12px';
      el.style.background = 'rgba(0,0,0,0.75)';
      el.style.color = '#fff';
      el.style.borderRadius = '8px';
      el.style.zIndex = 99999;
      el.style.fontSize = '13px';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(function () {
      el.style.transition = 'opacity 400ms';
      el.style.opacity = '0';
    }, 1200);
  }

  function findTableFromButton(btn) {
    if (!btn) return null;
    const wrapper = btn.closest ? btn.closest('.table-wrapper') : getClosest(btn, '.table-wrapper');
    if (!wrapper) return null;
    return wrapper.querySelector('table') || wrapper.querySelector('.data-table') || wrapper.querySelector('.chat-table') || null;
  }

  // copy all tables (plain)
  window.copyAllTablesPlain = async function () {
    let out = '';
    document.querySelectorAll('.table-wrapper').forEach(function (w, idx) {
      const table = w.querySelector('table') || w.querySelector('.data-table') || w.querySelector('.chat-table');
      if (!table) return;
      out += 'Table ' + (idx + 1) + '\n';
      out += tableToPlainText(table) + '\n\n';
    });
    await writeToClipboard(out);
  };

  // copy all tables (markdown)
  window.copyAllTablesMarkdown = async function () {
    let md = '';
    document.querySelectorAll('.table-wrapper').forEach(function (w, idx) {
      const table = w.querySelector('table') || w.querySelector('.data-table') || w.querySelector('.chat-table');
      if (!table) return;
      md += '### Table ' + (idx + 1) + '\n\n';
      md += tableToMarkdown(table) + '\n\n';
    });
    await writeToClipboard(md);
  };

  // reset interface
  window.resetAllTables = function () {
    document.querySelectorAll('.table-wrapper').forEach(w => w.classList.remove('table-collapsed'));
    const sb = document.getElementById('searchBox');
    if (sb) sb.value = '';
    searchTable();
    const btn = document.getElementById('toggleAllBtn');
    if (btn) btn.textContent = 'Collapse All Tables';
  };

  // search across tables; hides rows that don't match and hides whole table if no rows match
  window.searchTable = function () {
    const q = (document.getElementById('searchBox') || { value: '' }).value.trim().toLowerCase();
    const wrappers = document.querySelectorAll('.table-wrapper');
    wrappers.forEach(function (w) {
      const table = w.querySelector('table') || w.querySelector('.data-table') || w.querySelector('.chat-table');
      if (!table) return;
      const tbody = table.tBodies[0];
      if (!tbody) return;
      let anyMatch = false;
      Array.from(tbody.rows).forEach(function (tr) {
        const text = tr.textContent.toLowerCase();
        const match = q === '' || text.indexOf(q) !== -1;
        tr.style.display = match ? '' : 'none';
        if (match) anyMatch = true;
        if (q && match) tr.classList.add('highlight'); else tr.classList.remove('highlight');
      });
      w.style.display = anyMatch ? '' : 'none';
    });
  };

  // copy single table (plain)
  window.copyTablePlain = async function (btn) {
    const table = findTableFromButton(btn);
    if (!table) return;
    await writeToClipboard(tableToPlainText(table));
  };

  // copy single table (markdown)
  window.copyTableMarkdown = async function (btn) {
    const table = findTableFromButton(btn);
    if (!table) return;
    await writeToClipboard(tableToMarkdown(table));
  };

  // toggle a single table (collapse/expand)
  window.toggleTable = function (btn) {
    const wrapper = btn.closest ? btn.closest('.table-wrapper') : getClosest(btn, '.table-wrapper');
    if (!wrapper) return;
    wrapper.classList.toggle('table-collapsed');
    const collapsed = wrapper.classList.contains('table-collapsed');
    btn.textContent = collapsed ? 'Expand Table' : 'Collapse Table';
  };

  // convenience: call headerSortButtonClicked via this wrapper (keeps backward compatibility)
  window.sortTableByColumn = function (tableIndex, colIndex) {
    const wrappers = document.querySelectorAll('.table-wrapper');
    const wrapper = wrappers[tableIndex];
    if (!wrapper) return;
    const sortBtns = wrapper.querySelectorAll('.sort-btn');
    const btn = sortBtns[colIndex] || sortBtns[0] || null;
    return headerSortButtonClicked(tableIndex, colIndex, btn);
  };

  // header sort button handler: cycles 0 -> asc -> desc -> 0
  window.headerSortButtonClicked = function (tableIndex, colIndex, btn) {
    const wrappers = document.querySelectorAll('.table-wrapper');
    const wrapper = wrappers[tableIndex];
    if (!wrapper) return;
    const table = wrapper.querySelector('table') || wrapper.querySelector('.data-table') || wrapper.querySelector('.chat-table');
    if (!table) return;
    const tbody = table.tBodies[0];
    if (!tbody) return;

    const sortBtns = Array.from(wrapper.querySelectorAll('.sort-btn'));
    if (!btn) {
      // if no button passed, pick the relevant one and re-call
      const chosen = sortBtns[colIndex] || sortBtns[0];
      if (!chosen) return;
      return window.headerSortButtonClicked(tableIndex, colIndex, chosen);
    }

    // toggle state for this button only
    const current = parseInt(btn.dataset.sortState || '0', 10);
    const next = (current + 1) % 3; // 0 none, 1 asc, 2 desc

    // reset other buttons
    sortBtns.forEach(function (b) {
      b.dataset.sortState = '0';
      b.classList.remove('sort-state-1', 'sort-state-2');
      b.classList.add('sort-state-0');
    });

    btn.dataset.sortState = String(next);
    btn.classList.remove('sort-state-0', 'sort-state-1', 'sort-state-2');
    btn.classList.add('sort-state-' + next);

    // collect rows with keys
    const rows = Array.from(tbody.rows);
    const items = rows.map(function (r) {
      const cell = r.cells[colIndex];
      const txt = cell ? cell.textContent.trim() : '';
      return {
        row: r,
        key: txt.toLowerCase(),
        num: parseNumber(txt),
        idx: parseInt(r.dataset.origIndex || '0', 10)
      };
    });

    if (next === 0) {
      // restore original order
      items.sort(function (a, b) { return a.idx - b.idx; });
    } else {
      const allNumeric = items.every(i => !isNaN(i.num));
      items.sort(function (a, b) {
        if (allNumeric) {
          return (isNaN(a.num) ? -Infinity : a.num) - (isNaN(b.num) ? -Infinity : b.num);
        }
        return a.key.localeCompare(b.key);
      });
      if (next === 2) items.reverse();
    }

    // reattach rows in new order
    items.forEach(function (it) { tbody.appendChild(it.row); });
  };

  // back to top
  window.backToTop = function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // helpers
  function parseNumber(txt) {
    if (!txt) return NaN;
    const cleaned = String(txt).replace(/[^0-9\.\-]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') return NaN;
    const n = parseFloat(cleaned);
    return isNaN(n) ? NaN : n;
  }

  function tableToPlainText(table) {
    const rows = Array.from(table.rows);
    return rows.map(function (r) {
      return Array.from(r.cells).map(function (c) { return c.textContent.trim(); }).join('\t');
    }).join('\n');
  }

  function tableToMarkdown(table) {
    const thead = table.tHead;
    const tbody = table.tBodies[0];
    let md = '';
    if (thead && thead.rows.length) {
      const headers = Array.from(thead.rows[0].cells).map(c => c.textContent.trim());
      md += '| ' + headers.join(' | ') + ' |\n';
      md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
    }
    if (tbody) {
      Array.from(tbody.rows).forEach(function (r) {
        const cols = Array.from(r.cells).map(function (c) {
          return c.textContent.trim().replace(/\|/g, '\\|');
        });
        md += '| ' + cols.join(' | ') + ' |\n';
      });
    }
    return md;
  }

  // polyfill/utility for old browsers where closest may not exist
  function getClosest(el, sel) {
    while (el && el.matches && !el.matches(sel)) el = el.parentElement;
    return el;
  }
})();
