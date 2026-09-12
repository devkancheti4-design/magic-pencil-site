/* ==========================================================================
   HERO — re-frames the landscape on small screens and parks every loop when
   the section scrolls away. All the motion itself is CSS.
   Safe to load when the hero is absent from the page.
   ========================================================================== */
(function () {
  'use strict';

  function boot() {
    var root = document.getElementById('hero');
    if (!root || !root.classList.contains('hero')) return;

    var MPx = window.MP || {};
    var mq = window.matchMedia ? function (q) { return window.matchMedia(q); } : null;
    var reduced = MPx.reduced || (mq ? mq('(prefers-reduced-motion: reduce)') : { matches: false });

    /* -- the scene re-composes itself rather than shrinking to a smear ---- */
    /* Only the two max-width queries need listeners: crossing 620px or 1000px
       flips one of them, so every transition is covered exactly once. */
    var svgs = Array.prototype.slice.call(root.querySelectorAll('[data-vb]'));
    if (svgs.length && mq) {
      var WIDE = '0 0 1600 900';
      var VIEWS = [
        { m: mq('(max-width: 619px)'), vb: '700 0 900 900' },
        { m: mq('(max-width: 999px)'), vb: '380 0 1220 900' }
      ];
      var applied = null;
      var frame = function () {
        var vb = WIDE, i;
        for (i = 0; i < VIEWS.length; i++) {
          if (VIEWS[i].m.matches) { vb = VIEWS[i].vb; break; }
        }
        if (vb === applied) return;          /* don't touch the DOM for nothing */
        applied = vb;
        for (i = 0; i < svgs.length; i++) svgs[i].setAttribute('viewBox', vb);
      };
      for (var j = 0; j < VIEWS.length; j++) {
        var mql = VIEWS[j].m;
        if (mql.addEventListener) mql.addEventListener('change', frame);
        else if (mql.addListener) mql.addListener(frame);
      }
      frame();
    }

    /* -- nothing loops once the hero is off-screen ------------------------ */
    if (!reduced.matches && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        var visible = false, i;
        for (i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) visible = true;
        }
        root.classList.toggle('is-paused', !visible);
      }, { threshold: 0 }).observe(root);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
