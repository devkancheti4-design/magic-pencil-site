/* ==========================================================================
   THE PAPER KINGDOM — an animated short.

   Not a page and not a game: a film. Ten scenes, about eighty seconds, told
   mostly in pictures. There are roughly seventy words in the whole thing, and
   a voice says them — the animation does the rest of the telling.

   Everything is drawn here, frame by frame. There is no video file, no image
   file, and nothing to download.
   ========================================================================== */
(function () {
  'use strict';

  var stage = document.getElementById('film');
  if (!stage) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var $ = function (s) { return document.querySelector(s); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var ease = function (t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  var out = function (t) { return 1 - Math.pow(1 - t, 3); };

  /* The film is composed at a fixed size and scaled to fit, so every child
     sees the same framing whatever they are watching on. */
  var W = 1920, H = 1080, GY = H * 0.78;
  var ctx = stage.getContext('2d', { alpha: false });
  var dpr = 1, vw = 0, vh = 0;

  function fit() {
    var w = Math.max(280, window.innerWidth);
    var h = Math.max(240, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    stage.width = Math.round(w * dpr); stage.height = Math.round(h * dpr);
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
    vw = w; vh = h;
  }

  /* The film is composed at 1920x1080 but must FILL any screen, so it is
     scaled to cover and centred — the same thing a background image does.
     A little of the composition is cropped rather than letterboxed, which is
     why every scene keeps its action well inside the middle. */
  function coverTransform() {
    var k = Math.max(stage.width / W, stage.height / H);
    var ox = (stage.width - W * k) / 2;
    var oy = (stage.height - H * k) / 2;
    ctx.setTransform(k, 0, 0, k, ox, oy);
  }

  /* --------------------------------------------------------- the crayons -- */
  var C = {};
  function refresh() {
    var cs = getComputedStyle(document.documentElement);
    var g = function (n, f) { return (cs.getPropertyValue(n) || '').trim() || f; };
    C.line = g('--ink-900', '#2e2a26');
    C.faint = g('--ink-300', '#a89c8c');
    C.paper = g('--paper-1', '#fdf4e3');
    C.paper0 = g('--paper-0', '#fffdf6');
    C.green = g('--crayon-green', '#43a047');
    C.grass = g('--crayon-grass', '#8bc34a');
    C.sky = g('--crayon-sky', '#4fa3e3');
    C.sun = g('--crayon-sun', '#ffc63d');
    C.amber = g('--crayon-amber', '#ff9f1c');
    C.flame = g('--crayon-flame', '#ff6b35');
    C.ember = g('--crayon-ember', '#e8402a');
    C.royal = g('--crayon-royal', '#8e5bd0');
    C.slate = g('--crayon-slate', '#5b6670');
  }
  refresh();
  new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ============================== DRAWING ============================== */

  function sky(a) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    if (a > 0.5) {                                  /* the ink years */
      g.addColorStop(0, '#6b6f7a'); g.addColorStop(0.6, '#8a8b90'); g.addColorStop(1, C.paper);
    } else {
      g.addColorStop(0, '#bfe3fa'); g.addColorStop(0.62, '#e6f3fc'); g.addColorStop(1, C.paper);
    }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function sun(t, x, y, r) {
    ctx.save(); ctx.translate(x, y);
    ctx.globalAlpha = .28; ctx.fillStyle = C.sun;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.1 + Math.sin(t) * 4, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.sun; ctx.strokeStyle = C.line; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function cloud(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = C.paper0; ctx.strokeStyle = C.line; ctx.lineWidth = 6 / s;
    ctx.beginPath();
    ctx.moveTo(-95, 20);
    ctx.bezierCurveTo(-128, 20, -130, -16, -92, -22);
    ctx.bezierCurveTo(-84, -56, -30, -62, -14, -35);
    ctx.bezierCurveTo(8, -64, 68, -52, 68, -18);
    ctx.bezierCurveTo(106, -16, 104, 20, 70, 20);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function clouds(t, drift) {
    for (var i = 0; i < 5; i++) {
      var x = ((i * 470 + t * (14 + i * 7) * (drift || 1)) % (W + 700)) - 250;
      cloud(x, 120 + (i % 3) * 110, 0.75 + (i % 3) * 0.22);
    }
  }

  function hills(seed, colour, yOff, t) {
    ctx.fillStyle = colour; ctx.strokeStyle = C.line; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-40, H + 40);
    for (var x = -40; x <= W + 40; x += 60) {
      var n = Math.sin(x * 0.0032 + seed) * 58 + Math.sin(x * 0.0085 + seed * 2) * 26;
      ctx.lineTo(x, GY + yOff + n + Math.sin(t * 0.5 + x * 0.001) * 4);
    }
    ctx.lineTo(W + 40, H + 40); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function grass(t, step, h) {
    ctx.strokeStyle = C.line; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (var x = 0; x < W; x += step) {
      var w = Math.sin(t * 0.8 + x * 0.02) * 0.8;
      ctx.beginPath(); ctx.moveTo(x, GY + 26);
      ctx.quadraticCurveTo(x + w * 7, GY + 4, x + w * 18, GY - h);
      ctx.stroke();
    }
  }

  /* A castle, built from the ground up as `p` goes 0 -> 1 so it can be drawn
     into existence, and dimmed when the ink takes it. */
  function castle(x, y, s, p, dark) {
    p = clamp(p, 0, 1);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    var body = C.paper0, roof = C.green, stone = C.line;
    if (dark > 0) {
      body = mix(C.paper0, '#3a3a42', dark);
      roof = mix(C.green, '#2a2a30', dark);
    }
    ctx.strokeStyle = stone; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    var hgt = 150 * p;
    /* keep */
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.rect(-60, -hgt, 120, hgt); ctx.fill(); ctx.stroke();
    if (p > 0.55) {
      /* towers */
      [-95, 95].forEach(function (tx) {
        var th = 190 * clamp((p - 0.55) / 0.45, 0, 1);
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.rect(tx - 28, -th, 56, th); ctx.fill(); ctx.stroke();
        ctx.fillStyle = roof;
        ctx.beginPath(); ctx.moveTo(tx - 36, -th); ctx.lineTo(tx, -th - 62); ctx.lineTo(tx + 36, -th); ctx.closePath();
        ctx.fill(); ctx.stroke();
      });
      /* gate */
      ctx.fillStyle = mix(body, C.line, .25);
      ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(-24, -50); ctx.quadraticCurveTo(0, -78, 24, -50); ctx.lineTo(24, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      /* flag */
      var fh = -hgt - 70;
      ctx.beginPath(); ctx.moveTo(0, -hgt); ctx.lineTo(0, fh); ctx.stroke();
      ctx.fillStyle = dark > .5 ? '#7a2b2b' : C.flame;
      ctx.beginPath(); ctx.moveTo(0, fh); ctx.lineTo(58, fh + 16); ctx.lineTo(0, fh + 32); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function mix(a, b, k) {
    function rgb(c) {
      c = c.trim();
      if (c[0] === '#') {
        var n = parseInt(c.slice(1), 16);
        return c.length === 7 ? [n >> 16 & 255, n >> 8 & 255, n & 255] : [0, 0, 0];
      }
      var m = c.match(/\d+/g);
      return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
    }
    var A = rgb(a), B = rgb(b);
    return 'rgb(' + Math.round(lerp(A[0], B[0], k)) + ',' + Math.round(lerp(A[1], B[1], k)) + ',' + Math.round(lerp(A[2], B[2], k)) + ')';
  }

  function tree(x, y, s, dark) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = C.line; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    ctx.fillStyle = dark > 0 ? mix('#6d4c2f', '#33262a', dark) : '#8d6742';
    ctx.beginPath(); ctx.rect(-11, -54, 22, 54); ctx.fill(); ctx.stroke();
    ctx.fillStyle = dark > 0 ? mix(C.green, '#25252c', dark) : C.green;
    ctx.beginPath(); ctx.moveTo(-58, -48); ctx.lineTo(0, -152); ctx.lineTo(58, -48); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /* A little paper person, using the shared rig so it walks like the one in
     every other part of this project. */
  function person(x, ground, t, opts) {
    opts = opts || {};
    var run = !!opts.run;
    var cad = run ? 8.6 : 4.6;
    var p = t * cad;
    var amp = run ? 0.7 : 0.42;
    var rise = -Math.abs(Math.sin(p)) * (run ? 9 : 4);
    ctx.save();
    ctx.translate(x, ground);
    ctx.scale((opts.face || 1) * (opts.scale || 1), (opts.scale || 1));
    ctx.globalAlpha = .16; ctx.fillStyle = C.line;
    ctx.beginPath(); ctx.ellipse(0, 4, 26, 6, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    if (window.PaperRig) {
      PaperRig.drawFigure(ctx, {
        hipL: Math.sin(p) * amp, hipR: Math.sin(p + Math.PI) * amp,
        kneeL: 0.18 + Math.max(0, -Math.sin(p - 0.7)) * (run ? 1.5 : 0.9),
        kneeR: 0.18 + Math.max(0, -Math.sin(p + Math.PI - 0.7)) * (run ? 1.5 : 0.9),
        armL: -Math.sin(p) * (run ? .95 : .7), armR: -Math.sin(p + Math.PI) * (run ? .95 : .7),
        elbowL: run ? 1.35 : .55, elbowR: run ? 1.35 : .55,
        lean: run ? .2 : .05, rise: rise,
        hipTwist: Math.sin(p) * .12, shoulderTwist: -Math.sin(p) * .18,
        tunic: opts.tunic || C.sky, limb: C.paper0, line: C.line, lineWidth: 5
      });
    }
    ctx.restore();
  }

  function dragon(x, y, t, s, colour) {
    var flap = Math.sin(t * 4.6);
    ctx.save(); ctx.translate(x, y + Math.sin(t * 1.8) * 18); ctx.scale(s, s);
    ctx.strokeStyle = C.line; ctx.lineWidth = 7 / s; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = colour || C.green;
    ctx.beginPath();
    ctx.moveTo(-70, 0); ctx.quadraticCurveTo(0, -40, 74, -8);
    ctx.quadraticCurveTo(108, 2, 130, -26);
    ctx.quadraticCurveTo(94, 14, 72, 18);
    ctx.quadraticCurveTo(0, 32, -70, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-70, 0);
    ctx.quadraticCurveTo(-132, -8 + flap * 16, -186, -42 + flap * 24); ctx.stroke();
    ctx.save(); ctx.translate(8, -18); ctx.rotate(flap * 0.55);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-42, -104, 56, -88);
    ctx.quadraticCurveTo(36, -42, 0, 0); ctx.closePath();
    ctx.fillStyle = C.sun; ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(118, -26, 4.5, 0, 6.2832); ctx.fillStyle = C.line; ctx.fill();
    ctx.restore();
  }

  function fire(x, y, t, len) {
    for (var i = 0; i < 26; i++) {
      var k = i / 26;
      var px = x + k * len + Math.sin(t * 8 + i) * 10;
      var py = y + Math.sin(t * 6 + i * .6) * 22 * k;
      var r = (1 - k) * 30 + 6;
      ctx.globalAlpha = (1 - k) * .85;
      ctx.fillStyle = k < .3 ? C.sun : (k < .65 ? C.amber : C.flame);
      ctx.beginPath(); ctx.arc(px, py, r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* The pencil that draws the world in. */
  function pencil(x, y, a, s) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
    ctx.strokeStyle = C.line; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    ctx.fillStyle = C.sun;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-26, -34); ctx.lineTo(-14, -210); ctx.lineTo(26, -204); ctx.lineTo(26, -30); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.flame;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-26, -34); ctx.lineTo(26, -30); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.line;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-9, -12); ctx.lineTo(9, -11); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function bird(x, y, t, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = C.line; ctx.lineWidth = 7 / s; ctx.lineCap = 'round';
    var f = Math.sin(t * 9) * 26;
    ctx.beginPath();
    ctx.moveTo(-34, 0); ctx.quadraticCurveTo(-16, -f, 0, 0);
    ctx.quadraticCurveTo(16, -f, 34, 0);
    ctx.stroke();
    ctx.restore();
  }

  /* Ink creeping across the page — irregular, never a circle. */
  var blots = [];
  function inkBlot(x, y, max, seed) {
    var lobes = [];
    for (var i = 0; i < 11; i++) lobes.push({ a: i / 11 * 6.2832, r: 0.55 + ((Math.sin(seed + i * 12.9) + 1) / 2) * 0.45 });
    return { x: x, y: y, max: max, lobes: lobes };
  }
  function drawBlot(b, p) {
    if (p <= 0) return;
    var r = b.max * out(clamp(p, 0, 1));
    ctx.beginPath();
    for (var j = 0; j <= b.lobes.length; j++) {
      var l = b.lobes[j % b.lobes.length];
      var rr = r * l.r;
      var px = b.x + Math.cos(l.a) * rr, py = b.y + Math.sin(l.a) * rr;
      j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(28,26,30,0.88)';
    ctx.fill();
  }

  function roach(x, y, t, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = C.line; ctx.lineWidth = 6 / s; ctx.lineCap = 'round';
    ctx.fillStyle = '#4a3a2e';
    ctx.beginPath(); ctx.ellipse(0, 0, 40, 24, 0, 0, 6.2832); ctx.fill(); ctx.stroke();
    var w = Math.sin(t * 14) * 8;
    for (var i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(i * 16, -18); ctx.lineTo(i * 16 - 12, -40 + w); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * 16, 18); ctx.lineTo(i * 16 - 12, 40 - w); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(34, -8); ctx.lineTo(58, -24 + w * .5); ctx.moveTo(34, 4); ctx.lineTo(58, 20 - w * .5); ctx.stroke();
    ctx.restore();
  }

  /* =============================== SCENES =============================== */
  /* Each scene draws itself from `p`, its own progress from 0 to 1, so the
     whole film is a pure function of time and can be scrubbed or replayed. */

  var SCENES = [
    {
      dur: 7, title: 'THE PAPER KINGDOM',
      say: 'Once, there was a kingdom made of paper.',
      draw: function (p, t) {
        sky(0);
        var d = clamp(p * 1.9, 0, 1);
        if (p > 0.18) { clouds(t, 1); }
        if (p > 0.30) sun(t, W * 0.8, 190, 76);
        if (d > 0.12) hills(1.2, C.grass, 90, t);
        if (d > 0.25) hills(3.7, C.green, 0, t);
        if (d > 0.40) castle(W * 0.5, GY, 1, (d - 0.40) / 0.4, 0);
        if (d > 0.62) { tree(W * 0.22, GY, 1, 0); tree(W * 0.78, GY, .85, 0); }
        if (d < 0.98) {
          var px = lerp(-200, W * 0.5, ease(clamp(p * 1.4, 0, 1)));
          pencil(px, GY - 150 * Math.sin(p * 3.1), -0.5 + Math.sin(t * 4) * .12, 1.1);
        }
        grass(t, 90, 30);
      }
    },
    {
      dur: 8,
      say: 'Everyone there was drawn by hand. And everything drawn came alive.',
      draw: function (p, t) {
        sky(0); clouds(t, 1); sun(t, W * 0.8, 190, 76);
        hills(1.2, C.grass, 90, t); hills(3.7, C.green, 0, t);
        castle(W * 0.5, GY, 1, 1, 0);
        tree(W * 0.18, GY, 1, 0); tree(W * 0.84, GY, .85, 0);
        person(lerp(W * 0.1, W * 0.36, p), GY, t, { scale: 1.15, tunic: C.royal });
        person(lerp(W * 0.92, W * 0.66, p), GY, t + 1.3, { scale: 1.05, face: -1, tunic: C.berry || C.flame });
        person(lerp(W * 0.3, W * 0.44, p), GY, t + 2.6, { scale: .85, tunic: C.amber });
        grass(t, 90, 30);
      }
    },
    {
      dur: 9,
      say: 'A boy named Iries found the pencil. He drew a bird, and it flew away.',
      draw: function (p, t) {
        sky(0); clouds(t, 1); sun(t, W * 0.82, 190, 76);
        hills(1.2, C.grass, 90, t); hills(3.7, C.green, 0, t);
        castle(W * 0.78, GY, .8, 1, 0);
        person(W * 0.3, GY, t, { scale: 1.4, tunic: C.sun });
        if (p < 0.5) pencil(W * 0.3 + 90, GY - 150, -0.3 + Math.sin(t * 3) * .3, 0.8);
        else {
          var q = (p - 0.5) / 0.5;
          bird(lerp(W * 0.36, W * 1.05, ease(q)), lerp(GY - 150, 150, ease(q)), t, 1.6);
        }
        grass(t, 90, 30);
      }
    },
    {
      dur: 8,
      say: 'But the roaches found a pencil too.',
      draw: function (p, t) {
        sky(clamp(p * .9, 0, 1)); clouds(t, 1.6);
        hills(1.2, mix(C.grass, '#5c5f52', p * .7), 90, t);
        hills(3.7, mix(C.green, '#3f4a3c', p * .7), 0, t);
        castle(W * 0.5, GY, 1, 1, p * .5);
        for (var i = 0; i < 5; i++) {
          var rx = lerp(W + 200 + i * 190, W * 0.12 + i * 170, ease(clamp(p * 1.3 - i * .06, 0, 1)));
          roach(rx, GY - 34, t + i, 1.2);
        }
        grass(t, 90, 30);
      }
    },
    {
      dur: 9,
      say: 'They drew in ink that would not rub out. One by one, five kingdoms went dark.',
      setup: function () {
        blots = [];
        for (var i = 0; i < 5; i++) blots.push(inkBlot(W * (0.16 + i * 0.17), GY - 40, 340, i * 3.1));
      },
      draw: function (p, t) {
        sky(1); clouds(t, 1.8);
        hills(1.2, '#5c5f52', 90, t); hills(3.7, '#3f4a3c', 0, t);
        for (var i = 0; i < 5; i++) {
          var q = clamp((p - i * 0.16) / 0.3, 0, 1);
          castle(W * (0.16 + i * 0.17), GY, .62, 1, q);
        }
        for (var b = 0; b < blots.length; b++) drawBlot(blots[b], (p - b * 0.16) / 0.34);
        grass(t, 90, 30);
      }
    },
    {
      dur: 8,
      say: 'So Iries went to get them back. He went alone.',
      draw: function (p, t) {
        sky(0.7); clouds(t, 1.2);
        hills(1.2, mix(C.grass, '#5c5f52', .5), 90, t);
        hills(3.7, mix(C.green, '#3f4a3c', .5), 0, t);
        castle(W * 0.86, GY, .7, 1, .8);
        person(lerp(W * 0.06, W * 0.6, p), GY, t, { scale: 1.5, tunic: C.sun });
        grass(t, 90, 30);
      }
    },
    {
      dur: 11,
      say: 'The roaches filled the sky with arrows.',
      setup: function () {
        this.ar = [];
        for (var i = 0; i < 260; i++) {
          this.ar.push({ x: Math.random() * W * 1.3 - W * .15, y: -Math.random() * 900 - 100,
                         vx: -40 - Math.random() * 60, vy: 300 + Math.random() * 260, d: Math.random() * 3.2 });
        }
      },
      draw: function (p, t, dt) {
        sky(0.8); clouds(t, 1.2);
        hills(1.2, mix(C.grass, '#5c5f52', .55), 90, t);
        hills(3.7, mix(C.green, '#3f4a3c', .55), 0, t);
        /* roach archers holding the ridge */
        for (var k = 0; k < 6; k++) roach(W * (0.72 + k * 0.05), GY - 30, t + k, 1.0);
        /* the storm */
        ctx.lineCap = 'round';
        for (var i = 0; i < this.ar.length; i++) {
          var a = this.ar[i];
          if (a.d > 0) { a.d -= dt; continue; }
          a.vy += 820 * dt; a.x += a.vx * dt; a.y += a.vy * dt;
          if (a.y > GY) { a.y = GY; a.vy = 0; a.vx = 0; }
          var ang = Math.atan2(a.vy || 1, a.vx || -1);
          var dx = Math.cos(ang) * 44, dy = Math.sin(ang) * 44;
          ctx.strokeStyle = C.line; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(a.x - dx, a.y - dy); ctx.lineTo(a.x, a.y); ctx.stroke();
        }
        /* Iries running through it */
        person(lerp(W * 0.08, W * 0.56, p), GY, t, { scale: 1.5, run: true, tunic: C.sun });
        grass(t, 90, 30);
      }
    },
    {
      dur: 10,
      say: 'So Iries drew something bigger. He called it a dragon.',
      draw: function (p, t) {
        sky(0.7); clouds(t, 1.2);
        hills(1.2, mix(C.grass, '#5c5f52', .5), 90, t);
        hills(3.7, mix(C.green, '#3f4a3c', .5), 0, t);
        person(W * 0.18, GY, t, { scale: 1.4, tunic: C.sun });
        if (p < 0.42) {
          pencil(W * 0.18 + 100 + Math.sin(t * 5) * 60, GY - 220 + Math.cos(t * 4) * 50, .3 + Math.sin(t * 6) * .3, .9);
        }
        var q = clamp((p - 0.35) / 0.65, 0, 1);
        if (q > 0) {
          ctx.globalAlpha = Math.min(1, q * 2);
          dragon(lerp(W * 0.42, W * 0.62, ease(q)), lerp(GY - 60, 330, ease(q)), t, 1.5 + q * .5, C.green);
          ctx.globalAlpha = 1;
        }
        grass(t, 90, 30);
      }
    },
    {
      dur: 10,
      say: 'And the dragon burned the ink away.',
      setup: function () {
        blots = [];
        for (var i = 0; i < 5; i++) blots.push(inkBlot(W * (0.16 + i * 0.17), GY - 40, 340, i * 3.1));
      },
      draw: function (p, t) {
        sky(clamp(0.9 - p, 0, 1)); clouds(t, 1.2);
        var clean = ease(clamp(p, 0, 1));
        hills(1.2, mix('#5c5f52', C.grass, clean), 90, t);
        hills(3.7, mix('#3f4a3c', C.green, clean), 0, t);
        for (var i = 0; i < 5; i++) {
          var gone = clamp((p - i * 0.14) / 0.3, 0, 1);
          castle(W * (0.16 + i * 0.17), GY, .62, 1, 1 - gone);
          drawBlot(blots[i], clamp(1 - (p - i * 0.14) / 0.24, 0, 1));
        }
        var dx = lerp(-320, W + 320, ease(p));
        dragon(dx, 300, t, 1.7, C.green);
        fire(dx + 150, 300, t, 260);
        grass(t, 90, 30);
      }
    },
    {
      dur: 10, title: 'THE END',
      say: 'And the paper kingdom was bright again.',
      draw: function (p, t) {
        sky(0); clouds(t, 1); sun(t, W * 0.82, 180, 78 + Math.sin(t) * 3);
        hills(1.2, C.grass, 90, t); hills(3.7, C.green, 0, t);
        for (var i = 0; i < 5; i++) castle(W * (0.16 + i * 0.17), GY, .62, 1, 0);
        tree(W * 0.08, GY, .9, 0); tree(W * 0.95, GY, .8, 0);
        for (var k = 0; k < 4; k++) {
          person(W * (0.2 + k * 0.18) + Math.sin(t * .6 + k) * 60, GY, t + k * 1.7,
                 { scale: 1.0, tunic: [C.royal, C.sky, C.amber, C.flame][k], face: k % 2 ? -1 : 1 });
        }
        dragon(lerp(W * 1.2, W * 0.3, clamp(p * .8, 0, 1)), 260, t, 1.3, C.green);
        grass(t, 90, 30);
      }
    }
  ];

  var TOTAL = SCENES.reduce(function (a, s) { return a + s.dur; }, 0);

  /* ================================ PLAYER ============================== */
  var at = 0, sceneT = 0, filmT = 0, playing = false, raf = 0, last = 0;
  var titleT = 0, said = -1;
  var synth = window.speechSynthesis;
  var voice = null;

  function pickVoice() {
    if (!synth) return;
    var vs = (synth.getVoices() || []).filter(function (v) { return /^en/i.test(v.lang); });
    voice = vs.find(function (v) { return /natural|neural|enhanced|premium|samantha|google uk|google us/i.test(v.name); }) || vs[0] || null;
  }
  if (synth) { pickVoice(); if (typeof synth.onvoiceschanged !== 'undefined') synth.onvoiceschanged = pickVoice; }

  var capEl = $('#film-caption'), barEl = $('#film-bar i'), sceneEl = $('#film-scene');
  var titleEl = $('#film-title');
  var root = document.getElementById('film-page');
  var playBtn = $('#film-play'), replayBtn = $('#film-replay'), capBtn = $('#film-captions');
  var captionsOn = true;

  function speak(text) {
    if (!synth || !window.SpeechSynthesisUtterance) return;
    try {
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.rate = 0.92; u.pitch = 1.05;
      synth.speak(u);
    } catch (e) { /* the film carries on without a voice */ }
  }

  function enterScene(i) {
    at = i; sceneT = 0; titleT = 0;
    var s = SCENES[i];
    if (!s) return;
    if (s.setup) s.setup();
    showCaption(playing ? s.say : '');
    if (sceneEl) sceneEl.textContent = (i + 1) + ' / ' + SCENES.length;
    if (titleEl) titleEl.textContent = s.title || 'The Paper Kingdom';
    if (said !== i) { said = i; if (s.say && playing) speak(s.say); }
  }

  function showCaption(text) {
    var on = !!(captionsOn && text);
    if (capEl) {
      capEl.textContent = on ? text : '';
      capEl.classList.toggle('is-on', on);
    }
    root.classList.toggle('is-reading', on);
  }

  function paint(dt) {
    var s = SCENES[at];
    if (!s) return;
    var p = clamp(sceneT / s.dur, 0, 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, stage.width, stage.height);
    coverTransform();
    s.draw.call(s, p, sceneT, dt);

    if (barEl) barEl.style.transform = 'scaleX(' + clamp(filmT / TOTAL, 0, 1) + ')';
  }

  function frame(ts) {
    if (!playing) return;
    if (!last) last = ts;
    var dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    sceneT += dt; filmT += dt;
    if (sceneT >= SCENES[at].dur) {
      if (at + 1 >= SCENES.length) { paint(dt); stop(true); return; }
      enterScene(at + 1);
    }
    paint(dt);
    raf = requestAnimationFrame(frame);
  }

  function play() {
    playing = true; last = 0;
    showCaption(SCENES[at] && SCENES[at].say);
    if (playBtn) { playBtn.textContent = 'Pause'; playBtn.setAttribute('aria-pressed', 'true'); }
    root.classList.add('is-rolling');
    var s = SCENES[at];
    if (s && s.say && said !== at) { said = at; speak(s.say); }
    else if (s && s.say) speak(s.say);
    raf = requestAnimationFrame(frame);
  }
  function stop(ended) {
    playing = false;
    cancelAnimationFrame(raf);
    if (synth) { try { synth.cancel(); } catch (e) {} }
    if (playBtn) { playBtn.textContent = ended ? 'Watch again' : 'Play'; playBtn.setAttribute('aria-pressed', 'false'); }
    root.classList.remove('is-rolling');
    if (ended) { at = SCENES.length - 1; }
  }
  function restart() {
    stop(); filmT = 0; said = -1; enterScene(0); paint(0); play();
  }

  if (playBtn) playBtn.addEventListener('click', function () {
    if (playing) stop();
    else if (at === SCENES.length - 1 && sceneT >= SCENES[at].dur) restart();
    else play();
  });
  if (replayBtn) replayBtn.addEventListener('click', restart);
  if (capBtn) capBtn.addEventListener('click', function () {
    captionsOn = !captionsOn;
    capBtn.setAttribute('aria-pressed', captionsOn ? 'true' : 'false');
    capBtn.textContent = captionsOn ? 'Words on' : 'Words off';
    showCaption(SCENES[at] && SCENES[at].say);
  });

  /* Tap the picture, or the big button, to play. The simplest control there is. */
  var bigBtn = $('#film-big');
  function toggle() {
    if (playing) stop();
    else if (at === SCENES.length - 1 && sceneT >= SCENES[at].dur) restart();
    else play();
  }
  stage.addEventListener('click', toggle);
  if (bigBtn) bigBtn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });

  document.addEventListener('visibilitychange', function () { if (document.hidden && playing) stop(); });

  fit();
  window.addEventListener('resize', function () { fit(); paint(0); });
  enterScene(0);
  paint(0);
  if (sceneEl) sceneEl.textContent = '1 / ' + SCENES.length;

  if (reduced.matches) showCaption('Press play when you are ready.');
})();
