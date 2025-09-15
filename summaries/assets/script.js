// tables viewer v2.3 (script)
const STORAGE_KEY_PREFIX = "tablesViewer_v2";
let originalTableRows = [];
let sortStates = [];

function _storageKey(k){ return STORAGE_KEY_PREFIX + "_" + k; }

function initTables(){
  document.querySelectorAll(".table-container table").forEach((table, idx) => {
    const rows = Array.from(table.tBodies[0].rows).map(r => r.cloneNode(true));
    originalTableRows[idx] = rows;
    sortStates[idx] = Array(table.tHead.rows[0].cells.length).fill(0);
    const wrapper = table.closest('.table-wrapper');
    if(wrapper && !wrapper.querySelector('.match-counter')){
      const el = document.createElement('span');
      el.className = 'match-counter counter-badge';
      wrapper.querySelector('.table-header-wrapper .table-controls').appendChild(el);
    }
  });
  applySavedState();
  document.querySelectorAll(".table-container table").forEach((t, idx)=> updateHeaderSortUI(idx));
}

function saveState(){
  try{
    localStorage.setItem(_storageKey("search"), document.getElementById('searchBox')?.value || "");
    localStorage.setItem(_storageKey("sortStates"), JSON.stringify(sortStates));
    const collapsed = Array.from(document.querySelectorAll('.table-container')).map(c => c.classList.contains('collapsed'));
    localStorage.setItem(_storageKey("collapsed"), JSON.stringify(collapsed));
  }catch(e){ console.debug("saveState:", e); }
}
function loadState(){
  try{
    const search = localStorage.getItem(_storageKey("search")) || "";
    const ss = JSON.parse(localStorage.getItem(_storageKey("sortStates") || "null") || "null");
    const collapsed = JSON.parse(localStorage.getItem(_storageKey("collapsed") || "null") || "null");
    return { search: search, sortStates: ss, collapsed: collapsed };
  }catch(e){ console.debug("loadState:", e); return { search: "", sortStates: null, collapsed: null }; }
}

function applySavedState(){
  const state = loadState();
  if(Array.isArray(state.collapsed)){
    document.querySelectorAll('.table-container').forEach((c, i) => {
      if(state.collapsed[i]) c.classList.add('collapsed'); else c.classList.remove('collapsed');
      const btn = c.closest('.table-wrapper')?.querySelector('.collapse-btn');
      if(btn) btn.textContent = c.classList.contains('collapsed') ? 'Expand' : 'Collapse';
    });
  }
  if(Array.isArray(state.sortStates)){
    state.sortStates.forEach((arr, tableIdx) => {
      if(!arr) return;
      sortStates[tableIdx] = Array(arr.length).fill(0);
      arr.forEach((colState, colIdx) => {
        if(colState === 1){
          sortTableByColumn(tableIdx, colIdx);
        } else if(colState === 2){
          sortTableByColumn(tableIdx, colIdx);
          sortTableByColumn(tableIdx, colIdx);
        }
      });
    });
  }
  if(state.search){
    const sb = document.getElementById('searchBox');
    if(sb){ sb.value = state.search; searchTable(); }
  } else {
    searchTable();
  }
}

function updateHeaderSortUI(tableIdx){
  const table = document.querySelectorAll(".table-container table")[tableIdx];
  if(!table) return;
  const ths = table.tHead.rows[0].cells;
  for(let c=0;c<ths.length;c++){
    const btn = ths[c].querySelector('.sort-btn');
    if(!btn) continue;
    btn.classList.remove('sort-state-0','sort-state-1','sort-state-2');
    const state = (sortStates[tableIdx] && sortStates[tableIdx][c]) ? sortStates[tableIdx][c] : 0;
    btn.classList.add('sort-state-' + state);
    if(state===1) ths[c].setAttribute('aria-sort','ascending');
    else if(state===2) ths[c].setAttribute('aria-sort','descending');
    else ths[c].setAttribute('aria-sort','none');
    const icon = btn.querySelector('.sort-icon');
    if(icon){
      if(state===0) icon.innerHTML = '⇅';
      else if(state===1) icon.innerHTML = '↑';
      else icon.innerHTML = '↓';
    }
  }
}

