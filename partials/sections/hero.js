/* ==========================================================================
   HERO — the cover of the book.
   One job: re-frame the woodcut so it still reads on a narrow leaf.
   Every line of the drawing is drawn by the shared runtime; the rest of the
   cover is CSS. Nothing here loops, so nothing here needs pausing.
   Safe to load when the hero is absent from the page.
   ========================================================================== */
(function () {
  'use strict';

  function boot() {
    var root = document.getElementById('hero');
    if (!root || !root.classList.contains('hero')) return;
    if (!window.matchMedia) return;

    /* The plate is cut from one 1200 x 1200 block. A wide leaf shows the
       whole scene; a narrow one crops in on Iries and the pencil. The runtime
       measures paths in user units, so re-framing after measureStrokes is
       harmless, and every crop scales the block DOWN — never up — so the
       dash lengths stay long enough to cover each path. */
    var plate = root.querySelector('[data-vb]');
    if (!plate) return;

    var WIDE = '0 20 1200 1010';
    var VIEWS = [
      { m: window.matchMedia('(max-width: 619px)'), vb: '372 150 604 1040' },
      { m: window.matchMedia('(max-width: 999px)'), vb: '150 40 1000 1080' }
    ];

    var applied = null;
    function frame() {
      var vb = WIDE, i;
      for (i = 0; i < VIEWS.length; i++) {
        if (VIEWS[i].m.matches) { vb = VIEWS[i].vb; break; }
      }
      if (vb === applied) return;          /* do not touch the DOM for nothing */
      applied = vb;
      plate.setAttribute('viewBox', vb);
    }

    /* Crossing 620px or 1000px flips exactly one query, so listening to both
       covers every transition once. */
    for (var j = 0; j < VIEWS.length; j++) {
      var q = VIEWS[j].m;
      if (q.addEventListener) q.addEventListener('change', frame);
      else if (q.addListener) q.addListener(frame);
    }
    frame();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
