/* ==========================================================================
   THE DRAGONS OF THE WAR — #dragons
   The stir is CSS. A pointer gets it from .dragons__plate:hover; everyone
   else gets it from the "stir the plate" button, which this file wires up.
   Two small jobs and nothing else:
     1. hold every plate still while the bestiary is off screen
     2. run one gesture when the button is focused or pressed
   No rAF loop, no canvas, no interval. The shared runtime already inked
   the plates in with MP.enhance(document).
   ========================================================================== */
(function () {
  'use strict';

  var MP = window.MP;
  if (!MP || typeof MP.ready !== 'function') return;

  MP.ready(function () {
    var section = document.getElementById('dragons');
    if (!section) return;

    var beasts = MP.$$('.dragons__beast', section);
    if (!beasts.length) return;

    /* -- 1 · nothing stirs while nobody is looking ----------------------- */
    if (typeof window.IntersectionObserver === 'function') {
      new IntersectionObserver(function (entries) {
        var last = entries[entries.length - 1];
        if (last) section.classList.toggle('is-paused', !last.isIntersecting);
      }, { rootMargin: '160px 0px' }).observe(section);
    }

    /* -- 2 · one gesture, then the plate is a drawing again --------------
       Removing the class and forcing a reflow before re-adding it is what
       lets the reader ask twice in a row and see it twice. */
    var STIR_MS = 2800;

    function stir(beast) {
      if (!beast || MP.reduced.matches) return;
      if (beast.__stir) { window.clearTimeout(beast.__stir); beast.__stir = 0; }
      beast.classList.remove('is-stirring');
      void beast.offsetWidth;
      beast.classList.add('is-stirring');
      beast.__stir = window.setTimeout(function () {
        beast.classList.remove('is-stirring');
        beast.__stir = 0;
      }, STIR_MS);
    }

    function settle(beast) {
      if (!beast) return;
      if (beast.__stir) { window.clearTimeout(beast.__stir); beast.__stir = 0; }
      beast.classList.remove('is-stirring');
    }

    beasts.forEach(function (beast) {
      var btn = MP.$('.dragons__stir', beast);
      if (!btn) return;
      btn.addEventListener('click', function () { stir(beast); });
      btn.addEventListener('focus', function () { stir(beast); });
    });

    /* Reduced motion can be switched on without a reload. */
    if (typeof MP.reduced.addEventListener === 'function') {
      MP.reduced.addEventListener('change', function () {
        if (MP.reduced.matches) beasts.forEach(settle);
      });
    }
  });
})();
