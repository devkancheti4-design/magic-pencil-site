/* ==========================================================================
   THE DRAGON ROOST — #dragons
   The wings, tails and fire are all CSS. This file does three things only:
     1. stops every loop while the roost is off screen
     2. gives the pointer-only "wake" a real, keyboard-operable button
     3. hands over the name, ready to type under a drawing
   No rAF loops, no canvas, no timers beyond one copy-confirmation reset.
   ========================================================================== */
(function () {
  'use strict';

  var MP = window.MP;
  if (!MP || typeof MP.ready !== 'function') return;

  MP.ready(function () {
    var section = document.getElementById('dragons');
    if (!section) return;

    var cards = MP.$$('.dragons__card', section);
    var live = MP.$('[data-dragons-live]', section);
    var hasIO = typeof window.IntersectionObserver === 'function';

    /* An identical string does not always get re-announced, and every card
       now offers the same two words — so clear, then set on the next frame. */
    function announce(msg) {
      if (!live) return;
      live.textContent = '';
      window.requestAnimationFrame(function () { live.textContent = msg; });
    }

    /* -- 1 · nothing animates while nobody can see it --------------------- */
    if (hasIO) {
      new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          section.classList.toggle('is-paused', !entries[i].isIntersecting);
        }
      }, { rootMargin: '160px 0px' }).observe(section);
    }

    /* -- 2 · "wake it up" — the keyboard's version of hover ---------------- */
    MP.$$('.dragons__wake', section).forEach(function (btn) {
      var card = btn.closest ? btn.closest('.dragons__card') : null;
      if (!card) return;
      btn.addEventListener('click', function () {
        var on = !card.classList.contains('is-awake');
        card.classList.toggle('is-awake', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });

    /* -- 3 · a coarse pointer has no hover at all -------------------------
       Wake whichever card is crossing the middle of the screen. The margin
       (not a ratio) is what makes this work for a card taller than the
       viewport, which a 320px phone reaches easily. */
    var seenIO = null;

    function bindSeen() {
      if (seenIO || !hasIO || MP.fine.matches || MP.reduced.matches) return;
      seenIO = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          entries[i].target.classList.toggle('is-seen', entries[i].isIntersecting);
        }
      }, { rootMargin: '-38% 0px -38% 0px', threshold: 0 });
      cards.forEach(function (c) { seenIO.observe(c); });
    }

    function unbindSeen() {
      if (!seenIO) return;
      seenIO.disconnect();
      seenIO = null;
      cards.forEach(function (c) { c.classList.remove('is-seen'); });
    }

    bindSeen();

    /* Somebody can turn reduced motion on without reloading. */
    if (typeof MP.reduced.addEventListener === 'function') {
      MP.reduced.addEventListener('change', function () {
        if (MP.reduced.matches) {
          unbindSeen();
          MP.$$('.dragons__wake', section).forEach(function (btn) {
            btn.setAttribute('aria-pressed', 'false');
          });
          cards.forEach(function (c) { c.classList.remove('is-awake'); });
        } else {
          bindSeen();
        }
      });
    }

    /* -- 4 · copy the name ------------------------------------------------ */
    function legacyCopy(text) {
      return new Promise(function (resolve, reject) {
        var active = document.activeElement;
        var ta = document.createElement('textarea');
        var ok = false;
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.setAttribute('aria-hidden', 'true');
        ta.tabIndex = -1;
        ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
        document.body.appendChild(ta);
        try {
          ta.select();
          ok = document.execCommand('copy');
        } catch (e) {
          ok = false;
        }
        document.body.removeChild(ta);
        if (active && typeof active.focus === 'function') {
          try { active.focus({ preventScroll: true }); } catch (e2) { active.focus(); }
        }
        if (ok) resolve();
        else reject(new Error('copy-unavailable'));
      });
    }

    function copy(text) {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text).catch(function () {
          return legacyCopy(text);
        });
      }
      return legacyCopy(text);
    }

    MP.$$('.dragons__copy', section).forEach(function (btn) {
      var name = (btn.getAttribute('data-copy') || '').trim();
      if (!name) return;
      var timer = 0;
      btn.addEventListener('click', function () {
        copy(name).then(function () {
          btn.classList.add('is-copied');
          announce('Copied "' + name + '". Type it under your drawing.');
          window.clearTimeout(timer);
          timer = window.setTimeout(function () {
            btn.classList.remove('is-copied');
          }, 1800);
        }, function () {
          announce('Could not copy it. The name is "' + name + '".');
        });
      });
    });

    /* The runtime measures the strokes and binds the reveals. */
    MP.enhance(section);
  });
})();
