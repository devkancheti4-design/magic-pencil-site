/* ==========================================================================
   THE MAP — marker disclosures, the scrolling parchment, and the little
   army that keeps marching east.
   ========================================================================== */
(function () {
  'use strict';

  function init() {
    var root = document.getElementById('kingdoms');
    if (!root) return;

    var MP = window.MP || {};
    var $$ = MP.$$ || function (s, c) {
      return Array.prototype.slice.call((c || document).querySelectorAll(s));
    };
    var reduced = MP.reduced ||
      (window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false });
    var debounce = MP.debounce || function (fn, ms) {
      var t; return function () { clearTimeout(t); t = setTimeout(fn, ms || 150); };
    };
    var rafThrottle = MP.raf || function (fn) {
      var q = false;
      return function () {
        if (q) return; q = true;
        requestAnimationFrame(function () { q = false; fn(); });
      };
    };

    var frame    = root.querySelector('.kingdoms__frame');
    var scroller = root.querySelector('.kingdoms__scroller');
    var markers  = $$('.kingdoms__marker', root);
    var castles  = $$('.kingdoms__castle', root);

    /* ============================================ 1. marker <-> note ====== */
    if (frame && scroller && markers.length) {
      var panels = markers.map(function (b) {
        var id = b.getAttribute('aria-controls');
        return id ? document.getElementById(id) : null;
      });

      var scrollTo = function (left) {
        if (typeof scroller.scrollTo === 'function') {
          try {
            scroller.scrollTo({ left: left, behavior: reduced.matches ? 'auto' : 'smooth' });
            return;
          } catch (e) { /* older Safari: options object unsupported */ }
        }
        scroller.scrollLeft = left;
      };

      var centre = function (btn) {
        if (!btn) return;
        if (scroller.scrollWidth - scroller.clientWidth < 8) return;
        var r = btn.getBoundingClientRect();
        var s = scroller.getBoundingClientRect();
        var delta = (r.left + r.width / 2) - (s.left + s.width / 2);
        if (!isFinite(delta) || Math.abs(delta) < 2) return;
        scrollTo(scroller.scrollLeft + delta);
      };

      var open = function (index, scrollToIt) {
        if (index < 0 || index >= markers.length) return;
        var key = markers[index].getAttribute('data-k');
        markers.forEach(function (b, i) {
          var on = i === index;
          b.setAttribute('aria-expanded', on ? 'true' : 'false');
          if (panels[i]) panels[i].classList.toggle('is-open', on);
        });
        castles.forEach(function (c) {
          c.classList.toggle('is-open', key !== null && c.getAttribute('data-k') === key);
        });
        if (scrollToIt) centre(markers[index]);
      };

      markers.forEach(function (btn, i) {
        btn.addEventListener('click', function () { open(i, true); });
        // Focus follows selection, but let the browser do its own scrolling on
        // a plain Tab — only deliberate activation re-centres the map.
        btn.addEventListener('focus', function () { open(i, false); });
        btn.addEventListener('keydown', function (e) {
          var n = -1;
          // Left/Right and Home/End only: the map is horizontal, and Up/Down
          // must stay free to scroll the page.
          if (e.key === 'ArrowRight') n = (i + 1) % markers.length;
          else if (e.key === 'ArrowLeft') n = (i - 1 + markers.length) % markers.length;
          else if (e.key === 'Home') n = 0;
          else if (e.key === 'End') n = markers.length - 1;
          if (n < 0) return;
          e.preventDefault();
          markers[n].focus({ preventScroll: true });
          open(n, true);
        });
      });

      // Start on Greenhaven, with the other five folded away. aria-expanded is
      // written here rather than in the markup, so with JS off the buttons
      // never claim a state they cannot honour.
      open(0, false);

      /* --------------------------------------- the map scrolls sideways -- */
      var edges = rafThrottle(function () {
        var max = scroller.scrollWidth - scroller.clientWidth;
        frame.classList.toggle('can-scroll', max > 8);
        frame.classList.toggle('at-start', scroller.scrollLeft <= 4);
        frame.classList.toggle('at-end', scroller.scrollLeft >= max - 4);
      });
      scroller.addEventListener('scroll', edges, { passive: true });
      window.addEventListener('resize', debounce(edges, 140));
      edges();
      // The handwriting face changes the stage's intrinsic width when it lands.
      if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(edges, function () {});
      }
    }

    /* ============================================ 2. the marching column == */
    var trail = root.querySelector('#kingdoms-march');
    var units = $$('.kingdoms__unit', root);
    var total = 0;
    if (trail && typeof trail.getTotalLength === 'function') {
      try { total = trail.getTotalLength(); } catch (e) { total = 0; }
    }
    if (!isFinite(total) || total <= 0) total = 0;

    // No-ops unless there is a track and someone to walk it, so the pause
    // wiring below never has to know whether the column exists.
    var startMarch = function () {};
    var stopMarch  = function () {};

    if (total > 0 && units.length) {
      var SPEED = 42;   // user units per second
      var LEAD  = 9;    // how far ahead we sample to find the tangent
      var FADE  = 70;   // fade-in/out zone either side of the loop seam
      var num = function (el, attr, fallback) {
        var v = parseFloat(el.getAttribute(attr));
        return isFinite(v) ? v : fallback;
      };
      var column = units.map(function (u) {
        return { el: u, off: num(u, 'data-off', 0), bob: num(u, 'data-bob', 2), ph: num(u, 'data-phase', 0) };
      });

      var place = function (walked, c, t) {
        var d = ((walked + c.off) % total + total) % total;
        var p, q;
        try {
          p = trail.getPointAtLength(d);
          q = trail.getPointAtLength(Math.min(d + LEAD, total));
        } catch (e) { return; }
        if (!p || !q || !isFinite(p.x) || !isFinite(p.y)) return;
        var a = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
        if (!isFinite(a)) a = 0;
        var bob = Math.sin(t * 5.4 + c.ph) * c.bob;
        if (!isFinite(bob)) bob = 0;
        c.el.setAttribute('transform',
          'translate(' + p.x.toFixed(1) + ' ' + (p.y + bob).toFixed(1) + ') rotate(' + a.toFixed(2) + ')');
        // Fade across the wrap so nobody sees them teleport home.
        var fade = Math.min(1, Math.min(d, total - d) / FADE);
        c.el.style.opacity = (isFinite(fade) ? fade : 1).toFixed(3);
      };

      var id = 0, prev = 0, walked = 230, clock = 0;

      var placeAll = function (t) {
        for (var i = 0; i < column.length; i++) place(walked, column[i], t);
      };

      var step = function (ts) {
        id = requestAnimationFrame(step);
        if (!prev) prev = ts;
        var dt = (ts - prev) / 1000;
        prev = ts;
        if (!isFinite(dt) || dt < 0) dt = 0;
        if (dt > 0.05) dt = 0.05;          // a returning tab must not jump
        if (document.hidden) return;
        walked = (walked + dt * SPEED) % total;   // wrapped, so it never drifts
        clock += dt;
        if (clock > 1e5) clock = 0;
        placeAll(clock);
      };

      startMarch = function () {
        if (id || reduced.matches) return;
        prev = 0;
        id = requestAnimationFrame(step);
      };
      stopMarch = function () {
        if (id) { cancelAnimationFrame(id); id = 0; }
      };

      // A still column still reads as an army on the march — this is also the
      // whole of the reduced-motion state, and it is never a blank box.
      placeAll(0);

      var onReducedChange = function () {
        if (reduced.matches) { stopMarch(); placeAll(0); }
        else if (!root.classList.contains('is-paused')) startMarch();
      };
      if (reduced.addEventListener) reduced.addEventListener('change', onReducedChange);
      else if (reduced.addListener) reduced.addListener(onReducedChange);
    }

    /* ============================================ 3. nothing runs offscreen */
    /* Deliberately outside the column block: the CSS loops (the creeping
       track, wings, fire, the .alive wobble) must pause even on a browser
       where getTotalLength gave us nothing. */
    var setPaused = function (paused) {
      root.classList.toggle('is-paused', !!paused);
      if (paused) stopMarch(); else startMarch();
    };

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) setPaused(!entries[i].isIntersecting);
      }, { rootMargin: '120px 0px' }).observe(root);
    } else {
      setPaused(false);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopMarch();
      else if (!root.classList.contains('is-paused')) startMarch();
    });

    /* Measure the strokes / arm the reveals if this section arrived late. */
    if (MP.enhance) MP.enhance(root);
  }

  if (window.MP && window.MP.ready) window.MP.ready(init);
  else if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
