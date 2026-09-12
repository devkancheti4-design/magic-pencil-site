/* ==========================================================================
   PAPER RIG — the one definition of how a paper human is drawn.

   The rig takes ANGLES, never poses. That is the whole point: the battle feeds
   it angles invented by a gait function, and the webcam page feeds it angles
   measured off a real person. Neither knows about the other, and the drawing
   comes out identical.

   Angles are measured from straight-down, positive swinging forward.
   Second-segment angles (knee, elbow) are RELATIVE to their parent segment.
   ========================================================================== */
(function () {
  'use strict';

  /* A tapered bone: thick at the root, thinner at the tip. */
  function bone(c, x1, y1, x2, y2, w1, w2) {
    var dx = x2 - x1, dy = y2 - y1;
    var L = Math.hypot(dx, dy) || 1;
    var nx = -dy / L, ny = dx / L;
    c.beginPath();
    c.moveTo(x1 + nx * w1, y1 + ny * w1);
    c.lineTo(x2 + nx * w2, y2 + ny * w2);
    c.lineTo(x2 - nx * w2, y2 - ny * w2);
    c.lineTo(x1 - nx * w1, y1 - ny * w1);
    c.closePath();
    c.fill(); c.stroke();
  }

  function joint(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); c.stroke(); }

  /* Two-segment limb. Returns [kneeX, kneeY, footX, footY]. */
  function limbPts(hx, hy, a1, l1, a2, l2) {
    var kx = hx + Math.sin(a1) * l1, ky = hy + Math.cos(a1) * l1;
    var fx = kx + Math.sin(a1 + a2) * l2, fy = ky + Math.cos(a1 + a2) * l2;
    return [kx, ky, fx, fy];
  }

  var P = { THIGH: 26, SHIN: 25, FOOT: 9, UPPER: 20, FORE: 19, SPINE: 30, NECK: 7, HEADR: 10.5 };

  /**
   * Draw a paper human at the current transform origin (feet at 0,0).
   * o = {
   *   hipL, kneeL, hipR, kneeR,     leg angles (radians)
   *   armL, elbowL, armR, elbowR,   arm angles
   *   lean,                          spine pitch
   *   rise,                          vertical offset of the pelvis (negative = up)
   *   hipTwist, shoulderTwist,       counter-rotation
   *   tunic, limb, line,             colours
   *   lineWidth, hair
   * }
   */
  function drawFigure(c, o) {
    var lean = o.lean || 0;
    var rise = o.rise || 0;
    var hipTwist = o.hipTwist || 0;
    var shoulderTwist = o.shoulderTwist || 0;

    var px = 0, py = -54 + rise;
    var cx = px - Math.sin(lean) * P.SPINE, cy = py - Math.cos(lean) * P.SPINE;
    var nx = cx - Math.sin(lean) * P.NECK,  ny = cy - Math.cos(lean) * P.NECK;
    /* the head is held level even though the torso is pitched */
    var hx = nx + Math.sin(lean) * 3, hy = ny - P.HEADR * 0.85;

    var hipOffL = Math.cos(hipTwist) * 6,  hipOffR = -Math.cos(hipTwist) * 6;
    var shOffL  = Math.cos(shoulderTwist) * 9, shOffR = -Math.cos(shoulderTwist) * 9;

    var legL = limbPts(px + hipOffL, py, (o.hipL || 0) + lean * .3, P.THIGH, o.kneeL || 0, P.SHIN);
    var legR = limbPts(px + hipOffR, py, (o.hipR || 0) + lean * .3, P.THIGH, o.kneeR || 0, P.SHIN);
    var armL = limbPts(cx + shOffL, cy, (o.armL || 0) + lean, P.UPPER, o.elbowL || 0, P.FORE);
    var armR = limbPts(cx + shOffR, cy, (o.armR || 0) + lean, P.UPPER, o.elbowR || 0, P.FORE);

    c.strokeStyle = o.line;
    c.lineWidth = o.lineWidth || 3;
    c.lineJoin = 'round';

    /* far side first and dimmed, so the body has volume */
    c.globalAlpha = 0.62;
    c.fillStyle = o.limb;
    bone(c, px + hipOffR, py, legR[0], legR[1], 7, 5);
    bone(c, legR[0], legR[1], legR[2], legR[3], 5, 3.6);
    bone(c, legR[2], legR[3], legR[2] + P.FOOT, legR[3] + 2, 3.6, 2.6);
    bone(c, cx + shOffR, cy, armR[0], armR[1], 5.4, 4);
    bone(c, armR[0], armR[1], armR[2], armR[3], 4, 2.8);
    c.globalAlpha = 1;

    /* torso — the tunic */
    c.fillStyle = o.tunic;
    bone(c, px, py, cx, cy, 9.5, 11);

    /* near side */
    c.fillStyle = o.limb;
    bone(c, px + hipOffL, py, legL[0], legL[1], 7.5, 5.2);
    bone(c, legL[0], legL[1], legL[2], legL[3], 5.2, 3.8);
    bone(c, legL[2], legL[3], legL[2] + P.FOOT, legL[3] + 2, 3.8, 2.8);
    joint(c, legL[0], legL[1], 3.2);

    bone(c, cx + shOffL, cy, armL[0], armL[1], 5.6, 4.2);
    bone(c, armL[0], armL[1], armL[2], armL[3], 4.2, 3);
    joint(c, armL[0], armL[1], 2.8);

    /* neck + head */
    bone(c, cx, cy, nx, ny, 4.5, 4);
    c.beginPath(); c.arc(hx, hy, P.HEADR, 0, 6.2832); c.fill(); c.stroke();

    if (o.hair !== false) {
      c.beginPath();
      c.moveTo(hx - P.HEADR * .9, hy - P.HEADR * .3);
      c.quadraticCurveTo(hx - P.HEADR * .4, hy - P.HEADR * 1.5, hx + P.HEADR * .95, hy - P.HEADR * .45);
      c.lineWidth = 2.4; c.stroke();
    }
  }

  window.PaperRig = { bone: bone, joint: joint, limbPts: limbPts, drawFigure: drawFigure, P: P };
})();
