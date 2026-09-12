/* ==========================================================================
   THE STUDIO — a scripted drawing session on a loop.
   Pen outlines a half-dragon, one stroke goes wrong, undo eats it, bucket and
   crayon colour it, mirror completes the other half, it gets named, saved to
   the shelf and pulled back out three times. render(t) is a pure function of
   time, so pausing off-screen is exact and reduced motion simply never starts.
   ========================================================================== */
(function () {
  'use strict';

  var MP = window.MP || {};
  var $ = MP.$ || function (s, c) { return (c || document).querySelector(s); };
  var $$ = MP.$$ || function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = MP.clamp || function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var reduced = MP.reduced || window.matchMedia('(prefers-reduced-motion: reduce)');

  function num(v, fallback) { return (typeof v === 'number' && isFinite(v)) ? v : fallback; }
  function smooth(p) { return p * p * (3 - 2 * p); }
  function seg(t, a, b) { return b > a ? clamp((t - a) / (b - a), 0, 1) : (t >= b ? 1 : 0); }
  function back(p) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
  function lerp(a, b, p) { return a + (b - a) * p; }

  /* Only names the game documents; the drawing stays the same and the wish
     changes, which is the whole point of "the name is the wish". */
  var PAL = [
    { name: 'fire dragon', body: 'var(--crayon-flame)', wing: 'var(--crayon-amber)' },
    { name: 'knight',      body: 'var(--crayon-sky)',   wing: 'var(--crayon-deep)' },
    { name: 'army',        body: 'var(--crayon-green)', wing: 'var(--crayon-grass)' }
  ];

  function boot() {
    var root = document.getElementById('studio');
    if (!root) return;
    var win = $('[data-studio]', root);
    var svg = $('[data-canvas]', root);
    if (!win || !svg) return;

    function measure(el, fallback) {
      if (!el || typeof el.getTotalLength !== 'function') return fallback;
      try {
        var l = el.getTotalLength();
        return (isFinite(l) && l > 0) ? Math.ceil(l) + 1 : fallback;
      } catch (e) { return fallback; }
    }

    /* Whole-number dash lengths on purpose: a fractional dasharray leaves a
       round-capped dot at the start of each sub-path in some engines. */
    var lines = $$('[data-ln]', svg).map(function (el) {
      return { el: el, len: measure(el, 300), p: 0, t0: 0, t1: 0 };
    });
    if (!lines.length) return;
    var eyeLine = lines.filter(function (o) { return o.el.hasAttribute('data-eye'); })[0] || lines[0];

    var dot     = $('[data-dot]', svg);
    var fBody   = $('[data-fill="body"]', svg);
    var fHorn   = $('[data-fill="horn"]', svg);
    var fWing   = $('[data-fill="wing"]', svg);
    var art     = $('[data-art]', svg);
    var mirror  = $('[data-mirror]', svg);
    var axis    = $('[data-axis]', svg);
    var stray   = $('[data-stray]', svg);
    var splash  = $('[data-splash]', svg);
    var penCur  = $('[data-pen]', svg);
    var crayCur = $('[data-crayon]', svg);
    var bktCur  = $('[data-bucket]', svg);
    var stamps  = $$('[data-stamp]', svg);
    var capEl   = $('[data-cap]', root);
    var nameEl  = $('[data-name]', root);
    var pill    = $('[data-pill]', root);
    var tools   = $$('[data-tool]', root);
    var slots   = $$('[data-slot]', root);

    if (!art || !mirror || !stray || !slots.length) return;

    var strayLen = measure(stray, 300);

    /* ---------------------------------------------------- the timeline -- */
    var STAMP_XY = [[74, 150], [160, 150], [246, 150]];
    var nStamps = Math.min(stamps.length, STAMP_XY.length);
    var STAMP_STEP = 190;

    var cursor = 420;
    lines.forEach(function (o) {
      o.t0 = cursor;
      o.t1 = cursor + 110 + o.len * 2.9;
      cursor = o.t1 + 55;
    });
    var PEN_END = cursor;
    var STRAY0  = PEN_END + 180,  STRAY1 = STRAY0 + 620;
    var UNDO0   = STRAY1 + 460,   UNDO1  = UNDO0 + 380;
    var BKT0    = UNDO1 + 320,    BKT1   = BKT0 + 900;
    var CRA0    = BKT1 - 60,      CRA1   = CRA0 + 820;
    var MIR0    = CRA1 + 320,     MIR1   = MIR0 + 860;
    var NAME0   = MIR1 + 60,      NAME1  = NAME0 + 820;
    var SAVE0   = NAME1 + 320,    SAVE1  = SAVE0 + 900;
    var STAMP0  = SAVE1 + 60;
    var END     = STAMP0 + Math.max(nStamps - 1, 0) * STAMP_STEP + 1840;
    var SAVED_AT = SAVE0 + 0.5 * (SAVE1 - SAVE0);

    /* --------------------------------- write-once helpers (null + NaN safe) */
    function xf(el, s) { if (el && el.__x !== s) { el.setAttribute('transform', s); el.__x = s; } }
    function op(el, v) {
      if (!el) return;
      var s = clamp(num(v, 0), 0, 1).toFixed(3);
      if (el.__o !== s) { el.style.opacity = s; el.__o = s; }
    }
    function dash(el, v) {
      if (!el) return;
      var s = num(v, 0).toFixed(1);
      if (el.__d !== s) { el.style.strokeDashoffset = s; el.__d = s; }
    }
    function txt(el, s) { if (el && el.__t !== s) { el.textContent = s; el.__t = s; } }
    function cls(el, name, on) { if (el && el.classList.contains(name) !== !!on) el.classList.toggle(name, !!on); }
    function ptAt(el, l, len) {
      if (!el || typeof el.getPointAtLength !== 'function') return null;
      try {
        var p = el.getPointAtLength(clamp(num(l, 0), 0, num(len, 0)));
        return (p && isFinite(p.x) && isFinite(p.y)) ? p : null;
      } catch (e) { return null; }
    }

    /* ------------------------------------------------------- the render -- */
    var loopIdx = 0;

    function render(t) {
      /* 1 — the pen lays down the outline, one stroke at a time */
      var active = null, done = null;
      for (var i = 0; i < lines.length; i++) {
        var o = lines[i];
        var p = seg(t, o.t0, o.t1);
        o.p = smooth(p);
        dash(o.el, o.len * (1 - o.p));
        if (p > 0 && p < 1) active = o;
        if (p === 1) done = o;
      }
      op(dot, eyeLine.p === 1 ? 1 : 0);

      /* 2 — the stroke that should not have happened, and the undo */
      var sp = smooth(seg(t, STRAY0, STRAY1));
      var gone = smooth(seg(t, UNDO0, UNDO1));
      dash(stray, strayLen * (1 - sp));
      op(stray, t >= STRAY0 ? 1 - gone : 0);
      xf(stray, 'translate(194,70) scale(' + (1 - 0.45 * gone).toFixed(3) + ') translate(-194,-70)');

      /* 3 — bucket floods the body, crayon shades the wing */
      var bq = smooth(seg(t, BKT0 + 120, BKT0 + 620));
      var hq = smooth(seg(t, BKT0 + 380, BKT0 + 820));
      var wq = smooth(seg(t, CRA0 + 160, CRA1));
      op(fBody, bq);
      op(fHorn, hq);
      op(fWing, wq * 0.86);
      xf(fBody, 'translate(143,134) scale(' + lerp(0.72, 1, bq).toFixed(3) + ') translate(-143,-134)');
      xf(fWing, 'translate(126,132) scale(' + lerp(0.82, 1, wq).toFixed(3) + ') translate(-126,-132)');

      var sq = seg(t, BKT0, BKT0 + 620);
      op(splash, (sq > 0 && sq < 1) ? (1 - sq) * 0.9 : 0);
      xf(splash, 'translate(143,134) scale(' + lerp(0.2, 3.4, smooth(sq)).toFixed(3) + ') translate(-143,-134)');

      /* 4 — the hands */
      var penOn = t > lines[0].t0 - 240 && t < STRAY1 + 260;
      op(penCur, penOn
        ? (t < lines[0].t0 ? seg(t, lines[0].t0 - 240, lines[0].t0) : 1 - seg(t, STRAY1, STRAY1 + 260))
        : 0);
      if (penOn) {
        var pt = null, lift = 0;
        if (t >= STRAY0 && t <= STRAY1) pt = ptAt(stray, strayLen * sp, strayLen);
        else if (active) pt = ptAt(active.el, active.len * active.p, active.len);
        else if (done) { pt = ptAt(done.el, done.len, done.len); lift = 1; }
        else { pt = ptAt(lines[0].el, 0, lines[0].len); lift = 1; }
        if (pt) xf(penCur, 'translate(' + (pt.x + 0.6).toFixed(1) + ',' + (pt.y - lift * 4).toFixed(1) + ')');
      }

      var bktIn = smooth(seg(t, BKT0 - 340, BKT0 - 40));
      var bktOut = smooth(seg(t, BKT0 + 560, BKT0 + 820));
      op(bktCur, (t > BKT0 - 340 && t < BKT0 + 820) ? bktIn * (1 - bktOut) : 0);
      xf(bktCur, 'translate(' + lerp(212, 147, bktIn).toFixed(1) + ',' + lerp(78, 130, bktIn).toFixed(1) + ')');

      var cOn = t > CRA0 - 120 && t < CRA1 + 200;
      var cq = seg(t, CRA0, CRA1);
      op(crayCur, cOn
        ? smooth(seg(t, CRA0 - 120, CRA0)) * (1 - smooth(seg(t, CRA1, CRA1 + 200)))
        : 0);
      if (cOn) {
        xf(crayCur, 'translate(' +
          (lerp(118, 68, cq) + Math.sin(cq * 21) * 7).toFixed(1) + ',' +
          (lerp(128, 96, cq) + Math.cos(cq * 17) * 6).toFixed(1) + ')');
      }

      /* 5 — the mirror completes it */
      var mq = smooth(seg(t, MIR0, MIR0 + 780));
      op(mirror, mq);
      xf(mirror, 'translate(' + (-18 * (1 - mq)).toFixed(2) + ',0)');
      op(axis, Math.sin(Math.PI * seg(t, MIR0 - 340, MIR0 + 900)) * 0.85);

      /* 6 — it breathes, then it is saved */
      var rot = t > MIR1 ? Math.sin((t - MIR1) / 380) * 1.1 : 0;
      var scale = 1, tx = 0, ty = 0, aOp = 1;
      var q = seg(t, SAVE0, SAVE1);
      if (q > 0) {
        var pop = Math.sin(Math.PI * clamp(q / 0.24, 0, 1)) * 0.09;
        var fly = smooth(clamp((q - 0.2) / 0.8, 0, 1));
        scale = (1 + pop) * (1 - 0.86 * fly);
        tx = -118 * fly; ty = 98 * fly;
        rot *= (1 - fly);
        aOp = 1 - smooth(clamp((q - 0.5) / 0.5, 0, 1));
      }
      op(art, aOp);
      xf(art, 'translate(' + tx.toFixed(1) + ',' + ty.toFixed(1) + ') translate(160,118) rotate(' +
        rot.toFixed(2) + ') scale(' + scale.toFixed(3) + ') translate(-160,-118)');

      /* 7 — three copies come back out of the library */
      var out = smooth(seg(t, END - 420, END));
      for (var k = 0; k < nStamps; k++) {
        var kq = seg(t, STAMP0 + k * STAMP_STEP, STAMP0 + k * STAMP_STEP + 340);
        op(stamps[k], kq * (1 - out));
        xf(stamps[k], 'translate(' + STAMP_XY[k][0] + ',' + STAMP_XY[k][1] + ') scale(' +
          Math.max(0.001, 0.54 * back(kq) * (1 - 0.2 * out)).toFixed(3) + ')');
      }

      /* 8 — the chrome: tool, caption, name, save pill, shelf */
      var tool = t < UNDO0 ? 'pen'
        : t < UNDO1 + 160 ? 'undo'
        : t < CRA0 ? 'bucket'
        : t < CRA1 ? 'crayon'
        : t < MIR1 ? 'mirror'
        : 'pen';
      for (var j = 0; j < tools.length; j++) {
        cls(tools[j], 'is-on', tools[j].getAttribute('data-tool') === tool);
      }

      txt(capEl,
        t < STRAY0 ? 'Pen. Outline it.'
        : t < UNDO0 ? 'Hm. That was not the plan.'
        : t < UNDO1 + 120 ? 'Undo. Nobody saw that.'
        : t < CRA0 ? 'Bucket. Flood the colour in.'
        : t < MIR0 ? 'Crayon. Scribble the rest.'
        : t < NAME0 ? 'Mirror. Both sides at once.'
        : t < SAVE0 ? 'Name it — the name is the wish.'
        : t < STAMP0 ? 'Saved to your library.'
        : 'Back out of the library, as often as you like.');

      var full = PAL[loopIdx % PAL.length].name;
      var n = Math.round(full.length * smooth(seg(t, NAME0, NAME1)));
      txt(nameEl, full.slice(0, n));
      cls(win, 'is-typing', t > NAME0 - 120 && t < SAVE0);
      cls(pill, 'is-hot', t > SAVE0 - 260 && t < SAVE0 + 420);
      cls(slots[loopIdx % slots.length], 'is-full', t >= SAVED_AT);
    }

    /* ------------------------------------------------------ loop control -- */
    var t = 0, last = 0, rafId = 0, playing = false, visible = false;

    function startLoop() {
      var pal = PAL[loopIdx % PAL.length];
      var slot = slots[loopIdx % slots.length];
      svg.style.setProperty('--c-body', pal.body);
      svg.style.setProperty('--c-wing', pal.wing);
      if (loopIdx % slots.length === 0) {
        slots.forEach(function (sl) { sl.classList.remove('is-full'); });
      }
      slot.style.setProperty('--c-body', pal.body);
      slot.style.setProperty('--c-wing', pal.wing);
    }

    function frame(ts) {
      if (!playing) return;
      if (!last) last = ts;
      var dt = Math.min(ts - last, 64);
      last = ts;
      t += dt;
      if (t >= END) { t = 0; loopIdx++; startLoop(); }
      render(t);
      rafId = requestAnimationFrame(frame);
    }

    function play() {
      if (playing || reduced.matches) return;
      playing = true;
      last = 0;
      rafId = requestAnimationFrame(frame);
    }
    function pause() {
      playing = false;
      last = 0;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }

    /* Clear every inline value the loop writes: back to the finished sheet
       that the markup and CSS describe on their own. */
    function restore() {
      pause();
      lines.forEach(function (o) {
        o.el.style.strokeDasharray = '';
        o.el.style.strokeDashoffset = '';
        o.el.style.opacity = '';
        o.el.removeAttribute('transform');
        o.__d = null; o.el.__d = null; o.el.__o = null; o.el.__x = null;
        o.p = 1;
      });
      stray.style.strokeDasharray = '';
      stray.style.strokeDashoffset = '';
      stray.__d = null;
      [dot, fBody, fHorn, fWing, art, mirror, axis, stray, splash, penCur, crayCur, bktCur]
        .concat(stamps).forEach(function (el) {
          if (!el) return;
          el.style.opacity = '';
          el.removeAttribute('transform');
          el.__o = null; el.__x = null;
        });
      svg.style.removeProperty('--c-body');
      svg.style.removeProperty('--c-wing');
      win.classList.remove('is-typing');
      if (pill) pill.classList.remove('is-hot');
      tools.forEach(function (el, i) { el.classList.toggle('is-on', i === 0); });
      slots.forEach(function (sl, i) {
        sl.classList.toggle('is-full', i === 0);
        sl.style.removeProperty('--c-body');
        sl.style.removeProperty('--c-wing');
      });
      if (slots[0]) {
        slots[0].style.setProperty('--c-body', PAL[0].body);
        slots[0].style.setProperty('--c-wing', PAL[0].wing);
      }
      txt(nameEl, PAL[0].name);
      txt(capEl, 'Saved to your library.');
    }

    function begin() {
      lines.forEach(function (o) { o.el.style.strokeDasharray = String(o.len); });
      stray.style.strokeDasharray = String(strayLen);
      loopIdx = 0;
      t = 0;
      startLoop();
      render(0);
      if (visible) play();
    }

    /* The loop only ever runs while the window is actually on screen. */
    var io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          visible = entries[i].isIntersecting;
        }
        if (visible && !document.hidden) play(); else pause();
      }, { threshold: 0.12 });
      io.observe(win);
    } else {
      visible = true;
    }

    /* Under reduced motion nothing starts: the markup is already the finished
       drawing, coloured, named, with a copy saved on the shelf. */
    if (!reduced.matches) begin();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause();
      else if (visible) play();
    });

    function onReduce() {
      if (reduced.matches) restore();
      else begin();
    }
    if (reduced.addEventListener) reduced.addEventListener('change', onReduce);
    else if (reduced.addListener) reduced.addListener(onReduce);
  }

  if (MP.ready) MP.ready(boot);
  else if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
