/* ==========================================================================
   THE READER — narration for the Chronicle.

   The page is a document first. This turns it into a told story: press play
   and it reads the chapters aloud, lights the word it is saying, draws each
   illustration as it reaches it, and moves itself along.

   It uses the browser's own speech synthesis. Nothing is downloaded, nothing
   is sent anywhere, and there are no audio files — the voice is the one
   already installed on the machine.

   Honest limits, handled rather than hidden:
     - getVoices() is async in Chrome; we wait for onvoiceschanged.
     - Long utterances get cut off in some engines, so every beat is split
       into sentences and queued.
     - iOS needs a user gesture to start and is fussy about resuming.
     - If there is no speech engine at all, the bar hides itself and the
       chronicle is simply a page you read with your eyes.
   ========================================================================== */
(function () {
  'use strict';

  var synth = window.speechSynthesis;
  var bar = document.getElementById('reader');
  if (!bar) return;

  /* No engine: leave a readable document and say so once, quietly. */
  if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
    bar.hidden = true;
    return;
  }

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  var playBtn = $('#reader-play');
  var prevBtn = $('#reader-prev');
  var nextBtn = $('#reader-next');
  var stopBtn = $('#reader-stop');
  var whereEl = $('#reader-where');
  var voiceSel = $('#reader-voice');
  var rateInput = $('#reader-rate');
  var rateOut = $('#reader-rate-out');
  var liveEl = $('#reader-live');

  /* ------------------------------------------------------------- beats --- */
  /* A beat is one thing the narrator says. Marked in the markup with
     data-narrate; data-narrate-text overrides what is spoken, so an
     illustration can be narrated without having visible prose. */
  var beats = [];
  function collect() {
    beats = $$('[data-narrate]').filter(function (el) {
      /* Anything hidden from sight is a duplicate description of something
         already on the page — reading it aloud would say everything twice. */
      if (el.closest('.sr-only, [aria-hidden="true"], [data-no-narrate]')) return false;
      return true;
    }).map(function (el, i) {
      var spoken = el.getAttribute('data-narrate-text');
      return {
        el: el,
        index: i,
        label: el.getAttribute('data-narrate-label') || '',
        spoken: spoken,
        prepared: false,
        sentences: null
      };
    });
  }

  /* Wrap every word in its own span so the spoken word can be lit, without
     destroying nested markup — we only ever touch text nodes. */
  function prepare(beat) {
    if (beat.prepared) return;
    beat.prepared = true;

    if (beat.spoken != null) {                 /* narration only, no highlighting */
      beat.sentences = split(beat.spoken, 0);
      beat.words = [];
      return;
    }

    var walker = document.createTreeWalker(beat.el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        /* never narrate things that are not prose */
        if (n.parentElement.closest('svg, .sr-only, [aria-hidden="true"], [data-no-narrate]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);

    /* The spoken string is built HERE, already normalised, and every word
       records its offset into THAT string. Normalising afterwards was a real
       bug: a paragraph indented in the source begins with whitespace, trim()
       then shifted the whole text by one character and no word ever matched
       its own boundary event. Headings were unaffected, which is why it hid. */
    var full = '', words = [];
    nodes.forEach(function (node) {
      var parts = node.nodeValue.split(/(\s+)/);
      var frag = document.createDocumentFragment();
      parts.forEach(function (p) {
        if (!p) return;
        if (/^\s+$/.test(p)) {
          frag.appendChild(document.createTextNode(p));
          /* one space between words, never one before the first */
          if (full && full.slice(-1) !== ' ') full += ' ';
          return;
        }
        var span = document.createElement('span');
        span.className = 'w';
        span.textContent = p;
        frag.appendChild(span);
        words.push({ span: span, start: full.length, end: full.length + p.length });
        full += p;
      });
      node.parentNode.replaceChild(frag, node);
    });

    beat.words = words;
    /* only a trailing space may be shed — trailing characters shift nothing */
    beat.text = full.replace(/\s+$/, '');
    beat.sentences = split(beat.text, 0);
  }

  /* Split into sentences, keeping each one's offset into the beat, because
     charIndex from onboundary is relative to the utterance being spoken. */
  function split(text, base) {
    var out = [], re = /[^.!?…]+[.!?…]*\s*/g, m;
    while ((m = re.exec(text)) !== null) {
      var t = m[0];
      if (!t.trim()) continue;
      out.push({ text: t.trim(), start: base + m.index });
      if (re.lastIndex === m.index) re.lastIndex++;   /* never loop forever */
    }
    if (!out.length && text.trim()) out.push({ text: text.trim(), start: base });
    return out;
  }

  /* ------------------------------------------------------------ voices --- */
  var voices = [], chosen = null;
  function loadVoices() {
    voices = (synth.getVoices() || []).filter(function (v) { return /^en/i.test(v.lang); });
    if (!voices.length) voices = synth.getVoices() || [];
    if (!voiceSel) return;
    var keep = voiceSel.value;
    voiceSel.innerHTML = voices.map(function (v, i) {
      return '<option value="' + i + '">' + v.name.replace(/\s*\(.*\)$/, '') + '</option>';
    }).join('');
    /* prefer a natural-sounding one where the platform offers it */
    var pref = voices.findIndex(function (v) {
      return /natural|neural|enhanced|premium|siri|google uk|google us/i.test(v.name);
    });
    voiceSel.value = keep && voices[keep] ? keep : (pref >= 0 ? pref : 0);
    chosen = voices[voiceSel.value] || voices[0] || null;
  }
  loadVoices();
  if (typeof synth.onvoiceschanged !== 'undefined') synth.onvoiceschanged = loadVoices;

  /* --------------------------------------------------------------- cues --- */
  /* The chapters were written as prose, not as a storyboard, so rather than
     ask every scribe to mark up their own text we listen for the words that
     matter. When the narrator SAYS one, the page does it. Authored moments can
     still override this with an explicit data-cue on any element. */
  var CUES = [
    [/\b(dragon|drake|wyrm|serpent|titan|hatchling)s?\b/i, 'dragon'],
    [/\b(fire|flame|burn|burnt|burned|blaz|ember|scorch|ash)/i, 'fire'],
    [/\b(ink|blot|spill|spilled|stain|drown)/i, 'ink'],
    [/\b(fold|folded|crease|creased|dogear|corner)/i, 'fold'],
    [/\b(smudge|smudged|eras|rub|half-erased|blur)/i, 'smudge'],
    [/\b(broke|broken|shatter|fell|fall|struck|smash|siege|storm)/i, 'shake'],
    [/\b(drew|draw|drawn|pencil|nib|quill|line)/i, 'draw'],
    [/\b(throne|crown|king|kingdom|castle)s?\b/i, 'throne'],
    [/\b(roach|roaches|cockroach)/i, 'roach']
  ];
  var lastCue = '', lastCueAt = 0;
  function cue(name, word) {
    var now = Date.now();
    /* the same cue twice in quick succession is noise, not drama */
    if (name === lastCue && now - lastCueAt < 2600) return;
    lastCue = name; lastCueAt = now;
    document.dispatchEvent(new CustomEvent('mp:cue', { detail: { cue: name, word: word } }));
  }
  function cueFor(span) {
    if (!span) return;
    var explicit = span.closest('[data-cue]');
    if (explicit) { cue(explicit.getAttribute('data-cue'), span.textContent); return; }
    var w = span.textContent;
    for (var i = 0; i < CUES.length; i++) {
      if (CUES[i][0].test(w)) { cue(CUES[i][1], w); return; }
    }
  }

  /* ------------------------------------------------------------- state --- */
  var at = 0, sen = 0, playing = false, utter = null, stopping = false;
  /* cancel() is asynchronous: a cancelled utterance can still emit one more
     boundary event after we have moved on, which would leave a word lit in a
     passage nobody is reading. Every state change bumps this token, and a
     boundary from a stale token is ignored. */
  var token = 0;
  /* The speech engine can wedge: speak() reports speaking:true but never emits
     onstart, onboundary or onend again. It is a known Chromium fault, not ours
     — a bare utterance with no involvement from this file reproduces it. So we
     watch for silence and recover, rather than leaving the reader stuck. */
  var lastTick = 0, retries = 0, watchdog = 0;

  function say(msg) { if (liveEl) liveEl.textContent = msg; }

  function where() {
    if (!whereEl) return;
    var b = beats[at];
    var label = (b && b.label) || '';
    whereEl.textContent = label
      ? label + ' · ' + (at + 1) + ' of ' + beats.length
      : (at + 1) + ' of ' + beats.length;
  }

  function markBeat(i) {
    beats.forEach(function (b, k) { b.el.classList.toggle('is-speaking', k === i); });
    if (i >= 0 && beats[i]) {
      document.dispatchEvent(new CustomEvent('mp:beat', {
        detail: { el: beats[i].el, index: i, label: beats[i].label }
      }));
    }
  }
  function clearWords(beat) {
    if (beat && beat.words) beat.words.forEach(function (w) { w.span.classList.remove('is-now'); });
  }
  function clearAllWords() {
    beats.forEach(function (b) { if (b.words) b.words.forEach(function (w) { w.span.classList.remove('is-now'); }); });
  }

  function scrollTo(beat) {
    var r = beat.el.getBoundingClientRect();
    var pad = window.innerHeight * 0.28;
    if (r.top < pad || r.bottom > window.innerHeight - pad * 0.5) {
      beat.el.scrollIntoView({
        behavior: reduced.matches ? 'auto' : 'smooth',
        block: 'center'
      });
    }
  }

  function speak() {
    if (!playing) return;
    var beat = beats[at];
    if (!beat) { finish(); return; }
    prepare(beat);

    /* Nothing to say here (an illustration with no prose, or text we refuse to
       read): drop it from the running order so the count stays honest. */
    if (!beat.sentences || !beat.sentences.length) {
      beats.splice(at, 1);
      sen = 0;
      if (at >= beats.length) { finish(); return; }
      where(); markBeat(at); scrollTo(beats[at]);
      speak();
      return;
    }

    if (sen >= beat.sentences.length) {           /* beat done, go on */
      clearAllWords();
      at++; sen = 0;
      if (at >= beats.length) { finish(); return; }
      where();
      markBeat(at);
      scrollTo(beats[at]);
      speak();
      return;
    }

    var s = beat.sentences[sen];
    var mine = ++token;
    utter = new SpeechSynthesisUtterance(s.text);
    if (chosen) utter.voice = chosen;
    utter.rate = rateInput ? parseFloat(rateInput.value) || 1 : 1;
    utter.pitch = 0.95;

    utter.onstart = function () { lastTick = Date.now(); retries = 0; };
    utter.onboundary = function (e) {
      lastTick = Date.now();
      if (mine !== token) return;              /* a stale utterance still talking */
      if (e.name && e.name !== 'word') return;
      if (!beat.words || !beat.words.length) return;
      var idx = s.start + (e.charIndex || 0);
      for (var i = 0; i < beat.words.length; i++) {
        var w = beat.words[i];
        if (idx >= w.start && idx < w.end) {
          clearWords(beat);
          w.span.classList.add('is-now');
          cueFor(w.span);
          break;
        }
      }
    };
    utter.onend = function () {
      lastTick = Date.now();
      if (stopping || mine !== token) return;
      sen++;
      speak();
    };
    utter.onerror = function (e) {
      /* 'interrupted' and 'canceled' are us stopping on purpose */
      if (stopping || !e || e.error === 'interrupted' || e.error === 'canceled') return;
      say('The voice stopped: ' + (e.error || 'unknown') + '. You can keep reading.');
      pause();
    };

    lastTick = Date.now();
    synth.speak(utter);
  }

  function startWatchdog() {
    if (watchdog) return;
    watchdog = setInterval(function () {
      if (!playing) return;
      /* Chrome stops a long utterance after ~15s unless it is nudged. */
      try { if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); } } catch (e) {}

      if (Date.now() - lastTick < 6000) return;      /* still making progress */

      if (retries >= 2) {
        say('The voice stopped responding. This is a fault in the browser\u2019s speech engine, not the page \u2014 reload to try again. The chronicle reads fine without it.');
        pause();
        return;
      }
      retries++;
      /* force a clean restart of the sentence we were on */
      var k = at, j = sen;
      stopping = true; token++;
      try { synth.cancel(); } catch (e) {}
      stopping = false;
      at = k; sen = j; lastTick = Date.now();
      setTimeout(function () { if (playing) speak(); }, 260);
    }, 1500);
  }
  function stopWatchdog() { clearInterval(watchdog); watchdog = 0; }

  function play() {
    if (!beats.length) collect();
    if (!beats.length) { say('There is nothing marked to read on this page.'); return; }
    stopping = false;
    playing = true;
    retries = 0; lastTick = Date.now();
    startWatchdog();
    /* clear anything the engine is still holding from a previous page */
    try { synth.cancel(); } catch (e) {}
    if (playBtn) { playBtn.textContent = 'Pause'; playBtn.setAttribute('aria-pressed', 'true'); }
    bar.classList.add('is-playing');
    markBeat(at); where();
    prepare(beats[at]);
    scrollTo(beats[at]);
    say('Reading aloud. ' + (beats[at].label || 'Beginning.'));
    speak();
  }

  function pause() {
    token++;
    stopWatchdog();
    playing = false; stopping = true;
    synth.cancel();
    stopping = false;
    if (playBtn) { playBtn.textContent = 'Read aloud'; playBtn.setAttribute('aria-pressed', 'false'); }
    bar.classList.remove('is-playing');
  }

  function finish() {
    pause();
    clearAllWords();
    markBeat(-1);
    at = 0; sen = 0; where();
    say('The chronicle is finished.');
  }

  function jump(delta) {
    var was = playing;
    token++;
    stopping = true; synth.cancel(); stopping = false;
    clearAllWords();
    at = Math.max(0, Math.min(beats.length - 1, at + delta));
    sen = 0;
    where(); markBeat(at);
    prepare(beats[at]);
    scrollTo(beats[at]);
    if (was) { playing = true; speak(); }
    else say('Moved to ' + (beats[at].label || 'passage ' + (at + 1)) + '.');
  }

  /* ------------------------------------------------------------ wiring --- */
  /* A wedged engine survives a reload in some builds; clear it up front. */
  try { synth.cancel(); } catch (e) {}

  collect();
  where();
  document.body.classList.add('has-reader');

  if (playBtn) playBtn.addEventListener('click', function () { playing ? pause() : play(); });
  if (prevBtn) prevBtn.addEventListener('click', function () { jump(-1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { jump(1); });
  if (stopBtn) stopBtn.addEventListener('click', function () {
    pause(); clearAllWords(); markBeat(-1); at = 0; sen = 0; where();
    say('Stopped.');
  });
  if (voiceSel) voiceSel.addEventListener('change', function () {
    chosen = voices[voiceSel.value] || null;
    if (playing) { var k = at, j = sen; pause(); at = k; sen = j; play(); }
  });
  if (rateInput) {
    var showRate = function () { if (rateOut) rateOut.textContent = parseFloat(rateInput.value).toFixed(1) + '×'; };
    showRate();
    rateInput.addEventListener('input', showRate);
    rateInput.addEventListener('change', function () {
      if (playing) { var k = at, j = sen; pause(); at = k; sen = j; play(); }
    });
  }

  /* Click any passage to start there. */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-narrate-from]');
    if (!b) return;
    var id = b.getAttribute('data-narrate-from');
    var target = document.getElementById(id);
    if (!target) return;
    var i = beats.findIndex(function (x) { return x.el === target || x.el.contains(target) || target.contains(x.el); });
    if (i < 0) return;
    e.preventDefault();
    pause(); clearAllWords();
    at = i; sen = 0;
    play();
  });

  /* Never keep talking to an empty room. */
  document.addEventListener('visibilitychange', function () { if (document.hidden && playing) pause(); });
  window.addEventListener('pagehide', function () { if (playing) pause(); });
  window.addEventListener('beforeunload', function () { try { synth.cancel(); } catch (e) {} });

  /* Keyboard: space toggles when the bar has focus, arrows move passages. */
  bar.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); jump(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); jump(-1); }
  });
})();
