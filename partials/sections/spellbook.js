/* ==========================================================================
   THE SPELLBOOK — filter the index, turn the page, draw the word.
   Safe to load on a page that has no #spellbook.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('spellbook');
  if (!root) return;

  var MP = window.MP || {};
  var reduced = MP.reduced || window.matchMedia('(prefers-reduced-motion: reduce)');
  var qs = function (s, c) { return (c || root).querySelector(s); };
  var qsa = function (s, c) { return Array.prototype.slice.call((c || root).querySelectorAll(s)); };

  var input    = qs('.spellbook__input');
  var clearBtn = qs('.spellbook__clear');
  var list     = qs('.spellbook__list');
  var turn     = qs('.spellbook__turn');
  var spread   = qs('.spellbook__spread');
  var emptyRow = qs('.spellbook__empty');
  var countEl  = qs('[data-sb-count]');
  var totalEl  = qs('[data-sb-total]');
  var kickerEl = qs('[data-sb-kicker]');
  var wordEl   = qs('[data-sb-word]');
  var effectEl = qs('[data-sb-effect]');
  var tipEl    = qs('[data-sb-tip]');

  /* Every element the code writes to, guarded in one place. */
  if (!input || !list || !turn || !kickerEl || !wordEl || !effectEl || !tipEl) return;

  /* ---- the copy that lives only in JS: the word the pencil doesn't know --- */
  var UNKNOWN = {
    kicker: 'not in the book',
    effect: 'Not one of the words the game spells out. Name it anyway — it still comes alive.',
    tip: 'Then the shape does all the talking: bigger is tougher, more legs is faster, spikes are damage, a closed coloured-in body is armour, and more detail earns a masterpiece bonus.'
  };
  var KNOWN_KICKER = 'the pencil knows this one';

  /* ------------------------------------------------------------- index ---- */
  var rows = qsa('.spellbook__row[data-word]');
  if (!rows.length) return;

  var book = {};
  var order = [];
  rows.forEach(function (row) {
    var key = row.getAttribute('data-word');
    if (!key || book[key]) return;
    var term = qs('.spellbook__term', row);
    var gloss = qs('.spellbook__gloss', row);
    var effect = gloss ? gloss.textContent.replace(/\s+/g, ' ').trim() : '';
    var alt = row.getAttribute('data-alt') || '';
    book[key] = {
      key: key,
      row: row,
      btn: qs('.spellbook__entry', row),
      label: term ? term.textContent.replace(/\s+/g, ' ').trim() : key,
      effect: effect,
      tip: row.getAttribute('data-tip') || '',
      hay: (key + ' ' + alt + ' ' + effect).toLowerCase()
    };
    order.push(key);
  });
  if (!order.length) return;

  var figs = {};
  qsa('.spellbook__fig').forEach(function (f) {
    var k = f.getAttribute('data-word');
    if (k) figs[k] = f;
  });

  var state = { key: order[0], raw: '', visible: order.slice(), onscreen: false };

  /* Writing identical text back into the live region would re-announce it. */
  function setText(el, str) { if (el.textContent !== str) el.textContent = str; }
  function reflow(el) { return el.getBoundingClientRect().width; }

  /* --------------------------------------------------------- the drawing -- */
  function prepare(fig) {
    if (!fig || fig.__sbPrepared) return;
    qsa('.stroke', fig).forEach(function (p, i) {
      if (!p.style.getPropertyValue('--len') && typeof p.getTotalLength === 'function') {
        try {
          var len = Math.ceil(p.getTotalLength());
          if (len > 0) p.style.setProperty('--len', len);
        } catch (e) { /* not a measurable shape */ }
      }
      p.style.setProperty('--draw-delay', Math.min(i * 34, 620) + 'ms');
    });
    fig.__sbPrepared = true;
  }

  function draw(fig) {
    if (!fig || fig.classList.contains('is-drawn')) return;
    prepare(fig);
    reflow(fig);
    fig.classList.add('is-drawn');
  }

  function showFig(key) {
    var next = figs[key] || figs.__unknown;
    if (!next) return;
    Object.keys(figs).forEach(function (k) {
      var f = figs[k];
      if (f === next) return;
      f.classList.remove('is-live', 'is-drawn');
      f.setAttribute('aria-hidden', 'true');
    });
    prepare(next);
    next.classList.remove('is-drawn');
    next.classList.add('is-live');
    next.removeAttribute('aria-hidden');
    /* Off screen it stays undrawn on purpose; wake() draws it on arrival. */
    if (state.onscreen) draw(next);
  }

  function flourish() {
    if (reduced.matches) return;
    turn.classList.remove('is-turning');
    reflow(turn);
    turn.classList.add('is-turning');
  }
  turn.addEventListener('animationend', function (e) {
    if (e.target === turn) turn.classList.remove('is-turning');
  });

  /* ------------------------------------------------------------ choosing -- */
  function markCurrent(key) {
    order.forEach(function (k) {
      var btn = book[k].btn;
      if (btn) btn.setAttribute('aria-current', k === key ? 'true' : 'false');
    });
  }

  function select(key, opts) {
    opts = opts || {};
    var entry = book[key];
    if (!entry) return;
    if (state.key === key && !opts.force) return;
    state.key = key;
    state.raw = '';
    markCurrent(key);
    setText(kickerEl, KNOWN_KICKER);
    setText(wordEl, entry.label);
    setText(effectEl, entry.effect);
    setText(tipEl, entry.tip);
    showFig(key);
    if (!opts.quiet) flourish();
    if (opts.scroll && entry.row.scrollIntoView) {
      entry.row.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
    }
  }

  function clip(s) { return s.length > 22 ? s.slice(0, 21) + '…' : s; }

  function selectUnknown(raw) {
    if (state.key === null && state.raw === raw) return;
    state.key = null;
    state.raw = raw;
    markCurrent(null);
    setText(kickerEl, UNKNOWN.kicker);
    setText(wordEl, raw ? clip(raw) : 'that word');
    setText(effectEl, UNKNOWN.effect);
    setText(tipEl, UNKNOWN.tip);
    showFig('__unknown');
    flourish();
  }

  function focusEntry(key) {
    var entry = book[key];
    if (entry && entry.btn) entry.btn.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------ filtering - */
  function filter() {
    var raw = input.value.trim();
    var q = raw.toLowerCase();
    var visible = [];

    order.forEach(function (k) {
      var entry = book[k];
      var hit = !q || entry.hay.indexOf(q) !== -1;
      entry.row.hidden = !hit;
      if (hit) visible.push(k);
    });

    state.visible = visible;
    if (countEl) setText(countEl, String(visible.length));
    if (emptyRow) emptyRow.hidden = visible.length !== 0;
    if (clearBtn) clearBtn.hidden = !raw;

    if (!visible.length) { selectUnknown(raw); return; }
    if (state.key === null || visible.indexOf(state.key) === -1) select(visible[0]);
  }

  function step(from, dir) {
    var vis = state.visible;
    if (!vis.length) return null;
    var i = vis.indexOf(from);
    if (i === -1) return dir > 0 ? vis[0] : vis[vis.length - 1];
    return vis[(i + dir + vis.length) % vis.length];
  }

  /* --------------------------------------------------------------- wires -- */
  input.addEventListener('input', filter);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!state.visible.length) return;
      e.preventDefault();
      var to = step(state.key, e.key === 'ArrowDown' ? 1 : -1);
      if (!to) return;
      select(to, { scroll: true });
      focusEntry(to);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (state.visible.length) focusEntry(state.key || state.visible[0]);
    } else if (e.key === 'Escape' && input.value) {
      e.preventDefault();
      input.value = '';
      filter();
    }
  });

  list.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('.spellbook__entry') : null;
    if (!btn || !list.contains(btn)) return;
    var row = btn.closest('.spellbook__row');
    if (row) select(row.getAttribute('data-word'));
  });

  list.addEventListener('keydown', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('.spellbook__entry') : null;
    if (!btn) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      input.focus();
      input.select();
      return;
    }
    var vis = state.visible;
    if (!vis.length) return;
    var row = btn.closest('.spellbook__row');
    var here = row ? row.getAttribute('data-word') : state.key;
    var to = null;
    if (e.key === 'ArrowDown') to = step(here, 1);
    else if (e.key === 'ArrowUp') to = step(here, -1);
    else if (e.key === 'Home') to = vis[0];
    else if (e.key === 'End') to = vis[vis.length - 1];
    else return;
    if (!to) return;
    e.preventDefault();
    select(to, { scroll: true });
    focusEntry(to);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      input.value = '';
      /* Move focus BEFORE filter() hides this button, or focus falls to body. */
      input.focus();
      filter();
    });
  }

  /* ------------------------------------------------- on screen / off it --- */
  function wake(on) {
    state.onscreen = on;
    root.classList.toggle('is-onscreen', on);
    if (!on) return;
    /* Always draw whatever is live now — it may have been chosen off screen. */
    draw(qs('.spellbook__fig.is-live'));
  }

  function start() {
    root.classList.add('is-armed');
    if (MP.enhance) { try { MP.enhance(root); } catch (e) {} }
    if (totalEl) setText(totalEl, String(order.length));

    /* filter() honours any value the browser restored into the input. */
    filter();
    if (state.key !== null) select(state.key, { force: true, quiet: true });

    if ('IntersectionObserver' in window && spread) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { wake(en.isIntersecting); });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
      io.observe(spread);
    } else {
      wake(true);
    }
  }

  if (MP.ready) MP.ready(start);
  else if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);
})();
