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
    hero: null,

    reset: function () {
      this.t = 0; this.units.length = 0; this.an = 0; this.dust.length = 0;
      this.nextId = 1;

      /* Iries. The only one running — everything else holds its ground. */
      this.hero = this.add({
        name: 'iries', team: 'home', x: 60, behaviour: 'run', speed: 300, hero: true,
        defend: null, defendT: 0, dodges: 0, deflects: 0
      });

      /* The enemy line: archers standing on the far ridge. Every arrow in the
         sky was loosed by one of these, from its bow, at Iries. */
      for (var j = 0; j < 9; j++) {
        this.add({
          name: 'archer-' + j, team: 'away',
          x: W - 520 + j * 58 + (j % 2) * 22,
          behaviour: 'archer', speed: 0,
          scale: 0.92 + (j % 3) * 0.06,
          cooldown: 1.2 + Math.random() * 3.4,
          draw: 0
        });
      }

      /* One dragon, high up and out of the way. */
      this.add({ name: 'dragon', team: 'home', x: -300, behaviour: 'fly', speed: 120, scale: 1.4 });
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

    /* One archer looses one arrow, from its bow, on a real ballistic arc that
       lands on or near Iries. No arrow exists that nobody shot. */
    loose: function (archer, target) {
      if (this.an >= MAX_ARROWS) return;
      var k = this.an++;
      var bx = archer.x - 30 * archer.scale;      // the bow, not the feet
      var by = GROUND - 74 * archer.scale;

      /* Aim at where Iries will be, not where he is, then miss a bit. */
      var flight = 1.5 + Math.random() * 0.7;
      var tx = target.x + (target.speed || 0) * flight * (0.5 + Math.random() * 0.6)
               + (Math.random() - 0.5) * 260;
      var ty = GROUND - Math.random() * 40;

      var g = 820;
      this.ax[k] = bx; this.ay[k] = by;
      this.avx[k] = (tx - bx) / flight;
      this.avy[k] = (ty - by - 0.5 * g * flight * flight) / flight;
      this.adelay[k] = 0;
      this.astate[k] = 1;
      this.astuck[k] = 0;
    },

    burst: function (x, y, n) {
      if (this.dust.length > 700) return;
      for (var i = 0; i < n; i++) {
        this.dust.push({ x: x, y: y, vx: (Math.random() - .5) * 110, vy: -Math.random() * 140, life: 1, r: 2 + Math.random() * 4 });
      }
    },

    update: function (dt) {
      this.t += dt;
      var hero = this.hero;
      var g = 820;

      /* --- the archers: draw, aim, loose ------------------------------- */
      for (var a = 0; a < this.units.length; a++) {
        var ar = this.units[a];
        if (ar.behaviour !== 'archer') continue;
        ar.cooldown -= dt;
        ar.draw = clamp(1 - ar.cooldown / 0.9, 0, 1);      // bow drawn as it nears
        if (ar.cooldown <= 0 && hero && hero.alive) {
          this.loose(ar, hero);
          ar.cooldown = 1.6 + Math.random() * 3.2;
          ar.draw = 0;
        }
      }

      /* --- arrows ------------------------------------------------------ */
      for (var i = 0; i < this.an; i++) {
        if (this.astate[i] === 2) { this.astuck[i] += dt; continue; }
        this.avy[i] += g * dt;
        this.ax[i] += this.avx[i] * dt;
        this.ay[i] += this.avy[i] * dt;

        /* --- Iries, and only Iries, defends himself ------------------- */
        if (this.astate[i] === 1 && hero && hero.alive) {
          var dx = this.ax[i] - hero.x;
          var dy = this.ay[i] - (GROUND - 60);
          var near = dx * dx + dy * dy;
          if (near < 24000 && this.avx[i] * -Math.sign(dx || 1) > -9999) {
            if (hero.defendT <= 0) {
              /* Pick a real response to THIS arrow: high ones he ducks,
                 low ones he leans past, the rest he knocks away. */
              var incomingHigh = this.ay[i] < GROUND - 110;
              hero.defend = incomingHigh ? 'duck' : (Math.random() < 0.55 ? 'deflect' : 'lean');
              hero.defendT = 0.42;
            }
            if (hero.defend === 'deflect' && near < 9000) {
              /* Knocked out of the air — it keeps its energy, changes its mind. */
              var sp = Math.hypot(this.avx[i], this.avy[i]);
              var ang = -2.3 + Math.random() * 0.8;
              this.avx[i] = Math.cos(ang) * sp * 0.75;
              this.avy[i] = Math.sin(ang) * sp * 0.75;
              this.astate[i] = 3;
              hero.deflects++;
              this.burst(this.ax[i], this.ay[i], 4);
            } else if (near < 5000) {
              hero.dodges++;
            }
          }
        }

        if (this.ay[i] >= GROUND) {
          this.ay[i] = GROUND;
          this.astate[i] = 2;
          this.burst(this.ax[i], GROUND, 1);
        }
      }

      /* spent arrows rot away so the field stays readable */
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

      /* --- dust -------------------------------------------------------- */
      for (var d = this.dust.length - 1; d >= 0; d--) {
        var p = this.dust[d];
        p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.4;
        if (p.life <= 0) this.dust.splice(d, 1);
      }

      /* --- units ------------------------------------------------------- */
      for (var u = 0; u < this.units.length; u++) {
        var m = this.units[u];
        m.t += dt;
        if (m.defendT > 0) m.defendT -= dt;
        else if (m.defend) m.defend = null;

        if (m.behaviour === 'archer') continue;            // they stand their ground

        /* Iries slows a little while he is dealing with an arrow — that is
           what makes the defence read as effort rather than decoration. */
        var sp2 = m.speed || 0;
        if (m.hero && m.defendT > 0) sp2 *= 0.45;
        m.x += sp2 * dt;

        if (m.hero && m.x > W - 760) {        // reached the line: run it again
          m.x = 60; m.dodges = 0; m.deflects = 0;
        }
        if (!m.hero && m.speed > 0 && m.x > W + 300) m.x = -320;
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
    { id: 'wide',   label: 'Wide',        rig: 'locked', x: W * 0.55, y: GROUND - 230, zoom: 0.55, rot: 0 },
    { id: 'iries',  label: 'On Iries',    rig: 'follow', target: 'iries', y: GROUND - 95, zoom: 1.9, rot: 0 },
    { id: 'low',    label: 'Low angle',   rig: 'tripod', x: W * 0.45, y: GROUND - 70, zoom: 1.5, rot: -0.05, target: 'iries' },
    { id: 'crane',  label: 'Crane',       rig: 'crane',  y: H * 0.34, zoom: 0.8, rot: 0 },
    { id: 'sky',    label: 'The sky',     rig: 'locked', x: W * 0.5, y: H * 0.16, zoom: 0.62, rot: 0 },
    { id: 'dragon', label: 'Dragon cam',  rig: 'follow', target: 'dragon', y: H * 0.40, zoom: 1.25, rot: .02 },
    { id: 'arrow',  label: 'Arrow cam',   rig: 'arrow',  zoom: 2.4, rot: 0 },
    { id: 'front',  label: 'The front',   rig: 'tripod', x: W * 0.74, y: GROUND - 110, zoom: 1.3, rot: .03, target: 'archer-4' }
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

  /* ------------------------------------------------------------------------
     The paper is alive. Wind runs across the sheet on its own clock; grass
     leans with it, clouds drift and slowly change shape, the horizon breathes,
     and a couple of soft creases sit on the page because it is a real sheet
     that has been folded.
     ------------------------------------------------------------------------ */
  function wind(t, x) {
    return Math.sin(t * 0.6 + x * 0.0016) * 0.6 + Math.sin(t * 1.7 + x * 0.004) * 0.4;
  }

  function drawHills(c, seed, colour, yOff) {
    var t = World.t;
    c.fillStyle = colour; c.strokeStyle = INK.line; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-W, H * 3);
    for (var x = -W; x <= W * 2; x += 60) {
      var n = Math.sin(x * 0.0035 + seed) * 54 + Math.sin(x * 0.009 + seed * 2) * 24;
      /* the sheet breathes — a long, slow ripple down the page */
      var ripple = Math.sin(t * 0.5 + x * 0.0011 + seed) * 5;
      c.lineTo(x, GROUND + yOff + n + ripple);
    }
    c.lineTo(W * 2, H * 3); c.closePath(); c.fill(); c.stroke();
  }

  /* Tufts of grass that lean with the wind, thicker near the camera. */
  function drawGrass(c, spacing, height, seed) {
    var t = World.t;
    c.strokeStyle = INK.line; c.lineWidth = 2.2; c.lineCap = 'round';
    for (var x = -600; x < W + 600; x += spacing) {
      var w = wind(t, x);
      var h = height * (0.7 + ((Math.sin(x * 12.9 + seed) + 1) % 1) * 0.6);
      var baseY = GROUND + Math.sin(t * 0.5 + x * 0.0011) * 5;
      c.beginPath();
      c.moveTo(x, baseY);
      c.quadraticCurveTo(x + w * 6, baseY - h * 0.6, x + w * 16, baseY - h);
      c.stroke();
      c.beginPath();
      c.moveTo(x + 7, baseY);
      c.quadraticCurveTo(x + 7 + w * 5, baseY - h * 0.5, x + 7 + w * 12, baseY - h * 0.78);
      c.stroke();
    }
  }

  /* Paper-cutout clouds. Each drifts at its own pace and swells very slowly,
     so the sky is never twice the same. */
  var CLOUDS = [];
  for (var ci = 0; ci < 9; ci++) {
    CLOUDS.push({
      x: ci * 340 - 200,
      y: 120 + (ci % 4) * 95,
      s: 0.75 + (ci % 3) * 0.35,
      v: 7 + (ci % 5) * 4,
      ph: ci * 1.7
    });
  }
  function drawClouds(c) {
    var t = World.t;
    c.lineWidth = 3; c.strokeStyle = INK.line; c.lineJoin = 'round';
    for (var i = 0; i < CLOUDS.length; i++) {
      var q = CLOUDS[i];
      var x = ((q.x + t * q.v) % (W + 1200)) - 400;
      var y = q.y + Math.sin(t * 0.25 + q.ph) * 9;
      var s = q.s * (1 + Math.sin(t * 0.18 + q.ph) * 0.05);
      c.save();
      c.translate(x, y); c.scale(s, s);
      c.fillStyle = INK.paper;
      c.beginPath();
      c.moveTo(-90, 18);
      c.bezierCurveTo(-118, 18, -120, -14, -88, -20);
      c.bezierCurveTo(-80, -50, -30, -56, -14, -32);
      c.bezierCurveTo(6, -58, 62, -48, 62, -18);
      c.bezierCurveTo(98, -16, 96, 18, 66, 18);
      c.closePath();
      c.fill(); c.stroke();
      c.restore();
    }
  }

  function drawSun(c) {
    var t = World.t;
    var r = 46 + Math.sin(t * 0.4) * 2.5;
    c.save();
    c.translate(W * 0.16, 150);
    c.globalAlpha = .22; c.fillStyle = INK.sun;
    c.beginPath(); c.arc(0, 0, r * 2.1, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = INK.sun; c.strokeStyle = INK.line; c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, r, 0, 6.2832); c.fill(); c.stroke();
    c.restore();
  }

  /* Fold creases. These live in SCREEN space, not world space — they are on
     the sheet you are looking at, not in the world you are looking into. */
  function drawCreases(c, vw, vh) {
    var t = World.t;
    var g = c.createLinearGradient(0, 0, vw, vh);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.33, 'rgba(90,70,40,0.055)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.37, 'rgba(0,0,0,0)');
    g.addColorStop(0.74, 'rgba(0,0,0,0)');
    g.addColorStop(0.76, 'rgba(90,70,40,0.045)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, vw, vh);

    /* a very slow sheen crossing the page, like light moving over paper */
    var k = (Math.sin(t * 0.09) + 1) / 2;
    var sh = c.createLinearGradient(vw * (k - 0.45), 0, vw * (k + 0.35), vh);
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0.07)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sh;
    c.fillRect(0, 0, vw, vh);
  }

  /* ------------------------------------------------------------------------
     A human, not a stick. Forward kinematics over a real skeleton: pelvis,
     spine, chest, neck, head, and limbs with two segments each. The gait is a
     proper run cycle — the pelvis drops twice per stride, the shoulders
     counter-rotate against the hips, the knees flex hardest through swing, and
     the head is held level because that is what people do.
     ------------------------------------------------------------------------ */

  var bone = PaperRig.bone, joint = PaperRig.joint, limbPts = PaperRig.limbPts;

  function drawHuman(c, m) {
    var isRun = m.behaviour === 'run';
    var cadence = isRun ? 8.6 : 4.4;
    var p = m.t * cadence;

    /* proportions, in units where the figure is ~104 tall */
    var THIGH = 26, SHIN = 25, FOOT = 9;
    var UPPER = 20, FORE = 19;
    var SPINE = 30, NECK = 7, HEADR = 10.5;

    /* --- gait ---------------------------------------------------------- */
    var amp = isRun ? 0.72 : 0.42;
    var hipL = Math.sin(p) * amp;
    var hipR = Math.sin(p + Math.PI) * amp;
    /* knee flexes hardest while the leg is swinging through */
    var kneeL = 0.18 + Math.max(0, -Math.sin(p - 0.7)) * (isRun ? 1.5 : 0.9);
    var kneeR = 0.18 + Math.max(0, -Math.sin(p + Math.PI - 0.7)) * (isRun ? 1.5 : 0.9);

    /* the body rises and falls twice per stride */
    var rise = -Math.abs(Math.sin(p)) * (isRun ? 9 : 4) - (isRun ? 4 : 0);
    /* hips and shoulders twist against each other */
    var hipTwist = Math.sin(p) * (isRun ? 0.13 : 0.07);
    var shoulderTwist = -hipTwist * 1.5;

    var lean = isRun ? 0.20 : 0.06;
    var crouch = 0;

    /* arms: opposite to the leg on the same side, elbow held bent */
    var armL = -hipL * (isRun ? 0.95 : 0.7);
    var armR = -hipR * (isRun ? 0.95 : 0.7);
    var elbowL = isRun ? 1.35 : 0.55;
    var elbowR = elbowL;

    /* --- defence overrides --------------------------------------------- */
    if (m.defend === 'duck')    { crouch = 16; lean = 0.42; armL = -1.9; armR = -1.5; elbowL = elbowR = 2.1; }
    if (m.defend === 'lean')    { lean = -0.30; armL = 1.5; armR = -0.9; elbowL = 1.7; elbowR = 1.0; }
    if (m.defend === 'deflect') { armL = -2.5; elbowL = 0.35; armR = 0.9; elbowR = 1.6; lean = 0.26; }

    /* --- skeleton ------------------------------------------------------- */
    var px = 0, py = -54 + rise + crouch;              // pelvis
    var cx = px - Math.sin(lean) * SPINE, cy = py - Math.cos(lean) * SPINE;  // chest
    var nx2 = cx - Math.sin(lean) * NECK, ny2 = cy - Math.cos(lean) * NECK;  // neck top
    /* the head stays level even though the torso is pitched forward */
    var hx2 = nx2 + Math.sin(lean) * 3, hy2 = ny2 - HEADR * 0.85;

    var hipOffL = Math.cos(hipTwist) * 6, hipOffR = -Math.cos(hipTwist) * 6;
    var shOffL = Math.cos(shoulderTwist) * 9, shOffR = -Math.cos(shoulderTwist) * 9;

    var legL = limbPts(px + hipOffL, py, hipL + lean * .3, THIGH, kneeL, SHIN);
    var legR = limbPts(px + hipOffR, py, hipR + lean * .3, THIGH, kneeR, SHIN);
    var armLp = limbPts(cx + shOffL, cy, armL + lean, UPPER, elbowL, FORE);
    var armRp = limbPts(cx + shOffR, cy, armR + lean, UPPER, elbowR, FORE);

    PaperRig.drawFigure(c, {
      hipL: hipL, kneeL: kneeL, hipR: hipR, kneeR: kneeR,
      armL: armL, elbowL: elbowL, armR: armR, elbowR: elbowR,
      lean: lean, rise: rise + crouch,
      hipTwist: hipTwist, shoulderTwist: shoulderTwist,
      tunic: m.hero ? INK.sun : (m.team === 'home' ? INK.green : INK.ember),
      limb: INK.paper, line: INK.line, lineWidth: m.hero ? 3.2 : 2.6
    });
  }

  function drawArcher(c, m) {
    var d = m.draw || 0;
    var sway = Math.sin(m.t * 1.3) * 0.02;
    var THIGH = 25, SHIN = 24, UPPER = 20, FORE = 19, SPINE = 29, NECK = 7, HEADR = 10;

    var px = 0, py = -52;
    var cx = px - Math.sin(sway) * SPINE, cy = py - Math.cos(sway) * SPINE;
    var nx2 = cx, ny2 = cy - NECK;

    /* a braced stance: front leg forward, back leg planted */
    var legF = limbPts(px + 5, py, 0.34, THIGH, 0.16, SHIN);
    var legB = limbPts(px - 5, py, -0.30, THIGH, 0.30, SHIN);
    /* bow arm locked out, string arm drawing back as the shot nears */
    var armBow = limbPts(cx - 8, cy, -1.42, UPPER, 0.10, FORE);
    var armStr = limbPts(cx + 8, cy, -1.05 + d * 0.45, UPPER, 1.30 - d * 0.55, FORE);

    c.strokeStyle = INK.line; c.lineWidth = 2.5; c.lineJoin = 'round';
    c.fillStyle = INK.paper;

    c.globalAlpha = .62;
    bone(c, px - 5, py, legB[0], legB[1], 7, 5);
    bone(c, legB[0], legB[1], legB[2], legB[3], 5, 3.6);
    bone(c, legB[2], legB[3], legB[2] - 9, legB[3] + 2, 3.6, 2.6);
    bone(c, cx + 8, cy, armStr[0], armStr[1], 5.2, 4);
    bone(c, armStr[0], armStr[1], armStr[2], armStr[3], 4, 2.8);
    c.globalAlpha = 1;

    c.fillStyle = INK.ember;
    bone(c, px, py, cx, cy, 9, 10.5);
    c.fillStyle = INK.paper;
    bone(c, px + 5, py, legF[0], legF[1], 7.2, 5);
    bone(c, legF[0], legF[1], legF[2], legF[3], 5, 3.6);
    bone(c, legF[2], legF[3], legF[2] + 9, legF[3] + 2, 3.6, 2.6);
    bone(c, cx - 8, cy, armBow[0], armBow[1], 5.4, 4);
    bone(c, armBow[0], armBow[1], armBow[2], armBow[3], 4, 2.8);
    bone(c, cx, cy, nx2, ny2, 4.4, 4);
    c.beginPath(); c.arc(nx2, ny2 - HEADR * .85, HEADR, 0, 6.2832); c.fill(); c.stroke();

    /* the bow, held in the locked-out hand, string pulled by the other */
    var bx = armBow[2], by = armBow[3];
    c.strokeStyle = INK.line; c.lineWidth = 3;
    c.beginPath(); c.arc(bx, by, 27, -1.3, 1.3); c.stroke();
    var tipUx = bx + 27 * Math.cos(-1.3), tipUy = by + 27 * Math.sin(-1.3);
    var tipDx = bx + 27 * Math.cos(1.3),  tipDy = by + 27 * Math.sin(1.3);
    var nockX = bx + 6 + d * 17, nockY = by;
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(tipUx, tipUy); c.lineTo(nockX, nockY); c.lineTo(tipDx, tipDy); c.stroke();
    if (d > 0.25) {                                  // the arrow on the string
      c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(nockX, nockY); c.lineTo(nockX - 34, nockY - 3); c.stroke();
    }
  }

  function drawUnit(c, m) {
    var bob = 0, tilt = 0;
    if (m.behaviour === 'fly') { bob = Math.sin(m.t * 2.2) * -30 - 300; tilt = Math.sin(m.t * 2.2) * .12; }

    c.save();
    c.translate(m.x, GROUND + m.y + bob);
    c.rotate(tilt);
    c.scale(m.face * m.scale, m.scale);

    c.globalAlpha = .16; c.fillStyle = INK.line;
    c.beginPath(); c.ellipse(0, 4, 26, 6, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;

    if (m.behaviour === 'fly') drawDragon(c, m.t, INK.green);
    else if (m.behaviour === 'archer') drawArcher(c, m);
    else drawHuman(c, m);

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

    /* sky wash — barely moves, so it reads as distance */
    c.save(); applyCam(c, s, vw, vh, 0.10);
    var g = c.createLinearGradient(0, -H, 0, H);
    g.addColorStop(0, '#f7d9b0'); g.addColorStop(0.55, '#dce9f7'); g.addColorStop(1, '#cfe8fa');
    c.fillStyle = g; c.fillRect(-W * 2, -H * 2, W * 5, H * 5);
    drawSun(c);
    c.restore();

    c.save(); applyCam(c, s, vw, vh, 0.18); drawClouds(c); c.restore();

    c.save(); applyCam(c, s, vw, vh, 0.38); drawHills(c, 1.2, INK.grass, 110); c.restore();
    c.save(); applyCam(c, s, vw, vh, 0.64); drawHills(c, 3.7, INK.green, 50); drawGrass(c, 90, 26, 3.1); c.restore();

    c.save();
    applyCam(c, s, vw, vh, 1);
    drawHills(c, 6.1, INK.green, 0);

    /* arrows */
    c.lineCap = 'round';
    for (var i = 0; i < World.an; i++) {
      if (World.astate[i] === 0) continue;
      var a, L = 30;
      if (World.astate[i] === 2) { a = -Math.PI / 2 + Math.sin(i) * .3; c.globalAlpha = clamp(1 - World.astuck[i] / 7, 0, 1); }
      else { a = Math.atan2(World.avy[i], World.avx[i]); c.globalAlpha = 1; }
      var dx = Math.cos(a) * L, dy = Math.sin(a) * L;
      c.strokeStyle = INK.line; c.lineWidth = 2.6;
      c.beginPath(); c.moveTo(World.ax[i] - dx, World.ay[i] - dy); c.lineTo(World.ax[i], World.ay[i]); c.stroke();
      if (World.astate[i] !== 2) {                       // fletching on live shafts
        c.strokeStyle = INK.ember; c.lineWidth = 1.7;
        c.beginPath();
        c.moveTo(World.ax[i] - dx, World.ay[i] - dy);
        c.lineTo(World.ax[i] - dx * 1.12 + dy * 0.17, World.ay[i] - dy * 1.12 - dx * 0.17);
        c.moveTo(World.ax[i] - dx, World.ay[i] - dy);
        c.lineTo(World.ax[i] - dx * 1.12 - dy * 0.17, World.ay[i] - dy * 1.12 + dx * 0.17);
        c.stroke();
      }
    }
    c.globalAlpha = 1;

    /* dust */
    for (var d = 0; d < World.dust.length; d++) {
      var pp = World.dust[d];
      c.globalAlpha = clamp(pp.life, 0, 1) * .45; c.fillStyle = INK.faint;
      c.beginPath(); c.arc(pp.x, pp.y, pp.r, 0, 6.2832); c.fill();
    }
    c.globalAlpha = 1;

    var list = World.units.slice().sort(function (a2, b2) { return a2.scale - b2.scale; });
    for (var u = 0; u < list.length; u++) drawUnit(c, list[u]);
    c.restore();

    /* foreground grass, moving more than the camera */
    c.save(); applyCam(c, s, vw, vh, 1.45); drawGrass(c, 120, 54, 7.7); c.restore();

    /* and finally the sheet you are holding */
    drawCreases(c, vw, vh);
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
