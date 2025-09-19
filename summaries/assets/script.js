// Fixed script.js — accepts searchBox or searchInput and wires search correctly.

document.querySelectorAll('.table-wrapper').forEach(wrapper=>{
  if(wrapper.querySelector('.table-container')) return;
  const table = wrapper.querySelector('table');
  if(!table) return;
  const container = document.createElement('div');
  container.className = 'table-container';
  wrapper.insertBefore(container, table);
  container.appendChild(table);
});

let originalTableRows = [];
let sortStates = [];

// helper to tolerate multiple possible search input ids
function getSearchEl(){
  return document.getElementById('searchBox') || document.getElementById('searchInput') || document.getElementById('search');
}

// simple debounce
function debounce(fn, wait){
  let t;
  return function(...args){
    clearTimeout(t);
    t = setTimeout(()=> fn.apply(this, args), wait);
  };
}

document.querySelectorAll(".table-container table").forEach((table, idx)=>{
  const rows = Array.from(table.tBodies[0].rows).map(r=> r.cloneNode(true));
  originalTableRows[idx] = rows;
  sortStates[idx] = Array(table.rows[0].cells.length).fill(0);
});

const modeBtn = document.getElementById('modeBtn');
if(localStorage.getItem('uiMode') === 'dark'){
  document.documentElement.setAttribute('data-theme','dark');
  if(modeBtn) modeBtn.textContent = 'Light mode';
}

function toggleMode(){
  const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
  if(dark){
    document.documentElement.setAttribute('data-theme','dark');
    if(modeBtn) modeBtn.textContent = 'Light mode';
    localStorage.setItem('uiMode','dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    if(modeBtn) modeBtn.textContent = 'Dark mode';
    localStorage.setItem('uiMode','light');
  }
}

function updateHeaderSortUI(tableIdx){
  const table = document.querySelectorAll(".table-container table")[tableIdx];
  if(!table || !table.tHead) return;
  const ths = table.tHead.rows[0].cells;
  for(let c=0;c<ths.length;c++){
    const btn = ths[c].querySelector('.sort-btn');
    if(!btn) continue;
    btn.classList.remove('sort-state-0','sort-state-1','sort-state-2');
    const state = sortStates[tableIdx][c] || 0;
    btn.classList.add('sort-state-'+state);
    if(state===1) ths[c].setAttribute('aria-sort','ascending');
    else if(state===2) ths[c].setAttribute('aria-sort','descending');
    else ths[c].setAttribute('aria-sort','none');
    const iconSpan = btn.querySelector('.sort-icon');
    if(iconSpan){
      if(state===0){
        iconSpan.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14l5-5 5 5"></path><path d="M7 10l5 5 5-5"></path></svg>';
      } else if(state===1){
        iconSpan.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6"></path><path d="M5 12l7-7 7 7"></path></svg>';
      } else {
        iconSpan.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v13"></path><path d="M19 12l-7 7-7-7"></path></svg>';
      }
    }
  }
}

function sortTableByColumn(tableIdx, colIdx){
  let table = document.querySelectorAll(".table-container table")[tableIdx];
  let state = sortStates[tableIdx][colIdx] || 0;
  let rows = Array.from(table.tBodies[0].rows);
  if(state === 0){
    rows.sort((a,b)=>{
      let valA = a.cells[colIdx].textContent.trim();
      let valB = b.cells[colIdx].textContent.trim();
      let numA = parseFloat(valA.replace(/,/g,'')); let numB = parseFloat(valB.replace(/,/g,''));
      if(!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return valA.localeCompare(valB);
    });
    sortStates[tableIdx][colIdx] = 1;
  } else if(state === 1){
    rows.sort((a,b)=>{
      let valA = a.cells[colIdx].textContent.trim();
      let valB = b.cells[colIdx].textContent.trim();
      let numA = parseFloat(valA.replace(/,/g,'')); let numB = parseFloat(valB.replace(/,/g,''));
      if(!isNaN(numA) && !isNaN(numB)) return numB - numA;
      return valB.localeCompare(valA);
    });
    sortStates[tableIdx][colIdx] = 2;
  } else {
    rows = (originalTableRows[tableIdx] || []).map(r=> r.cloneNode(true));
    sortStates[tableIdx][colIdx] = 0;
  }
  for(let i=0;i<sortStates[tableIdx].length;i++){ if(i!==colIdx) sortStates[tableIdx][i] = 0; }
  let tbody = table.tBodies[0];
  tbody.innerHTML = "";
  rows.forEach(r=> tbody.appendChild(r));
  updateHeaderSortUI(tableIdx);
  try{ updateRowCounts() }catch(e){}
}

function headerSortButtonClicked(tableIdx, colIdx, btnEl){
  sortTableByColumn(tableIdx, colIdx);
  try{ btnEl && btnEl.focus() }catch(e){}
}

function toggleTable(btn){
  const wrapper = btn.closest('.table-wrapper');
  if(!wrapper) return;
  const collapsed = wrapper.classList.toggle('table-collapsed');
  btn.textContent = collapsed ? "Expand Table" : "Collapse Table";
  const anyExpanded = document.querySelectorAll('.table-wrapper:not(.table-collapsed)').length > 0;
  const toggleAllBtn = document.getElementById('toggleAllBtn');
  if(toggleAllBtn) toggleAllBtn.textContent = anyExpanded ? "Collapse All Tables" : "Expand All Tables";
  try{ updateRowCounts() }catch(e){}
}

function toggleAllTables(){
  const wrappers = Array.from(document.querySelectorAll('.table-wrapper'));
  if(wrappers.length === 0) return;
  const anyExpanded = wrappers.some(w=> !w.classList.contains('table-collapsed'));
  if(anyExpanded){
    wrappers.forEach(w=>{ w.classList.add('table-collapsed'); const btn = w.querySelector('.toggle-table-btn'); if(btn) btn.textContent = "Expand Table"; });
    const toggleAllBtn = document.getElementById('toggleAllBtn');
    if(toggleAllBtn) toggleAllBtn.textContent = "Expand All Tables";
  } else {
    wrappers.forEach(w=>{ w.classList.remove('table-collapsed'); const btn = w.querySelector('.toggle-table-btn'); if(btn) btn.textContent = "Collapse Table"; });
    const toggleAllBtn = document.getElementById('toggleAllBtn');
    if(toggleAllBtn) toggleAllBtn.textContent = "Collapse All Tables";
  }
  try{ updateRowCounts() }catch(e){}
}

document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll(".table-container table").forEach((t, idx)=>{ updateHeaderSortUI(idx) });
  document.querySelectorAll('.table-wrapper').forEach(w=>{
    const btn = w.querySelector('.toggle-table-btn');
    if(btn) btn.textContent = w.classList.contains('table-collapsed') ? "Expand Table" : "Collapse Table";
  });

  const anyExpanded = document.querySelectorAll('.table-wrapper:not(.table-collapsed)').length > 0;
  const toggleAll = document.getElementById('toggleAllBtn');
  if(toggleAll) toggleAll.textContent = anyExpanded ? "Collapse All Tables" : "Collapse All Tables";

  document.addEventListener("keydown", function(e){
    try{
      const active = document.activeElement;
      const tag = active && (active.tagName || "").toLowerCase();
      if(e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey){
        if(tag === 'input' || tag === 'textarea' || (active && active.isContentEditable)) return;
        e.preventDefault();
        const sb = getSearchEl();
        if(sb){ sb.focus(); sb.select(); }
      }
    }catch(err){}
  });

  try{ updateRowCounts() }catch(e){}
});

