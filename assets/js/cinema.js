/* ==========================================================================
   PAPER CINEMA — a battle that is actually happening, and cameras you can cut
   between while it happens.

   The important idea: THE WORLD IS THE TRUTH. It runs on its own clock and does
   not know or care that anyone is watching. Cameras are objects placed in that
   world. Switching camera changes only where you are standing — the battle does
   not restart, rewind or pause. Two people watching the same moment from two
   cameras are watching the same moment.

   Creators place the cameras. Viewers choose one.
   No dependencies.
   ========================================================================== */
(function () {
  'use strict';

  var main = document.getElementById('stage');
  if (!main) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* The world is authored at a fixed size so a camera placed on a phone frames
     the same thing on a monitor. */
  var W = 2400, H = 1000;
  var GROUND = H * 0.80;

  var mctx = main.getContext('2d', { alpha: false });

  /* ------------------------------------------------------------ palette -- */
  var INK = {};
  function css(n, f) { var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || f; }
  function refreshInk() {
    INK.line = css('--ink-900', '#241f1a');
    INK.faint = css('--ink-300', '#9c8f7d');
    INK.paper = css('--paper-1', '#fdf6e6');
    INK.green = css('--crayon-green', '#4a9b5e');
    INK.grass = css('--crayon-grass', '#7ec488');
    INK.sky = css('--crayon-sky', '#7fb7e8');
    INK.sun = css('--crayon-sun', '#ffcc3e');
    INK.flame = css('--crayon-flame', '#ff6b35');
    INK.ember = css('--crayon-ember', '#e23d28');
    INK.royal = css('--crayon-royal', '#7c5cbf');
    INK.slate = css('--crayon-slate', '#55606b');
  }
  refreshInk();
  new MutationObserver(refreshInk).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ======================================================== THE WORLD ==== */

  var MAX_ARROWS = 4000;
  var World = {
    t: 0,
    units: [],
    nextId: 1,

    ax: new Float32Array(MAX_ARROWS),
    ay: new Float32Array(MAX_ARROWS),
    avx: new Float32Array(MAX_ARROWS),
    avy: new Float32Array(MAX_ARROWS),
    adelay: new Float32Array(MAX_ARROWS),
    astate: new Uint8Array(MAX_ARROWS),   // 0 waiting 1 flying 2 stuck
    astuck: new Float32Array(MAX_ARROWS),
    an: 0,

    dust: [],
    nextVolley: 6,

    reset: function () {
      this.t = 0; this.units.length = 0; this.an = 0; this.dust.length = 0;
      this.nextVolley = 6; this.nextId = 1;

      // The hero. Named, so the cameras can find him.
      this.add({ name: 'iries', team: 'home', x: 120, behaviour: 'run', speed: 210, hero: true });

      // Greenhaven's column, marching east.
      for (var i = 0; i < 14; i++) {
        this.add({
          name: 'greenhaven-' + i, team: 'home',
          x: -60 - i * 78 - (i % 3) * 30,
          behaviour: i % 5 === 0 ? 'run' : 'walk',
          speed: 84 + (i % 4) * 12,
          scale: 0.8 + (i % 3) * 0.1
        });
      }
      // The roaches holding the far side.
      for (var j = 0; j < 16; j++) {
        this.add({
          name: 'roach-' + j, team: 'away',
          x: W - 120 + (j % 4) * 70, y: 0,
          behaviour: j % 4 === 0 ? 'archer' : 'walk',
          speed: -62 - (j % 3) * 14,
          scale: 0.78 + (j % 3) * 0.08
        });
      }
      // One dragon, because there is always one dragon.
      this.add({ name: 'dragon', team: 'home', x: -300, behaviour: 'fly', speed: 150, scale: 1.5 });
    },

    add: function (o) {
      o.id = this.nextId++;
      o.y = o.y || 0;
      o.t = Math.random() * 6;
      o.scale = o.scale || 1;
      o.face = (o.speed || 0) < 0 ? -1 : 1;
      o.alive = true;
      o.hitT = 0;
      this.units.push(o);
      return o;
    },

    find: function (name) {
      for (var i = 0; i < this.units.length; i++) if (this.units[i].name === name) return this.units[i];
      return null;
    },

    volley: function (count, over) {
      count = Math.min(count | 0, MAX_ARROWS - this.an);
      for (var i = 0; i < count; i++) {
        var k = this.an++;
        this.ax[k] = Math.random() * W * 1.2 - W * 0.1;
        this.ay[k] = -120 - Math.random() * 520;
        this.avx[k] = (Math.random() - 0.62) * 130;
        this.avy[k] = 260 + Math.random() * 220;
        this.adelay[k] = Math.random() * over;
        this.astate[k] = 0;
        this.astuck[k] = 0;
      }
    },

    burst: function (x, y, n) {
      if (this.dust.length > 700) return;
      for (var i = 0; i < n; i++) {
        this.dust.push({ x: x, y: y, vx: (Math.random() - .5) * 110, vy: -Math.random() * 140, life: 1, r: 2 + Math.random() * 4 });
      }
    },

    update: function (dt) {
      this.t += dt;

      /* Volleys keep coming — the battle does not wait for a viewer. */
      this.nextVolley -= dt;
      if (this.nextVolley <= 0) {
        this.volley(260 + Math.floor(Math.random() * 340), 2.2);
        this.nextVolley = 7 + Math.random() * 6;
      }

      /* Arrows */
      var g = 820;
      for (var i = 0; i < this.an; i++) {
        if (this.astate[i] === 2) { this.astuck[i] += dt; continue; }
        if (this.astate[i] === 0) {
          this.adelay[i] -= dt;
          if (this.adelay[i] > 0) continue;
          this.astate[i] = 1;
        }
        this.avy[i] += g * dt;
        this.ax[i] += this.avx[i] * dt;
        this.ay[i] += this.avy[i] * dt;
        if (this.ay[i] >= GROUND) {
          this.ay[i] = GROUND;
          this.astate[i] = 2;
          this.burst(this.ax[i], GROUND, 1);
        }
      }
      /* Spent arrows rot away after a few seconds, otherwise every volley
         leaves a permanent black hedge across the field. */
      if (this.an) {
        var keep = 0;
        for (var q = 0; q < this.an; q++) {
          if (this.astate[q] === 2 && this.astuck[q] > 7) continue;
          this.ax[keep] = this.ax[q]; this.ay[keep] = this.ay[q];
          this.avx[keep] = this.avx[q]; this.avy[keep] = this.avy[q];
          this.adelay[keep] = this.adelay[q]; this.astate[keep] = this.astate[q];
          this.astuck[keep] = this.astuck[q];
          keep++;
        }
        this.an = keep;
      }

      /* Dust */
      for (var d = this.dust.length - 1; d >= 0; d--) {
        var p = this.dust[d];
        p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.4;
        if (p.life <= 0) this.dust.splice(d, 1);
      }

      /* Units */
      for (var u = 0; u < this.units.length; u++) {
        var m = this.units[u];
        m.t += dt;
        if (m.hitT > 0) m.hitT -= dt;
        m.x += (m.speed || 0) * dt;
        if (m.behaviour === 'archer') m.x = m.x;              // archers hold position
        // wrap the march so the battle is continuous
        if (m.speed > 0 && m.x > W + 200) m.x = -200 - Math.random() * 300;
        if (m.speed < 0 && m.x < -200) m.x = W + 200 + Math.random() * 300;
      }
    }
  };

  /* ========================================================= CAMERAS ===== */
  /* A camera is a placed object. `solve` returns where it is looking THIS frame.
     Rigs:
       locked  — bolted down, never moves
       follow  — rides along with a unit, always centred on them
       tripod  — fixed position, pans to keep a unit in frame (like a real tripod)
       crane   — sweeps along a path on a loop
       arrow   — rides a falling arrow down. Chaos. Wonderful.                */
  var Cameras = [
    { id: 'wide',   label: 'Wide',        rig: 'locked', x: W * 0.5, y: H * 0.44, zoom: 0.52, rot: 0 },
    { id: 'iries',  label: 'On Iries',    rig: 'follow', target: 'iries', y: H * 0.58, zoom: 1.9, rot: 0 },
    { id: 'low',    label: 'Low angle',   rig: 'tripod', x: W * 0.42, y: H * 0.72, zoom: 1.55, rot: -0.05, target: 'iries' },
    { id: 'crane',  label: 'Crane',       rig: 'crane',  y: H * 0.34, zoom: 0.8, rot: 0 },
    { id: 'sky',    label: 'The sky',     rig: 'locked', x: W * 0.5, y: H * 0.16, zoom: 0.62, rot: 0 },
    { id: 'dragon', label: 'Dragon cam',  rig: 'follow', target: 'dragon', y: H * 0.40, zoom: 1.25, rot: .02 },
    { id: 'arrow',  label: 'Arrow cam',   rig: 'arrow',  zoom: 2.4, rot: 0 },
    { id: 'front',  label: 'The front',   rig: 'tripod', x: W * 0.80, y: H * 0.66, zoom: 1.35, rot: .03, target: 'roach-0' }
  ];

  /* live solved state per camera, so pans are smooth across frames */
  var camState = {};
  Cameras.forEach(function (c) { camState[c.id] = { x: c.x == null ? W / 2 : c.x, y: c.y, zoom: c.zoom, rot: c.rot || 0, arrowIdx: -1 }; });

  function solve(cam, dt) {
    var s = camState[cam.id];
    var tx = s.x, ty = s.y, tz = cam.zoom, tr = cam.rot || 0;

    if (cam.rig === 'locked') {
      tx = cam.x; ty = cam.y;
    } else if (cam.rig === 'follow') {
      var u = World.find(cam.target);
      if (u) { tx = u.x; ty = cam.y + (u.behaviour === 'fly' ? -160 : 0); }
    } else if (cam.rig === 'tripod') {
      // The camera body never moves; it only turns and zooms toward its subject.
      var t = World.find(cam.target);
      tx = cam.x; ty = cam.y;
      if (t) {
        var off = clamp((t.x - cam.x) / (W * 0.5), -1, 1);
        tr = (cam.rot || 0) + off * 0.10;                 // pan reads as a slight roll
        tz = cam.zoom * (1 + 0.28 * (1 - Math.abs(off)));  // punch in when they're close
        tx = lerp(cam.x, t.x, 0.35);                       // lead the subject a little
      }
    } else if (cam.rig === 'crane') {
      var k = (Math.sin(World.t * 0.13) + 1) / 2;
      tx = lerp(W * 0.12, W * 0.88, k);
      ty = cam.y + Math.sin(World.t * 0.26) * 60;
    } else if (cam.rig === 'arrow') {
      // Grab a live arrow and ride it. When it lands, grab another.
      if (s.arrowIdx < 0 || s.arrowIdx >= World.an || World.astate[s.arrowIdx] !== 1) {
        s.arrowIdx = -1;
        for (var i = 0; i < World.an; i++) {
          if (World.astate[i] === 1 && World.ay[i] < GROUND - 300) { s.arrowIdx = i; break; }
        }
      }
      if (s.arrowIdx >= 0) {
        tx = World.ax[s.arrowIdx];
        ty = clamp(World.ay[s.arrowIdx] + 120, H * 0.18, GROUND - 40);
      } else {
        tx = W * 0.5; ty = H * 0.4;                       // nothing in the air yet
      }
    }

    /* Ease toward the target so no camera ever snaps. Locked cameras ease too,
       which is what makes a cut feel like a cut rather than a teleport. */
    var k2 = 1 - Math.pow(0.0015, dt);
    s.x = lerp(s.x, tx, cam.rig === 'arrow' ? 1 : k2);
    s.y = lerp(s.y, ty, cam.rig === 'arrow' ? 1 : k2);
    s.zoom = lerp(s.zoom, tz, k2);
    s.rot = lerp(s.rot, tr, k2);
    return s;
  }

  /* ========================================================== RENDER ===== */
  function applyCam(c, s, vw, vh, depth) {
    var d = depth == null ? 1 : depth;
    var z = s.zoom * (0.35 + 0.65 * d) * (vw / 1200);
    c.translate(vw / 2, vh / 2);
    c.rotate(s.rot * d);
    c.scale(z, z);
    c.translate(-s.x * d - (W / 2) * (1 - d), -s.y * d - (H / 2) * (1 - d));
  }

  function drawHills(c, seed, colour, yOff) {
    c.fillStyle = colour; c.strokeStyle = INK.line; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-W, H * 3);
    for (var x = -W; x <= W * 2; x += 90) {
      var n = Math.sin(x * 0.0035 + seed) * 54 + Math.sin(x * 0.009 + seed * 2) * 24;
      c.lineTo(x, GROUND + yOff + n);
    }
    c.lineTo(W * 2, H * 3); c.closePath(); c.fill(); c.stroke();
  }

  function drawUnit(c, m) {
    var bob = 0, tilt = 0, sy = 1;
    if (m.behaviour === 'run') { bob = Math.abs(Math.sin(m.t * 11)) * -16; tilt = 0.12 * m.face; }
    else if (m.behaviour === 'walk') { bob = Math.abs(Math.sin(m.t * 5.5)) * -7; }
    else if (m.behaviour === 'fly') { bob = Math.sin(m.t * 2.2) * -30 - 260; tilt = Math.sin(m.t * 2.2) * .12; }
    else if (m.behaviour === 'archer') { bob = Math.sin(m.t * 2.6) * -3; }
    if (m.hitT > 0) tilt += Math.sin(m.hitT * 40) * .3;

    c.save();
    c.translate(m.x, GROUND + m.y + bob);
    c.rotate(tilt);
    c.scale(m.face * m.scale, m.scale * sy);

    c.globalAlpha = .16; c.fillStyle = INK.line;
    c.beginPath(); c.ellipse(0, 6, 30, 7, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;

    var col = m.team === 'home' ? INK.green : INK.ember;

    if (m.behaviour === 'fly') { drawDragon(c, m.t, col); c.restore(); return; }

    c.strokeStyle = INK.line; c.lineWidth = m.hero ? 6 : 4.5;
    c.lineCap = 'round'; c.lineJoin = 'round';
    var sw = Math.sin(m.t * (m.behaviour === 'run' ? 11 : 5.5));
    c.beginPath(); c.arc(0, -96, 18, 0, 6.2832);
    c.fillStyle = m.hero ? INK.sun : col; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(0, -78); c.lineTo(0, -32); c.stroke();
    c.beginPath();
    c.moveTo(0, -32); c.lineTo(-14 + sw * 18, 0);
    c.moveTo(0, -32); c.lineTo(14 - sw * 18, 0);
    c.stroke();
    c.beginPath();
    if (m.behaviour === 'archer') {                    // drawing a bow
      c.moveTo(0, -68); c.lineTo(26, -74);
      c.moveTo(0, -68); c.lineTo(-14, -56);
      c.stroke();
      c.strokeStyle = col; c.lineWidth = 3;
      c.beginPath(); c.arc(30, -74, 20, -1.1, 1.1); c.stroke();
    } else {
      c.moveTo(0, -68); c.lineTo(-20 - sw * 14, -40);
      c.moveTo(0, -68); c.lineTo(20 + sw * 14, -40);
      c.stroke();
    }
    c.restore();
  }

  function drawDragon(c, t, col) {
    var flap = Math.sin(t * 4.2);
    c.strokeStyle = INK.line; c.lineWidth = 4; c.lineJoin = 'round'; c.lineCap = 'round';
    c.fillStyle = col;
    // body
    c.beginPath();
    c.moveTo(-60, 0); c.quadraticCurveTo(0, -34, 62, -6);
    c.quadraticCurveTo(90, 2, 108, -22);                 // neck + head
    c.quadraticCurveTo(78, 10, 60, 14);
    c.quadraticCurveTo(0, 26, -60, 0);
    c.closePath(); c.fill(); c.stroke();
    // tail
    c.beginPath(); c.moveTo(-60, 0);
    c.quadraticCurveTo(-112, -6 + flap * 12, -156, -34 + flap * 18);
    c.stroke();
    // wings
    c.save(); c.translate(6, -14); c.rotate(flap * 0.5);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-34, -86, 46, -72);
    c.quadraticCurveTo(30, -34, 0, 0); c.closePath();
    c.fillStyle = INK.sun; c.fill(); c.stroke();
    c.restore();
    // eye
    c.beginPath(); c.arc(98, -22, 3.4, 0, 6.2832); c.fillStyle = INK.line; c.fill();
  }

  function drawView(c, cam, vw, vh) {
    var s = camState[cam.id];

    c.fillStyle = '#cfe8fa';
    c.fillRect(0, 0, vw, vh);

    c.save(); applyCam(c, s, vw, vh, 0.12);
    var g = c.createLinearGradient(0, -H, 0, H);
    g.addColorStop(0, '#f7d9b0'); g.addColorStop(1, '#cfe8fa');
    c.fillStyle = g; c.fillRect(-W * 2, -H * 2, W * 5, H * 5);
    c.restore();

    c.save(); applyCam(c, s, vw, vh, 0.38); drawHills(c, 1.2, INK.grass, 110); c.restore();
    c.save(); applyCam(c, s, vw, vh, 0.64); drawHills(c, 3.7, INK.green, 50); c.restore();

    c.save();
    applyCam(c, s, vw, vh, 1);
    drawHills(c, 6.1, INK.green, 0);

    // arrows
    c.lineCap = 'round';
    for (var i = 0; i < World.an; i++) {
      if (World.astate[i] === 0) continue;
      var a, L = 30;
      if (World.astate[i] === 2) { a = -Math.PI / 2 + Math.sin(i) * .3; c.globalAlpha = clamp(1 - World.astuck[i] / 7, 0, 1); }
      else { a = Math.atan2(World.avy[i], World.avx[i]); c.globalAlpha = 1; }
      var dx = Math.cos(a) * L, dy = Math.sin(a) * L;
      c.strokeStyle = INK.line; c.lineWidth = 2.6;
      c.beginPath(); c.moveTo(World.ax[i] - dx, World.ay[i] - dy); c.lineTo(World.ax[i], World.ay[i]); c.stroke();
    }
    c.globalAlpha = 1;

    // dust
    for (var d = 0; d < World.dust.length; d++) {
      var p = World.dust[d];
      c.globalAlpha = clamp(p.life, 0, 1) * .45; c.fillStyle = INK.faint;
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.2832); c.fill();
    }
    c.globalAlpha = 1;

    // units, far ones first
    var list = World.units.slice().sort(function (a, b) { return a.scale - b.scale; });
    for (var u = 0; u < list.length; u++) drawView.unit(c, list[u]);

    c.restore();
  }
  drawView.unit = drawUnit;

  /* ============================================================ VIEW ===== */
  var dpr = 1, vw = 0, vh = 0;
  var active = 'wide';
  var running = true;

  function fitMain() {
    var box = main.parentElement.getBoundingClientRect();
    var w = Math.max(300, box.width - 20);
    var h = Math.round(w * 9 / 16);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    main.width = Math.round(w * dpr); main.height = Math.round(h * dpr);
    main.style.width = w + 'px'; main.style.height = h + 'px';
    vw = w; vh = h;
  }

  /* ------------------------------------------------------- thumbnails --- */
  var thumbs = {};   // camId -> {canvas, ctx, w, h}
  function buildThumbs() {
    var strip = $('#camstrip');
    if (!strip) return;
    strip.innerHTML = '';
    Cameras.forEach(function (cam, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'camstrip__cam' + (cam.id === active ? ' is-live' : '');
      b.setAttribute('data-cam', cam.id);
      b.setAttribute('aria-pressed', cam.id === active ? 'true' : 'false');

      var cv = document.createElement('canvas');
      cv.className = 'camstrip__canvas';
      cv.width = 240; cv.height = 135;
      cv.setAttribute('aria-hidden', 'true');

      var cap = document.createElement('span');
      cap.className = 'camstrip__label';
      cap.innerHTML = '<b>' + (i + 1) + '</b> ' + cam.label;

      b.appendChild(cv); b.appendChild(cap);
      b.addEventListener('click', function () { cut(cam.id); });
      strip.appendChild(b);
      thumbs[cam.id] = { canvas: cv, ctx: cv.getContext('2d', { alpha: false }), w: 240, h: 135 };
    });
  }

  function cut(id) {
    if (!camState[id]) return;
    active = id;
    $$('.camstrip__cam').forEach(function (b) {
      var on = b.getAttribute('data-cam') === id;
      b.classList.toggle('is-live', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var cam = Cameras.filter(function (c) { return c.id === id; })[0];
    var live = $('#cam-live');
    if (live && cam) live.textContent = cam.label;
    var ann = $('#cam-ann');
    if (ann && cam) ann.textContent = 'Now watching: ' + cam.label + '. The battle did not restart.';
  }

  /* --------------------------------------------------------- the loop --- */
  var lastTs = 0, thumbTurn = 0, acc = 0;
  function frame(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    var dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;

    World.update(dt);
    Cameras.forEach(function (c) { solve(c, dt); });

    // main view, full rate
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cam = Cameras.filter(function (c) { return c.id === active; })[0] || Cameras[0];
    drawView(mctx, cam, vw, vh);

    // one thumbnail per frame, round robin — 8 cameras => each ~7fps, which is
    // plenty for a preview and costs almost nothing.
    acc += dt;
    if (acc > 1 / 30) {
      acc = 0;
      var c2 = Cameras[thumbTurn % Cameras.length];
      thumbTurn++;
      var th = thumbs[c2.id];
      if (th) { th.ctx.setTransform(1, 0, 0, 1, 0, 0); drawView(th.ctx, c2, th.w, th.h); }
    }

    var cl = $('#world-clock');
    if (cl) cl.textContent = fmtClock(World.t);

    requestAnimationFrame(frame);
  }
  function fmtClock(t) {
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ========================================================= CONTROLS ==== */
  document.addEventListener('keydown', function (e) {
    if (/^[1-9]$/.test(e.key)) {
      var tag = (document.activeElement || {}).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      var cam = Cameras[parseInt(e.key, 10) - 1];
      if (cam) { e.preventDefault(); cut(cam.id); }
    }
  });

  var pauseBtn = $('#pause');
  if (pauseBtn) pauseBtn.addEventListener('click', function () {
    running = !running;
    pauseBtn.textContent = running ? 'Pause the world' : 'Resume the world';
    pauseBtn.setAttribute('aria-pressed', running ? 'false' : 'true');
    if (running) { lastTs = 0; requestAnimationFrame(frame); }
  });

  var restartBtn = $('#restart');
  if (restartBtn) restartBtn.addEventListener('click', function () {
    World.reset();
    var ann = $('#cam-ann');
    if (ann) ann.textContent = 'The battle restarted.';
  });

  /* ------------------------------------------------ recording a camera -- */
  var recorder = null, chunks = [];
  var recBtn = $('#record');
  if (recBtn) recBtn.addEventListener('click', function () {
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    if (!window.MediaRecorder || !main.captureStream) {
      var s0 = $('#cam-ann');
      if (s0) s0.textContent = 'This browser can’t record. Chrome, Edge or Firefox can — watching still works.';
      return;
    }
    var mimes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    var mime = '';
    for (var i = 0; i < mimes.length; i++) if (MediaRecorder.isTypeSupported(mimes[i])) { mime = mimes[i]; break; }
    try {
      recorder = new MediaRecorder(main.captureStream(60), mime ? { mimeType: mime, videoBitsPerSecond: 8000000 } : undefined);
    } catch (err) {
      var s1 = $('#cam-ann'); if (s1) s1.textContent = 'Recording failed: ' + err.message;
      return;
    }
    chunks = [];
    recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = function () {
      var type = recorder.mimeType || 'video/webm';
      var blob = new Blob(chunks, { type: type });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'paper-cinema.' + (type.indexOf('mp4') > -1 ? 'mp4' : 'webm');
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      recBtn.textContent = 'Record this camera';
      var s2 = $('#cam-ann');
      if (s2) s2.textContent = 'Saved your clip (' + (blob.size / 1048576).toFixed(1) + ' MB).';
      recorder = null;
    };
    recorder.start();
    recBtn.textContent = 'Stop recording';
    var s3 = $('#cam-ann');
    if (s3) s3.textContent = 'Recording whatever camera you cut to.';
    // Never let a recording run away.
    setTimeout(function () { if (recorder && recorder.state === 'recording') recorder.stop(); }, 60000);
  });

  /* ============================================================= BOOT ==== */
  fitMain();
  buildThumbs();
  World.reset();
  cut('wide');

  window.addEventListener('resize', (window.MP ? MP.debounce(fitMain, 160) : fitMain));

  if (reduced.matches) {
    // Still a living world, just calm: draw one frame per second.
    running = false;
    World.update(0.016);
    Cameras.forEach(function (c) { solve(c, 1); });
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawView(mctx, Cameras[0], vw, vh);
    Cameras.forEach(function (c) {
      var th = thumbs[c.id];
      if (th) { th.ctx.setTransform(1, 0, 0, 1, 0, 0); drawView(th.ctx, c, th.w, th.h); }
    });
    var s4 = $('#cam-ann');
    if (s4) s4.textContent = 'Reduced motion is on, so the world is paused. Press “Resume the world” to run it.';
    if (pauseBtn) { pauseBtn.textContent = 'Resume the world'; pauseBtn.setAttribute('aria-pressed', 'true'); }
  } else {
    requestAnimationFrame(frame);
  }

  /* Don't burn frames when nobody is looking — but keep going while recording. */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (recorder && recorder.state === 'recording') return;
        if (!e.isIntersecting) { running = false; }
        else if (!running && !reduced.matches) { running = true; lastTs = 0; requestAnimationFrame(frame); }
      });
    }, { threshold: 0.02 }).observe(main);
  }
})();
