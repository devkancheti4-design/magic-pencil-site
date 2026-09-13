/* ==========================================================================
   THE PROLOGUE — ruling the page.

   The horizontal rules are painted per paragraph by CSS, one to a line.
   Only the browser knows where the first baseline actually falls once the
   webfont has landed, so we measure it and hand the number back as
   --pr-rule-ink. Writing then sits ON the line instead of near it.

   The measurement is taken on a hidden paragraph of our own, never on the
   text: nothing here mutates a paragraph a reader (or the narrator) may be
   part way through. Everything else on this leaf is the shared runtime's.
   ========================================================================== */
(function () {
  'use strict';

  function init() {
    var section = document.getElementById('prologue');
    if (!section) return;
    var body = section.querySelector('.prologue__body');
    if (!body) return;

    var MP = window.MP || {};
    var debounce = typeof MP.debounce === 'function' ? MP.debounce : function (fn, ms) {
      var t;
      return function () { clearTimeout(t); t = setTimeout(fn, ms || 150); };
    };

    var ruler = null, mark = null, last = -1;

    /* A paragraph identical to the written ones, hidden, carrying a
       zero-sized inline-block — which sits exactly on the baseline. */
    function ensureRuler() {
      if (ruler && ruler.isConnected) return true;
      ruler = document.createElement('p');
      ruler.className = 'prologue__ruler';
      ruler.setAttribute('aria-hidden', 'true');
      ruler.appendChild(document.createTextNode('Hxpg'));
      mark = document.createElement('span');
      mark.className = 'prologue__ruler-mark';
      ruler.insertBefore(mark, ruler.firstChild);
      body.appendChild(ruler);
      return true;
    }

    function measure() {
      if (!ensureRuler()) return;
      if (!ruler.getClientRects().length) return;      /* laid out at all? */

      var cs = window.getComputedStyle(ruler);
      var lead = parseFloat(cs.lineHeight);
      if (!isFinite(lead) || lead <= 0) return;

      var topY = ruler.getBoundingClientRect().top;
      var baseY = mark.getBoundingClientRect().top;
      if (!isFinite(topY) || !isFinite(baseY)) return;

      var ink = Math.round(baseY - topY) + 1;          /* the rule under the baseline */
      if (!isFinite(ink)) return;

      var lo = Math.round(lead * 0.45);
      var hi = Math.round(lead) - 1;
      if (hi <= lo) return;
      if (ink < lo) ink = lo;
      else if (ink > hi) ink = hi;

      if (ink === last) return;
      last = ink;
      section.style.setProperty('--pr-rule-ink', ink + 'px');
    }

    measure();
    window.addEventListener('resize', debounce(measure, 180), { passive: true });
    if (document.readyState !== 'complete') {
      window.addEventListener('load', measure, { once: true });
    }
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(measure).catch(function () {});
    }
  }

  if (window.MP && typeof window.MP.ready === 'function') window.MP.ready(init);
  else if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
