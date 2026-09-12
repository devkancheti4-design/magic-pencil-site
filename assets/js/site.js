/* ==========================================================================
   MAGIC PENCIL — core runtime. Zero dependencies.
   Everything here degrades: with JS off the page is a readable paper document.
   Exposes window.MP for section scripts.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rand = function (a, b) { return a + Math.random() * (b - a); };

  function raf(fn) {
    var t = false;
    return function () {
      if (t) return;
      t = true;
      requestAnimationFrame(function () { t = false; fn(); });
    };
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, s = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(s, a); }, ms || 150);
    };
  }

  /* ----------------------------------------------------------- reveal ---- */
  var revealIO = null;
  function observeReveal(scope) {
    var items = $$('[data-reveal], [data-draw]', scope || document);
    if (!items.length) return;
    if (reduced.matches || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    if (!revealIO) {
      revealIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add('is-in');
          revealIO.unobserve(en.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    }
    items.forEach(function (el) {
      if (el.classList.contains('is-in')) return;
      var p = el.parentElement;
      if (p && p.hasAttribute('data-stagger') && !el.style.getPropertyValue('--rv-delay')) {
        var step = parseInt(p.getAttribute('data-stagger'), 10) || 80;
        var i = Array.prototype.indexOf.call(p.children, el);
        el.style.setProperty('--rv-delay', Math.min(i * step, 800) + 'ms');
      }
      revealIO.observe(el);
    });
  }

  /* ------------------------------------------------- measure SVG paths ---- */
  /* Sets --len on every .stroke so the dash animation is exactly right. */
  function measureStrokes(scope) {
    $$('.stroke', scope || document).forEach(function (el) {
      if (el.__len || typeof el.getTotalLength !== 'function') return;
      try {
        var len = Math.ceil(el.getTotalLength());
        if (len > 0) { el.style.setProperty('--len', len); el.__len = len; }
      } catch (e) { /* non-path shapes */ }
    });
  }

  /* --------------------------------------------------------- parallax ---- */
  function bindParallax() {
    var els = $$('[data-parallax]');
    if (!els.length || reduced.matches) return;
    var update = raf(function () {
      var vh = window.innerHeight;
      els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -300 || r.top > vh + 300) return;
        var sp = parseFloat(el.getAttribute('data-parallax')) || 0.1;
        var mid = r.top + r.height / 2 - vh / 2;
        el.style.setProperty('--py', (-mid * sp).toFixed(1) + 'px');
      });
    });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ---------------------------------------------- mouse-drift on a layer -- */
  function bindDrift() {
    var els = $$('[data-drift]');
    if (!els.length || !fine.matches || reduced.matches) return;
    var tx = 0, ty = 0, cx = 0, cy = 0, playing = false;
    function tick() {
      cx = lerp(cx, tx, 0.06); cy = lerp(cy, ty, 0.06);
      els.forEach(function (el) {
        var d = parseFloat(el.getAttribute('data-drift')) || 1;
        el.style.setProperty('--dx', (cx * d).toFixed(2) + 'px');
        el.style.setProperty('--dy', (cy * d).toFixed(2) + 'px');
      });
      if (Math.abs(cx - tx) > 0.05 || Math.abs(cy - ty) > 0.05) requestAnimationFrame(tick);
      else playing = false;
    }
    window.addEventListener('pointermove', function (e) {
      tx = (e.clientX / window.innerWidth - 0.5) * 40;
      ty = (e.clientY / window.innerHeight - 0.5) * 28;
      if (!playing) { playing = true; requestAnimationFrame(tick); }
    }, { passive: true });
  }

  /* --------------------------------------------------------- counters ---- */
  function bindCounters(scope) {
    var els = $$('[data-count]', scope || document);
    if (!els.length) return;
    var run = function (el) {
      var target = parseFloat(el.getAttribute('data-count')) || 0;
      var dur = parseInt(el.getAttribute('data-count-dur'), 10) || 1400;
      var suffix = el.getAttribute('data-count-suffix') || '';
      if (reduced.matches) { el.textContent = target + suffix; return; }
      var t0 = null;
      requestAnimationFrame(function step(ts) {
        if (t0 === null) t0 = ts;
        var p = clamp((ts - t0) / dur, 0, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 4))) + suffix;
        if (p < 1) requestAnimationFrame(step);
      });
    };
    if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.4 });
    els.forEach(function (el) { if (!el.__c) { el.__c = true; io.observe(el); } });
  }

  /* ========================================================== SHELL ====== */

  /* Lamp (theme) */
  var KEY = 'mp-theme';
  function applyTheme(v) {
    if (v === 'day' || v === 'night') root.setAttribute('data-theme', v);
    else root.removeAttribute('data-theme');
    try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {}
  }
  function currentTheme() {
    var s = root.getAttribute('data-theme');
    if (s) return s;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
  }
  function initTheme() {
    try { var s = localStorage.getItem(KEY); if (s) applyTheme(s); } catch (e) {}
    $$('[data-lamp]').forEach(function (b) {
      b.addEventListener('click', function () {
        applyTheme(currentTheme() === 'night' ? 'day' : 'night');
      });
    });
  }

  /* Ink line + nav + back to top */
  function initScrollUI() {
    var line = $('.inkline i'), nav = $('.nav'), top = $('.to-top');
    var last = window.scrollY;
    var update = raf(function () {
      var y = window.scrollY;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (line) line.style.setProperty('--p', max > 0 ? clamp(y / max, 0, 1) : 0);
      if (nav) nav.classList.toggle('is-hidden', y > 400 && y > last && !document.body.classList.contains('is-locked'));
      if (top) top.classList.toggle('is-on', y > 800);
      last = y;
    });
    window.addEventListener('scroll', update, { passive: true });
    update();
    if (top) top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' });
    });
  }

  /* The pencil cursor, which actually draws */
  function initPencil() {
    if (!fine.matches || reduced.matches) return;
    var pencil = $('.pencil'), canvas = $('.trail');
    if (!pencil || !canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pts = [];

    function size() {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener('resize', debounce(size, 160));

    document.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      document.body.classList.add('has-pencil');
      pencil.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0)';
      pts.push({ x: e.clientX, y: e.clientY, life: 1 });
      if (pts.length > 90) pts.shift();
    }, { passive: true });

    document.addEventListener('pointerdown', function () { document.body.classList.add('pencil-down'); });
    document.addEventListener('pointerup', function () { document.body.classList.remove('pencil-down'); });
    document.addEventListener('pointerleave', function () { document.body.classList.remove('has-pencil'); });

    var ink = getComputedStyle(root).getPropertyValue('--ink-900').trim() || '#241f1a';
    (function loop() {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i];
        b.life *= 0.94;
        if (b.life < 0.02) continue;
        ctx.strokeStyle = ink;
        ctx.globalAlpha = b.life * 0.5;
        ctx.lineWidth = b.life * 3.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      while (pts.length && pts[0].life < 0.02) pts.shift();
      requestAnimationFrame(loop);
    })();

    // Re-read the ink colour when the lamp is switched.
    new MutationObserver(function () {
      ink = getComputedStyle(root).getPropertyValue('--ink-900').trim() || ink;
    }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* Mobile sheet */
  function initSheet() {
    var sheet = $('.sheet'), burger = $('.nav__burger');
    if (!sheet || !burger) return;
    var links = $$('.sheet__link', sheet);
    function open() {
      sheet.classList.add('is-open');
      document.body.classList.add('is-locked');
      burger.setAttribute('aria-expanded', 'true');
      links.forEach(function (l, i) { l.style.transitionDelay = (60 + i * 55) + 'ms'; });
      setTimeout(function () {
        var f = sheet.querySelector('a, button');
        if (f && sheet.classList.contains('is-open')) f.focus({ preventScroll: true });
      }, 40);
    }
    function close(restore) {
      sheet.classList.remove('is-open');
      document.body.classList.remove('is-locked');
      burger.setAttribute('aria-expanded', 'false');
      links.forEach(function (l) { l.style.transitionDelay = '0ms'; });
      if (restore !== false) burger.focus({ preventScroll: true });
    }
    burger.addEventListener('click', function () {
      sheet.classList.contains('is-open') ? close() : open();
    });
    sheet.addEventListener('click', function (e) {
      if (e.target.closest('a')) close(false);
      else if (e.target.closest('[data-close]')) close();
    });
    sheet.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = $$('a[href], button:not([disabled])', sheet).filter(function (n) { return n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sheet.classList.contains('is-open')) close();
    });
  }

  function initYear() { $$('[data-year]').forEach(function (e) { e.textContent = new Date().getFullYear(); }); }

  /* --------------------------------------------------------- public ------ */
  var MP = {
    $: $, $$: $$, clamp: clamp, lerp: lerp, rand: rand, raf: raf, debounce: debounce,
    reduced: reduced, fine: fine,
    enhance: function (scope) {
      measureStrokes(scope); observeReveal(scope); bindCounters(scope);
    },
    ready: function (fn) {
      if (document.readyState !== 'loading') fn();
      else document.addEventListener('DOMContentLoaded', fn);
    }
  };
  window.MP = MP;

  root.classList.add('js');

  MP.ready(function () {
    initTheme();
    initScrollUI();
    initPencil();
    initSheet();
    initYear();
    bindParallax();
    bindDrift();
    MP.enhance(document);
    // Fonts change path metrics; re-measure once they land.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { measureStrokes(document); });
    }
  });
})();
