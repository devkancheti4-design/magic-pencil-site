/* ==========================================================================
   THE CHRONICLE — the reader's marks, the running index, and the wide leaf.
   Nothing here is required to read the chapters; with JS off the index is
   six anchors and the map is a scrollable picture.
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'mp-chronicle-read';
  var WORDS = ['None', 'One', 'Two', 'Three', 'Four', 'Five'];

  function init() {
    var root = document.getElementById('chronicle');
    if (!root) return;

    var MP = window.MP || {};
    var $$ = MP.$$ || function (s, c) {
      return Array.prototype.slice.call((c || document).querySelectorAll(s));
    };
    var reduced = MP.reduced ||
      (window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false });
    var debounce = MP.debounce || function (fn, ms) {
      var t; return function () { clearTimeout(t); t = setTimeout(fn, ms || 150); };
    };
    var rafThrottle = MP.raf || function (fn) {
      var q = false;
      return function () {
        if (q) return; q = true;
        requestAnimationFrame(function () { q = false; fn(); });
      };
    };

    var hasIO = 'IntersectionObserver' in window;
    var links = $$('[data-chronicle-toc]', root);
    var chapters = $$('.chronicle__chapter', root);
    var feet = $$('.chronicle__foot', root);
    var tally = root.querySelector('[data-chronicle-tally]');
    var clearBtn = root.querySelector('[data-chronicle-clear]');
    var footIO = null;

    /* ------------------------------------------------ the reader's marks -- */
    var known = links.map(function (a) { return a.getAttribute('data-chronicle-toc'); });
    var read = load();

    function load() {
      var out = [];
      try {
        var raw = window.localStorage.getItem(KEY);
        var list = raw ? JSON.parse(raw) : [];
        if (Object.prototype.toString.call(list) === '[object Array]') {
          list.forEach(function (id) {
            if (known.indexOf(id) > -1 && out.indexOf(id) < 0) out.push(id);
          });
        }
      } catch (e) { /* no shelf to keep it on; the marks last the session */ }
      return out;
    }
    function save() {
      try { window.localStorage.setItem(KEY, JSON.stringify(read)); } catch (e) {}
    }

    function paint() {
      links.forEach(function (a) {
        var id = a.getAttribute('data-chronicle-toc');
        var done = read.indexOf(id) > -1;
        a.classList.toggle('is-read', done);
        var state = a.querySelector('.chronicle__toc-state');
        if (state) state.textContent = done ? 'marked as read' : 'not yet marked';
      });
      if (!tally) return;
      var n = Math.min(read.length, 6);
      tally.textContent = n === 0
        ? 'None of the six leaves marked.'
        : n === 6
          ? 'All six leaves marked. The book is read.'
          : WORDS[n] + ' of the six leaves marked.';
    }

    function mark(id) {
      if (!id || known.indexOf(id) < 0 || read.indexOf(id) > -1) return;
      read.push(id);
      save();
      paint();
    }

    paint();

    /* ---- a leaf marks itself when the reader reaches the foot of it ------- */
    if (hasIO && feet.length) {
      footIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var chapter = en.target.closest ? en.target.closest('.chronicle__chapter') : null;
          if (chapter) mark(chapter.id);
          footIO.unobserve(en.target);
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.9 });
      feet.forEach(function (f) { footIO.observe(f); });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        read = [];
        save();
        paint();
        /* re-arm the feet, or the marks could never be made again */
        if (footIO) feet.forEach(function (f) { footIO.observe(f); });
      });
    }

    /* ---- which leaf is open in front of the reader ------------------------ */
    function setCurrent(id) {
      links.forEach(function (a) {
        if (id && a.getAttribute('data-chronicle-toc') === id) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    }

    if (hasIO && chapters.length) {
      var here = {};
      var hereIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { here[en.target.id] = en.isIntersecting; });
        var open = null;
        for (var i = 0; i < chapters.length; i++) {
          if (here[chapters[i].id]) { open = chapters[i].id; break; }
        }
        setCurrent(open);
      }, { rootMargin: '-42% 0px -42% 0px', threshold: 0 });
      chapters.forEach(function (c) { hereIO.observe(c); });
    }

    /* ---- the index sends the reader to the leaf, and the focus with it ---- */
    var focusTimer = 0;
    links.forEach(function (a) {
      a.addEventListener('click', function () {
        var id = a.getAttribute('data-chronicle-toc');
        var target = document.getElementById(id);
        if (!target) return;
        setCurrent(id);
        if (!hasIO) mark(id);
        clearTimeout(focusTimer);
        focusTimer = window.setTimeout(function () {
          try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
        }, reduced.matches ? 0 : 640);
      });
    });

    /* --------------------------------------------------- the wide leaf ----- */
    var fig = root.querySelector('.chronicle__mapfig');
    var scroller = root.querySelector('.chronicle__mapscroll');

    if (fig && scroller) {
      var sync = function () {
        var over = scroller.scrollWidth - scroller.clientWidth > 8;
        fig.classList.toggle('is-scrollable', over);
        fig.classList.toggle(
          'is-end',
          scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 8
        );
      };
      var onScroll = rafThrottle(sync);

      scroller.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', debounce(sync, 160));
      sync();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);
    }
  }

  if (window.MP && window.MP.ready) window.MP.ready(init);
  else if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
