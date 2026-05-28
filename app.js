'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────────────────────────

const LEVELS = [
  { level: 1,  min: 0,     title: 'Novice'        },
  { level: 2,  min: 100,   title: 'Apprentice'    },
  { level: 3,  min: 250,   title: 'Student'       },
  { level: 4,  min: 500,   title: 'Scholar'       },
  { level: 5,  min: 1000,  title: 'Linguist'      },
  { level: 6,  min: 1800,  title: 'Polyglot'      },
  { level: 7,  min: 3000,  title: 'Wordsmith'     },
  { level: 8,  min: 5000,  title: 'Lexicographer' },
  { level: 9,  min: 8000,  title: 'Sage'          },
  { level: 10, min: 12000, title: 'Master'        },
];

const ACHIEVEMENTS = [
  { id: 'first_word',    icon: '🌱', name: 'First Word',       desc: 'Added your first word',           check: d => d.words.length >= 1 },
  { id: 'ten_words',     icon: '🌿', name: 'Growing Garden',   desc: 'Added 10 words',                  check: d => d.words.length >= 10 },
  { id: 'fifty_words',   icon: '🌳', name: 'Word Forest',      desc: 'Added 50 words',                  check: d => d.words.length >= 50 },
  { id: 'hundred_words', icon: '📚', name: 'Lexicon',          desc: 'Added 100 words',                 check: d => d.words.length >= 100 },
  { id: 'streak_3',      icon: '🔥', name: 'On a Roll',        desc: 'Studied 3 days in a row',         check: d => d.stats.streak >= 3 },
  { id: 'streak_7',      icon: '⚡', name: 'Week Warrior',     desc: 'Studied 7 days in a row',         check: d => d.stats.streak >= 7 },
  { id: 'streak_30',     icon: '💎', name: 'Unstoppable',      desc: 'Studied 30 days in a row',        check: d => d.stats.streak >= 30 },
  { id: 'first_usage',   icon: '🗣️', name: 'In the Wild',      desc: 'Used a word in real life',        check: d => d.stats.totalUsages >= 1 },
  { id: 'ten_usages',    icon: '💬', name: 'Word Speaker',     desc: 'Logged 10 word usages',           check: d => d.stats.totalUsages >= 10 },
  { id: 'fifty_usages',  icon: '🎤', name: 'Orator',           desc: 'Logged 50 word usages',           check: d => d.stats.totalUsages >= 50 },
  { id: 'first_mastered',icon: '⭐', name: 'First Mastery',    desc: 'Mastered your first word',        check: d => d.words.some(w => getMastery(w) === 'mastered' || getMastery(w) === 'legendary') },
  { id: 'ten_mastered',  icon: '🏆', name: 'Proficient',       desc: 'Mastered 10 words',               check: d => d.words.filter(w => getMastery(w) === 'mastered' || getMastery(w) === 'legendary').length >= 10 },
  { id: 'reviews_50',    icon: '📝', name: 'Dedicated',        desc: 'Completed 50 reviews',            check: d => d.stats.totalReviews >= 50 },
  { id: 'reviews_200',   icon: '🎯', name: 'Sharpshooter',     desc: 'Completed 200 reviews',           check: d => d.stats.totalReviews >= 200 },
  { id: 'level_5',       icon: '🎓', name: 'Linguist Rank',    desc: 'Reached level 5',                 check: d => d.stats.level >= 5 },
  { id: 'level_10',      icon: '👑', name: 'Grand Master',     desc: 'Reached level 10',                check: d => d.stats.level >= 10 },
  { id: 'golden_rule',   icon: '✨', name: 'The Golden Rule',  desc: 'Used 5 different words in real life', check: d => d.words.filter(w => w.usages.length > 0).length >= 5 },
];

const XP = {
  passive_correct: 8,
  passive_wrong:   3,
  active_correct:  15,
  active_wrong:    5,
  log_usage:       20,
  first_usage:     30,
};

// ──────────────────────────────────────────────────────────────────────────────
// STORAGE
// ──────────────────────────────────────────────────────────────────────────────

const Storage = {
  KEY: 'lexiflow_v1',

  defaults() {
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
  },

  async load() {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      const r = await chrome.storage.local.get(this.KEY);
      return r[this.KEY] || this.defaults();
    }
    try { return JSON.parse(localStorage.getItem(this.KEY)) || this.defaults(); }
    catch { return this.defaults(); }
  },

  save(data) {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      chrome.storage.local.set({ [this.KEY]: data });
      return;
    }
    localStorage.setItem(this.KEY, JSON.stringify(data));
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// SM-2 ALGORITHM
// ──────────────────────────────────────────────────────────────────────────────

