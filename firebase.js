'use strict';

// Firebase REST API wrapper — no SDK, works in both extension pages and service workers.
// Requires config.js to be loaded first (FIREBASE_API_KEY, FIREBASE_PROJECT_ID).

const FB = {
  AUTH_KEY: 'lexiflow_auth',

  get configured() {
    return !!(
      typeof FIREBASE_API_KEY    !== 'undefined' && FIREBASE_API_KEY &&
      typeof FIREBASE_PROJECT_ID !== 'undefined' && FIREBASE_PROJECT_ID
    );
  },

  // ── Auth ──────────────────────────────────────────────────────────────────

  async signIn(email, password) {
    const data = await this._authRequest('signInWithPassword', { email, password });
    await this._storeTokens(data.idToken, data.refreshToken, data.localId);
    return data.localId;
  },

  async signUp(email, password) {
    const data = await this._authRequest('signUp', { email, password });
    await this._storeTokens(data.idToken, data.refreshToken, data.localId);
    return data.localId;
  },

  async signOut() {
    await chrome.storage.local.remove(this.AUTH_KEY);
  },

  async getAuth() {
    const r = await chrome.storage.local.get(this.AUTH_KEY);
    return r[this.AUTH_KEY] || null;
  },

  async getIdToken() {
    const auth = await this.getAuth();
    if (!auth) return null;
    // Refresh proactively when within 5 minutes of expiry
    if (Date.now() >= auth.expiresAt - 300_000) {
      return this._refreshToken(auth.refreshToken);
    }
    return auth.idToken;
  },

  async _authRequest(endpoint, body) {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, returnSecureToken: true }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      const msg = data.error?.message || 'Authentication failed';
      throw new Error(msg);
    }
    return data;
  },

  async _refreshToken(refreshToken) {
    const res = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error('Token refresh failed');
    const existing = await this.getAuth();
    await this._storeTokens(data.id_token, data.refresh_token, existing?.userId);
    return data.id_token;
  },

  async _storeTokens(idToken, refreshToken, userId) {
    const existing = await this.getAuth();
    await chrome.storage.local.set({
      [this.AUTH_KEY]: {
        idToken,
        refreshToken,
        userId: userId || existing?.userId,
        expiresAt: Date.now() + 3_600_000, // 1 hour
      },
    });
  },

  // ── Firestore ─────────────────────────────────────────────────────────────

  _docUrl(userId) {
    return `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${userId}/vocab/data`;
  },

  async load() {
    if (!this.configured) return null;
    const auth = await this.getAuth();
    if (!auth?.userId) return null;
    const idToken = await this.getIdToken();
    if (!idToken) return null;

    const res = await fetch(this._docUrl(auth.userId), {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.status === 404) return null; // document doesn't exist yet
    if (!res.ok) throw new Error(`Firestore load failed (${res.status})`);
    const doc = await res.json();
    return JSON.parse(doc.fields?.payload?.stringValue || 'null');
  },

  async save(data) {
    if (!this.configured) return;
    const auth = await this.getAuth();
    if (!auth?.userId) return;
    const idToken = await this.getIdToken();
    if (!idToken) return;

    const res = await fetch(this._docUrl(auth.userId), {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: { payload: { stringValue: JSON.stringify(data) } },
      }),
    });
    if (!res.ok) throw new Error(`Firestore save failed (${res.status})`);
  },
};
