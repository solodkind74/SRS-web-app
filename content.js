(function () {
  'use strict';

  if (!document.body) return; // bail on SVG/XML/PDF docs — no body element
  if (document.getElementById('lf-host')) return; // guard against double-inject

  // ── Shadow DOM host ────────────────────────────────────────────────────────

  const host = document.createElement('div');
  if (!host.style) return; // Chrome SVG/XML viewer wraps in HTML but createElement has no style
  host.id = 'lf-host';
  Object.assign(host.style, {
    position: 'fixed',
    zIndex: '2147483647',
    top: '0',
    left: '0',
    pointerEvents: 'none',
  });
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    :host { all: initial; }

    #popup {
      position: fixed;
      max-width: 320px;
      min-width: 220px;
      max-height: 70vh;
      background: #1e1e2e;
      color: #cdd6f4;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.07);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      pointer-events: auto;
      overflow: hidden;
      display: none;
      flex-direction: column;
      animation: lf-pop .15s ease;
    }
    #popup.visible { display: flex; }

    @keyframes lf-pop {
      from { opacity: 0; transform: translateY(-4px) scale(.97); }
      to   { opacity: 1; transform: none; }
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px 8px;
      border-bottom: 1px solid rgba(255,255,255,.08);
      flex-shrink: 0;
    }
    .word {
      font-weight: 700;
      font-size: 16px;
      color: #cba6f7;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .close-btn {
      background: none;
      border: none;
      color: #6c7086;
      font-size: 18px;
      cursor: pointer;
      line-height: 1;
      padding: 0 2px;
      flex-shrink: 0;
    }
    .close-btn:hover { color: #cdd6f4; }

    .body {
      padding: 10px 12px 12px;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      scrollbar-width: thin;
      scrollbar-color: rgba(203,166,247,.3) transparent;
    }

    .phonetic-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .phonetic {
      color: #a6e3a1;
      font-size: 13px;
      font-style: italic;
    }
    .pos {
      font-size: 11px;
      background: rgba(203,166,247,.15);
      color: #cba6f7;
      border-radius: 4px;
      padding: 1px 6px;
      font-style: italic;
    }
    .audio-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      padding: 0;
      line-height: 1;
      opacity: .8;
    }
    .audio-btn:hover { opacity: 1; }

    .meanings { display: flex; flex-direction: column; gap: 10px; }

    .meaning-block {}
    .meaning-pos {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: #89b4fa;
      margin-bottom: 4px;
    }
    .def {
      color: #cdd6f4;
      font-size: 13px;
      line-height: 1.5;
    }
    .example {
      color: #6c7086;
      font-size: 12px;
      font-style: italic;
      margin-top: 3px;
    }

    .loading, .not-found {
      color: #6c7086;
      font-size: 13px;
      padding: 4px 0;
    }

    .add-btn {
      display: block;
      width: 100%;
      margin-top: 12px;
      padding: 7px 12px;
      position: sticky;
      bottom: 0;
      background: #cba6f7;
      color: #1e1e2e;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s;
    }
    .add-btn:hover:not(:disabled) { background: #d8b4fe; }
    .add-btn:disabled { opacity: .6; cursor: default; }
    .add-btn.success {
      background: #a6e3a1;
      cursor: default;
    }
  `;

  const popupEl = document.createElement('div');
  popupEl.id = 'popup';

  shadow.appendChild(styleEl);
  shadow.appendChild(popupEl);

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Guards against "Extension context invalidated" when the extension is
  // reloaded while a content script is still alive in an old tab.
  function sendMsg(msg, cb) {
    if (!chrome.runtime?.id) { cb(null); return; }
    try { chrome.runtime.sendMessage(msg, cb); }
    catch (_) { cb(null); }
  }

  // ── State ──────────────────────────────────────────────────────────────────

  let currentWord = null;
  let audioEl = null;

  // ── Selection listener ─────────────────────────────────────────────────────

  document.addEventListener('mouseup', e => {
    if (e.target.closest?.('#lf-host')) return;
    // Slight delay so selection is finalised
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';

      if (!text || text.split(/\s+/).length > 5 || text.length > 80 || /\d/.test(text)) {
        close();
        return;
      }

      const range = sel.rangeCount ? sel.getRangeAt(0) : null;
      if (!range) return;

      open(text, range.getBoundingClientRect());
    }, 30);
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.addEventListener('mousedown', e => {
    if (!e.target.closest?.('#lf-host')) close();
  });

  // ── Open / close ───────────────────────────────────────────────────────────

  function close() {
    popupEl.classList.remove('visible');
    popupEl.innerHTML = '';
    currentWord = null;
    if (audioEl) { audioEl.pause(); audioEl = null; }
  }

  function open(word, selRect) {
    currentWord = word;

    popupEl.innerHTML = `
      <div class="header">
        <span class="word" title="${esc(word)}">${esc(word)}</span>
        <button class="close-btn" title="Close">×</button>
      </div>
      <div class="body"><div class="loading">Looking up…</div></div>
    `;

    popupEl.classList.add('visible');
    position(selRect);

    shadow.querySelector('.close-btn').addEventListener('click', close);

    sendMsg({ type: 'LOOKUP', word }, response => {
      void chrome.runtime.lastError;
      if (!popupEl.classList.contains('visible') || currentWord !== word) return;
      if (!response || response.error) {
        renderNotFound(word);
      } else {
        renderResult(word, response);
      }
    });
  }

  function position(selRect) {
    const GAP = 8;
    const pw = 320; // max-width estimate for initial placement
    let top = selRect.bottom + GAP;
    let left = selRect.left + (selRect.width / 2) - (pw / 2);

    // clamp horizontally
    left = Math.max(GAP, Math.min(left, window.innerWidth - pw - GAP));
    // flip above if less than 30% of viewport height remains below selection
    const minH = window.innerHeight * 0.3;
    if (top + minH > window.innerHeight) {
      top = selRect.top - minH - GAP;
    }
    top = Math.max(GAP, top);

    popupEl.style.top = top + 'px';
    popupEl.style.left = left + 'px';
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function renderNotFound(word) {
    const body = shadow.querySelector('.body');
    body.innerHTML = `<div class="not-found">No definition found.</div>`;
    body.appendChild(buildAddButton(word, [], ''));
  }

  function renderResult(word, data) {
    const { phonetic, audio, meanings } = data;

    const phonRow = (phonetic || audio)
      ? `<div class="phonetic-row">
          ${phonetic ? `<span class="phonetic">${esc(phonetic)}</span>` : ''}
          ${audio ? `<button class="audio-btn" title="Play pronunciation">🔊</button>` : ''}
        </div>`
      : '';

    const meaningBlocks = (meanings || []).slice(0, 3).map(m => {
      const defs = m.definitions || [];
      const defsHtml = defs.map((d, i) => {
        const defText = d.definition ?? '';
        const exText = d.example ?? '';
        const prefix = defs.length > 1 ? `${i + 1}. ` : '';
        return `
          <div class="def">${esc(prefix + defText)}</div>
          ${exText ? `<div class="example">"${esc(exText)}"</div>` : ''}
        `;
      }).join('');
      return `
        <div class="meaning-block">
          <div class="meaning-pos">${esc(m.partOfSpeech || '')}</div>
          ${defsHtml}
        </div>
      `;
    }).join('');

    const body = shadow.querySelector('.body');
    body.innerHTML = `
      ${phonRow}
      <div class="meanings">${meaningBlocks}</div>
    `;

    if (audio) {
      const audioBtn = body.querySelector('.audio-btn');
      audioBtn?.addEventListener('click', () => {
        if (audioEl) audioEl.pause();
        audioEl = new Audio(audio);
        audioEl.play().catch(() => {});
      });
    }

    body.appendChild(buildAddButton(word, meanings || [], phonetic ?? ''));
  }

  function buildAddButton(word, meanings, phonetic) {
    // Combine all parts of speech into one definition string
    const defs = (meanings || []).map(m => {
      const mDefs = (m.definitions || []).map(d => d.definition).filter(Boolean);
      if (!mDefs.length) return '';
      const numbered = mDefs.length > 1 ? mDefs.map((d, i) => `${i + 1}. ${d}`) : mDefs;
      return (m.partOfSpeech ? `[${m.partOfSpeech}] ` : '') + numbered.join('; ');
    }).filter(Boolean);
    const definition = defs.join('\n');

    // Collect all examples across all meanings
    const examples = (meanings || [])
      .flatMap(m => (m.definitions || []).map(d => d.example).filter(Boolean));

    const btn = document.createElement('button');
    btn.className = 'add-btn';
    btn.textContent = '＋ Add to Vocab';

    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'Saving…';

      sendMsg(
        { type: 'ADD_WORD', wordData: { word, definition, phonetic, examples } },
        response => {
          void chrome.runtime.lastError;
          if (response?.success) {
            btn.textContent = '✓ Added to vocab!';
            btn.classList.add('success');
          } else if (response?.duplicate) {
            btn.textContent = '✓ Already in your vocab';
            btn.classList.add('success');
          } else {
            btn.textContent = 'Error — try again';
            btn.disabled = false;
          }
        }
      );
    });

    return btn;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