function numericCompare(a,b){
  const na = parseFloat(a.replace(/,/g,'')), nb = parseFloat(b.replace(/,/g,''));
  if(!isNaN(na) && !isNaN(nb)) return na-nb;
  return a.localeCompare(b);
}

function sortTableByColumn(tableIdx, colIdx){
  const table = document.querySelectorAll(".table-container table")[tableIdx];
  if(!table) return;
  if(!sortStates[tableIdx]) sortStates[tableIdx] = Array(table.tHead.rows[0].cells.length).fill(0);
  let state = sortStates[tableIdx][colIdx] || 0;
  let rows = Array.from(table.tBodies[0].rows);
  function cellVal(r){ return r.cells[colIdx].textContent.trim(); }
  if(state===0){
    rows.sort((a,b)=> numericCompare(cellVal(a), cellVal(b)));
    sortStates[tableIdx][colIdx]=1;
  } else if(state===1){
    rows.sort((a,b)=> numericCompare(cellVal(b), cellVal(a)));
    sortStates[tableIdx][colIdx]=2;
  } else {
    rows = originalTableRows[tableIdx].map(r => r.cloneNode(true));
    sortStates[tableIdx][colIdx]=0;
  }
  for(let i=0;i<sortStates[tableIdx].length;i++) if(i!==colIdx) sortStates[tableIdx][i]=0;
  const tbody = table.tBodies[0];
  tbody.innerHTML = "";
  rows.forEach(r=> tbody.appendChild(r));
  updateHeaderSortUI(tableIdx);
  saveState();
  searchTable();
}

function headerSortButtonClicked(tableIdx,colIdx,btnEl){
  sortTableByColumn(tableIdx,colIdx);
  try{ btnEl.focus(); }catch(e){}
}

function toggleCollapse(btn){
  const wrapper = btn.closest('.table-wrapper');
  if(!wrapper) return;
  const container = wrapper.querySelector('.table-container');
  if(!container) return;
  const collapsed = container.classList.toggle('collapsed');
  btn.textContent = collapsed ? 'Expand' : 'Collapse';
  btn.title = collapsed ? 'Expand this table' : 'Collapse this table';
  saveState();
}

function getTableFromButton(btn){ return btn.closest('.table-container').querySelector('table'); }
function copyTablePlain(btn){
  const table = getTableFromButton(btn);
  const title = btn.closest('.table-wrapper').querySelector('h3')?.textContent || '';
  const text = title + "\n" + Array.from(table.rows).map(r => Array.from(r.cells).map(c => c.textContent.trim()).join("\t")).join("\n");
  navigator.clipboard.writeText(text).then(()=> alert('Table copied as plain text!'));
}
function copyTableMarkdown(btn){
  const table = getTableFromButton(btn);
  const title = btn.closest('.table-wrapper').querySelector('h3')?.textContent || '';
  const rows = Array.from(table.rows);
  let text = "**" + title + "**\n| " + Array.from(rows[0].cells).map(c=>c.textContent.trim()).join(" | ") + " |\n";
  text += "| " + Array.from(rows[0].cells).map(()=> "---").join(" | ") + " |\n";
  for(let i=1;i<rows.length;i++) text += "| " + Array.from(rows[i].cells).map(c=>c.textContent.trim()).join(" | ") + " |\n";
  navigator.clipboard.writeText(text).then(()=> alert('Table copied in Markdown format!'));
}
function copyAllTablesPlain(){ document.querySelectorAll('.table-wrapper .copy-plain-btn').forEach(b => copyTablePlain(b)); alert('All tables copied as plain text.'); }
function copyAllTablesMarkdown(){ document.querySelectorAll('.table-wrapper .copy-md-btn').forEach(b => copyTableMarkdown(b)); alert('All tables copied as markdown.'); }

function resetAllTables(){
  document.querySelectorAll(".table-container table").forEach((table, idx) => {
    const tbody = table.tBodies[0];
    tbody.innerHTML = "";
    originalTableRows[idx].forEach(r => tbody.appendChild(r.cloneNode(true)));
    sortStates[idx] = Array(table.rows[0].cells.length).fill(0);
    updateHeaderSortUI(idx);
  });
  document.getElementById('searchBox').value = "";
  saveState();
  searchTable();
  alert("All tables reset!");
}