const SM2 = {
  // quality: 1=Again, 3=Hard, 4=Good, 5=Easy
  update(card, quality) {
    let { interval, easeFactor, repetitions } = card;
    const now = Date.now();

    if (quality >= 3) {
      if (repetitions === 0)      interval = 1;
      else if (repetitions === 1) interval = 6;
      else                        interval = Math.round(interval * easeFactor);

      easeFactor += 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
      easeFactor = Math.max(1.3, parseFloat(easeFactor.toFixed(3)));
      repetitions++;
    } else {
      repetitions = 0;
      interval = 1;
    }

    return {
      interval,
      easeFactor,
      repetitions,
      lastReview: now,
      nextReview: now + interval * 86_400_000,
    };
  },

  freshCard(delayDays = 0) {
    return {
      interval: 1,
      easeFactor: 2.5,
      repetitions: 0,
      lastReview: null,
      nextReview: Date.now() + delayDays * 86_400_000,
    };
  },

  // Show next interval for each rating button
  preview(card) {
    const preview = (q) => SM2.update({ ...card }, q).interval;
    return { again: 1, hard: preview(3), good: preview(4), easy: preview(5) };
  },

  formatInterval(days) {
    if (days < 1)  return '<1d';
    if (days === 1) return '1d';
    if (days < 30)  return `${days}d`;
    return `${Math.round(days / 30)}mo`;
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ──────────────────────────────────────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getMastery(word) {
  const p = word.passive, a = word.active;
  if (p.repetitions === 0 && a.repetitions === 0) return 'new';
  if (p.interval >= 60 && a.interval >= 45)       return 'legendary';
  if (p.interval >= 21 && a.interval >= 14)        return 'mastered';
  if (p.interval >= 7  && a.repetitions >= 1)      return 'familiar';
  return 'learning';
}

function masteryLabel(m) {
  return { new: 'New', learning: 'Learning', familiar: 'Familiar', mastered: 'Mastered', legendary: 'Legendary' }[m] || m;
}

function formatDate(ts) {
  if (!ts) return 'Never';
  const diff = Math.floor((Date.now() - ts) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return `${diff}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatNextReview(ts) {
  if (!ts) return 'Now';
  const diff = Math.ceil((ts - Date.now()) / 86_400_000);
  if (diff <= 0) return 'Due now';
  if (diff === 1) return 'Tomorrow';
  return `In ${diff}d`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getDue(words, mode) {
  const now = Date.now();
  return words.filter(w => w[mode].nextReview <= now);
}

function getLevelInfo(xp) {
  let cur = LEVELS[0], nxt = LEVELS[1];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].min) {
      cur = LEVELS[i];
      nxt = LEVELS[i + 1] || null;
      break;
    }
  }
  const progress = nxt
    ? ((xp - cur.min) / (nxt.min - cur.min)) * 100
    : 100;
  return { cur, nxt, progress };
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDailyChallenge(words) {
  const usable = words.filter(w => w.passive.repetitions > 0);
  if (!usable.length) return words[0] || null;
  const seed = new Date().toDateString();
  let hash = 0;
  for (const c of seed) hash = ((hash << 5) - hash) + c.charCodeAt(0);
  return usable[Math.abs(hash) % usable.length];
}

// ──────────────────────────────────────────────────────────────────────────────
// GAMIFICATION
// ──────────────────────────────────────────────────────────────────────────────

const Gamification = {
  addXP(data, amount, label) {
    const old = { ...getLevelInfo(data.stats.xp) };
    data.stats.xp += amount;
    const nw = getLevelInfo(data.stats.xp);

    Toast.show(`+${amount} XP — ${label}`, 'xp');

    if (nw.cur.level > old.cur.level) {
      data.stats.level = nw.cur.level;
      setTimeout(() => Toast.show(`🎉 Level Up! You're now a ${nw.cur.title}!`, 'achievement'), 400);
    }
  },

  checkStreak(data) {
    const today = todayStr();
    if (data.stats.lastStudyDate === today) return;

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (data.stats.lastStudyDate === yesterday) {
      data.stats.streak++;
    } else if (data.stats.lastStudyDate !== today) {
      data.stats.streak = 1;
    }
    data.stats.lastStudyDate = today;
  },

  checkAchievements(data) {
    const earned = data.stats.achievements;
    const newlyEarned = [];

    for (const ach of ACHIEVEMENTS) {
      if (!earned.find(e => e.id === ach.id) && ach.check(data)) {
        earned.push({ id: ach.id, date: Date.now() });
        newlyEarned.push(ach);
      }
    }

    newlyEarned.forEach((ach, i) => {
      setTimeout(() => Toast.show(`${ach.icon} Achievement: ${ach.name}!`, 'achievement'), i * 600);
    });
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// TOAST SYSTEM
// ──────────────────────────────────────────────────────────────────────────────

const Toast = {
  show(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${msg}</span>`;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => {
      el.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, 2800);
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// APP STATE & ROUTER
// ──────────────────────────────────────────────────────────────────────────────

const App = {
  data: null,
  view: 'dashboard',
  params: {},
  session: null,         // active study session state
  sessionStart: null,

  async init() {
    this.data = await Storage.load();
    // ensure all words have required fields (migration safety)
    for (const w of this.data.words) {
      w.usages = w.usages || [];
      w.tags = w.tags || [];
      w.notes = w.notes || '';
      w.phonetic = w.phonetic || '';
      w.examples = w.examples || [];
    }
    this.checkInitStreak();
    this._attachGlobalListeners();
    this._attachStorageListener();
    window.addEventListener('hashchange', () => this.route());
    this.route();
  },

  _attachStorageListener() {
    if (typeof chrome === 'undefined' || !chrome?.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[Storage.KEY]) return;
      const fresh = changes[Storage.KEY].newValue;
      if (!fresh) return;
      for (const w of fresh.words) {
        w.usages   = w.usages   || [];
        w.tags     = w.tags     || [];
        w.notes    = w.notes    || '';
        w.phonetic = w.phonetic || '';
        w.examples = w.examples || [];
      }
      this.data = fresh;
      this.renderNav();
      this.route();
    });
  },

  _attachGlobalListeners() {
    document.addEventListener('click', e => {
      if (e.target.classList.contains('tag-remove')) { e.target.parentElement.remove(); return; }
      if (e.target.id === 'modal-overlay') { this.closeModal(); return; }
      if (e.target.closest('#modal')) { return; } // stop overlay close when clicking inside modal
      const el = e.target.closest('[data-action]');
      if (el) this._dispatch(el.dataset.action, el.dataset);
    });
    document.addEventListener('input', e => {
      const el = e.target.closest('[data-oninput]');
      if (el) this._dispatch(el.dataset.oninput, { ...el.dataset, value: el.value });
    });
    document.addEventListener('change', e => {
      const el = e.target.closest('[data-onchange]');
      if (el) this._dispatch(el.dataset.onchange, { ...el.dataset, value: el.value });
    });
    document.addEventListener('keydown', e => {
      if (e.target.id === 'f-tags-input') this.handleTagInput(e);
    });
  },

  _dispatch(action, d) {
    switch (action) {
      case 'navigate':     this.navigate(d.hash); break;
      case 'back':         history.back(); break;
      case 'log-usage':    this.openLogUsage(d.id); break;
      case 'delete-word':  this.deleteWord(d.id); break;
      case 'save-word':    this.saveWord(d.id || ''); break;
      case 'rate':         this.rate(parseInt(d.q)); break;
      case 'reveal-card':  this.revealCard(); break;
      case 'end-session':  this.endSession(); break;
      case 'save-usage':   this.saveUsage(d.id); break;
      case 'close-modal':  this.closeModal(); break;
      case 'study':        this.renderStudy(d.mode); break;
      case 'filter-lib': {
        const s = document.querySelector('.search-input')?.value ?? '';
        this.renderLibrary(d.filter, s, d.sort || 'newest');
        break;
      }
      case 'sort-lib': {
        const s = document.querySelector('.search-input')?.value ?? '';
        this.renderLibrary(d.filter || 'all', s, d.value);
        break;
      }
      case 'search-lib': this.renderLibrary(d.filter, d.value, d.sort); break;
    }
  },

  checkInitStreak() {
    // Just ensure streak data is current without adding XP
    const today = todayStr();
    if (this.data.stats.lastStudyDate === today) return;
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (this.data.stats.lastStudyDate !== yesterday && this.data.stats.lastStudyDate !== today) {
      // Streak broken
      this.data.stats.streak = 0;
    }
    Storage.save(this.data);
  },

  save() {
    Storage.save(this.data);
  },

  route() {
    const hash = window.location.hash.slice(1) || '/dashboard';
    const [path, ...rest] = hash.split('/').filter(Boolean);
    const viewMap = {
      dashboard: () => this.renderDashboard(),
      library:   () => this.renderLibrary(),
      add:       () => this.renderAddWord(null),
      edit:      () => this.renderAddWord(rest[0]),
      word:      () => this.renderWordDetail(rest[0]),
      study:     () => this.renderStudy(rest[0]),
      session:   () => this.renderSessionComplete(),
      achievements: () => this.renderAchievements(),
    };
    this.view = path;
    const render = viewMap[path] || viewMap.dashboard;
    this.renderNav();
    render();
  },

  navigate(hash) {
    window.location.hash = hash;
  },

  // ── NAVBAR ────────────────────────────────────────────────────────────────

  renderNav() {
    const { xp, streak, level } = this.data.stats;
    const { cur, nxt, progress } = getLevelInfo(xp);
    const active = this.view;

    const tabs = [
      { id: 'dashboard', label: '🏠 Home',      hash: '#/dashboard' },
      { id: 'library',   label: '📖 Library',   hash: '#/library'   },
      { id: 'study',     label: '🃏 Study',      hash: '#/study/passive' },
      { id: 'add',       label: '＋ Add Word',   hash: '#/add'       },
      { id: 'achievements', label: '🏆 Achievements', hash: '#/achievements' },
    ];

    document.getElementById('navbar').innerHTML = `
      <a class="nav-brand" href="#/dashboard">
        <span class="logo">📚</span>
        <span class="name">LexiFlow</span>
      </a>
      <nav class="nav-tabs">
        ${tabs.map(t => `
          <button class="nav-tab ${active === t.id ? 'active' : ''}"
            data-action="navigate" data-hash="${t.hash}">${t.label}</button>
        `).join('')}
      </nav>
      <div class="nav-stats">
        <div class="stat-chip streak">🔥 ${streak}</div>
        <div class="stat-chip level">Lv.${level} ${cur.title}</div>
        <div class="xp-bar-mini">
          <div class="xp-bar-fill" style="width:${progress.toFixed(1)}%"></div>
        </div>
      </div>
    `;
  },

  // ── MODAL ─────────────────────────────────────────────────────────────────

  openModal(html) {
    document.getElementById('modal').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  },

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW: DASHBOARD
  // ──────────────────────────────────────────────────────────────────────────

  renderDashboard() {
    const d = this.data;
    const { xp, streak, level, totalReviews, totalUsages } = d.stats;
    const { cur, nxt, progress } = getLevelInfo(xp);

    const passiveDue = getDue(d.words, 'passive').length;
    const activeDue  = getDue(d.words, 'active').length;
    const totalWords = d.words.length;

    const masteryBreakdown = {
      new:       d.words.filter(w => getMastery(w) === 'new').length,
      learning:  d.words.filter(w => getMastery(w) === 'learning').length,
      familiar:  d.words.filter(w => getMastery(w) === 'familiar').length,
      mastered:  d.words.filter(w => getMastery(w) === 'mastered').length,
      legendary: d.words.filter(w => getMastery(w) === 'legendary').length,
    };

    const challenge = pickDailyChallenge(d.words);
    const recentWords = [...d.words].sort((a, b) => b.dateAdded - a.dateAdded).slice(0, 5);

    document.getElementById('main').innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Welcome back! ${streak > 0 ? `🔥 ${streak}-day streak` : ''}</div>
          <div class="page-subtitle">${totalWords} words in your vocabulary</div>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card streak-card">
          <div class="value">${streak}</div>
          <div class="label">Day Streak</div>
        </div>
        <div class="stat-card xp-card">
          <div class="value">${xp.toLocaleString()}</div>
          <div class="label">Total XP</div>
        </div>
        <div class="stat-card passive-card">
          <div class="value">${passiveDue}</div>
          <div class="label">Passive Due</div>
        </div>
        <div class="stat-card active-card">
          <div class="value">${activeDue}</div>
          <div class="label">Active Due</div>
        </div>
      </div>

      <div class="study-cta-row">
        <div class="study-cta passive" data-action="navigate" data-hash="#/study/passive">
          <div class="cta-icon">👁️</div>
          <div class="cta-title">Passive Study</div>
          <div class="cta-desc">Recognition — see word, recall meaning</div>
          <div class="cta-count">${passiveDue} card${passiveDue !== 1 ? 's' : ''} due</div>
        </div>
        <div class="study-cta active" data-action="navigate" data-hash="#/study/active">
          <div class="cta-icon">✍️</div>
          <div class="cta-title">Active Study</div>
          <div class="cta-desc">Production — see meaning, recall word</div>
          <div class="cta-count">${activeDue} card${activeDue !== 1 ? 's' : ''} due</div>
        </div>
      </div>

      <div class="dash-grid">
        <div>
          <div class="card level-card">
            <div class="level-info">
              <div class="level-name">Level ${level} — ${cur.title}</div>
              <div class="xp-text">${nxt ? `${xp - cur.min} / ${nxt.min - cur.min} XP` : 'Max level!'}</div>
            </div>
            <div class="xp-bar">
              <div class="fill" style="width:${progress.toFixed(1)}%"></div>
            </div>
            <div class="word-count-breakdown mt-8">
              ${Object.entries(masteryBreakdown).map(([m, n]) => n > 0 ? `
                <div class="wc-item">
                  <div class="wc-dot" style="background:var(--mastery-${m})"></div>
                  <span class="text-muted">${n} ${masteryLabel(m)}</span>
                </div>` : '').join('')}
            </div>
          </div>

          ${challenge ? `
            <div class="card challenge-card mt-16">
              <div class="section-title">⚡ Today's Challenge</div>
              <div class="challenge-word">${esc(challenge.word)}</div>
              <div class="challenge-def">${esc(challenge.definition.slice(0, 100))}${challenge.definition.length > 100 ? '…' : ''}</div>
              <button class="btn btn-secondary btn-sm"
                data-action="log-usage" data-id="${challenge.id}">
                ✔ Log I used this word today (+${XP.log_usage} XP)
              </button>
            </div>
          ` : `
            <div class="card mt-16 text-center" style="padding:32px">
              <div style="font-size:2rem;margin-bottom:12px">🌱</div>
              <div class="text-muted">Add your first word to get a daily challenge!</div>
              <button class="btn btn-primary mt-16" data-action="navigate" data-hash="#/add">Add Word</button>
            </div>
          `}
        </div>

        <div>
          <div class="card">
            <div class="section-header">
              <div class="section-title">Recently Added</div>
              <button class="btn btn-secondary btn-sm" data-action="navigate" data-hash="#/library">View All</button>
            </div>
            ${recentWords.length ? recentWords.map(w => `
              <div class="word-list-item" data-action="navigate" data-hash="#/word/${w.id}">
                <span class="badge badge-${getMastery(w)}">${masteryLabel(getMastery(w))}</span>
                <span class="word">${esc(w.word)}</span>
                <span class="def">${esc(w.definition)}</span>
              </div>
            `).join('') : `
              <div class="text-center" style="padding:24px">
                <div class="text-muted">No words yet</div>
                <button class="btn btn-primary btn-sm mt-16" data-action="navigate" data-hash="#/add">Add First Word</button>
              </div>
            `}
          </div>

          <div class="card mt-16">
            <div class="section-title" style="margin-bottom:12px">Your Stats</div>
            <div class="srs-stat"><span class="srs-stat-label">Total Reviews</span><span class="srs-stat-value">${totalReviews}</span></div>
            <div class="srs-stat"><span class="srs-stat-label">Word Usages Logged</span><span class="srs-stat-value">${totalUsages}</span></div>
            <div class="srs-stat"><span class="srs-stat-label">Achievements</span><span class="srs-stat-value">${d.stats.achievements.length} / ${ACHIEVEMENTS.length}</span></div>
            <div class="srs-stat">
              <span class="srs-stat-label">Active Vocabulary</span>
              <span class="srs-stat-value">${d.words.filter(w => w.usages.length > 0).length} words used</span>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW: LIBRARY
  // ──────────────────────────────────────────────────────────────────────────

  renderLibrary(filter = 'all', search = '', sort = 'newest') {
    const d = this.data;

    const filtered = d.words.filter(w => {
      const m = getMastery(w);
      if (filter !== 'all' && m !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return w.word.toLowerCase().includes(q) || w.definition.toLowerCase().includes(q);
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'newest')  return b.dateAdded - a.dateAdded;
      if (sort === 'alpha')   return a.word.localeCompare(b.word);
      if (sort === 'due')     return (a.passive.nextReview || 0) - (b.passive.nextReview || 0);
      if (sort === 'mastery') {
        const order = { new: 0, learning: 1, familiar: 2, mastered: 3, legendary: 4 };
        return (order[getMastery(b)] || 0) - (order[getMastery(a)] || 0);
      }
      return 0;
    });

    document.getElementById('main').innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Library</div>
          <div class="page-subtitle">${d.words.length} words total</div>
        </div>
        <button class="btn btn-primary" data-action="navigate" data-hash="#/add">＋ Add Word</button>
      </div>

      <div class="library-controls">
        <input class="search-input" type="search" placeholder="Search words or definitions…"
          value="${esc(search)}"
          data-oninput="search-lib" data-filter="${filter}" data-sort="${sort}">

        <div class="filter-chips">
          ${['all','new','learning','familiar','mastered','legendary'].map(f => `
            <button class="chip ${filter === f ? 'active' : ''}"
              data-action="filter-lib" data-filter="${f}" data-sort="${sort}">
              ${f === 'all' ? 'All' : masteryLabel(f)}
            </button>
          `).join('')}
        </div>

        <select class="form-select" style="width:auto"
          data-onchange="sort-lib" data-filter="${filter}">
          <option value="newest" ${sort==='newest'?'selected':''}>Newest</option>
          <option value="alpha"  ${sort==='alpha'?'selected':''}>A–Z</option>
          <option value="due"    ${sort==='due'?'selected':''}>Due Soon</option>
          <option value="mastery"${sort==='mastery'?'selected':''}>Mastery</option>
        </select>
      </div>

      ${sorted.length ? `
        <div class="words-grid">
          ${sorted.map(w => {
            const m = getMastery(w);
            const now = Date.now();
            const passiveDue = w.passive.nextReview <= now;
            const activeDue  = w.active.nextReview <= now;
            return `
              <div class="word-card" data-action="navigate" data-hash="#/word/${w.id}">
                <div class="word-card-top">
                  <div>
                    <div class="word-card-word">${esc(w.word)}</div>
                    <div class="word-card-pos">${esc(w.partOfSpeech)}</div>
                  </div>
                  <span class="badge badge-${m}">${masteryLabel(m)}</span>
                </div>
                <div class="word-card-def">${esc(w.definition)}</div>
                <div class="word-card-footer">
                  <div class="srs-dots">
                    <div class="srs-dot ${passiveDue ? 'passive' : ''}" title="Passive: ${formatNextReview(w.passive.nextReview)}"></div>
                    <div class="srs-dot ${activeDue  ? 'active'  : ''}" title="Active: ${formatNextReview(w.active.nextReview)}"></div>
                    <span class="srs-label">${passiveDue || activeDue ? 'Due' : 'Next: ' + formatNextReview(Math.min(w.passive.nextReview, w.active.nextReview))}</span>
                  </div>
                  ${w.usages.length > 0 ? `<span class="usage-count">🗣️ ${w.usages.length} use${w.usages.length !== 1 ? 's' : ''}</span>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>${filter === 'all' && !search ? 'No words yet' : 'No words found'}</h3>
          <p>${filter === 'all' && !search ? 'Start building your vocabulary!' : 'Try a different filter or search.'}</p>
          ${filter === 'all' && !search ? `<button class="btn btn-primary" data-action="navigate" data-hash="#/add">Add First Word</button>` : ''}
        </div>
      `}
    `;
  },

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW: WORD DETAIL
  // ──────────────────────────────────────────────────────────────────────────

  renderWordDetail(id) {
    const w = this.data.words.find(x => x.id === id);
    if (!w) { this.navigate('#/library'); return; }
    const m = getMastery(w);
    const p = w.passive, a = w.active;

    document.getElementById('main').innerHTML = `
      <div class="page-header">
        <button class="btn btn-secondary btn-sm" data-action="back">← Back</button>
        <div class="word-detail-actions">
          <button class="btn btn-secondary btn-sm" data-action="log-usage" data-id="${w.id}">🗣️ Log Usage (+${XP.log_usage} XP)</button>
          <button class="btn btn-secondary btn-sm" data-action="navigate" data-hash="#/edit/${w.id}">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" data-action="delete-word" data-id="${w.id}">Delete</button>
        </div>
      </div>

      <div class="word-detail-header">
        <div class="word-detail-main">
          <div class="word-big">${esc(w.word)}</div>
          ${w.phonetic ? `<div class="word-phonetic">${esc(w.phonetic)}</div>` : ''}
          <span class="badge badge-${m} word-pos">${masteryLabel(m)}</span>
          ${w.partOfSpeech ? `<span class="text-muted" style="margin-left:8px;font-size:0.9rem;font-style:italic">${esc(w.partOfSpeech)}</span>` : ''}
          <div class="text-muted mt-8" style="font-size:0.82rem">Added ${formatDate(w.dateAdded)} · ${w.usages.length} usage${w.usages.length !== 1 ? 's' : ''} logged</div>
        </div>
      </div>

      <div class="word-definition">${esc(w.definition)}</div>

      ${w.examples.filter(Boolean).length ? `
        <h3 style="margin-bottom:10px">Examples</h3>
        <ul class="examples-list">
          ${w.examples.filter(Boolean).map(ex => `<li class="example-item">"${esc(ex)}"</li>`).join('')}
        </ul>
      ` : ''}

      ${w.notes ? `
        <h3 style="margin:20px 0 10px">Notes</h3>
        <div class="text-muted" style="font-size:0.9rem;line-height:1.6">${esc(w.notes)}</div>
      ` : ''}

      ${w.tags.length ? `
        <div class="tags-wrap mt-16">
          ${w.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}
        </div>
      ` : ''}

      <div class="srs-panels">
        <div class="srs-panel passive">
          <div class="srs-panel-title">👁️ Passive (Recognition)</div>
          <div class="srs-stat"><span class="srs-stat-label">Repetitions</span><span class="srs-stat-value">${p.repetitions}</span></div>
          <div class="srs-stat"><span class="srs-stat-label">Interval</span><span class="srs-stat-value">${p.interval}d</span></div>
          <div class="srs-stat"><span class="srs-stat-label">Ease Factor</span><span class="srs-stat-value">${p.easeFactor.toFixed(2)}</span></div>
          <div class="srs-stat"><span class="srs-stat-label">Last Review</span><span class="srs-stat-value">${formatDate(p.lastReview)}</span></div>
          <div class="srs-stat"><span class="srs-stat-label">Next Review</span><span class="srs-stat-value">${formatNextReview(p.nextReview)}</span></div>
        </div>
        <div class="srs-panel active">
          <div class="srs-panel-title">✍️ Active (Production)</div>
          <div class="srs-stat"><span class="srs-stat-label">Repetitions</span><span class="srs-stat-value">${a.repetitions}</span></div>
          <div class="srs-stat"><span class="srs-stat-label">Interval</span><span class="srs-stat-value">${a.interval}d</span></div>
          <div class="srs-stat"><span class="srs-stat-label">Ease Factor</span><span class="srs-stat-value">${a.easeFactor.toFixed(2)}</span></div>
          <div class="srs-stat"><span class="srs-stat-label">Last Review</span><span class="srs-stat-value">${formatDate(a.lastReview)}</span></div>
          <div class="srs-stat"><span class="srs-stat-label">Next Review</span><span class="srs-stat-value">${formatNextReview(a.nextReview)}</span></div>
        </div>
      </div>

      <div class="usage-log mt-24">
        <div class="section-header">
          <h3>Usage Log <span class="text-muted" style="font-weight:400">(${w.usages.length})</span></h3>
          <button class="btn btn-secondary btn-sm" data-action="log-usage" data-id="${w.id}">+ Log Usage</button>
        </div>
        ${w.usages.length ? w.usages.slice().reverse().map(u => `
          <div class="usage-entry">
            <div class="usage-entry-context">"${esc(u.context)}"</div>
            <div class="usage-entry-meta">${u.type ? esc(u.type.charAt(0).toUpperCase() + u.type.slice(1)) + ' · ' : ''}${formatDate(u.date)}</div>
          </div>
        `).join('') : `
          <div class="text-muted" style="padding:20px 0;font-size:0.9rem">
            No usages logged yet. <strong>The golden rule:</strong> use your words in real life to truly own them!
          </div>
        `}
      </div>
    `;
  },

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW: ADD / EDIT WORD
  // ──────────────────────────────────────────────────────────────────────────

  renderAddWord(editId) {
    const existing = editId ? this.data.words.find(w => w.id === editId) : null;
    const w = existing || { word: '', definition: '', partOfSpeech: '', phonetic: '', examples: ['', '', ''], notes: '', tags: [] };
    const isEdit = !!existing;
    const partsOfSpeech = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection', 'phrase', 'other'];

    document.getElementById('main').innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">${isEdit ? 'Edit Word' : 'Add New Word'}</div>
          <div class="page-subtitle">${isEdit ? 'Update the details below' : 'Expand your vocabulary'}</div>
        </div>
        ${isEdit ? `<button class="btn btn-secondary btn-sm" data-action="back">Cancel</button>` : ''}
      </div>

      <div class="add-word-wrap">
        <div class="card">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Word *</label>
              <input id="f-word" class="form-input" type="text" placeholder="e.g. ephemeral"
                value="${esc(w.word)}" autocomplete="off" autocapitalize="none">
            </div>
            <div class="form-group">
              <label class="form-label">Part of Speech</label>
              <select id="f-pos" class="form-select">
                <option value="">— select —</option>
                ${partsOfSpeech.map(p => `<option value="${p}" ${w.partOfSpeech === p ? 'selected' : ''}>${p}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Phonetic Pronunciation</label>
            <input id="f-phonetic" class="form-input" type="text" placeholder="e.g. /ɪˈfem(ə)r(ə)l/"
              value="${esc(w.phonetic)}">
          </div>

          <div class="form-group">
            <label class="form-label">Definition *</label>
            <textarea id="f-def" class="form-textarea" rows="3"
              placeholder="Lasting for a very short time">${esc(w.definition)}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Example Sentences <span class="text-subtle">(up to 3)</span></label>
            <div class="example-inputs" id="example-inputs">
              ${[0, 1, 2].map(i => `
                <div class="example-row">
                  <input class="form-input example-input" type="text"
                    placeholder="Example sentence ${i + 1}…"
                    value="${esc((w.examples || [])[i] || '')}">
                </div>
              `).join('')}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea id="f-notes" class="form-textarea" rows="2"
              placeholder="Memory tips, etymology, synonyms…">${esc(w.notes)}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Tags</label>
            <input id="f-tags-input" class="form-input" type="text"
              placeholder="Type a tag and press Enter (e.g. formal, C1)">
            <div class="tags-wrap" id="f-tags">
              ${(w.tags || []).map(t => `
                <span class="tag">${esc(t)} <span class="tag-remove">×</span></span>
              `).join('')}
            </div>
            <div class="form-hint">Tags help you organise and filter your vocabulary</div>
          </div>

          <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:8px">
            <button class="btn btn-secondary" data-action="back">Cancel</button>
            <button class="btn btn-primary" data-action="save-word" data-id="${editId || ''}">
              ${isEdit ? '💾 Save Changes' : '＋ Add to Library'}
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('f-word').focus();
  },

  handleTagInput(e) {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const input = e.target;
    const val = input.value.trim().replace(/,/g, '');
    if (!val) return;
    const container = document.getElementById('f-tags');
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = val + ' ';
    const rm = document.createElement('span');
    rm.className = 'tag-remove';
    rm.textContent = '×';
    span.appendChild(rm);
    container.appendChild(span);
    input.value = '';
  },

  saveWord(editId) {
    const word = document.getElementById('f-word').value.trim();
    const definition = document.getElementById('f-def').value.trim();

    if (!word) { Toast.show('Please enter a word', 'xp'); return; }
    if (!definition) { Toast.show('Please enter a definition', 'xp'); return; }

    const pos    = document.getElementById('f-pos').value;
    const phon   = document.getElementById('f-phonetic').value.trim();
    const notes  = document.getElementById('f-notes').value.trim();
    const examples = [...document.querySelectorAll('.example-input')].map(el => el.value.trim()).filter(Boolean);
    const tags = [...document.querySelectorAll('#f-tags .tag')].map(el => el.textContent.replace('×', '').trim()).filter(Boolean);

    const d = this.data;

    if (editId) {
      const w = d.words.find(x => x.id === editId);
      if (!w) return;
      Object.assign(w, { word, definition, partOfSpeech: pos, phonetic: phon, notes, examples, tags });
      Toast.show(`Updated "${word}"`, 'success');
    } else {
      const newWord = {
        id: uid(),
        word,
        definition,
        partOfSpeech: pos,
        phonetic: phon,
        notes,
        examples,
        tags,
        dateAdded: Date.now(),
        passive: SM2.freshCard(0),    // due immediately for passive
        active: SM2.freshCard(1),     // delay active by 1 day
        usages: [],
      };
      d.words.push(newWord);
      Gamification.addXP(d, 10, `Added "${word}"`);
      Toast.show(`Added "${word}"! 🎉`, 'success');
    }

    Gamification.checkAchievements(d);
    this.save();
    this.navigate('#/library');
  },

  deleteWord(id) {
    const w = this.data.words.find(x => x.id === id);
    if (!w) return;
    if (!confirm(`Delete "${w.word}"? This cannot be undone.`)) return;
    this.data.words = this.data.words.filter(x => x.id !== id);
    this.save();
    Toast.show(`Deleted "${w.word}"`, 'success');
    this.navigate('#/library');
  },

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW: STUDY SESSION
  // ──────────────────────────────────────────────────────────────────────────

  renderStudy(mode = 'passive') {
    if (!['passive', 'active'].includes(mode)) mode = 'passive';

    const due = getDue(this.data.words, mode);

    if (due.length === 0) {
      document.getElementById('main').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${mode === 'passive' ? '👁️' : '✍️'}</div>
          <h3>All caught up!</h3>
          <p>No ${mode} reviews due right now. Great work!</p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary" data-action="navigate" data-hash="#/study/${mode === 'passive' ? 'active' : 'passive'}">
              Switch to ${mode === 'passive' ? 'Active' : 'Passive'} Study
            </button>
            <button class="btn btn-secondary" data-action="navigate" data-hash="#/add">Add New Word</button>
            <button class="btn btn-secondary" data-action="navigate" data-hash="#/dashboard">Dashboard</button>
          </div>
        </div>
      `;
      return;
    }

    // Build session
    this.session = {
      mode,
      queue: shuffle(due),
      index: 0,
      results: [],    // { word, quality }
      xpEarned: 0,
      startTime: Date.now(),
    };

    this.renderStudyCard();
  },

  renderStudyCard() {
    const s = this.session;
    if (!s || s.index >= s.queue.length) {
      this.finishSession();
      return;
    }

    const word = s.queue[s.index];
    const total = s.queue.length;
    const done  = s.index;
    const pct   = total > 0 ? (done / total) * 100 : 0;
    const mode  = s.mode;

    const p = SM2.preview(word[mode]);
    const modeLabel = mode === 'passive' ? 'Passive Study' : 'Active Study';
    const modeColor = mode === 'passive' ? 'var(--info)' : 'var(--success)';

    document.getElementById('main').innerHTML = `
      <div class="study-header">
        <div class="study-mode-badge ${mode}">${mode === 'passive' ? '👁️' : '✍️'} ${modeLabel}</div>
        <div class="study-progress">
          <div class="study-progress-bar">
            <div class="study-progress-fill" style="background:${modeColor};width:${pct.toFixed(1)}%"></div>
          </div>
          <div class="study-progress-text">${done} / ${total}</div>
        </div>
        <button class="btn btn-secondary btn-sm" data-action="end-session">End Session</button>
      </div>

      <div class="study-card-wrap">
        <div class="flashcard ${mode}">
          ${mode === 'passive' ? `
            <div class="card-front" id="card-front">
              <div class="card-prompt">What does this word mean?</div>
              <div class="card-word">${esc(word.word)}</div>
              ${word.partOfSpeech ? `<div class="card-pos">${esc(word.partOfSpeech)}</div>` : ''}
              <button class="btn btn-primary reveal-btn" data-action="reveal-card">Reveal Definition</button>
            </div>
            <div class="card-answer" id="card-answer">
              <div class="card-prompt">Definition</div>
              <div class="card-definition">${esc(word.definition)}</div>
              ${word.examples[0] ? `<div class="card-example">${esc(word.examples[0])}</div>` : ''}
            </div>
          ` : `
            <div class="card-front" id="card-front">
              <div class="card-prompt">What's the word?</div>
              <div class="card-definition">${esc(word.definition)}</div>
              ${word.partOfSpeech ? `<div class="card-pos">${esc(word.partOfSpeech)}</div>` : ''}
              <button class="btn btn-success reveal-btn" data-action="reveal-card">Reveal Word</button>
            </div>
            <div class="card-answer" id="card-answer">
              <div class="card-prompt">The word is</div>
              <div class="card-word">${esc(word.word)}</div>
              ${word.phonetic ? `<div class="card-pos">${esc(word.phonetic)}</div>` : ''}
              ${word.examples[0] ? `<div class="card-example">"${esc(word.examples[0])}"</div>` : ''}
            </div>
          `}
        </div>

        <div class="rating-section" id="rating-section">
          <div class="rating-label">How well did you know it?</div>
          <div class="rating-buttons">
            <button class="rating-btn again" data-action="rate" data-q="1">
              <span class="r-label">Again</span>
              <span class="r-interval">${SM2.formatInterval(p.again)}</span>
            </button>
            <button class="rating-btn hard" data-action="rate" data-q="3">
              <span class="r-label">Hard</span>
              <span class="r-interval">${SM2.formatInterval(p.hard)}</span>
            </button>
            <button class="rating-btn good" data-action="rate" data-q="4">
              <span class="r-label">Good</span>
              <span class="r-interval">${SM2.formatInterval(p.good)}</span>
            </button>
            <button class="rating-btn easy" data-action="rate" data-q="5">
              <span class="r-label">Easy</span>
              <span class="r-interval">${SM2.formatInterval(p.easy)}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  revealCard() {
    document.getElementById('card-front').classList.add('hidden');
    document.getElementById('card-answer').classList.add('revealed');
    document.getElementById('rating-section').classList.add('visible');
  },

  rate(quality) {
    const s = this.session;
    const word = s.queue[s.index];
    const mode = s.mode;

    const updated = SM2.update(word[mode], quality);
    Object.assign(word[mode], updated);

    const correct = quality >= 3;
    const xpKey = `${mode}_${correct ? 'correct' : 'wrong'}`;
    const xpGain = XP[xpKey] || 0;

    Gamification.addXP(this.data, xpGain, correct ? `Correct! (${mode})` : `Keep trying! (${mode})`);
    s.xpEarned += xpGain;
    s.results.push({ word, quality, correct });
    s.index++;

    this.data.stats.totalReviews++;
    Gamification.checkStreak(this.data);
    Gamification.checkAchievements(this.data);
    this.save();
    this.renderStudyCard();
  },

  endSession() {
    if (this.session && this.session.results.length === 0) {
      this.navigate('#/dashboard');
      return;
    }
    this.finishSession();
  },

  finishSession() {
    const s = this.session;
    if (!s) { this.navigate('#/dashboard'); return; }

    const total   = s.results.length;
    const correct = s.results.filter(r => r.correct).length;
    const elapsed = Math.round((Date.now() - s.startTime) / 60000);

    this.session = { ...s, summary: { total, correct, elapsed } };
    this.renderSessionComplete();
  },

  renderSessionComplete() {
    const s = this.session;
    if (!s || !s.summary) { this.navigate('#/dashboard'); return; }

    const { total, correct, elapsed } = s.summary;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    const emoji = pct >= 90 ? '🎉' : pct >= 70 ? '👍' : pct >= 50 ? '📚' : '💪';
    const message = pct >= 90 ? 'Outstanding!' : pct >= 70 ? 'Great session!' : pct >= 50 ? 'Good effort!' : 'Keep going!';

    document.getElementById('main').innerHTML = `
      <div class="session-complete">
        <div class="session-emoji">${emoji}</div>
        <div class="session-title">${message}</div>
        <div class="session-subtitle">
          ${s.mode === 'passive' ? 'Passive' : 'Active'} study session complete
        </div>
        <div class="session-stats">
          <div class="session-stat correct">
            <div class="val">${correct}/${total}</div>
            <div class="lbl">Correct</div>
          </div>
          <div class="session-stat xp">
            <div class="val">+${s.xpEarned}</div>
            <div class="lbl">XP Earned</div>
          </div>
          <div class="session-stat time">
            <div class="val">${elapsed || '<1'}</div>
            <div class="lbl">Minutes</div>
          </div>
        </div>
        <div class="session-actions">
          <button class="btn btn-primary" data-action="study" data-mode="${s.mode}">Study Again</button>
          <button class="btn btn-secondary" data-action="study" data-mode="${s.mode === 'passive' ? 'active' : 'passive'}">
            Switch to ${s.mode === 'passive' ? 'Active' : 'Passive'}
          </button>
          <button class="btn btn-secondary" data-action="navigate" data-hash="#/dashboard">Dashboard</button>
        </div>
      </div>
    `;
  },

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW: ACHIEVEMENTS
  // ──────────────────────────────────────────────────────────────────────────

  renderAchievements() {
    const earned = this.data.stats.achievements;
    const earnedIds = new Set(earned.map(e => e.id));
    const sorted = [...ACHIEVEMENTS].sort((a, b) => {
      const aE = earnedIds.has(a.id), bE = earnedIds.has(b.id);
      if (aE && !bE) return -1;
      if (!aE && bE) return 1;
      return 0;
    });

    document.getElementById('main').innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Achievements</div>
          <div class="page-subtitle">${earned.length} / ${ACHIEVEMENTS.length} unlocked</div>
        </div>
      </div>

      <div class="achievements-grid">
        ${sorted.map(ach => {
          const e = earned.find(x => x.id === ach.id);
          return `
            <div class="achievement ${e ? 'unlocked' : 'locked'}">
              <div class="achievement-icon">${ach.icon}</div>
              <div>
                <div class="achievement-name">${esc(ach.name)}</div>
                <div class="achievement-desc">${esc(ach.desc)}</div>
                ${e ? `<div class="achievement-date">Unlocked ${formatDate(e.date)}</div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  // ──────────────────────────────────────────────────────────────────────────
  // LOG USAGE MODAL
  // ──────────────────────────────────────────────────────────────────────────

  openLogUsage(wordId) {
    const w = this.data.words.find(x => x.id === wordId);
    if (!w) return;

    this.openModal(`
      <div class="modal-title">🗣️ Log Word Usage</div>
      <p class="text-muted mb-16" style="font-size:0.9rem">
        <strong>${esc(w.word)}</strong> — using words in real life is the key to true fluency!
      </p>
      <div class="form-group">
        <label class="form-label">How did you use it?</label>
        <textarea id="usage-context" class="form-textarea" rows="3"
          placeholder='e.g. "I told my friend the meeting was ephemeral."'></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Context</label>
        <select id="usage-type" class="form-select">
          <option value="spoken">Spoken conversation</option>
          <option value="written">Written (email, chat, notes)</option>
          <option value="thought">Internal thought / monologue</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary" data-action="save-usage" data-id="${wordId}">Log Usage (+${XP.log_usage} XP)</button>
      </div>
    `);

    setTimeout(() => document.getElementById('usage-context')?.focus(), 50);
  },

  saveUsage(wordId) {
    const context = document.getElementById('usage-context').value.trim();
    const type    = document.getElementById('usage-type').value;

    if (!context) { Toast.show('Please describe how you used the word', 'xp'); return; }

    const d = this.data;
    const w = d.words.find(x => x.id === wordId);
    if (!w) return;

    const isFirst = w.usages.length === 0;
    w.usages.push({ id: uid(), date: Date.now(), context, type });
    d.stats.totalUsages++;

    Gamification.addXP(d, XP.log_usage, `Used "${w.word}"`);
    if (isFirst) Gamification.addXP(d, XP.first_usage, `First time using "${w.word}"!`);

    Gamification.checkAchievements(d);
    this.save();
    this.closeModal();
    Toast.show(`Usage logged! 🗣️`, 'success');

    // Re-render word detail if we're on it
    if (this.view === 'word') this.renderWordDetail(wordId);
    if (this.view === 'dashboard') this.renderDashboard();
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// BOOT
// ──────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => App.init());
