/* ════════════════════════════════════════════
   TRUCKFLEET PRO — split-flap.js
   A vanilla-JS "airport departure board" text animation. No React needed —
   window.createSplitFlap(container, options) mirrors the props of the
   SplitFlapText component this was ported from.
════════════════════════════════════════════ */
(function () {
  const CHARSETS = {
    alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
    alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ',
    numeric: '0123456789 '
  };

  function padWord(word, len) {
    const upper = word.toUpperCase();
    if (upper.length >= len) return upper.slice(0, len);
    return upper + ' '.repeat(len - upper.length);
  }

  window.createSplitFlap = function createSplitFlap(container, options) {
    const opts = Object.assign({
      words: ['HELLO'],
      flipDuration: 0.12,
      stagger: 0.06,
      cycleDelay: 2400,
      charset: 'alphanumeric',
      flipsPerChar: 8,
      tileColor: '#111827',
      textColor: '#f8fafc',
      tileRadius: 8,
      gap: 6,
      fontSize: 52,
      loop: true,
      padTo: null
    }, options || {});

    const chars = CHARSETS[opts.charset] || CHARSETS.alphanumeric;
    const padTo = opts.padTo || Math.max(...opts.words.map(w => w.length));
    const words = opts.words.map(w => padWord(w, padTo));

    container.classList.add('split-flap');
    container.innerHTML = '';
    container.style.setProperty('--sf-gap', opts.gap + 'px');
    container.style.setProperty('--sf-radius', opts.tileRadius + 'px');
    container.style.setProperty('--sf-tile-color', opts.tileColor);
    container.style.setProperty('--sf-text-color', opts.textColor);
    container.style.setProperty('--sf-flip-ms', (opts.flipDuration * 1000) + 'ms');

    const tiles = [];
    for (let i = 0; i < padTo; i++) {
      const tile = document.createElement('div');
      tile.className = 'sf-tile';
      const inner = document.createElement('div');
      inner.className = 'sf-tile-inner';
      inner.textContent = ' ';
      tile.appendChild(inner);
      container.appendChild(tile);
      tiles.push({ tile, inner });
    }

    // Tiles are sized in JS (not fixed CSS) so the whole row always fits its
    // container's actual width — this is what keeps a 12-character word from
    // overflowing a phone screen without needing per-device breakpoints.
    function fitSize() {
      const available = container.clientWidth;
      if (!available) return;
      const totalGap = opts.gap * (padTo - 1);
      // Tile width is derived straight from the container's real width first —
      // the authoritative, overflow-safe number — and font size is fit inside
      // that (not the other way around), so a 12-tile row can never spill
      // past its container no matter how small the screen is.
      const tileWidth = Math.max(10, Math.floor((available - totalGap) / padTo));
      const fontPx = Math.max(8, Math.min(opts.fontSize, Math.floor((tileWidth - 10) / 0.72)));
      const tileHeight = Math.floor(fontPx * 1.15) + 10;
      container.style.setProperty('--sf-font', fontPx + 'px');
      container.style.setProperty('--sf-tile-w', tileWidth + 'px');
      container.style.setProperty('--sf-tile-h', tileHeight + 'px');
    }
    fitSize();
    const ro = new ResizeObserver(fitSize);
    ro.observe(container);

    let destroyed = false;
    const timeouts = [];
    function after(fn, ms) { const t = setTimeout(fn, ms); timeouts.push(t); return t; }
    function randomChar() { return chars[Math.floor(Math.random() * chars.length)]; }

    function flipTile(tileObj, targetChar, flipsLeft) {
      if (destroyed) return;
      const { tile, inner } = tileObj;
      tile.classList.remove('flipping');
      void tile.offsetWidth; // restart the CSS animation
      tile.classList.add('flipping');
      const nextChar = flipsLeft > 1 ? randomChar() : targetChar;
      after(() => { inner.textContent = nextChar === ' ' ? ' ' : nextChar; }, (opts.flipDuration * 1000) / 2);
      after(() => {
        tile.classList.remove('flipping');
        if (flipsLeft > 1) flipTile(tileObj, targetChar, flipsLeft - 1);
      }, opts.flipDuration * 1000);
    }

    function playWord(wordIndex) {
      if (destroyed) return;
      const word = words[wordIndex];
      tiles.forEach((tileObj, i) => {
        after(() => flipTile(tileObj, word[i], opts.flipsPerChar), i * opts.stagger * 1000);
      });
      const totalDuration = (padTo - 1) * opts.stagger * 1000 + opts.flipsPerChar * opts.flipDuration * 1000;
      after(() => {
        const next = wordIndex + 1;
        if (next < words.length) playWord(next);
        else if (opts.loop) playWord(0);
      }, totalDuration + opts.cycleDelay);
    }
    playWord(0);

    return {
      destroy() {
        destroyed = true;
        timeouts.forEach(clearTimeout);
        ro.disconnect();
        container.innerHTML = '';
      }
    };
  };
})();
