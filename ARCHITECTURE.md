# LexiFlow — Architecture

## Overview

Two tightly-coupled components share a single `chrome.storage.local` store:

| Component | Role |
|-----------|------|
| **Chrome Extension** | Capture words from any web page |
| **Web App (LexiFlow)** | Spaced-repetition study interface |

No server, no build step, no dependencies.

---

## Directory Layout

```
GoldenRuleExtension/
├── manifest.json       # MV3 extension manifest
├── background.js       # Service worker: dictionary API + storage writes + tab opener
├── content.js          # Content script: selection detection → lookup popup (Shadow DOM)
├── index.html          # Web app shell (extension page)
├── app.js              # Web app logic: SRS engine, UI, chrome.storage adapter
├── style.css           # Web app styles
└── ARCHITECTURE.md
```

---

## Data Flow

```
User highlights text on any page
         │
         ▼  mouseup event
   content.js (Shadow DOM popup)
         │  chrome.runtime.sendMessage  LOOKUP
         ▼
   background.js (service worker)
         │  fetch()
         ▼
   Free Dictionary API
   api.dictionaryapi.dev
         │  { phonetic, audio, meanings }
         ▼
   Popup renders: IPA · 🔊 audio · all meanings (noun/verb/adj…) · examples
         │
         │  user clicks "+ Add to Vocab"
         │  chrome.runtime.sendMessage  ADD_WORD
         │  (all meanings combined into one definition string, all examples collected)
         ▼
   background.js writes to chrome.storage.local
         │
         ▼
   Web app (index.html) reads chrome.storage.local on init
   → word appears in Library, enters SRS queue
```

---

## Storage Schema

Key: `lexiflow_v1` in `chrome.storage.local`

```jsonc
{
  "words": [
    {
      "id": "string",            // uid: timestamp36 + random
      "word": "string",
      "definition": "string",    // all POS joined by \n; multiple defs per POS numbered: "[noun] 1. silence; 2. hush\n[verb] to quiet"
      "phonetic": "string",      // IPA, e.g. "/wɜːd/"
      "examples": ["string"],
      "tags": ["string"],
      "notes": "string",
      "dateAdded": 1234567890000,
      "passive": {               // SM-2 card: word → meaning (recognition)
        "interval": 1,
        "easeFactor": 2.5,
        "repetitions": 0,
        "lastReview": null,
        "nextReview": 1234567890000
      },
      "active": {                // SM-2 card: meaning → word (recall)
        "interval": 1,
        "easeFactor": 2.5,
        "repetitions": 0,
        "lastReview": null,
        "nextReview": 1234567890000
      },
      "usages": [
        { "id": "string", "date": 1234567890000, "context": "string", "type": "spoken|written|thought|other" }
      ]
    }
  ],
  "stats": {
    "xp": 0,
    "level": 1,
    "streak": 0,
    "lastStudyDate": null,
    "achievements": [{ "id": "string", "date": 1234567890000 }],
    "totalReviews": 0,
    "totalUsages": 0
  }
}
```

---

## SRS Algorithm (SM-2)

Each word has two independent cards:

- **Passive** — shown the word, must recall the meaning (recognition)
- **Active** — shown the meaning/definition, must produce the word (recall)

Rating buttons and their quality scores:

| Button | Quality | Effect |
|--------|---------|--------|
| Again  | 1       | Reset to interval=1, repetitions=0 |
| Hard   | 3       | Interval grows slowly, ease factor decreases |
| Good   | 4       | Normal progression |
| Easy   | 5       | Interval grows fast, ease factor increases |

Interval formula (on success, quality ≥ 3):
- rep 0 → 1 day
- rep 1 → 6 days
- rep n → `round(prev_interval × ease_factor)`

Mastery stages: `new → learning → familiar → mastered → legendary`

---

## Dictionary API

**Free Dictionary API** — `https://api.dictionaryapi.dev/api/v2/entries/en/{word}`
- No API key required
- Returns IPA phonetics, MP3 audio URL, definitions with examples, part of speech
- Coverage: most common English words and some phrasal verbs

**Known limitation:** rare words and multi-word phrasal verbs (e.g. _come across as_) may return 404.
The extension still lets the user save the word; definition will be empty and can be edited in the web app.

**Future enhancement:** call Claude API as fallback for AI-generated context-aware explanations of phrasal verbs and idioms.

---

## Chrome Extension Components

### `manifest.json` (Manifest V3)
- `permissions`: `storage` (chrome.storage.local), `tabs` (open web app tab)
- `host_permissions`: dictionary API origin
- No popup — clicking the toolbar icon opens a new tab to the web app

### `background.js` (Service Worker)
- `chrome.action.onClicked` → opens `index.html` as a new tab
- `LOOKUP` message → fetches dictionary API, returns parsed result
- `ADD_WORD` message → reads storage, deduplicates, appends word, saves

### `content.js` (Content Script)
- Injected into every page at `document_idle`
- Uses **Shadow DOM** for full CSS isolation from the host page
- `mouseup` → checks selection (max 5 words / 80 chars, no digits) → shows popup
- Popup shows up to 3 parts of speech; within each POS **all definitions** are listed (numbered when >1), each with its example
- Popup body is scrollable (`max-height: 70vh`, `overflow-y: auto`); "＋ Add to Vocab" button is sticky at the bottom
- Saving stores every definition and every example the API returns (no caps)
- `Escape` / click-outside → dismisses popup
- Audio playback via `new Audio(url)`

---

## Web App (`app.js`)

### Storage Adapter
`Storage.load()` is async and detects context:
- Extension page (`chrome.storage.local` available) → uses `chrome.storage.local`
- Standalone file (`file://`) → falls back to `localStorage`

This means `index.html` works both as an extension page and as a plain local file.

### Routing
Hash-based SPA router: `#/dashboard`, `#/library`, `#/study/passive`, `#/study/active`, `#/add`, `#/word/:id`, `#/achievements`

### Add / Edit Form
- **🔍 Fetch button** next to the word input calls the dictionary API directly from the extension page and auto-populates phonetic, definition (all POS, all definitions numbered per POS, one POS per line), part of speech, and all available example sentences.

### Gamification
XP system, 10 levels (Novice → Master), 16 achievements, daily challenge word, usage logging.

---

## Development Setup

1. Open `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked** → select this repository root
4. Click the extension icon in the toolbar → opens LexiFlow in a new tab
5. Browse any page, highlight a word → popup appears

To reload after code changes: click the refresh icon on the extension card in `chrome://extensions`.

---

## Potential Next Steps

- **Claude API fallback**: context-aware definitions for phrasal verbs and idioms
- **Cross-device sync**: replace `chrome.storage.local` with `chrome.storage.sync` (100 KB quota) or a Supabase backend
- **Import / export**: JSON or Anki `.apkg` deck export
- **Sentence mining**: save the full sentence context alongside the word
- **TTS fallback**: Web Speech API (`speechSynthesis`) when no audio URL is available
