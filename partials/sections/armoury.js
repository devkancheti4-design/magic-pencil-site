/* ==========================================================================
   THE ARMOURY — the ruled index filters the plate.
   Safe to load on a page that has no #armoury.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('armoury');
  if (!root) return;

  var qsa = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };

  var tabs = qsa('.armoury__tab');
  var figs = qsa('.armoury__fig');
  var out  = root.querySelector('[data-armoury-count]');
  if (!tabs.length || !figs.length) return;

  var WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
               'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
               'fourteen', 'fifteen', 'sixteen'];
  function word(n) { return WORDS[n] || String(n); }

  var NAMES = {
    edged: 'arms of the edge',
    hafted: 'hafted arms',
    missile: 'arms thrown or shot',
    defensive: 'defensive arms'
  };

  var total = figs.length;

  /* Count the plate rather than trust the numbers typed into it. */
  var counts = { all: total };
  figs.forEach(function (f) {
    var k = f.getAttribute('data-kind') || 'other';
    counts[k] = (counts[k] || 0) + 1;
  });
  tabs.forEach(function (t) {
    var n = t.querySelector('.armoury__tab-n');
    var k = t.getAttribute('data-filter') || 'all';
    if (n) n.textContent = counts[k] || 0;
  });

  function setText(el, str) { if (el && el.textContent !== str) el.textContent = str; }

  /* `source` is the button that asked for the change; if hiding a figure
     would strand the keyboard focus, it is handed back to that button. */
  function apply(kind, source) {
    var shown = 0;
    var stranded = false;
    var active = document.activeElement;

    figs.forEach(function (f) {
      if (kind === 'all' || f.getAttribute('data-kind') === kind) {
        f.removeAttribute('hidden');
        shown++;
        return;
      }
      if (active && f.contains(active)) stranded = true;
      f.setAttribute('hidden', '');
    });

    tabs.forEach(function (t) {
      t.setAttribute('aria-pressed',
        (t.getAttribute('data-filter') || 'all') === kind ? 'true' : 'false');
    });

    if (stranded && source && typeof source.focus === 'function') source.focus();

    setText(out, kind === 'all'
      ? 'All ' + word(total) + ' figures of the plate.'
      : word(shown) + ' of ' + word(total) + ' figures: ' + (NAMES[kind] || kind) + '.');
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      apply(t.getAttribute('data-filter') || 'all', t);
    });
  });

  /* Matches the text already in the markup, so the live region stays quiet
     until the reader actually filters something. */
  apply('all');
})();
