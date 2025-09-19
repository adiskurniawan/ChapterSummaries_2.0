// assets/script.js — Tables Viewer v2.1 (defensive bindings)
// Revised: added robust event binding and diagnostic logs (careful checks)
(function () {
  "use strict";

  // Small debug helper
  function log(...args) {
    try { console.info("TV:", ...args); } catch (e) {}
  }
  function warn(...args) { try { console.warn("TV:", ...args); } catch (e) {} }
  function err(...args) { try { console.error("TV:", ...args); } catch (e) {} }

  document.addEventListener("DOMContentLoaded", init, { once: true });

  // Public API placeholders (exposed below)
  let API = {};

  function init() {
    log("TV-INIT");

    // Expose API early so inline onclicks can call if needed
    exposeGlobals();

    // Defensive binding steps
    bindToggleTableButtons();
    bindHeaderClicks();
    bindCopyButtons();
    bindGlobalControls();
    restoreOriginalOrderIndexes();
    attachErrorHandler();
    // mark ready in DOM for quick detection
    document.documentElement.dataset.tvReady = "1";

    log("bindings-complete");
  }

  function exposeGlobals() {
    // assign placeholder functions to window before concrete definitions
    const fns = [
      "toggleMode",
      "toggleAllTables",
      "copyAllTablesPlain",
      "copyAllTablesMarkdown",
      "resetAllTables",
      "searchTable",
      "copyTablePlain",
      "copyTableMarkdown",
      "toggleTable",
      "sortTableByColumn",
      "headerSortButtonClicked",
      "backToTop"
    ];
    fns.forEach(name => {
      if (!window[name]) window[name] = function () {
        warn(`${name} called before script init; retrying after init`);
        if (API && typeof API[name] === "function") return API[name].apply(null, arguments);
      };
    });
  }

  // store original order index per row
  function restoreOriginalOrderIndexes() {
    Array.from(document.querySelectorAll(".table-wrapper")).forEach(function (wrapper) {
      const table = wrapper.querySelector("table") || wrapper.querySelector(".data-table") || wrapper.querySelector(".chat-table");
      if (!table || !table.tBodies || !table.tBodies[0]) return;
      const tbody = table.tBodies[0];
      Array.from(tbody.rows).forEach(function (tr, i) {
        if (!tr.dataset.origIndex) tr.dataset.origIndex = String(i);
      });
    });
  }

  // Attach a global error handler to surface problems
  function attachErrorHandler() {
    window.addEventListener("error", function (ev) {
      err("Runtime error:", ev && ev.message ? ev.message : ev);
      showToast("Script error — see console (TV)");
    });
  }

  // --------- Bindings ---------
  function bindToggleTableButtons() {
    const els = Array.from(document.querySelectorAll(".toggle-table-btn"));
    if (!els.length) {
      log("no toggle-table-btn found");
      return;
    }
    els.forEach(function (btn) {
      if (btn.dataset.tvBound) return;
      btn.dataset.tvBound = "1";
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        try { toggleTable(btn); } catch (e) { err("toggleTable()", e); }
      });
    });
    log("bound", els.length, "toggle buttons");
  }

  function bindHeaderClicks() {
    const wrappers = Array.from(document.querySelectorAll(".table-wrapper"));
    if (!wrappers.length) {
      log("no table wrappers for header binding");
      return;
    }
    wrappers.forEach(function (wrapper, tableIndex) {
      const table = wrapper.querySelector("table") || wrapper.querySelector(".data-table") || wrapper.querySelector(".chat-table");
      if (!table) return;
      const thead = table.tHead;
      if (!thead || !thead.rows || !thead.rows.length) return;
      const headerRow = thead.rows[0];
      Array.from(headerRow.cells).forEach(function (th, colIndex) {
        // set pointer cursor so users know it's clickable
        try { th.style.cursor = "pointer"; } catch (e) {}
        // avoid double-binding
        if (th.dataset.tvBound) return;
        th.dataset.tvBound = "1";
        th.addEventListener("click", function (ev) {
          // if click was on inner sort-btn, let that handler manage state
          try { sortTableByColumn(tableIndex, colIndex); } catch (e) { err("sortTableByColumn", e); }
        });
      });
    });
    log("bound header clicks for", wrappers.length, "tables");
  }

  function bindCopyButtons() {
    // buttons may have inline onclicks; add robust event listeners as fallback
    Array.from(document.querySelectorAll(".copy-buttons .btn")).forEach(function (btn) {
      if (btn.dataset.tvBound) return;
      btn.dataset.tvBound = "1";
      const txt = (btn.textContent || "").toLowerCase();
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (txt.indexOf("plain") !== -1) {
          copyTablePlain(btn);
        } else if (txt.indexOf("markdown") !== -1) {
          copyTableMarkdown(btn);
        } else {
          // fallback: try to infer
          const wrapper = btn.closest ? btn.closest(".table-wrapper") : getClosest(btn, ".table-wrapper");
          if (!wrapper) return;
          const isCopyAll = wrapper === document.body; // not likely
          if (isCopyAll) copyAllTablesPlain(); else copyTablePlain(btn);
        }
      });
    });
    log("bound copy buttons");
  }

  function bindGlobalControls() {
    // toggleAllBtn
    const toggleAllBtn = document.getElementById("toggleAllBtn");
    if (toggleAllBtn && !toggleAllBtn.dataset.tvBound) {
      toggleAllBtn.dataset.tvBound = "1";
      toggleAllBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        try { toggleAllTables(); } catch (e) { err("toggleAllTables", e); }
      });
    }

    // mode button
    const modeBtn = document.getElementById("modeBtn");
    if (modeBtn && !modeBtn.dataset.tvBound) {
      modeBtn.dataset.tvBound = "1";
      modeBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        try { toggleMode(); } catch (e) { err("toggleMode", e); }
      });
    }

    // search box input binding
    const sb = document.getElementById("searchBox");
    if (sb && !sb.dataset.tvBound) {
      sb.dataset.tvBound = "1";
      sb.addEventListener("input", function () { searchTable(); });
    }

    log("bound global controls");
  }

  // --------- Utility helpers ---------
  function getClosest(el, sel) {
    while (el && el.matches && !el.matches(sel)) el = el.parentElement;
    return el;
  }

  function showToast(msg) {
    try {
      const id = "tv-toast";
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.style.position = "fixed";
        el.style.right = "18px";
        el.style.bottom = "18px";
        el.style.padding = "8px 12px";
        el.style.background = "rgba(0,0,0,0.75)";
        el.style.color = "#fff";
        el.style.borderRadius = "8px";
        el.style.zIndex = 99999;
        el.style.fontSize = "13px";
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.opacity = "1";
      setTimeout(function () { el.style.transition = "opacity 400ms"; el.style.opacity = "0"; }, 1200);
    } catch (e) { /* ignore */ }
  }

  // simple parse number for sorting
  function parseNumber(txt) {
    if (!txt) return NaN;
    const cleaned = String(txt).replace(/[^0-9\.\-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === "." || cleaned === "-.") return NaN;
    const n = parseFloat(cleaned);
    return isNaN(n) ? NaN : n;
  }

  function tableToPlainText(table) {
    const rows = Array.from(table.rows);
    return rows.map(function (r) { return Array.from(r.cells).map(c => c.textContent.trim()).join('\t'); }).join('\n');
  }

  function tableToMarkdown(table) {
    const thead = table.tHead;
    const tbody = table.tBodies[0];
    let md = "";
    if (thead && thead.rows.length) {
      const headers = Array.from(thead.rows[0].cells).map(c => c.textContent.trim());
      md += "| " + headers.join(" | ") + " |\n";
      md += "| " + headers.map(() => "---").join(" | ") + " |\n";
    }
    if (tbody) {
      Array.from(tbody.rows).forEach(function (r) {
        const cols = Array.from(r.cells).map(function (c) {
          return c.textContent.trim().replace(/\|/g, "\\|");
        });
        md += "| " + cols.join(" | ") + " |\n";
      });
    }
    return md;
  }

  // find table from a button inside wrapper
  function findTableFromButton(btn) {
    if (!btn) return null;
    const wrapper = btn.closest ? btn.closest(".table-wrapper") : getClosest(btn, ".table-wrapper");
    if (!wrapper) return null;
    return wrapper.querySelector("table") || wrapper.querySelector(".data-table") || wrapper.querySelector(".chat-table") || null;
  }

  // --------- Core behaviors (exposed) ---------
  API.toggleMode = function () {
    const body = document.body;
    const btn = document.getElementById("modeBtn");
    const isDark = body.classList.toggle("dark-mode");
    if (isDark) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    if (btn) btn.textContent = isDark ? "Light mode" : "Dark mode";
    log("toggleMode ->", isDark ? "dark" : "light");
  };

  API.toggleAllTables = function () {
    const wrappers = Array.from(document.querySelectorAll(".table-wrapper"));
    if (!wrappers.length) return;
    const anyOpen = wrappers.some(w => !w.classList.contains("table-collapsed"));
    wrappers.forEach(w => {
      if (anyOpen) w.classList.add("table-collapsed");
      else w.classList.remove("table-collapsed");
    });
    const btn = document.getElementById("toggleAllBtn");
    if (btn) btn.textContent = anyOpen ? "Expand All Tables" : "Collapse All Tables";
    log("toggleAllTables ->", anyOpen ? "collapsed" : "expanded");
  };

  API.copyAllTablesPlain = async function () {
    let out = "";
    document.querySelectorAll(".table-wrapper").forEach(function (w, idx) {
      const table = w.querySelector("table") || w.querySelector(".data-table") || w.querySelector(".chat-table");
      if (!table) return;
      out += "Table " + (idx + 1) + "\n";
      out += tableToPlainText(table) + "\n\n";
    });
    await writeToClipboard(out);
  };

  API.copyAllTablesMarkdown = async function () {
    let md = "";
    document.querySelectorAll(".table-wrapper").forEach(function (w, idx) {
      const table = w.querySelector("table") || w.querySelector(".data-table") || w.querySelector(".chat-table");
      if (!table) return;
      md += "### Table " + (idx + 1) + "\n\n";
      md += tableToMarkdown(table) + "\n\n";
    });
    await writeToClipboard(md);
  };

  API.resetAllTables = function () {
    document.querySelectorAll(".table-wrapper").forEach(w => w.classList.remove("table-collapsed"));
    const sb = document.getElementById("searchBox");
    if (sb) sb.value = "";
    API.searchTable();
    const btn = document.getElementById("toggleAllBtn");
    if (btn) btn.textContent = "Collapse All Tables";
    log("resetAllTables");
  };

  API.searchTable = function () {
    const q = (document.getElementById("searchBox") || { value: "" }).value.trim().toLowerCase();
    const wrappers = document.querySelectorAll(".table-wrapper");
    wrappers.forEach(function (w) {
      const table = w.querySelector("table") || w.querySelector(".data-table") || w.querySelector(".chat-table");
      if (!table) return;
      const tbody = table.tBodies[0];
      if (!tbody) return;
      let anyMatch = false;
      Array.from(tbody.rows).forEach(function (tr) {
        const text = tr.textContent.toLowerCase();
        const match = q === "" || text.indexOf(q) !== -1;
        tr.style.display = match ? "" : "none";
        if (match) anyMatch = true;
        if (q && match) tr.classList.add("highlight"); else tr.classList.remove("highlight");
      });
      w.style.display = anyMatch ? "" : "none";
    });
  };

  API.copyTablePlain = async function (btn) {
    const table = findTableFromButton(btn);
    if (!table) return;
    await writeToClipboard(tableToPlainText(table));
  };

  API.copyTableMarkdown = async function (btn) {
    const table = findTableFromButton(btn);
    if (!table) return;
    await writeToClipboard(tableToMarkdown(table));
  };

  API.toggleTable = function (btn) {
    const wrapper = btn.closest ? btn.closest(".table-wrapper") : getClosest(btn, ".table-wrapper");
    if (!wrapper) return;
    wrapper.classList.toggle("table-collapsed");
    const collapsed = wrapper.classList.contains("table-collapsed");
    try { btn.textContent = collapsed ? "Expand Table" : "Collapse Table"; } catch (e) {}
    log("toggleTable ->", collapsed ? "collapsed" : "expanded");
  };

  API.sortTableByColumn = function (tableIndex, colIndex) {
    const wrappers = document.querySelectorAll(".table-wrapper");
    const wrapper = wrappers[tableIndex];
    if (!wrapper) return;
    const table = wrapper.querySelector("table") || wrapper.querySelector(".data-table") || wrapper.querySelector(".chat-table");
    if (!table) return;
    const tbody = table.tBodies[0];
    if (!tbody) return;

    // find associated button if present
    const sortBtns = Array.from(wrapper.querySelectorAll(".sort-btn"));
    const btn = sortBtns[colIndex] || sortBtns[0] || null;
    return API.headerSortButtonClicked(tableIndex, colIndex, btn);
  };

  API.headerSortButtonClicked = function (tableIndex, colIndex, btn) {
    const wrappers = document.querySelectorAll(".table-wrapper");
    const wrapper = wrappers[tableIndex];
    if (!wrapper) return;
    const table = wrapper.querySelector("table") || wrapper.querySelector(".data-table") || wrapper.querySelector(".chat-table");
    if (!table) return;
    const tbody = table.tBodies[0];
    if (!tbody) return;

    const sortBtns = Array.from(wrapper.querySelectorAll(".sort-btn"));
    if (!btn) {
      const chosen = sortBtns[colIndex] || sortBtns[0];
      if (!chosen) return;
      return API.headerSortButtonClicked(tableIndex, colIndex, chosen);
    }

    const current = parseInt(btn.dataset.sortState || "0", 10);
    const next = (current + 1) % 3;
    sortBtns.forEach(function (b) {
      b.dataset.sortState = "0";
      b.classList.remove("sort-state-1", "sort-state-2");
      b.classList.add("sort-state-0");
    });

    btn.dataset.sortState = String(next);
    btn.classList.remove("sort-state-0", "sort-state-1", "sort-state-2");
    btn.classList.add("sort-state-" + next);

    const rows = Array.from(tbody.rows);
    const items = rows.map(function (r) {
      const cell = r.cells[colIndex];
      const txt = cell ? cell.textContent.trim() : "";
      return {
        row: r,
        key: txt.toLowerCase(),
        num: parseNumber(txt),
        idx: parseInt(r.dataset.origIndex || "0", 10)
      };
    });

    if (next === 0) {
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

    items.forEach(function (it) { tbody.appendChild(it.row); });
  };

  API.backToTop = function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // clipboard helper
  async function writeToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        showToast("Copied to clipboard");
        return true;
      }
    } catch (e) {
      warn("clipboard API failed", e);
    }
    try {
      window.prompt("Copy to clipboard (Ctrl+C, Enter)", text);
      return true;
    } catch (e) {
      alert("Copy failed");
      return false;
    }
  }

  // attach the API methods to window
  function attachApiToWindow() {
    Object.keys(API).forEach(k => { window[k] = API[k]; });
  }

  // small binding to ensure window points to latest API
  (function attachAndExpose() {
    // map API functions to internal API (defined above)
    const impl = [
      "toggleMode",
      "toggleAllTables",
      "copyAllTablesPlain",
      "copyAllTablesMarkdown",
      "resetAllTables",
      "searchTable",
      "copyTablePlain",
      "copyTableMarkdown",
      "toggleTable",
      "sortTableByColumn",
      "headerSortButtonClicked",
      "backToTop"
    ];
    impl.forEach(name => {
      if (typeof API[name] === "function") return;
      // link API.* to internal function defined later
      // fallback no-op until init runs
    });
    // expose once init runs
    window.addEventListener("DOMContentLoaded", function () { attachApiToWindow(); }, { once: true });
  })();

  // assign API functions into API object (so exposeGlobals can route early calls)
  API = Object.assign(API, {
    toggleMode: API.toggleMode,
    toggleAllTables: API.toggleAllTables,
    copyAllTablesPlain: API.copyAllTablesPlain,
    copyAllTablesMarkdown: API.copyAllTablesMarkdown,
    resetAllTables: API.resetAllTables,
    searchTable: API.searchTable,
    copyTablePlain: API.copyTablePlain,
    copyTableMarkdown: API.copyTableMarkdown,
    toggleTable: API.toggleTable,
    sortTableByColumn: API.sortTableByColumn,
    headerSortButtonClicked: API.headerSortButtonClicked,
    backToTop: API.backToTop
  });

  // expose API now (will be replaced with real functions on DOMContentLoaded)
  attachApiToWindow();

  // End IIFE
})();
