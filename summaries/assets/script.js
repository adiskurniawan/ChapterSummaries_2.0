// Store original table rows and sort states
let originalTableRows = [];
let sortStates = [];
document.querySelectorAll(".table-container table").forEach((table, idx) => {
  // store original tbody rows
  const rows = Array.from(table.tBodies[0].rows).map(r => r.cloneNode(true));
  originalTableRows[idx] = rows;
  // initialize sort states for each column (0=original,1=asc,2=desc)
  sortStates[idx] = Array(table.rows[0].cells.length).fill(0);
});

// Dark mode
const modeBtn = document.getElementById('modeBtn');
if (localStorage.getItem('uiMode') === 'dark') {
  document.documentElement.setAttribute('data-theme','dark');
  if (modeBtn) modeBtn.textContent = 'Light mode';
}
function toggleMode(){
  const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
  if(dark){
    document.documentElement.setAttribute('data-theme','dark'); if (modeBtn) modeBtn.textContent='Light mode'; localStorage.setItem('uiMode','dark');
  } else {
    document.documentElement.removeAttribute('data-theme'); if (modeBtn) modeBtn.textContent='Dark mode'; localStorage.setItem('uiMode','light');
  }
}

// Helper: update header sort UI and aria-sort for accessibility
function updateHeaderSortUI(tableIdx){
  const table = document.querySelectorAll(".table-container table")[tableIdx];
  const ths = table.tHead.rows[0].cells;
  for(let c = 0; c < ths.length; c++){
    const btn = ths[c].querySelector('.sort-btn');
    if(!btn) continue;
    // reset classes
    btn.classList.remove('sort-state-0','sort-state-1','sort-state-2');
    const state = sortStates[tableIdx][c] || 0;
    btn.classList.add('sort-state-' + state);
    // set ARIA attribute for screen readers
    if(state === 1) ths[c].setAttribute('aria-sort','ascending');
    else if(state === 2) ths[c].setAttribute('aria-sort','descending');
    else ths[c].setAttribute('aria-sort','none');

    // replace icon SVG to visually indicate asc/desc/unsorted
    const iconSpan = btn.querySelector('.sort-icon');
    if(iconSpan){
      if(state === 0){
        iconSpan.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M7 14l5-5 5 5"></path><path d="M7 10l5 5 5-5"></path></svg>`;
      } else if(state === 1){
        iconSpan.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 19V6"></path><path d="M5 12l7-7 7 7"></path></svg>`;
      } else {
        iconSpan.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 5v13"></path><path d="M19 12l-7 7-7-7"></path></svg>`;
      }
    }
  }
}

// Sort table with 3-state (preserves originalTableRows)
function sortTableByColumn(tableIdx, colIdx){
  let table = document.querySelectorAll(".table-container table")[tableIdx];
  let state = sortStates[tableIdx][colIdx] || 0;
  let rows = Array.from(table.tBodies[0].rows);

  if(state === 0){ // Original -> Asc
    rows.sort((a, b) => {
      let valA = a.cells[colIdx].textContent.trim();
      let valB = b.cells[colIdx].textContent.trim();
      let numA = parseFloat(valA.replace(/,/g,'')); let numB = parseFloat(valB.replace(/,/g,''));
      if(!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return valA.localeCompare(valB);
    });
    sortStates[tableIdx][colIdx] = 1;
  } else if(state === 1){ // Asc -> Desc
    rows.sort((a, b) => {
      let valA = a.cells[colIdx].textContent.trim();
      let valB = b.cells[colIdx].textContent.trim();
      let numA = parseFloat(valA.replace(/,/g,'')); let numB = parseFloat(valB.replace(/,/g,''));
      if(!isNaN(numA) && !isNaN(numB)) return numB - numA;
      return valB.localeCompare(valA);
    });
    sortStates[tableIdx][colIdx] = 2;
  } else { // Desc -> Original (restore original order)
    rows = originalTableRows[tableIdx].map(r => r.cloneNode(true));
    sortStates[tableIdx][colIdx] = 0;
  }

  // Reset other columns' states
  for(let i = 0; i < sortStates[tableIdx].length; i++){ if(i !== colIdx) sortStates[tableIdx][i] = 0; }

  // Append rows
  let tbody = table.tBodies[0];
  tbody.innerHTML = "";
  rows.forEach(r => tbody.appendChild(r));

  // update header UI + aria
  updateHeaderSortUI(tableIdx);
}

// Handler for the small header button click (prevents propagation to th)
function headerSortButtonClicked(tableIdx, colIdx, btnEl){
  sortTableByColumn(tableIdx, colIdx);
  try{ btnEl.focus(); } catch(e) {}
}

// Initialize header UI states on page load
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll(".table-container table").forEach((t, idx) => {
    updateHeaderSortUI(idx);
  });
});

