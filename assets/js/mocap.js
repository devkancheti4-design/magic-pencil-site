/* ==========================================================================
   PAPER MIRROR — stand in front of the camera, and a drawing moves like you.

   MediaPipe BlazePose finds 33 landmarks on the person in the webcam frame.
   We do NOT train anything: pose estimation is a solved, commodity problem and
   Google gives away a model that runs in this tab.

   The only real work is RETARGETING — turning measured landmark positions into
   the joint angles the paper rig wants. That is just atan2 per limb, with the
   second-segment angle taken relative to its parent, plus smoothing because raw
   landmarks jitter.

   The video never leaves this machine. There is no upload, no server, no
   recording of the camera. The frames go from the webcam into the model in
   memory and are thrown away.
   ========================================================================== */
(function () {
  'use strict';

  var stage = document.getElementById('mirror');
  if (!stage) return;

  var $ = function (s) { return document.querySelector(s); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  var ctx = stage.getContext('2d');
  var video = $('#feed');
  var statusEl = $('#mirror-status');
  var startBtn = $('#mirror-start');
  var stopBtn = $('#mirror-stop');
  var skelToggle = $('#show-skeleton');
  var confEl = $('#mirror-conf');

  var W = 900, H = 640;
  var dpr = 1;

  function fit() {
    var box = stage.parentElement.getBoundingClientRect();
    var w = Math.max(280, box.width - 20);
    var h = Math.round(w * H / W);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    stage.width = Math.round(w * dpr); stage.height = Math.round(h * dpr);
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
  }
  fit();
  window.addEventListener('resize', (window.MP ? MP.debounce(fit, 160) : fit));

  function say(msg) { if (statusEl) statusEl.textContent = msg; }

  /* ---------------------------------------------------------- palette ---- */
  function css(n, f) { var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || f; }
  var INK = {};
  function refreshInk() {
    INK.line = css('--ink-900', '#241f1a');
    INK.paper = css('--paper-1', '#fdf6e6');
    INK.paper0 = css('--paper-0', '#fffdf7');
    INK.faint = css('--ink-300', '#9c8f7d');
    INK.green = css('--crayon-green', '#4a9b5e');
    INK.grass = css('--crayon-grass', '#7ec488');
    INK.sun = css('--crayon-sun', '#ffcc3e');
    INK.ember = css('--crayon-ember', '#e23d28');
  }
  refreshInk();
  new MutationObserver(refreshInk).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ====================================================== RETARGETING ==== */
  /* BlazePose landmark indices we care about. */
  var L = {
    nose: 0,
    shoulderL: 11, shoulderR: 12,
    elbowL: 13, elbowR: 14,
    wristL: 15, wristR: 16,
    hipL: 23, hipR: 24,
    kneeL: 25, kneeR: 26,
    ankleL: 27, ankleR: 28
  };

  /* The rig's convention: 0 points straight down, positive swings forward.
     x = sin(a), y = cos(a)  ->  a = atan2(dx, dy). */
  function angleFromDown(ax, ay, bx, by) {
    return Math.atan2(bx - ax, by - ay);
  }

  /* Exponential smoothing. Landmarks jitter a few pixels every frame; without
     this the drawing vibrates. Higher alpha = snappier but noisier. */
  var smooth = {};
  function ease(key, value, alpha) {
    if (smooth[key] == null || !isFinite(smooth[key])) { smooth[key] = value; return value; }
    /* take the shortest way round so angles never spin the long way */
    var d = value - smooth[key];
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    smooth[key] += d * alpha;
    return smooth[key];
  }

  /* Turn 33 landmarks into the handful of angles the rig wants. */
  function retarget(lm) {
    var g = function (i) { return lm[i]; };
    var mid = function (a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };

    var hipM = mid(g(L.hipL), g(L.hipR));
    var shM  = mid(g(L.shoulderL), g(L.shoulderR));

    /* Everything is normalised by torso length, so a person close to the camera
       and a person far away drive the rig identically. */
    var torso = Math.hypot(shM.x - hipM.x, shM.y - hipM.y) || 0.001;

    /* spine pitch: angle of hip->shoulder away from straight up */
    var lean = Math.atan2(shM.x - hipM.x, hipM.y - shM.y);

    /* MediaPipe mirrors the image, so their "left" is the side we draw near. */
    var a = {
      hipL:   angleFromDown(g(L.hipL).x,  g(L.hipL).y,  g(L.kneeL).x, g(L.kneeL).y),
      hipR:   angleFromDown(g(L.hipR).x,  g(L.hipR).y,  g(L.kneeR).x, g(L.kneeR).y),
      armL:   angleFromDown(g(L.shoulderL).x, g(L.shoulderL).y, g(L.elbowL).x, g(L.elbowL).y),
      armR:   angleFromDown(g(L.shoulderR).x, g(L.shoulderR).y, g(L.elbowR).x, g(L.elbowR).y),
      lean: lean
    };
    /* second segments are RELATIVE to their parent — that is what makes a knee
       behave like a knee rather than a second free hinge */
    a.kneeL  = angleFromDown(g(L.kneeL).x, g(L.kneeL).y, g(L.ankleL).x, g(L.ankleL).y) - a.hipL;
    a.kneeR  = angleFromDown(g(L.kneeR).x, g(L.kneeR).y, g(L.ankleR).x, g(L.ankleR).y) - a.hipR;
    a.elbowL = angleFromDown(g(L.elbowL).x, g(L.elbowL).y, g(L.wristL).x, g(L.wristL).y) - a.armL;
    a.elbowR = angleFromDown(g(L.elbowR).x, g(L.elbowR).y, g(L.wristR).x, g(L.wristR).y) - a.armR;

    /* shoulders and hips counter-rotate; read it off the real body */
    a.hipTwist = (g(L.hipL).x - g(L.hipR).x) / torso * 0.35;
    a.shoulderTwist = (g(L.shoulderL).x - g(L.shoulderR).x) / torso * 0.35;

    /* how high the pelvis sits, relative to a standing torso — this is what
       makes a real jump or crouch come through */
    a.rise = clamp((hipM.y - 0.62) * -260, -70, 70);
    a.x = hipM.x;
    a.torso = torso;

    var A = 0.35;    // smoothing strength
    ['hipL','hipR','kneeL','kneeR','armL','armR','elbowL','elbowR','lean','hipTwist','shoulderTwist'].forEach(function (k) {
      a[k] = ease(k, a[k], A);
    });
    a.rise = ease('rise', a.rise, 0.25);
    a.x = ease('x', a.x, 0.22);
    return a;
  }

  /* ========================================================== SCENERY ==== */
  function drawPaperWorld(c, vw, vh, t) {
    var g = c.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#f7d9b0'); g.addColorStop(0.55, '#dce9f7'); g.addColorStop(1, '#cfe8fa');
    c.fillStyle = g; c.fillRect(0, 0, vw, vh);

    /* sun */
    c.save();
    c.translate(vw * 0.16, vh * 0.18);
    c.globalAlpha = .22; c.fillStyle = INK.sun;
    c.beginPath(); c.arc(0, 0, 62, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = INK.sun; c.strokeStyle = INK.line; c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, 30, 0, 6.2832); c.fill(); c.stroke();
    c.restore();

    /* drifting paper clouds */
    c.lineWidth = 3; c.strokeStyle = INK.line; c.fillStyle = INK.paper;
    for (var i = 0; i < 4; i++) {
      var x = ((i * 300 + t * (6 + i * 3)) % (vw + 420)) - 200;
      var y = vh * (0.14 + (i % 3) * 0.09);
      c.save(); c.translate(x, y); c.scale(0.55, 0.55);
      c.beginPath();
      c.moveTo(-90, 18);
      c.bezierCurveTo(-118, 18, -120, -14, -88, -20);
      c.bezierCurveTo(-80, -50, -30, -56, -14, -32);
      c.bezierCurveTo(6, -58, 62, -48, 62, -18);
      c.bezierCurveTo(98, -16, 96, 18, 66, 18);
      c.closePath(); c.fill(); c.stroke();
      c.restore();
    }

    /* ground */
    var gy = vh * 0.80;
    c.fillStyle = INK.grass; c.strokeStyle = INK.line; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-20, vh + 20);
    for (var x2 = -20; x2 <= vw + 20; x2 += 40) {
      c.lineTo(x2, gy + Math.sin(x2 * 0.012 + 1.1) * 9 + Math.sin(t * 0.5 + x2 * 0.004) * 3);
    }
    c.lineTo(vw + 20, vh + 20); c.closePath(); c.fill(); c.stroke();

    /* grass leaning in the wind */
    c.lineWidth = 2.2; c.lineCap = 'round';
    for (var x3 = 0; x3 < vw; x3 += 46) {
      var w = Math.sin(t * 0.6 + x3 * 0.02) * 0.7;
      c.beginPath();
      c.moveTo(x3, gy + 14);
      c.quadraticCurveTo(x3 + w * 5, gy - 6, x3 + w * 13, gy - 20);
      c.stroke();
    }
    return gy;
  }

  function drawSkeleton(c, lm, vw, vh) {
    var bones = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
    c.strokeStyle = INK.ember; c.lineWidth = 2; c.globalAlpha = .85;
    bones.forEach(function (b) {
      c.beginPath();
      c.moveTo((1 - lm[b[0]].x) * vw, lm[b[0]].y * vh);
      c.lineTo((1 - lm[b[1]].x) * vw, lm[b[1]].y * vh);
      c.stroke();
    });
    c.fillStyle = INK.ember;
    for (var i = 0; i < lm.length; i++) {
      c.beginPath(); c.arc((1 - lm[i].x) * vw, lm[i].y * vh, 2.6, 0, 6.2832); c.fill();
    }
    c.globalAlpha = 1;
  }

  /* ============================================================ LOOP ===== */
  var landmarker = null, stream = null, running = false, raf = 0, t0 = performance.now();
  var lastPose = null, lastSeen = 0;

  function render() {
    var vw = stage.width / dpr, vh = stage.height / dpr;
    var t = (performance.now() - t0) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var gy = drawPaperWorld(ctx, vw, vh, t);

    if (lastPose) {
      var a = lastPose;
      /* mirror x so moving right moves the drawing right */
      var px = (1 - a.x) * vw;
      var scale = clamp(vh / 640 * 2.0, 0.9, 3.2);

      ctx.save();
      ctx.translate(clamp(px, 60, vw - 60), gy + 10);
      ctx.scale(scale, scale);
      ctx.globalAlpha = .16; ctx.fillStyle = INK.line;
      ctx.beginPath(); ctx.ellipse(0, 4, 26, 6, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
      PaperRig.drawFigure(ctx, {
        hipL: a.hipL, kneeL: a.kneeL, hipR: a.hipR, kneeR: a.kneeR,
        armL: a.armL, elbowL: a.elbowL, armR: a.armR, elbowR: a.elbowR,
        lean: a.lean, rise: a.rise,
        hipTwist: a.hipTwist, shoulderTwist: a.shoulderTwist,
        tunic: INK.sun, limb: INK.paper, line: INK.line, lineWidth: 3.2
      });
      ctx.restore();

      if (skelToggle && skelToggle.checked && lastPose.lm) {
        drawSkeleton(ctx, lastPose.lm, vw, vh);
      }
    } else {
      ctx.fillStyle = INK.line;
      ctx.font = '600 ' + Math.round(vh * 0.045) + 'px Caveat, cursive';
      ctx.textAlign = 'center';
      ctx.fillText('Step into the frame', vw / 2, vh * 0.45);
    }
  }

  function tick() {
    if (!running) return;
    if (landmarker && video.readyState >= 2) {
      var now = performance.now();
      try {
        var res = landmarker.detectForVideo(video, now);
        if (res && res.landmarks && res.landmarks.length) {
          var a = retarget(res.landmarks[0]);
          a.lm = res.landmarks[0];
          lastPose = a;
          lastSeen = now;
          if (confEl) confEl.textContent = 'tracking';
        } else if (now - lastSeen > 900) {
          lastPose = null;
          if (confEl) confEl.textContent = 'nobody in frame';
        }
      } catch (e) { /* a dropped frame is not worth killing the loop over */ }
    }
    render();
    raf = requestAnimationFrame(tick);
  }

  /* ============================================================ START ==== */
  async function start() {
    startBtn.disabled = true;
    try {
      say('Loading the pose model…');
      var vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
      var files = await vision.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
      landmarker = await vision.PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numPoses: 1
      });

      say('Asking for the camera…');
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }, audio: false
      });
      video.srcObject = stream;
      await video.play();

      running = true;
      startBtn.hidden = true;
      stopBtn.hidden = false;
      say('Move around. The drawing is copying your joint angles, not your picture.');
      tick();
    } catch (err) {
      startBtn.disabled = false;
      var m = String(err && err.name === 'NotAllowedError'
        ? 'You said no to the camera — nothing happens without it. Press the button again if you change your mind.'
        : 'Could not start: ' + (err && err.message ? err.message : err));
      say(m);
    }
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    if (stream) { stream.getTracks().forEach(function (tr) { tr.stop(); }); stream = null; }
    video.srcObject = null;
    lastPose = null;
    startBtn.hidden = false; startBtn.disabled = false;
    stopBtn.hidden = true;
    if (confEl) confEl.textContent = 'camera off';
    say('Camera stopped. Nothing was sent anywhere and nothing was kept.');
    render();
  }

  if (startBtn) startBtn.addEventListener('click', start);
  if (stopBtn) stopBtn.addEventListener('click', stop);

  /* Never leave the camera running when the page is hidden or the tab is left. */
  document.addEventListener('visibilitychange', function () { if (document.hidden && running) stop(); });
  window.addEventListener('pagehide', function () { if (running) stop(); });

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (startBtn) startBtn.disabled = true;
    say('This browser has no camera access. Chrome, Edge, Firefox or Safari on a device with a camera will work.');
  } else if (reduced.matches) {
    say('Reduced motion is on. The mirror still works — press the button when you are ready.');
  }

  render();
})();
