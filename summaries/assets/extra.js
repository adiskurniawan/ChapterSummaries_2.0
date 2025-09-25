// assets/extra.js
// Extended mobile-friendly helper for Tables Viewer
// - Non-invasive: clones a tiny floating toggle when header controls overflow or toggle is off-screen on narrow viewports.
// - Safe: conservative DOM reads/writes, many guards, small Mutation/Resize observers.
// - Adds compact/icon-only mode on very narrow viewports without modifying script.js.
// - Exposes a minimal api at window.tvExtra for manual control if needed.

(function () {
  'use strict';

  const MOBILE_BP = 600;            // show mobile helper below this width
  const NARROW_BP = 420;           // switch to icon-only on very narrow devices
  const GENERATED_ATTR = 'data-tv-mobile-toggle';
  const STYLE_ID = 'tv-mobile-toggle-style-v2';
  const OBS_REG = new Map();       // wrapper -> { mo, ro, resizeObs }
  const DEBOUNCE_MS = 140;

  function safe(fn) {
    return function (...args) {
      try { return fn.apply(this, args); } catch (e) { /* silent */ }
    };
  }

  function debounce(fn, wait) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => {
        try { fn.apply(this, args); } catch (e) { /* silent */ }
      }, wait);
    };
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
/* mobile toggle (injected by extra.js) */
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
/* hide above mobile breakpoint */
@media (min-width: ${MOBILE_BP + 1}px) {
  .tv-mobile-toggle { display: none !important; }
}
/* ensure the wrapper can host absolute children safely if needed */
.table-wrapper[data-tv-mobile-enabled="1"] { position: relative; }
`;
    (document.head || document.documentElement).appendChild(s);
  }

  function findOriginalToggle(wrapper) {
    if (!wrapper || !(wrapper.querySelector)) return null;
    // try common selectors in order
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
    // lastly, try any button with text like "Collapse" / "Expand" within header area
    const header = wrapper.querySelector('.table-header-wrapper, .table-header, .copy-buttons');
    if (header) {
      const btns = Array.from(header.querySelectorAll('button'));
      for (const b of btns) {
        const t = (b.textContent || b.innerText || '').trim().toLowerCase();
        if (t.includes('collapse') || t.includes('expand') || t.includes('toggle')) return b;
      }
    }
    return null;
  }

  function findHeaderContainer(wrapper) {
    if (!wrapper) return null;
    return wrapper.querySelector('.table-header-wrapper') || wrapper.querySelector('.table-header') || wrapper.querySelector('.copy-buttons') || wrapper;
  }

  function isElementVisibleWithin(el, container) {
    if (!el || !container) return false;
    try {
      const er = el.getBoundingClientRect();
      const cr = container.getBoundingClientRect();
      return er.left >= cr.left && er.right <= cr.right && er.top >= cr.top && er.bottom <= cr.bottom;
    } catch (e) {
      return false;
    }
  }

  function shouldShowMobileToggle(wrapper) {
    try {
      if (!wrapper) return false;
      if (window.innerWidth > MOBILE_BP) return false;
      const header = findHeaderContainer(wrapper);
      if (!header) return false;
      // show when header's controls overflow horizontally OR original toggle is not fully visible
      const overflows = header.scrollWidth > header.clientWidth + 6;
      const orig = findOriginalToggle(wrapper);
      if (!orig) return overflows;
      // if original exists but not visible within header viewport -> show
      const visible = isElementVisibleWithin(orig, header);
      return overflows || !visible;
    } catch (e) {
      return false;
    }
  }

  function createMobileToggle(wrapper, original) {
    try {
      if (!wrapper || !original) return;
      if (wrapper.querySelector(`[${GENERATED_ATTR}]`)) return;
      // ensure wrapper is positioned to anchor absolute toggle
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

      // choose icon-only for very narrow screens
      const applyIconMode = () => {
        if (window.innerWidth <= NARROW_BP) btn.classList.add('tv-icon-only');
        else btn.classList.remove('tv-icon-only');
      };
      applyIconMode();
      // icon glyph (keeps text for readable viewports)
      function buildLabel() {
        try {
          const txt = (original.textContent || original.innerText || '').trim();
          if (window.innerWidth <= NARROW_BP) return txt ? txt.charAt(0) : '☰';
          return txt || 'Toggle';
        } catch (e) { return 'Toggle'; }
      }
      btn.textContent = buildLabel();

      // clicking clone triggers original click to preserve behavior
      btn.addEventListener('click', function (ev) {
        try { ev.stopPropagation(); } catch (_) {}
        try {
          if (typeof original.click === 'function') original.click();
          else original.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        } catch (err) {
          try { if (typeof window.toggleTable === 'function') window.toggleTable(original); } catch (_) {}
        }
      }, { passive: true });

      // sync text/title when original changes (MutationObserver)
      const sync = () => {
        try {
          btn.title = (original.title || original.getAttribute('aria-label') || original.textContent || 'Toggle').toString().trim();
          btn.textContent = buildLabel();
        } catch (e) { /* silent */ }
      };
      const mo = new MutationObserver(debounce(sync, 80));
      mo.observe(original, { childList: true, characterData: true, subtree: true, attributes: true });

      // also update when original is clicked (server code may toggle text on click)
      original.addEventListener('click', sync, { passive: true });

      // append and remember observer
      wrapper.appendChild(btn);
      OBS_REG.set(wrapper, Object.assign(OBS_REG.get(wrapper) || {}, { mo }));

      // ensure clone removed when original is removed from DOM
      const parentMo = new MutationObserver(debounce(() => {
        if (!document.documentElement.contains(original)) removeMobileToggle(wrapper);
      }, 180));
      parentMo.observe(document.documentElement || document.body, { childList: true, subtree: true });
      OBS_REG.set(wrapper, Object.assign(OBS_REG.get(wrapper) || {}, { parentMo }));

      // listen to window resize to toggle icon-only
      const onResize = debounce(() => {
        applyIconMode();
      }, 100);
      window.addEventListener('resize', onResize);
      OBS_REG.set(wrapper, Object.assign(OBS_REG.get(wrapper) || {}, { onResize }));

    } catch (e) {
      console.warn('tv:extra createMobileToggle failed', e);
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
        try {
          wrapper.style.position = '';
          delete wrapper.dataset.tvPrevPosition;
        } catch (_) {}
      }
      wrapper.removeAttribute('data-tv-mobile-enabled');
    } catch (e) {
      console.warn('tv:extra removeMobileToggle failed', e);
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
      // store very lightweight reference for potential cleanup
      window.__tvExtraGlobalMO = mo;
    } catch (e) { /* silent */ }
  }

  // public API
  const api = {
    refreshAll: safe(refreshAll),
    enableWrapper: safe(function (wrapperEl) {
      try {
        if (!wrapperEl) return;
        wrapperEl.setAttribute('data-tv-extra-enabled', '1');
        refreshWrapper(wrapperEl);
      } catch (e) {}
    }),
    disableWrapper: safe(function (wrapperEl) {
      try {
        if (!wrapperEl) return;
        wrapperEl.removeAttribute('data-tv-extra-enabled');
        removeMobileToggle(wrapperEl);
      } catch (e) {}
    }),
    teardown: safe(function () {
      try {
        // remove clones and disconnect observers
        Array.from(document.querySelectorAll('.table-wrapper')).forEach(w => removeMobileToggle(w));
        if (window.__tvExtraGlobalMO && typeof window.__tvExtraGlobalMO.disconnect === 'function') window.__tvExtraGlobalMO.disconnect();
        delete window.__tvExtraGlobalMO;
        const s = document.getElementById(STYLE_ID);
        if (s) s.remove();
      } catch (e) {}
    })
  };

  function init() {
    try {
      injectStyle();
      refreshAll();
      observeGlobalMutations();
      // also refresh on orientation and resize
      const onResize = debounce(refreshAll, 180);
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);

      // attach small ResizeObservers to header regions to detect overflow changes
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

      // cleanup on pagehide/unload to avoid leaked observers in SPA
      const cleanup = () => { try { api.teardown(); } catch (_) {} };
      window.addEventListener('pagehide', cleanup);
      window.addEventListener('beforeunload', cleanup);

      // expose
      window.tvExtra = Object.assign(window.tvExtra || {}, api);
    } catch (e) {
      console.warn('tv:extra init failed', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
