'use strict';

const STORAGE_KEY = 'lexiflow_v1';
const DICT_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

// Open the web app tab when the toolbar icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'LOOKUP') {
    lookupWord(msg.word).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'ADD_WORD') {
    addWord(msg.wordData).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  }
});

async function lookupWord(word) {
  const res = await fetch(DICT_API + encodeURIComponent(word.toLowerCase()));
  if (!res.ok) return { error: 'not_found' };

  const json = await res.json();
  const entry = json[0];
  if (!entry) return { error: 'not_found' };

  // Pick the first audio URL that exists
  const audio = entry.phonetics?.find(p => p.audio?.startsWith('http'))?.audio ?? '';

  return {
    phonetic: entry.phonetic || entry.phonetics?.[0]?.text || '',
    audio,
    meanings: (entry.meanings || []).slice(0, 3),
  };
}

async function addWord(wordData) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const data = result[STORAGE_KEY] || defaultData();

  const exists = data.words.some(w => w.word.toLowerCase() === wordData.word.toLowerCase());
  if (exists) return { duplicate: true };

  const now = Date.now();
  data.words.push({
    id: now.toString(36) + Math.random().toString(36).slice(2, 7),
    word: wordData.word,
    definition: wordData.definition || '',
    phonetic: wordData.phonetic || '',
    examples: wordData.examples || [],
    tags: [],
    notes: '',
    dateAdded: now,
    passive: freshCard(now),
    active: freshCard(now),
    usages: [],
  });

  await chrome.storage.local.set({ [STORAGE_KEY]: data });
  return { success: true };
}

function defaultData() {
  return {
    words: [],
    stats: {
      xp: 0, level: 1, streak: 0,
      lastStudyDate: null,
      achievements: [],
      totalReviews: 0,
      totalUsages: 0,
    },
  };
}

function freshCard(now = Date.now()) {
  return { interval: 1, easeFactor: 2.5, repetitions: 0, lastReview: null, nextReview: now };
}
