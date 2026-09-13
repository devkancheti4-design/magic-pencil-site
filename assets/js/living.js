/* ==========================================================================
   THE LIVING PAGE — the chronicle reacts to being read.

   The narrator emits two things: `mp:beat` when it starts a passage, and
   `mp:cue` the instant it SAYS a word that matters — dragon, fire, ink, fold,
   broke. This turns those into something you can see.

   Three layers, in order of how much they cost:

     1. THE PASSAGE WAKES.  The section being read gets .is-live, and any
        illustration inside it re-draws itself in time with the voice instead
        of only once on scroll.
     2. THE PAGE REACTS.  Viewport-level effects that work over ANY chapter,
        whatever it happens to have drawn: ink spreading through the fibres,
        embers lifting off the page, a scorch of firelight, the whole sheet
        shaken. These compose with the woodcuts rather than needing to know
        about them.
     3. THE READER TOUCHES IT.  Illustrations lean toward the pointer and
        replay their own drawing when clicked, so the page is worth poking at
        even with the voice off.

   Everything here is decoration. With no JS, no speech engine or reduced
   motion set, the chronicle is still a finished, readable, fully-drawn page.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  /* ===================================================== 1. THE PASSAGE == */

  document.addEventListener('mp:beat', function (e) {
    var el = e.detail && e.detail.el;
    if (!el) return;

    var section = el.closest('section');
    $$('section.is-live').forEach(function (s) { if (s !== section) s.classList.remove('is-live'); });
    if (section) section.classList.add('is-live');

    if (reduced.matches) return;

    /* Re-draw the illustrations belonging to this passage, so the woodcut
       appears as it is being described rather than whenever you scrolled past. */
    var scope = section || el;
    $$('[data-draw]', scope).slice(0, 3).forEach(function (d, i) {
      if (d.__redrawing) return;
      d.__redrawing = true;
      d.classList.remove('is-in');
      /* force a reflow so the animation restarts from zero */
      void d.offsetWidth;
      setTimeout(function () {
        d.classList.add('is-in');
        d.__redrawing = false;
      }, 40 + i * 180);
    });
  });

  /* ======================================================= 2. THE PAGE === */

  /* One canvas over everything for ink, embers and firelight. It is created
     lazily — a reader who never presses play never pays for it. */
  var fx = null, ctx = null, dpr = 1, drops = [], sparks = [], glow = 0, raf = 0;

  function ensureCanvas() {
    if (fx) return true;
    if (reduced.matches) return false;
    fx = document.createElement('canvas');
    fx.className = 'fx';
    fx.setAttribute('aria-hidden', 'true');
    document.body.appendChild(fx);
    ctx = fx.getContext('2d');
    size();
    window.addEventListener('resize', (window.MP ? MP.debounce(size, 160) : size));
    return true;
  }
  function size() {
    if (!fx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    fx.width = Math.round(window.innerWidth * dpr);
    fx.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ink(x, y) {
    /* A blot does not arrive round — it creeps along the fibres. */
    var lobes = [];
    for (var i = 0; i < 9; i++) {
      lobes.push({ a: (i / 9) * 6.2832 + rand(-.3, .3), r: rand(.55, 1) });
    }
    drops.push({ x: x, y: y, t: 0, life: rand(3.4, 4.6), max: rand(90, 190), lobes: lobes });
  }
  function ember(n) {
    for (var i = 0; i < n; i++) {
      sparks.push({
        x: rand(0, window.innerWidth),
        y: window.innerHeight + rand(0, 60),
        vx: rand(-14, 14), vy: rand(-52, -22),
        life: 1, r: rand(1, 2.8)
      });
    }
  }

  function tick() {
    if (!ctx) return;
    var w = window.innerWidth, h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    var dt = 1 / 60;
    var busy = false;

    /* firelight washing the page */
    if (glow > 0.002) {
      busy = true;
      var g = ctx.createRadialGradient(w * 0.5, h * 0.82, 0, w * 0.5, h * 0.82, h * 0.9);
      g.addColorStop(0, 'rgba(201,153,47,' + (glow * 0.30).toFixed(3) + ')');
      g.addColorStop(0.5, 'rgba(178,67,31,' + (glow * 0.14).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(178,67,31,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      glow *= 0.975;
    } else glow = 0;

    /* ink soaking outward */
    for (var i = drops.length - 1; i >= 0; i--) {
      var d = drops[i];
      d.t += dt;
      var k = clamp(d.t / d.life, 0, 1);
      var r = d.max * (1 - Math.pow(1 - k, 3));
      var a = (1 - k) * 0.5;
      if (k >= 1) { drops.splice(i, 1); continue; }
      busy = true;
      ctx.beginPath();
      for (var j = 0; j <= d.lobes.length; j++) {
        var l = d.lobes[j % d.lobes.length];
        var rr = r * l.r;
        var px = d.x + Math.cos(l.a) * rr, py = d.y + Math.sin(l.a) * rr;
        j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(36,26,16,' + a.toFixed(3) + ')';
      ctx.fill();
    }

    /* embers lifting */
    for (var s = sparks.length - 1; s >= 0; s--) {
      var p = sparks[s];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 6 * dt; p.vx += Math.sin(p.y * 0.02) * 8 * dt;
      p.life -= dt * 0.42;
      if (p.life <= 0 || p.y < -40) { sparks.splice(s, 1); continue; }
      busy = true;
      ctx.globalAlpha = clamp(p.life, 0, 1) * 0.85;
      ctx.fillStyle = p.life > 0.55 ? '#f2d98a' : '#b2431f';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (busy) raf = requestAnimationFrame(tick);
    else { raf = 0; ctx.clearRect(0, 0, w, h); }
  }
  function run() { if (!raf && ctx) raf = requestAnimationFrame(tick); }

  /* A short, named reaction on the whole sheet. */
  function pageClass(name, ms) {
    root.classList.add(name);
    clearTimeout(pageClass['t_' + name]);
    pageClass['t_' + name] = setTimeout(function () { root.classList.remove(name); }, ms);
  }

  document.addEventListener('mp:cue', function (e) {
    if (reduced.matches) return;
    var c = e.detail && e.detail.cue;
    if (!c) return;
    if (!ensureCanvas()) return;

    switch (c) {
      case 'fire':
      case 'dragon':
        glow = Math.min(1, glow + (c === 'dragon' ? 0.75 : 1));
        ember(c === 'dragon' ? 14 : 22);
        pageClass('is-scorched', 2200);
        break;
      case 'ink':
        ink(rand(window.innerWidth * 0.12, window.innerWidth * 0.88),
            rand(window.innerHeight * 0.25, window.innerHeight * 0.8));
        break;
      case 'shake':
        pageClass('is-struck', 620);
        ember(8);
        break;
      case 'fold':
        pageClass('is-folded', 1400);
        break;
      case 'smudge':
        pageClass('is-smudged', 1600);
        break;
      case 'throne':
      case 'roach':
      case 'draw':
        pageClass('is-noted', 900);
        break;
    }
    run();
  });

  /* ===================================================== 3. THE READER === */

  /* Illustrations lean toward the pointer, and replay their own drawing when
     you click them. Pointer only — this is a bonus, never the only way in. */
  function bindTouchables() {
    $$('[data-draw], .woodcut, figure svg').forEach(function (el) {
      if (el.__live) return;
      el.__live = true;
      var host = el.closest('figure, [data-draw]') || el;

      if (fine.matches && !reduced.matches) {
        host.addEventListener('pointermove', function (ev) {
          var r = host.getBoundingClientRect();
          var px = (ev.clientX - r.left) / r.width - 0.5;
          var py = (ev.clientY - r.top) / r.height - 0.5;
          host.style.setProperty('--lean-x', (px * 7).toFixed(2) + 'deg');
          host.style.setProperty('--lean-y', (-py * 5).toFixed(2) + 'deg');
          host.classList.add('is-leaning');
        });
        host.addEventListener('pointerleave', function () {
          host.style.setProperty('--lean-x', '0deg');
          host.style.setProperty('--lean-y', '0deg');
          host.classList.remove('is-leaning');
        });
      }

      var drawTarget = host.matches('[data-draw]') ? host : host.querySelector('[data-draw]');
      if (!drawTarget) return;
      host.style.cursor = 'pointer';
      host.setAttribute('tabindex', host.getAttribute('tabindex') || '0');
      if (!host.getAttribute('role')) host.setAttribute('role', 'button');
      if (!host.getAttribute('aria-label')) host.setAttribute('aria-label', 'Draw this illustration again');

      var replay = function () {
        if (reduced.matches || drawTarget.__redrawing) return;
        drawTarget.__redrawing = true;
        drawTarget.classList.remove('is-in');
        void drawTarget.offsetWidth;
        drawTarget.classList.add('is-in');
        setTimeout(function () { drawTarget.__redrawing = false; }, 400);
      };
      host.addEventListener('click', replay);
      host.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); replay(); }
      });
    });
  }

  if (window.MP && MP.ready) MP.ready(bindTouchables);
  else document.addEventListener('DOMContentLoaded', bindTouchables);

  /* Stop painting when nobody is looking. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; }
    else run();
  });
})();
