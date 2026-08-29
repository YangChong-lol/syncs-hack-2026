if (!FT.getToken()) location.href = 'index.html';

// Shared app state + interface. The swipe deck (tab-swipe) should use:
//   FTApp.getMatches()             cached matches fetch (same data as Explore)
//   FTApp.sendInvite(toId, dishes) send a cooking invite (use on right swipe)
//   FTApp.refreshMatches()         drop cache and refetch
//   FTApp.state.me                 current user profile (null until loaded)
//   FTApp.onMeChanged(fn)          subscribe to profile/invite updates
const FTApp = {
  state: { me: null, profileComplete: false },
  _matchesPromise: null,
  _meListeners: [],

  onMeChanged(fn) { this._meListeners.push(fn); },

  async loadMe() {
    const data = await api('/api/me');
    this.state.me = data;
    this.state.profileComplete = data.profile_complete;
    this._meListeners.forEach((fn) => fn(data));
    updateGates();
    updateBadge();
    return data;
  },

  getMatches() {
    if (!this._matchesPromise) this._matchesPromise = api('/api/matches');
    return this._matchesPromise;
  },

  refreshMatches() {
    this._matchesPromise = null;
    return this.getMatches();
  },

  async sendInvite(toId, dishes) {
    const r = await api('/api/invite', { toId, dishes });
    this.loadMe().catch(() => {});
    return r;
  },

  goTab(name) { switchTab(name); },
};

// ---------- tabs ----------

const TABS = ['swipe', 'explore', 'profile'];
let activeTab = null;

function switchTab(name) {
  if (!TABS.includes(name)) name = 'explore';
  activeTab = name;
  TABS.forEach((t) => {
    el('tab-' + t).classList.toggle('hidden', t !== name);
    el('tabbtn-' + t).classList.toggle('active', t === name);
  });
  location.hash = name;
  document.dispatchEvent(new CustomEvent('tabshown', { detail: name }));
}

TABS.forEach((t) => el('tabbtn-' + t).addEventListener('click', () => switchTab(t)));

function updateGates() {
  const ok = FTApp.state.profileComplete;
  el('swipeLock').classList.toggle('hidden', ok);
  el('swipeReady').classList.toggle('hidden', !ok);
  el('exploreLock').classList.toggle('hidden', ok);
  el('exploreMain').classList.toggle('hidden', !ok);
}

function updateBadge() {
  const me = FTApp.state.me;
  const pending = me ? me.invites_received.filter((i) => i.status === 'pending').length : 0;
  const badge = el('profileBadge');
  badge.textContent = pending;
  badge.classList.toggle('hidden', pending === 0);
}

el('logoutBtn').addEventListener('click', () => FT.logout());

// ---------- boot ----------

(async () => {
  try {
    await FTApp.loadMe();
  } catch (e) {
    return; // 401 already redirected to login
  }
  const wanted = location.hash.replace('#', '');
  switchTab(wanted || (FTApp.state.profileComplete ? 'explore' : 'profile'));
})();

// Poll for invite updates (e.g. a neighbour accepting) every 10s.
setInterval(() => {
  FTApp.loadMe().catch(() => {});
}, 10000);