function searchTable(){
  const filter = (document.getElementById("searchBox").value || "").toLowerCase();
  let globalMatches = 0;
  document.querySelectorAll(".table-wrapper").forEach((wrapper, tableIdx) => {
    const table = wrapper.querySelector('table');
    const rows = Array.from(table.tBodies[0].rows);
    let tableMatches = 0;
    rows.forEach(row => {
      let rowMatches = false;
      Array.from(row.cells).forEach(cell => {
        const text = (cell.textContent || '').toLowerCase();
        if(filter !== "" && text.includes(filter)){
          cell.classList.add('highlight'); rowMatches = true; tableMatches++;
        } else {
          cell.classList.remove('highlight');
        }
      });
      row.style.display = rowMatches || filter === "" ? "" : "none";
    });
    globalMatches += tableMatches;
    const counterEl = wrapper.querySelector('.match-counter');
    if(counterEl) counterEl.textContent = tableMatches > 0 ? `${tableMatches} match${tableMatches>1?'es':''}` : '';
  });
  const globalEl = document.getElementById('globalMatchCounter');
  if(globalEl) globalEl.textContent = globalMatches > 0 ? `${globalMatches} total match${globalMatches>1?'es':''}` : '';
  saveState();
  if(filter !== ""){
    const first = document.querySelector('.highlight');
    if(first){
      const row = first.closest('tr');
      if(row){
        const headerHeight = document.getElementById('stickyMainHeader')?.offsetHeight || 0;
        const rect = row.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        window.scrollTo({ top: scrollTop + rect.top - headerHeight - 10, behavior: 'smooth' });
      }
    }
  }
}

function exportTableCSV(btn){
  const table = btn.closest('.table-container').querySelector('table');
  const title = btn.closest('.table-wrapper').querySelector('h3')?.textContent || 'table';
  const rows = Array.from(table.rows);
  const csv = rows.map(r => Array.from(r.cells).map(c => '"' + c.textContent.replace(/"/g,'""') + '"').join(",")).join("\n");
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = title.replace(/\s+/g,'_') + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function sanitizeSheetName(name){
  return String(name || 'Sheet').replace(/[\[\]\*\/\\:\?]/g,'').substring(0,31);
}
function exportTableXLSX(btn){
  if(typeof XLSX === 'undefined'){ alert('SheetJS (XLSX) library not loaded.'); return; }
  const table = btn.closest('.table-container').querySelector('table');
  const title = btn.closest('.table-wrapper').querySelector('h3')?.textContent || 'table';
  const ws = XLSX.utils.table_to_sheet(table, {raw: true});
  const wb = XLSX.utils.book_new();
  const safeName = sanitizeSheetName(title);
  XLSX.utils.book_append_sheet(wb, ws, safeName || 'Sheet1');
  XLSX.writeFile(wb, title.replace(/\s+/g,'_') + '.xlsx');
}
function exportAllXLSX(){
  if(typeof XLSX === 'undefined'){ alert('SheetJS (XLSX) library not loaded.'); return; }
  const wrappers = document.querySelectorAll('.table-wrapper');
  const wb = XLSX.utils.book_new();
  wrappers.forEach((w, idx) => {
    const title = (w.querySelector('h3')?.textContent || `Table_${idx+1}`);
    const table = w.querySelector('table');
    if(table){
      const ws = XLSX.utils.table_to_sheet(table, {raw: true});
      XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(title) || `Sheet${idx+1}`);
    }
  });
  XLSX.writeFile(wb, 'all_tables.xlsx');
}

function initTOCLinks(){
  document.querySelectorAll('#tocSidebar a').forEach(a=>{
    a.addEventListener('click', e=>{
      e.preventDefault();
      const href = a.getAttribute('href');
      if(!href) return;
      const target = document.querySelector(href);
      if(target){
        const headerHeight = document.getElementById('stickyMainHeader')?.offsetHeight || 0;
        const rect = target.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        window.scrollTo({ top: scrollTop + rect.top - headerHeight - 10, behavior: 'smooth' });
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', function(){
  initTables();
  initTOCLinks();
  const exportAllCSVBtn = document.getElementById('exportAllCSV');
  if(exportAllCSVBtn) exportAllCSVBtn.addEventListener('click', function(){ /* unused in this build */ });
  const exportAllXLSXBtn = document.getElementById('exportAllXLSX');
  if(exportAllXLSXBtn) exportAllXLSXBtn.addEventListener('click', exportAllXLSX);
});