function updateRowCounts(){
  document.querySelectorAll(".table-wrapper").forEach((wrapper, idx)=>{
    const table = wrapper.querySelector("table");
    const countDiv = wrapper.querySelector(".row-count");
    if(!table || !countDiv) return;
    const rows = table.tBodies[0].rows;
    const total = rows.length;
    const visible = Array.from(rows).filter(r=> r.style.display !== "none").length;
    if(total === 0) countDiv.textContent = "Showing 0 rows";
    else if(visible === total) countDiv.textContent = `Showing ${total} rows`;
    else countDiv.textContent = `Showing ${visible} of ${total} rows`;
  });
}

function getTableFromButton(btn){ return btn.closest('.table-container').querySelector('table') }

function copyTablePlain(btn){
  let table = getTableFromButton(btn);
  let title = table.closest('.table-wrapper').querySelector('h3')?.textContent || '';
  let text = title + "\n" + Array.from(table.rows).map(r=> Array.from(r.cells).map(c=> c.textContent.trim()).join("\t")).join("\n");
  navigator.clipboard.writeText(text).then(()=> alert('Table copied as plain text!')).catch(()=> alert('Copy failed'));
}

function copyTableMarkdown(btn){
  let table = getTableFromButton(btn);
  let title = table.closest('.table-wrapper').querySelector('h3')?.textContent || '';
  let rows = Array.from(table.rows);
  if(rows.length === 0) return;
  let text = "**"+title+"**\n| "+Array.from(rows[0].cells).map(c=> c.textContent.trim()).join(" | ")+" |\n";
  text += "| "+Array.from(rows[0].cells).map(()=> "---").join(" | ")+" |\n";
  for(let i=1;i<rows.length;i++){ text += "| "+Array.from(rows[i].cells).map(c=> c.textContent.trim()).join(" | ")+" |\n"; }
  navigator.clipboard.writeText(text).then(()=> alert('Table copied in Markdown format!')).catch(()=> alert('Copy failed'));
}