// Copy & Reset functions
function getTableFromButton(btn){ return btn.closest('.table-container').querySelector('table'); }
function copyTablePlain(btn){
  let table = getTableFromButton(btn);
  let title = table.closest('.table-wrapper').querySelector('h3')?.textContent || '';
  let text = title + "\n" + Array.from(table.rows).map(r => Array.from(r.cells).map(c => c.textContent.trim()).join("\t")).join("\n");
  navigator.clipboard.writeText(text); alert('Table copied as plain text!');
}
function copyTableMarkdown(btn){
  let table = getTableFromButton(btn);
  let title = table.closest('.table-wrapper').querySelector('h3')?.textContent || '';
  let rows = Array.from(table.rows);
  let text = "**" + title + "**\n| " + Array.from(rows[0].cells).map(c => c.textContent.trim()).join(" | ") + " |\n";
  text += "| " + Array.from(rows[0].cells).map(() => "---").join(" | ") + " |\n";
  for(let i = 1; i < rows.length; i++){ text += "| " + Array.from(rows[i].cells).map(c => c.textContent.trim()).join(" | ") + " |\n"; }
  navigator.clipboard.writeText(text); alert('Table copied in Markdown format!');
}
function copyAllTablesPlain(){
  let text = "";
  document.querySelectorAll(".table-wrapper").forEach(wrapper => {
    let title = wrapper.querySelector('h3')?.textContent || '';
    let table = wrapper.querySelector('table');
    text += title + "\n" + Array.from(table.rows).map(r => Array.from(r.cells).map(c => c.textContent.trim()).join("\t")).join("\n") + "\n";
  });
  navigator.clipboard.writeText(text); alert("All tables copied as plain text!");
}
function copyAllTablesMarkdown(){
  let text = "";
  document.querySelectorAll(".table-wrapper").forEach(wrapper => {
    let title = wrapper.querySelector('h3')?.textContent || '';
    let table = wrapper.querySelector('table');
    let rows = Array.from(table.rows);
    text += "**" + title + "**\n| " + Array.from(rows[0].cells).map(c => c.textContent.trim()).join(" | ") + " |\n";
    text += "| " + Array.from(rows[0].cells).map(() => "---").join(" | ") + " |\n";
    for(let i = 1; i < rows.length; i++){ text += "| " + Array.from(rows[i].cells).map(c => c.textContent.trim()).join(" | ") + " |\n"; }
  });
  navigator.clipboard.writeText(text); alert("All tables copied in Markdown format!");
}
function resetAllTables(){
  document.querySelectorAll(".table-container table").forEach((table, idx) => {
    let tbody = table.tBodies[0];
    tbody.innerHTML = "";
    originalTableRows[idx].forEach(r => tbody.appendChild(r.cloneNode(true)));
    sortStates[idx] = Array(table.rows[0].cells.length).fill(0);
    updateHeaderSortUI(idx);
  });
  document.getElementById('searchBox').value = "";
  searchTable();
  alert("All tables reset!");
}

// Search
function searchTable(){
  let filter = document.getElementById("searchBox").value.toLowerCase();
  let firstMatch = null;
  document.querySelectorAll(".table-container table").forEach(table => {
    Array.from(table.rows).slice(1).forEach(row => {
      let rowMatches = false;
      Array.from(row.cells).forEach(cell => {
        let text = cell.textContent.toLowerCase();
        if(text.includes(filter) && filter !== ""){
          cell.classList.add("highlight"); rowMatches = true;
          if(!firstMatch) firstMatch = row;
        } else {
          cell.classList.remove("highlight");
        }
      });
      row.style.display = rowMatches || filter === "" ? "" : "none";
    });
  });
  if(firstMatch){
    const rect = firstMatch.getBoundingClientRect();
    const headerHeight = document.getElementById('stickyMainHeader').offsetHeight + 10;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    window.scrollTo({ top: scrollTop + rect.top - headerHeight, behavior: 'smooth' });
  }
}

// TOC toggle
function toggleTOC(){
  const toc = document.getElementById('toc'); const btn = document.getElementById('tocToggle');
  toc.classList.toggle('hide');
  if(toc.classList.contains('hide')) btn.innerHTML = 'Show <span id="tocArrow" class="rotate">▼</span>';
  else btn.innerHTML = 'Hide <span id="tocArrow">▼</span>';
}

// TOC click scroll
document.querySelectorAll('#tocSidebar a[href^="#"]').forEach(a => {
  a.addEventListener('click', function(e){
    e.preventDefault();
    const id = this.getAttribute('href').substring(1);
    const container = document.getElementById(id)?.closest('.table-wrapper');
    if(!container) return;
    const headerHeight = document.getElementById('stickyMainHeader')?.offsetHeight || 0;
    const containerTop = container.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({ top: containerTop - headerHeight - 5, behavior: 'smooth' });
    try{ history.replaceState(null, '', '#' + id); }catch(e){}
  });
});
