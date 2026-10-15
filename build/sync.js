/* ================= Cloud sync (Firebase Realtime Database) =================
   Layout: users/<uid>/{settings, est, route} and users/<uid>/items/<id>, each a JSON string.
   Strings keep empty arrays, empty objects and odd category names intact.
   Every key that changed locally but isn't confirmed by the server is "pending";
   pending keys win over the server copy, so edits made offline survive a reload. */
const FB_CONFIG = {
  apiKey: 'AIzaSyDJJvMrcnlw-5XPMzB7KrUAwMD4xUchUsQ',
  authDomain: 'flip-ledger-497fc.firebaseapp.com',
  databaseURL: 'https://flip-ledger-497fc-default-rtdb.firebaseio.com',
  projectId: 'flip-ledger-497fc',
  storageBucket: 'flip-ledger-497fc.firebasestorage.app',
  messagingSenderId: '878080757630',
  appId: '1:878080757630:web:35fc57c1107251af332d2f'
};
const fbApp = initializeApp(FB_CONFIG), fbAuth = getAuth(fbApp), fbDb = getDatabase(fbApp);
const SYNC = { user: null, ref: null, unsub: null, synced: {}, pending: new Set(), first: true, online: true, busy: 0, error: '', deferRender: false, t0: Date.now() };
const cacheKey = () => KEY + '.' + (SYNC.user ? SYNC.user.uid : 'anon');
function readCache() { try { const raw = localStorage.getItem(cacheKey()); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
function writeCache() {
  if (!S || !SYNC.user) return;
  try { localStorage.setItem(cacheKey(), JSON.stringify({ settings: S.settings, items: S.items, est: S.est, route: S.route, zip: S.zip, synced: SYNC.synced, pending: Array.from(SYNC.pending) })); } catch (e) {}
}
let saveTimer = 0;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); }
function saveNow() { if (!S || !SYNC.user) return; pushCloud(); writeCache(); syncLabel(); }
function stateMap() {
  const m = { settings: JSON.stringify(S.settings), est: JSON.stringify(S.est), route: JSON.stringify(S.route) };
  S.items.forEach((it) => { m['items/' + it.id] = JSON.stringify(it); });
  return m;
}
function pushCloud() {
  if (!SYNC.user || !SYNC.ref) return;
  const cur = stateMap(), up = {};
  for (const k in cur) if (cur[k] !== SYNC.synced[k]) up[k] = cur[k];
  for (const k in SYNC.synced) if (k.indexOf('items/') === 0 && !(k in cur)) up[k] = null;
  const keys = Object.keys(up);
  if (!keys.length) return;
  keys.forEach((k) => { SYNC.pending.add(k); if (up[k] == null) delete SYNC.synced[k]; else SYNC.synced[k] = up[k]; });
  SYNC.busy++; syncLabel();
  update(SYNC.ref, up)
    .then(() => { keys.forEach((k) => { if ((SYNC.synced[k] == null ? null : SYNC.synced[k]) === up[k]) SYNC.pending.delete(k); }); SYNC.error = ''; writeCache(); })
    .catch((e) => { SYNC.error = String(e && (e.code || e.message) || '').toLowerCase().indexOf('permission') >= 0 ? 'denied' : 'error'; keys.forEach((k) => { if (up[k] != null) delete SYNC.synced[k]; }); writeCache(); })
    .finally(() => { SYNC.busy--; syncLabel(); });
}
const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
function normItem(o) { const it = Object.assign(baseItem({}), o); it.dates = it.dates || {}; it.checks = it.checks || {}; it.parts = Array.isArray(it.parts) ? it.parts : []; return it; }
function onRemote(snap) {
  const v = snap.val() || {}, remote = {};
  ['settings', 'est', 'route'].forEach((k) => { if (typeof v[k] === 'string') remote[k] = v[k]; });
  if (v.items) Object.keys(v.items).forEach((id) => { if (typeof v.items[id] === 'string') remote['items/' + id] = v.items[id]; });
  const firstEver = SYNC.first;
  SYNC.first = false;
  hideGate();
  if (!Object.keys(remote).length) {
    /* Brand-new account (or everything erased elsewhere). Push what this device has. */
    if (firstEver) { SYNC.synced = {}; render(); pushCloud(); writeCache(); syncLabel(); return; }
  }
  let changed = firstEver;
  if (!changed) { const all = new Set(Object.keys(remote).concat(Object.keys(SYNC.synced))); for (const k of all) if (remote[k] !== SYNC.synced[k]) { changed = true; break; } }
  SYNC.synced = remote;
  if (!changed) { syncLabel(); return; }
  const local = stateMap();
  const pick = (k) => (SYNC.pending.has(k) ? local[k] : remote[k]);
  const settings = Object.assign(DEFAULT_SETTINGS(), parseJ(pick('settings'), S.settings));
  const ids = new Set(Object.keys(remote).concat(Object.keys(local)).filter((k) => k.indexOf('items/') === 0).map((k) => k.slice(6)));
  const items = [];
  ids.forEach((id) => { const s = pick('items/' + id); if (s) items.push(normItem(parseJ(s, {}))); });
  items.sort((a, b) => (lastDate(b) > lastDate(a) ? 1 : -1));
  S.settings = settings;
  S.items = items;
  S.est = Object.assign(blankDraft(settings), parseJ(pick('est'), S.est));
  S.route = Object.assign(S.route, parseJ(pick('route'), {}));
  applyTheme(); writeCache();
  if (editing()) SYNC.deferRender = true; else render();
  if (firstEver) pushCloud();
  syncLabel();
}
function editing() { const a = document.activeElement; return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.dataset && a.dataset.f); }
document.addEventListener('focusout', () => { setTimeout(() => { if (SYNC.deferRender && !editing()) { SYNC.deferRender = false; render(); } }, 0); });
function syncLabel() {
  if (!SYNC.user) return;
  let t, c;
  if (SYNC.error === 'denied') { t = "Can't sync. Check the database rules"; c = 'var(--neg)'; }
  else if (!SYNC.online) { t = SYNC.pending.size ? 'Offline · will sync' : 'Offline'; c = 'var(--warn)'; }
  else if (SYNC.busy || SYNC.pending.size) { t = 'Saving…'; c = 'var(--t3)'; }
  else if (SYNC.error) { t = 'Not synced yet · retrying'; c = 'var(--warn)'; }
  else { t = 'Synced'; c = 'var(--pos)'; }
  const el = $('#savedLabel'), dot = $('.side-foot .dot8'), row2 = $('#syncRow');
  if (el) el.textContent = t;
  if (dot) dot.style.background = c;
  if (row2) { row2.textContent = t; row2.style.color = c; }
}
onValue(ref(fbDb, '.info/connected'), (s) => {
  const on = !!s.val();
  if (!on && Date.now() - SYNC.t0 < 3000) return;
  SYNC.online = on; syncLabel();
  if (on && SYNC.error && S) { SYNC.error = ''; pushCloud(); }
});

