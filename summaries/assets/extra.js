// assets/extra.js — merged safe enhancements (batch 1/4)
// Includes: mobile toggle helper and base TVSearch bootstrap
(function () {
  'use strict';

  // -------------------------
  // Mobile toggle helper (unchanged behavior, idempotent)
  // -------------------------
  (function () {
    const MOBILE_BP = 600;
    const NARROW_BP = 420;
    const GENERATED_ATTR = 'data-tv-mobile-toggle';
    const STYLE_ID = 'tv-mobile-toggle-style-v2';
    const OBS_REG = new Map();
    const DEBOUNCE_MS = 140;

    function debounce(fn, wait) {
      let t = null;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => { try { fn.apply(this, args); } catch (e) { /* silent */ } }, wait);
      };
    }

    function injectStyle() {
      try {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = `
.tv-mobile-toggle {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1200;
  padding: 6px 10px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid rgba(0,0,0,0.08);
  background: var(--button-bg, #f3f4f6);
  color: var(--button-text, #111827);
  box-shadow: 0 6px 16px rgba(0,0,0,0.08);
  cursor: pointer;
  white-space: nowrap;
  line-height: 1;
}
.tv-mobile-toggle:focus { outline: 3px solid rgba(37,99,235,0.18); outline-offset: 2px; }
.tv-mobile-toggle.tv-icon-only {
  padding: 8px;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  text-indent: 0;
}
@media (min-width: ${MOBILE_BP + 1}px) {
  .tv-mobile-toggle { display: none !important; }
}
.table-wrapper[data-tv-mobile-enabled="1"] { position: relative; }
`;
        (document.head || document.documentElement).appendChild(s);
      } catch (e) { /* silent */ }
    }

    function findOriginalToggle(wrapper) {
      try {
        if (!wrapper || !wrapper.querySelector) return null;
        const selectors = [
          '.toggle-table-btn',
          'button[data-action="toggle-collapse"]',
          '.toggle-table',
          'button.toggle-table-btn',
          'button.toggle-table'
        ];
        for (const sel of selectors) {
          const found = wrapper.querySelector(sel);
          if (found) return found;
        }
        const header = wrapper.querySelector('.table-header-wrapper, .table-header, .copy-buttons');
        if (header) {
          const btns = Array.from(header.querySelectorAll('button'));
          for (const b of btns) {
            const t = (b.textContent || b.innerText || '').trim().toLowerCase();
            if (t.includes('collapse') || t.includes('expand') || t.includes('toggle')) return b;
          }
        }
      } catch (e) { /* silent */ }
      return null;
    }

    function findHeaderContainer(wrapper) {
      if (!wrapper) return null;
      try {
        return wrapper.querySelector('.table-header-wrapper') || wrapper.querySelector('.table-header') || wrapper.querySelector('.copy-buttons') || wrapper;
      } catch (e) { return null; }
    }

    function isElementVisibleWithin(el, container) {
      if (!el || !container) return false;
      try {
        const er = el.getBoundingClientRect();
        const cr = container.getBoundingClientRect();
        return er.left >= cr.left && er.right <= cr.right && er.top >= cr.top && er.bottom <= cr.bottom;
      } catch (e) { return false; }
    }

    function shouldShowMobileToggle(wrapper) {
      try {
        if (!wrapper) return false;
        if (window.innerWidth > MOBILE_BP) return false;
        const header = findHeaderContainer(wrapper);
        if (!header) return false;
        const overflows = header.scrollWidth > header.clientWidth + 6;
        const orig = findOriginalToggle(wrapper);
        if (!orig) return overflows;
        const visible = isElementVisibleWithin(orig, header);
        return overflows || !visible;
      } catch (e) { return false; }
    }

    function createMobileToggle(wrapper, original) {
      try {
        if (!wrapper || !original) return;
        if (wrapper.querySelector(`[${GENERATED_ATTR}]`)) return;
        if (!wrapper.hasAttribute('data-tv-mobile-enabled')) {
          const cs = getComputedStyle(wrapper);
          if (!cs || cs.position === 'static' || cs.position === '') {
            wrapper.dataset.tvPrevPosition = 'static';
            wrapper.style.position = 'relative';
          }
          wrapper.setAttribute('data-tv-mobile-enabled', '1');
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tv-mobile-toggle';
        btn.setAttribute(GENERATED_ATTR, '1');
        btn.setAttribute('aria-label', 'Toggle table collapse');
        btn.title = (original.title || original.getAttribute('aria-label') || original.textContent || 'Toggle').toString().trim();

        const applyIconMode = () => {
          if (window.innerWidth <= NARROW_BP) btn.classList.add('tv-icon-only');
          else btn.classList.remove('tv-icon-only');
        };
        applyIconMode();

        function buildLabel() {
          try {
            const txt = (original.textContent || original.innerText || '').trim();
            if (window.innerWidth <= NARROW_BP) return txt ? txt.charAt(0) : '☰';
            return txt || 'Toggle';
          } catch (e) { return 'Toggle'; }
        }
        btn.textContent = buildLabel();

        btn.addEventListener('click', function (ev) {
          try { ev.stopPropagation(); } catch (_) {}
          try {
            if (typeof original.click === 'function') original.click();
            else original.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          } catch (err) {
            try { if (typeof window.toggleTable === 'function') window.toggleTable(original); } catch (_) {}
          }
        }, { passive: true });

        const sync = debounce(function () {
          try {
            btn.title = (original.title || original.getAttribute('aria-label') || original.textContent || 'Toggle').toString().trim();
            btn.textContent = buildLabel();
          } catch (e) { /* silent */ }
        }, 80);

        const mo = new MutationObserver(sync);
        mo.observe(original, { childList: true, characterData: true, subtree: true, attributes: true });
        original.addEventListener('click', sync, { passive: true });

        wrapper.appendChild(btn);
        OBS_REG.set(wrapper, Object.assign(OBS_REG.get(wrapper) || {}, { mo }));

        const parentMo = new MutationObserver(debounce(() => {
          if (!document.documentElement.contains(original)) removeMobileToggle(wrapper);
        }, 180));
        parentMo.observe(document.documentElement || document.body, { childList: true, subtree: true });
        OBS_REG.set(wrapper, Object.assign(OBS_REG.get(wrapper) || {}, { parentMo }));

        const onResize = debounce(() => { applyIconMode(); }, 100);
        window.addEventListener('resize', onResize);
        OBS_REG.set(wrapper, Object.assign(OBS_REG.get(wrapper) || {}, { onResize }));

      } catch (e) {
        try { console.warn('tv:extra createMobileToggle failed', e); } catch (_) {}
      }
    }

    function removeMobileToggle(wrapper) {
      try {
        if (!wrapper) return;
        const clone = wrapper.querySelector(`[${GENERATED_ATTR}]`);
        if (clone) clone.remove();
        const entry = OBS_REG.get(wrapper);
        if (entry) {
          try { if (entry.mo && typeof entry.mo.disconnect === 'function') entry.mo.disconnect(); } catch (_) {}
          try { if (entry.parentMo && typeof entry.parentMo.disconnect === 'function') entry.parentMo.disconnect(); } catch (_) {}
          try { if (entry.onResize) window.removeEventListener('resize', entry.onResize); } catch (_) {}
          OBS_REG.delete(wrapper);
        }
        if (wrapper.dataset.tvPrevPosition) {
          try { wrapper.style.position = ''; delete wrapper.dataset.tvPrevPosition; } catch (_) {}
        }
        wrapper.removeAttribute('data-tv-mobile-enabled');
      } catch (e) {
        try { console.warn('tv:extra removeMobileToggle failed', e); } catch (_) {}
      }
    }

    function refreshWrapper(wrapper) {
      try {
        if (!wrapper) return;
        const original = findOriginalToggle(wrapper);
        if (!original) { removeMobileToggle(wrapper); return; }
        if (shouldShowMobileToggle(wrapper)) createMobileToggle(wrapper, original);
        else removeMobileToggle(wrapper);
      } catch (e) { /* silent */ }
    }

    const refreshAll = debounce(function () {
      try {
        const wrappers = Array.from(document.querySelectorAll('.table-wrapper'));
        wrappers.forEach(w => refreshWrapper(w));
      } catch (e) { /* silent */ }
    }, DEBOUNCE_MS);

    function observeGlobalMutations() {
      try {
        const mo = new MutationObserver(debounce((mutations) => {
          let need = false;
          for (const m of mutations) {
            if (m.addedNodes && m.addedNodes.length) {
              for (const n of m.addedNodes) {
                if (n.nodeType === 1 && (n.matches && n.matches('.table-wrapper') || (n.querySelector && n.querySelector('.table-wrapper')))) {
                  need = true; break;
                }
              }
            }
            if (m.type === 'attributes' && m.target && (m.target.classList && m.target.classList.contains('table-header-wrapper'))) {
              need = true; break;
            }
          }
          if (need) refreshAll();
        }, 160));
        mo.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true, characterData: false });
        window.__tvExtraGlobalMO = mo;
      } catch (e) { /* silent */ }
    }

    function init() {
      try {
        injectStyle();
        refreshAll();
        observeGlobalMutations();
        const onResize = debounce(refreshAll, 180);
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);

        try {
          document.querySelectorAll('.table-wrapper').forEach(wrapper => {
            try {
              const header = findHeaderContainer(wrapper);
              if (!header) return;
              const ro = new ResizeObserver(debounce(() => refreshWrapper(wrapper), 120));
              ro.observe(header);
              OBS_REG.set(wrapper, Object.assign(OBS_REG.get(wrapper) || {}, { ro }));
            } catch (e) { /* ignore per-wrapper */ }
          });
        } catch (e) { /* silent */ }

        const cleanup = () => { try { api.teardown(); } catch (_) {} };
        window.addEventListener('pagehide', cleanup);
        window.addEventListener('beforeunload', cleanup);

        window.tvExtra = Object.assign(window.tvExtra || {}, api);
      } catch (e) {
        try { console.warn('tv:extra init failed', e); } catch (_) {}
      }
    }

    const api = {
      refreshAll: debounce(function(){ try { refreshAll(); } catch(_){} }, 80),
      enableWrapper: function (wrapperEl) { try { if (!wrapperEl) return; wrapperEl.setAttribute('data-tv-extra-enabled', '1'); refreshWrapper(wrapperEl); } catch (e) {} },
      disableWrapper: function (wrapperEl) { try { if (!wrapperEl) return; wrapperEl.removeAttribute('data-tv-extra-enabled'); removeMobileToggle(wrapperEl); } catch (e) {} },
      teardown: function () { try { Array.from(document.querySelectorAll('.table-wrapper')).forEach(w => removeMobileToggle(w)); if (window.__tvExtraGlobalMO && typeof window.__tvExtraGlobalMO.disconnect === 'function') window.__tvExtraGlobalMO.disconnect(); delete window.__tvExtraGlobalMO; const s = document.getElementById(STYLE_ID); if (s) s.remove(); } catch (e) {} }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  })();

  // -------------------------
  // Base TVSearch module (lightweight safe)
  // -------------------------
  (function () {
    const SENTINEL = '__TV_SEARCH__';
    if (window[SENTINEL]) return;
    window[SENTINEL] = true;

    const ns = { debounceMs: (window.tvConfig && window.tvConfig.debounceMs) || 250, pageSize: (window.tvConfig && window.tvConfig.pageSize) || 200 };

    function log() { try { if (console && console.log) console.log.apply(console, ['[tv-search]'].concat(Array.from(arguments))); } catch (_) {} }

    function scriptBasePath() {
      try {
        const sel = document.querySelector('script[src*="script.js"], script[src*="/assets/script.js"]');
        if (sel && sel.src) return sel.src.replace(/script\.js(\?.*)?$/, '');
        const sAll = document.getElementsByTagName('script');
        for (let i = sAll.length - 1; i >= 0; i--) {
          const src = sAll[i].src || '';
          if (src.indexOf('/assets/') !== -1 && src.indexOf('script') !== -1) return src.replace(/script\.js(\?.*)?$/, '');
        }
      } catch (e) { }
      return (location.origin + (location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1) || '/'));
    }

    const BASE = scriptBasePath();
    const INDEX_URL = (document.body && document.body.getAttribute('data-index-url')) || (BASE + 'tables_index.json');
    const WORKER_URL = (document.body && document.body.getAttribute('data-worker-url')) || (BASE + 'worker.js');

    const shared = window.TVSearch && window.TVSearch._shared ? window.TVSearch._shared : {};
    shared.worker = shared.worker || null;
    shared.indexData = shared.indexData || null;
    shared.indexLoaded = !!shared.indexLoaded;
    window.TVSearch = window.TVSearch || {};
    window.TVSearch._shared = shared;

    let localWorker = null;

    function safeFetchJson(url) {
      return fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('fetch failed: ' + r.status); return r.json(); });
    }

    function attachWorker(w) {
      try {
        if (!w) return;
        localWorker = w;
        shared.worker = w;
        w.onmessage = function (ev) {
          const d = ev.data || {};
          try {
            if (d.type === 'index-ack') { shared.indexLoaded = true; log('worker index ack'); }
            else if (d.type === 'results') {
              try { document.dispatchEvent(new CustomEvent('tv:search:worker', { detail: d })); } catch (_) {}
              try { document.dispatchEvent(new CustomEvent('tv:search:results', { detail: { results: d.results || [], meta: d } })); } catch (_) {}
              try { if (!window.TVSearch._adv || !window.TVSearch._adv.isActive) renderResults(d.results || []); } catch (_) { renderResults(d.results || []); }
            }
          } catch (e) { log('worker message handler error', e); }
        };
        w.onerror = function (err) { log('worker error', err && err.message ? err.message : err); try { w.terminate(); } catch (_) { } shared.worker = null; localWorker = null; };
      } catch (e) { try { console.warn('attachWorker failed', e); } catch (_) {} }
    }

    function initWorkerWithIndex(idx) {
      if (!window.Worker) return false;
      try {
        if (localWorker) try { localWorker.terminate(); } catch (_) { }
        const w = new Worker(WORKER_URL);
        attachWorker(w);
        w.postMessage({ type: 'index', index: idx });
        return true;
      } catch (err) { log('worker init failed', err); try { if (localWorker) localWorker.terminate(); } catch (_) {} shared.worker = null; localWorker = null; return false; }
    }

    function fallbackDomSearch(q) {
      try {
        const needle = (q || '').trim().toLowerCase();
        if (!needle) return deliverResults([]);
        const results = [];
        const tables = document.querySelectorAll('table');
        tables.forEach((t, ti) => {
          const rows = t.querySelectorAll('tr');
          rows.forEach((r, ri) => {
            const txt = (r.textContent || '').toLowerCase();
            if (txt.indexOf(needle) !== -1) {
              results.push({ html: r.innerHTML, tableIndex: ti, rowIndex: ri, score: 1 });
            }
          });
        });
        deliverResults(results);
      } catch (e) { log('fallbackDomSearch failed', e); deliverResults([]); }
    }

    function inMemorySearch(q) {
      const needle = (q || '').trim().toLowerCase();
      if (!needle) return deliverResults([]);
      try {
        const out = (shared.indexData || []).filter(it => {
          const s = ((it.summary || '') + ' ' + (it.notes || '')).toLowerCase();
          return s.indexOf(needle) !== -1;
        }).map(it => ({ item: it, score: 1, html: it.html }));
        deliverResults(out);
      } catch (e) { log('inMemorySearch failed', e); deliverResults([]); }
    }

    function deliverResults(results) {
      try { document.dispatchEvent(new CustomEvent('tv:search:results', { detail: { results: results } })); } catch (e) { }
      renderResults(results);
    }

    function renderResults(results) {
      try {
        const container = document.querySelector('#tv-results') || document.querySelector('.tv-results');
        if (!container) return;
        container.innerHTML = '';
        const frag = document.createDocumentFragment();
        const slice = (results || []).slice(0, ns.pageSize);
        slice.forEach(r => {
          const node = document.createElement('div');
          node.className = 'tv-result';
          if (r && r.html) node.innerHTML = r.html;
          else if (r && r.item && r.item.summary) node.innerHTML = '<strong>' + escapeHtml(r.item.summary) + '</strong><div>' + escapeHtml(r.item.notes || '') + '</div>';
          else node.textContent = typeof r === 'string' ? r : JSON.stringify(r);
          frag.appendChild(node);
        });
        container.appendChild(frag);
        const countNode = document.querySelector('#tv-results-count') || document.querySelector('.tv-results-count');
        if (countNode) countNode.textContent = (results && results.length) || 0;
        announce((results && results.length) || 0);
      } catch (e) { log('renderResults failed', e); }
    }

    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]); }); }
    function announce(n) {
      try {
        let aria = document.getElementById('tv-results-aria');
        if (!aria) {
          aria = document.createElement('div');
          aria.id = 'tv-results-aria';
          aria.setAttribute('aria-live', 'polite');
          aria.style.position = 'absolute';
          aria.style.left = '-9999px';
          aria.style.height = '1px';
          aria.style.overflow = 'hidden';
          document.body.appendChild(aria);
        }
        aria.textContent = n + ' results';
      } catch (e) { }
    }

    function debounceLocal(fn, ms) { let t; return function () { const args = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, args); }, ms || 250); }; }

    function baseSearch(q) {
      try {
        if (shared.worker && shared.indexLoaded) { try { shared.worker.postMessage({ type: 'query', q: q }); return; } catch (e) { /* fallthrough */ } }
        if (shared.indexData) { inMemorySearch(q); return; }
        fallbackDomSearch(q);
      } catch (e) { log('baseSearch error', e); }
    }

    function bindSearchInput() {
      try {
        const selectors = ['#searchBox', '.tv-search input', 'input[type="search"]', 'input[name="q"]'];
        let input = null;
        for (const s of selectors) { input = document.querySelector(s); if (input) break; }
        if (!input) { log('no search input found'); return; }
        const handler = debounceLocal(function (e) {
          const q = (e && e.target && e.target.value) ? e.target.value : (typeof e === 'string' ? e : '');
          try { baseSearch(q); } catch (e) { fallbackDomSearch(q); }
          try {
            const u = new URL(location);
            if (q) u.searchParams.set('q', q); else u.searchParams.delete('q');
            history.replaceState(null, '', u);
          } catch (e) { }
        }, ns.debounceMs);
        input.addEventListener('input', handler, { passive: true });
        input.addEventListener('keyup', function (e) { if (e.key === 'Enter') baseSearch(input.value); }, { passive: true });
        try {
          const params = new URLSearchParams(location.search);
          if (params.has('q') && !input.value) { input.value = params.get('q'); input.dispatchEvent(new Event('input')); }
        } catch (e) { }
      } catch (e) { log('bindSearchInput failed', e); }
    }

    safeFetchJson(INDEX_URL).then(idx => {
      shared.indexData = idx;
      log('index loaded', Array.isArray(idx) ? idx.length : typeof idx);
      if (!initWorkerWithIndex(idx)) {
        log('worker unavailable or failed; index will be used in-memory');
        shared.indexLoaded = true;
      }
    }).catch(err => {
      log('index not found or failed to load', err);
    }).finally(() => { bindSearchInput(); });

    window.TVSearch.search = baseSearch;
    window.TVSearch.start = bindSearchInput;
    window.TVSearch.stop = function () { /* no-op for compatibility */ };
    window.TVSearch._initWorker = initWorkerWithIndex;
  })();

  // end of batch 1
  
  
  
  
  
})();
