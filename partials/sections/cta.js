/* ==========================================================================
   CLOSING CALL (#play)
   Three small jobs: give each dragon its own wingbeat so they never march in
   time, stop every loop when the section is off-screen, and light the little
   dragon's fire when someone reaches for the button.
   No rAF loop, no canvas, no timers — the motion itself is all CSS.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('#play.cta');
  if (!root) return;

  var MP = window.MP || null;
  var rand = (MP && MP.rand) || function (a, b) { return a + Math.random() * (b - a); };

  /* -- 1. every dragon gets its own wingbeat, so they never fly in step ---
     Applied unconditionally: these are inert custom properties, and under
     prefers-reduced-motion the CSS has already set `animation: none`. Gating
     them on reduced.matches at load time would leave the dragons synchronised
     forever if the visitor turned reduced motion back off. */
  Array.prototype.forEach.call(root.querySelectorAll('.cta__dragon'), function (d, i) {
    var scale = rand(0.78, 1.32);
    if (!isFinite(scale)) scale = 1;
    d.style.setProperty('--flap-scale', scale.toFixed(3));
    d.style.setProperty('--flap-delay', Math.round(rand(0, 600) + i * 130) + 'ms');
  });

  /* -- 2. nothing loops while the last page is off-screen -----------------
     The pause lives in CSS behind .is-observed, so with JS off the dragons
     keep flying rather than freezing off-stage. Observed regardless of
     reduced motion: pausing an animation that is already `none` costs
     nothing, and it survives a runtime change to the media query. */
  if ('IntersectionObserver' in window) {
    root.classList.add('is-observed');
    var io = new IntersectionObserver(function (entries) {
      if (!entries.length) return;
      root.classList.toggle('is-live', entries[entries.length - 1].isIntersecting);
    }, { rootMargin: '200px 0px' });
    io.observe(root);
  }

  /* -- 3. reach for the button and the drawn dragon breathes -------------- */
  var go = root.querySelector('.cta__go');
  if (!go) return;

  function light() { root.classList.add('is-lit'); }
  function douse() { root.classList.remove('is-lit'); }

  go.addEventListener('pointerenter', function (e) {
    /* A tap fires pointerenter and then never a matching pointerleave, so the
       flame would stick on lit. Mouse only; touch users get it on focus. */
    if (e.pointerType && e.pointerType !== 'mouse') return;
    light();
  });
  go.addEventListener('pointerleave', douse);
  go.addEventListener('pointercancel', douse);
  go.addEventListener('focus', light);
  go.addEventListener('blur', douse);
})();