/* ---------- Sign-in gate ---------- */
function showGate(mode, msg) {
  const g = $('#gate');
  g.hidden = false;
  $('.shell').setAttribute('aria-hidden', 'true');
  $('#gateBody').innerHTML = mode === 'loading'
    ? '<span class="spin" role="status" aria-label="Loading"></span>'
    : `<p>Sign in to keep your inventory, sales and settings in sync on every device.</p>
       <button class="btn btn-sec gbtn" type="button" data-gate="google"><svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Continue with Google</button>
       <p class="err" role="alert">${esc(msg || '')}</p>
       <p class="fine">Only you can see your data.</p>`;
}
function hideGate() { const g = $('#gate'); if (g.hidden) return; g.hidden = true; $('.shell').removeAttribute('aria-hidden'); }
async function signIn() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  try { await signInWithPopup(fbAuth, p); }
  catch (e) {
    const c = (e && e.code) || '';
    if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment') { await signInWithRedirect(fbAuth, p); return; }
    if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return;
    showGate('signin', c === 'auth/unauthorized-domain' ? "This site's address isn't approved yet. In Firebase, add it under Authentication › Settings › Authorized domains." : c === 'auth/network-request-failed' ? "You're offline. Connect and try again." : "Couldn't sign in. Try again.");
  }
}
document.addEventListener('click', (e) => { const g = e.target.closest('[data-gate]'); if (g) { e.preventDefault(); signIn(); } });
function bootUser(user) {
  SYNC.user = user;
  const c = readCache();
  SYNC.synced = (c && c.synced) || {};
  SYNC.pending = new Set((c && c.pending) || []);
  SYNC.first = true;
  loadState(c);
  if (c) S.items = S.items.map(normItem);
  applyTheme();
  if (c) hideGate(); else showGate('loading');
  route();
  [S.settings.homeZip, S.route.to].forEach((z) => { if (/^\d{5}$/.test(z) && !S.zip[z]) lookupZip(z).then(() => { if (S.ui.screen === 'route') refreshRoute(); }); });
  SYNC.ref = ref(fbDb, 'users/' + user.uid);
  SYNC.unsub = onValue(SYNC.ref, onRemote, () => { SYNC.error = 'denied'; hideGate(); syncLabel(); });
  syncLabel();
}
async function doSignOut() {
  clearTimeout(saveTimer); saveNow();
  if (SYNC.unsub) SYNC.unsub();
  await signOut(fbAuth);
  location.reload();
}
