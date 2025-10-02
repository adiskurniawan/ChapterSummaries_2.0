// assets/inlineblock_guard.js
//
// Prompt_08 Inline-Block Rendering Guard
// Ensures inline-block elements are visible, aligned, and non-clipped
// across breakpoints. Non-destructive: preserves DOM identity.

(function (global) {
  'use strict';

  /**
   * Utility: check visibility
   */
  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * Attempt non-destructive repair
   */
  function repairElement(el) {
    if (!el) return false;

    // If element has inline-block but is clipped, try utilities
    if (getComputedStyle(el).display === 'inline-block') {
      el.classList.add('tv-inline');

      if (!isVisible(el)) {
        el.classList.add('tv-inline--fit');
      }
      if (!isVisible(el)) {
        el.classList.add('tv-inline--fill');
      }
      if (!isVisible(el)) {
        // fallback to flex wrapper
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexWrap = 'wrap';
        el.parentNode.insertBefore(wrapper, el);
        wrapper.appendChild(el);
      }
    }
    return isVisible(el);
  }

  /**
   * Core guard
   */
  async function inlineBlockGuard(options = {}) {
    const root = options.root || document.body;
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 100;
    const telemetry = options.telemetry || (() => {});

    const targets = Array.from(root.querySelectorAll('.tv-inline, [style*="inline-block"], .inline-block'));

    const report = {
      scanned: targets.length,
      repaired: 0,
      failed: 0,
      details: []
    };

    for (const el of targets) {
      let ok = isVisible(el);
      let attempt = 0;

      while (!ok && attempt < maxRetries) {
        attempt++;
        ok = repairElement(el);
        if (!ok) {
          await new Promise(r => setTimeout(r, retryDelay));
        }
      }

      if (ok) {
        report.repaired++;
        el.dispatchEvent(new CustomEvent('inlineblock:repaired', { detail: el }));
      } else {
        report.failed++;
        report.details.push({ selector: el.className, reason: 'invisible after repair' });
      }
    }

    telemetry({ report });
    return report;
  }

  /**
   * Observe mutations
   */
  function observe(root = document.body) {
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        m.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          inlineBlockGuard({ root: node, maxRetries: 2, retryDelay: 50 });
        });
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    return observer;
  }

  // Export
  global.inlineBlockGuard = inlineBlockGuard;
  global.inlineBlockObserver = observe;

})(window);
