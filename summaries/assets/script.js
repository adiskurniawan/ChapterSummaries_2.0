
(function(){
  function initTableVirtualization(tbl, rowHeightEstimate, buffer){
    const tbody = tbl.querySelector('tbody');
    if(!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    if(rows.length === 0) return;
    let viewport = tbl.getBoundingClientRect().height || window.innerHeight;
    let rowH = rowHeightEstimate || 28;
    let pageSize = Math.max(10, Math.floor(viewport / rowH));
    let start = 0;
    function renderWindow(){
      const end = Math.min(rows.length, start + pageSize + buffer);
      tbody.innerHTML = '';
      for(let i=start;i<end;i++) tbody.appendChild(rows[i]);
    }
    renderWindow();
    const controls = document.createElement('div');
    controls.style.margin = '6px 0';
    const prev = document.createElement('button'); prev.textContent='Prev'; prev.onclick=()=>{ start = Math.max(0, start - pageSize); renderWindow(); };
    const next = document.createElement('button'); next.textContent='Next'; next.onclick=()=>{ start = Math.min(rows.length - pageSize, start + pageSize); renderWindow(); };
    controls.appendChild(prev); controls.appendChild(next);
    tbl.parentElement.insertBefore(controls, tbl.parentElement.firstChild);
  }
  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('.table-wrapper .table-container table').forEach(function(t){
      try{ initTableVirtualization(t, 28, 20); }catch(e){ console.error('virt init',e); }
    });
  });
})();


(function(){
  function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
  document.addEventListener('DOMContentLoaded', function(){
    const sb = document.getElementById('searchBox');
    if(!sb) return;
    function highlight(q){
      document.querySelectorAll('.table-wrapper .table-container td').forEach(td=>{
        const text = td.textContent || '';
        td.innerHTML = td.textContent;
        if(!q) return;
        const re = new RegExp(escapeRegex(q), 'ig');
        const newHtml = td.textContent.replace(re, match => `<mark>${match}</mark>`);
        td.innerHTML = newHtml;
      });
    }
    let t;
    sb.addEventListener('input', function(){ clearTimeout(t); t=setTimeout(()=>{ highlight(sb.value.trim()); }, 200); });
  });
})();


(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const root = document.getElementById('tables-viewer');
    const btn = document.getElementById('toggleThemeBtn');
    if(!btn) return;
    btn.addEventListener('click', function(){
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      const next = cur==='dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('tables_viewer_theme', next);
      document.documentElement.classList.toggle('dark-mode', next==='dark');
    });
    const saved = localStorage.getItem('tables_viewer_theme');
    if(saved==='dark'){ document.documentElement.setAttribute('data-theme','dark'); document.documentElement.classList.add('dark-mode'); }
  });
})();
