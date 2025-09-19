// script.js — cleaned, class-based, complete
// Revised: 2025-09-19
(() => {
  "use strict";

  // --- State
  let originalTableRows = [];
  let sortStates = [];

  // --- Helpers
  const getTables = () => Array.from(document.querySelectorAll(".table-container table"));

  function ensureInitState() {
    const tables = getTables();
    originalTableRows = tables.map((table) => {
      const tbody = table.tBodies[0];
      if (!tbody) return [];
      return Array.from(tbody.rows).map(r => r.cloneNode(true));
    });
    sortStates = tables.map((table) => {
      const headerRow = table.tHead && table.tHead.rows[0] ? table.tHead.rows[0] : table.rows[0];
      const cols = headerRow ? headerRow.cells.length : 0;
      return Array(cols).fill(0);
    });
  }

  // --- Theme (dark/light)
  const modeBtn = document.getElementById("modeBtn");
  function setModeButtonText(isDark) {
    if (!modeBtn) return;
    modeBtn.textContent = isDark ? "Light mode" : "Dark mode";
  }
  function applySavedMode() {
    const saved = localStorage.getItem("uiMode");
    const isDark = saved === "dark";
    if (isDark) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    setModeButtonText(isDark);
  }
  function toggleMode() {
    const wantDark = document.documentElement.getAttribute("data-theme") !== "dark";
    if (wantDark) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("uiMode", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("uiMode", "light");
    }
    setModeButtonText(wantDark);
  }

  // --- Sorting UI
  function _svgForState(state) {
    if (state === 0) return '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14l5-5 5 5"></path><path d="M7 10l5 5 5-5"></path></svg>';
    if (state === 1) return '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6"></path><path d="M5 12l7-7 7 7"></path></svg>';
    return '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v13"></path><path d="M19 12l-7 7-7-7"></path></svg>';
  }

  function updateHeaderSortUI(tableIdx) {
    const tables = getTables();
    const table = tables[tableIdx];
    if (!table || !table.tHead) return;
    const ths = table.tHead.rows[0].cells;
    for (let c = 0; c < ths.length; c++) {
      const btn = ths[c].querySelector(".sort-btn");
      if (!btn) continue;
      btn.classList.remove("sort-state-0", "sort-state-1", "sort-state-2");
      const state = (sortStates[tableIdx] && sortStates[tableIdx][c]) || 0;
      btn.classList.add("sort-state-" + state);
      if (state === 1) ths[c].setAttribute("aria-sort", "ascending");
      else if (state === 2) ths[c].setAttribute("aria-sort", "descending");
      else ths[c].setAttribute("aria-sort", "none");
      const iconSpan = btn.querySelector(".sort-icon");
      if (iconSpan) iconSpan.innerHTML = _svgForState(state);
    }
  }

  // --- Sorting logic
  function sortTableByColumn(tableIdx, colIdx) {
    const tables = getTables();
    const table = tables[tableIdx];
    if (!table || !table.tBodies[0]) return;
    let state = (sortStates[tableIdx] && sortStates[tableIdx][colIdx]) || 0;
    const tbody = table.tBodies[0];
    let rows = Array.from(tbody.rows);

    const compare = (a, b, asc = true) => {
      const valA = a.cells[colIdx] ? a.cells[colIdx].textContent.trim() : "";
      const valB = b.cells[colIdx] ? b.cells[colIdx].textContent.trim() : "";
      const numA = parseFloat(valA.replace(/,/g, ""));
      const numB = parseFloat(valB.replace(/,/g, ""));
      if (!isNaN(numA) && !isNaN(numB)) return asc ? numA - numB : numB - numA;
      return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    };

    if (state === 0) {
      rows.sort((a, b) => compare(a, b, true));
      sortStates[tableIdx][colIdx] = 1;
    } else if (state === 1) {
      rows.sort((a, b) => compare(a, b, false));
      sortStates[tableIdx][colIdx] = 2;
    } else {
      rows = (originalTableRows[tableIdx] || []).map(r => r.cloneNode(true));
      sortStates[tableIdx][colIdx] = 0;
    }

    // reset other columns
    for (let i = 0; i < sortStates[tableIdx].length; i++) {
      if (i !== colIdx) sortStates[tableIdx][i] = 0;
    }

    tbody.innerHTML = "";
    rows.forEach(r => tbody.appendChild(r.cloneNode(true)));
    updateHeaderSortUI(tableIdx);
    try { updateRowCounts(); } catch (e) {}
  }

  function headerSortButtonClicked(tableIdx, colIdx, btnEl) {
    sortTableByColumn(tableIdx, colIdx);
    if (btnEl && typeof btnEl.focus === "function") btnEl.focus();
  }

  // --- Collapse / expand
  function toggleTable(btn) {
    const wrapper = btn && btn.closest && btn.closest(".table-wrapper");
    if (!wrapper) return;
    const collapsed = wrapper.classList.toggle("table-collapsed");
    btn.textContent = collapsed ? "Expand Table" : "Collapse Table";
    updateToggleAllBtn();
    try { updateRowCounts(); } catch (e) {}
  }

  function updateToggleAllBtn() {
    const anyExpanded = document.querySelectorAll(".table-wrapper:not(.table-collapsed)").length > 0;
    const toggleAllBtn = document.getElementById("toggleAllBtn");
    if (!toggleAllBtn) return;
    toggleAllBtn.textContent = anyExpanded ? "Collapse All Tables" : "Expand All Tables";
  }

  function toggleAllTables() {
    const wrappers = Array.from(document.querySelectorAll(".table-wrapper"));
    if (!wrappers.length) return;
    const anyExpanded = wrappers.some(w => !w.classList.contains("table-collapsed"));
    if (anyExpanded) {
      wrappers.forEach(w => {
        w.classList.add("table-collapsed");
        const btn = w.querySelector(".toggle-table-btn");
        if (btn) btn.textContent = "Expand Table";
      });
      const toggleAllBtn = document.getElementById("toggleAllBtn");
      if (toggleAllBtn) toggleAllBtn.textContent = "Expand All Tables";
    } else {
      wrappers.forEach(w => {
        w.classList.remove("table-collapsed");
        const btn = w.querySelector(".toggle-table-btn");
        if (btn) btn.textContent = "Collapse Table";
      });
      const toggleAllBtn = document.getElementById("toggleAllBtn");
      if (toggleAllBtn) toggleAllBtn.textContent = "Collapse All Tables";
    }
    try { updateRowCounts(); } catch (e) {}
  }

  // --- Row counts & visibility
  function updateRowCounts() {
    document.querySelectorAll(".table-wrapper").forEach((wrapper) => {
      const table = wrapper.querySelector("table");
      const countDiv = wrapper.querySelector(".row-count");
      if (!table || !countDiv) return;
      const rows = table.tBodies[0] ? Array.from(table.tBodies[0].rows) : [];
      const total = rows.length;
      const visible = rows.filter(r => !r.hidden).length;
      if (total === 0) countDiv.textContent = "Showing 0 rows";
      else if (visible === total) countDiv.textContent = `Showing ${total} rows`;
      else countDiv.textContent = `Showing ${visible} of ${total} rows`;
    });
  }

  // --- Copy helpers
  function getTableFromButton(btn) {
    if (!btn) return null;
    const wrapper = btn.closest && btn.closest(".table-wrapper");
    if (wrapper) return wrapper.querySelector("table");
    const container = btn.closest && btn.closest(".table-container");
    if (container) return container.querySelector("table");
    return null;
  }

  function _rowsForExport(table) {
    if (!table) return { header: null, bodyRows: [] };
    const header = table.tHead && table.tHead.rows[0] ? Array.from(table.tHead.rows[0].cells).map(c => c.textContent.trim()) : null;
    const bodyRows = table.tBodies[0] ? Array.from(table.tBodies[0].rows).filter(r => !r.hidden) : [];
    return { header, bodyRows };
  }

  function copyTablePlain(btn) {
    const table = getTableFromButton(btn);
    if (!table) return;
    const title = table.closest(".table-wrapper")?.querySelector("h3")?.textContent || "";
    const { header, bodyRows } = _rowsForExport(table);
    let text = title ? title + "\n" : "";
    if (header) text += header.join("\t") + "\n";
    text += bodyRows.map(r => Array.from(r.cells).map(c => c.textContent.trim()).join("\t")).join("\n");
    navigator.clipboard.writeText(text).then(() => { try { alert("Table copied as plain text!"); } catch (e) {} });
  }

  function copyTableMarkdown(btn) {
    const table = getTableFromButton(btn);
    if (!table) return;
    const title = table.closest(".table-wrapper")?.querySelector("h3")?.textContent || "";
    const { header, bodyRows } = _rowsForExport(table);
    if (!header) return copyTablePlain(btn);
    let text = title ? `**${title}**\n` : "";
    text += `| ${header.join(" | ")} |\n`;
    text += `| ${header.map(() => '---').join(" | ")} |\n`;
    text += bodyRows.map(r => `| ${Array.from(r.cells).map(c => c.textContent.trim()).join(" | ")} |`).join("\n");
    navigator.clipboard.writeText(text).then(() => { try { alert("Table copied in Markdown format!"); } catch (e) {} });
  }

  function copyAllTablesPlain() {
    let text = "";
    document.querySelectorAll(".table-wrapper").forEach(wrapper => {
      const title = wrapper.querySelector("h3")?.textContent || "";
      const table = wrapper.querySelector("table");
      if (!table) return;
      const header = table.tHead && table.tHead.rows[0] ? Array.from(table.tHead.rows[0].cells).map(c => c.textContent.trim()) : null;
      const bodyRows = table.tBodies[0] ? Array.from(table.tBodies[0].rows).filter(r => !r.hidden) : [];
      text += title ? title + "\n" : "";
      if (header) text += header.join("\t") + "\n";
      text += bodyRows.map(r => Array.from(r.cells).map(c => c.textContent.trim()).join("\t")).join("\n");
      text += "\n";
    });
    navigator.clipboard.writeText(text).then(() => { try { alert("All tables copied as plain text!"); } catch (e) {} });
  }

  function copyAllTablesMarkdown() {
    let text = "";
    document.querySelectorAll(".table-wrapper").forEach(wrapper => {
      const title = wrapper.querySelector("h3")?.textContent || "";
      const table = wrapper.querySelector("table");
      if (!table) return;
      const header = table.tHead && table.tHead.rows[0] ? Array.from(table.tHead.rows[0].cells).map(c => c.textContent.trim()) : null;
      const bodyRows = table.tBodies[0] ? Array.from(table.tBodies[0].rows).filter(r => !r.hidden) : [];
      text += title ? `**${title}**\n` : "";
      if (header) {
        text += `| ${header.join(" | ")} |\n`;
        text += `| ${header.map(() => '---').join(" | ")} |\n`;
      }
      text += bodyRows.map(r => `| ${Array.from(r.cells).map(c => c.textContent.trim()).join(" | ")} |`).join("\n");
      text += "\n";
    });
    navigator.clipboard.writeText(text).then(() => { try { alert("All tables copied in Markdown format!"); } catch (e) {} });
  }

  function resetAllTables() {
    const tables = getTables();
    tables.forEach((table, idx) => {
      const tbody = table.tBodies[0];
      if (!tbody) return;
      tbody.innerHTML = "";
      (originalTableRows[idx] || []).forEach(r => tbody.appendChild(r.cloneNode(true)));
      sortStates[idx] = Array(table.rows[0] ? table.rows[0].cells.length : 0).fill(0);
      updateHeaderSortUI(idx);
    });
    document.querySelectorAll(".table-wrapper").forEach(w => {
      w.classList.remove("table-collapsed");
      const btn = w.querySelector(".toggle-table-btn");
      if (btn) btn.textContent = "Collapse Table";
    });
    const toggleAllBtn = document.getElementById("toggleAllBtn");
    if (toggleAllBtn) toggleAllBtn.textContent = "Collapse All Tables";
    const sb = document.getElementById("searchBox");
    if (sb) sb.value = "";
    searchTable();
    try { updateRowCounts(); } catch (e) {}
    try { alert("All tables reset!"); } catch (e) {}
  }

  // --- Search / highlight (uses hidden property to hide rows)
  function searchTable() {
    const filter = (document.getElementById("searchBox")?.value || "").toLowerCase();
    let firstMatch = null;
    getTables().forEach(table => {
      const rows = table.tBodies[0] ? Array.from(table.tBodies[0].rows) : [];
      rows.forEach(row => {
        let rowMatches = false;
        Array.from(row.cells).forEach(cell => {
          const text = (cell.textContent || "").toLowerCase();
          if (filter && text.includes(filter)) {
            cell.classList.add("highlight");
            rowMatches = true;
            if (!firstMatch) firstMatch = row;
          } else {
            cell.classList.remove("highlight");
          }
        });
        row.hidden = !(rowMatches || filter === "");
      });
    });

    if (firstMatch) {
      try {
        const headerHeight = document.getElementById("stickyMainHeader")?.offsetHeight || 0;
        const rect = firstMatch.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        window.scrollTo({ top: scrollTop + rect.top - headerHeight - 5, behavior: "smooth" });
      } catch (e) {}
    }
    try { updateRowCounts(); } catch (e) {}
  }

  // --- TOC click smooth scroll
  function onTocClick(e) {
    const a = e.target.closest && e.target.closest('#tocBar a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute("href").substring(1);
    const container = document.getElementById(id)?.closest(".table-wrapper");
    if (!container) return;
    const headerHeight = document.getElementById("stickyMainHeader")?.offsetHeight || 0;
    const containerTop = container.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({ top: containerTop - headerHeight - 5, behavior: "smooth" });
    try { history.replaceState(null, '', '#' + id); } catch (err) {}
  }

  // --- Back to top
  function updateBackToTopVisibility() {
    const btn = document.getElementById("backToTop");
    if (!btn) return;
    const visible = document.documentElement.scrollTop > 200 || window.pageYOffset > 200;
    btn.hidden = !visible;
  }
  function backToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // --- Keyboard handling
  function onGlobalKeydown(e) {
    try {
      const active = document.activeElement;
      const tag = (active && (active.tagName || "")).toLowerCase();
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (tag === "input" || tag === "textarea" || (active && active.isContentEditable)) return;
        e.preventDefault();
        const sb = document.getElementById("searchBox");
        if (sb) { sb.focus(); sb.select(); }
      } else if (e.key === "Escape") {
        backToTop();
      }
    } catch (err) {}
  }

  // --- Public bindings (used by core.py inline onclicks)
  window.toggleMode = toggleMode;
  window.sortTableByColumn = sortTableByColumn;
  window.headerSortButtonClicked = headerSortButtonClicked;
  window.toggleTable = toggleTable;
  window.toggleAllTables = toggleAllTables;
  window.copyTablePlain = copyTablePlain;
  window.copyTableMarkdown = copyTableMarkdown;
  window.copyAllTablesPlain = copyAllTablesPlain;
  window.copyAllTablesMarkdown = copyAllTablesMarkdown;
  window.resetAllTables = resetAllTables;
  window.searchTable = searchTable;
  window.backToTop = backToTop;

  // --- Init on DOM ready
  document.addEventListener("DOMContentLoaded", () => {
    ensureInitState();
    getTables().forEach((t, idx) => updateHeaderSortUI(idx));
    document.querySelectorAll(".table-wrapper").forEach(w => {
      const btn = w.querySelector(".toggle-table-btn");
      if (btn) btn.textContent = w.classList.contains("table-collapsed") ? "Expand Table" : "Collapse Table";
    });
    updateToggleAllBtn();
    applySavedMode();
    document.addEventListener("keydown", onGlobalKeydown);
    document.addEventListener("click", onTocClick);
    window.addEventListener("scroll", updateBackToTopVisibility);
    updateBackToTopVisibility();
    try { updateRowCounts(); } catch (e) {}
  });
})();