function copyAllTablesPlain(){
  let text = "";
  document.querySelectorAll(".table-wrapper").forEach(wrapper=>{
    let title = wrapper.querySelector('h3')?.textContent || '';
    let table = wrapper.querySelector('table');
    if(!table) return;
    text += title + "\n" + Array.from(table.rows).map(r=> Array.from(r.cells).map(c=> c.textContent.trim()).join("\t")).join("\n") + "\n";
  });
  navigator.clipboard.writeText(text).then(()=> alert("All tables copied as plain text!")).catch(()=> alert('Copy failed'));
}

function copyAllTablesMarkdown(){
  let text = "";
  document.querySelectorAll(".table-wrapper").forEach(wrapper=>{
    let title = wrapper.querySelector('h3')?.textContent || '';
    let table = wrapper.querySelector('table');
    if(!table) return;
    let rows = Array.from(table.rows);
    if(rows.length === 0) return;
    text += "**"+title+"**\n| "+Array.from(rows[0].cells).map(c=> c.textContent.trim()).join(" | ")+" |\n";
    text += "| "+Array.from(rows[0].cells).map(()=> "---").join(" | ")+" |\n";
    for(let i=1;i<rows.length;i++){ text += "| "+Array.from(rows[i].cells).map(c=> c.textContent.trim()).join(" | ")+" |\n"; }
  });
  navigator.clipboard.writeText(text).then(()=> alert("All tables copied in Markdown format!")).catch(()=> alert('Copy failed'));
}

function resetAllTables(){
  document.querySelectorAll(".table-container table").forEach((table, idx)=>{
    let tbody = table.tBodies[0];
    tbody.innerHTML = "";
    (originalTableRows[idx] || []).forEach(r=> tbody.appendChild(r.cloneNode(true)));
    sortStates[idx] = Array(table.rows[0].cells.length).fill(0);
    updateHeaderSortUI(idx);
  });
  document.querySelectorAll('.table-wrapper').forEach(w=>{ w.classList.remove('table-collapsed'); const btn = w.querySelector('.toggle-table-btn'); if(btn) btn.textContent = "Collapse Table"; });
  const toggleAllBtn = document.getElementById('toggleAllBtn');
  if(toggleAllBtn) toggleAllBtn.textContent = "Collapse All Tables";
  const sb = getSearchEl();
  if(sb) sb.value = "";
  searchTable();
  try{ updateRowCounts() }catch(e){}
  alert("All tables reset!");
}

function searchTable(){
  const filter = (getSearchEl()?.value || "").toLowerCase();
  let firstMatch = null;
  document.querySelectorAll(".table-container table").forEach(table=>{
    Array.from(table.rows).slice(1).forEach(row=>{
      let rowMatches = false;
      Array.from(row.cells).forEach(cell=>{
        let text = (cell.textContent || "").toLowerCase();
        if(text.includes(filter) && filter !== ""){
          cell.classList.add("highlight");
          rowMatches = true;
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
    const headerHeight = document.getElementById('stickyMainHeader')?.offsetHeight || 0;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    window.scrollTo({ top: scrollTop + rect.top - headerHeight - 5, behavior: 'smooth' });
  }
  try{ updateRowCounts() }catch(e){}
}

// attach input handlers (debounced) after searchTable exists
(function attachSearchHandlers(){
  const sb = getSearchEl();
  if(!sb) return;
  const deb = debounce(searchTable, 120);
  try{
    sb.addEventListener('input', deb);
    sb.addEventListener('keyup', function(e){ if(e.key === 'Enter') searchTable(); });
  }catch(e){}
})();

document.addEventListener('click', function(e){
  const a = e.target.closest && e.target.closest('#tocBar a[href^="#"]');
  if(!a) return;
  e.preventDefault();
  const id = a.getAttribute('href').substring(1);
  const container = document.getElementById(id)?.closest('.table-wrapper');
  if(!container) return;
  const headerHeight = document.getElementById('stickyMainHeader')?.offsetHeight || 0;
  const containerTop = container.getBoundingClientRect().top + window.pageYOffset;
  window.scrollTo({ top: containerTop - headerHeight - 5, behavior: 'smooth' });
  try{ history.replaceState(null, '', '#' + id) }catch(e){}
});

window.addEventListener("scroll", function(){
  const btn = document.getElementById("backToTop");
  if(!btn) return;
  if(document.documentElement.scrollTop > 200 || window.scrollY > 200) btn.style.display = "block";
  else btn.style.display = "none";
});

function backToTop(){ window.scrollTo({ top:0, behavior: "smooth" }) }

document.addEventListener("keydown", function(e){
  if(e.key === "Escape"){ try{ backToTop() }catch(err){} }
});
