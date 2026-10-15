"""Builds index.html from the Claude Design export plus the Firebase sync layer.

Run from the project folder:  python build/build.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / "Design" / "flip-ledger.html").read_text(encoding="utf-8")
sync = (ROOT / "build" / "sync.js").read_text(encoding="utf-8")


def sub(old, new, count=1):
    global src
    found = src.count(old)
    assert found == count, f"expected {count} match(es), found {found}: {old[:70]!r}"
    src = src.replace(old, new)


FB = "https://www.gstatic.com/firebasejs/10.12.2/"

# 1. Load as a module with the Firebase SDK.
sub("<script>\n'use strict';", f"""<script type="module">
import {{ initializeApp }} from '{FB}firebase-app.js';
import {{ getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut }} from '{FB}firebase-auth.js';
import {{ getDatabase, ref, onValue, update }} from '{FB}firebase-database.js';
window.__flLoaded = true;""")

# 2. State comes from the cache or the cloud, not straight from localStorage.
sub("""function loadState() {
  let saved = null;
  try { const raw = localStorage.getItem(KEY); if (raw) saved = JSON.parse(raw); } catch (e) { saved = null; }
""", "function loadState(saved) {\n")

old_save = src[src.index("let saveTimer = 0;"):src.index("/* ================= Math")]
sub(old_save, sync + "\n")

# 3. Remember the theme so the sign-in screen matches before data loads.
sub("  document.documentElement.className = t === 'light' ? 'th-light' : 'th-dark';",
    "  document.documentElement.className = t === 'light' ? 'th-light' : 'th-dark';\n  try { localStorage.setItem(KEY + '.theme', S.settings.theme); } catch (e) {}")
sub("mq.addEventListener && mq.addEventListener('change', () => { applyTheme();",
    "mq.addEventListener && mq.addEventListener('change', () => { if (!S) { earlyTheme(); return; } applyTheme();")

# 4. Sidebar status starts as connecting.
sub('<span id="savedLabel">Saved on this device</span>', '<span id="savedLabel">Connecting…</span>')

# 5. Settings › Data: account, sync status, new copy.
sub("""<section class="grp"><h2>Data</h2><div class="list">
""", """<section class="grp"><h2>Data</h2><div class="list">
        ${srow('Signed in as <span style="color:var(--t3)">' + esc(SYNC.user ? SYNC.user.email || '' : '') + '</span>', '<button class="btn btn-sec btn-sm" data-act="signOut">Sign out</button>')}
        ${srow('Sync', '<span id="syncRow" style="font-size:15px">Synced</span>')}
""")
sub("Everything is saved in this browser on this device. Use Back up to keep a copy or move it to another device.",
    "Everything syncs to your account, so your phone and computer always match. Back up saves a copy as a file.")
sub("case 'reset': try { localStorage.removeItem(KEY); } catch (e) {} S.settings", "case 'reset': S.settings")
sub("    case 'askReset':", "    case 'signOut': doSignOut(); break;\n    case 'askReset':")
sub("function render() {\n", "function render() {\n  if (!S) return;\n")
sub("  if (S.ui.screen === 'estimate') { renderPbar(); countUp(); }\n  renderOverlay();\n",
    "  if (S.ui.screen === 'estimate') { renderPbar(); countUp(); }\n  renderOverlay();\n  syncLabel();\n")

# 6. Guards for events that can fire before sign-in.
sub("document.addEventListener('keydown', (e) => {\n  const el = e.target;", "document.addEventListener('keydown', (e) => {\n  if (!S) return;\n  const el = e.target;")
sub("  if (dragY == null) return;", "  if (dragY == null || !S) return;")
sub("function route() {\n", "function route() {\n  if (!S) return;\n")
sub("rz = setTimeout(() => { if (S.ui.screen === 'route')", "rz = setTimeout(() => { if (!S) return; if (S.ui.screen === 'route')")

# 7. Start: wait for Google sign-in, then load from the cloud.
sub("""loadState();
applyTheme();
route();
[S.settings.homeZip, S.route.to].forEach((z) => { if (/^\\d{5}$/.test(z) && !S.zip[z]) lookupZip(z).then(() => { if (S.ui.screen === 'route') refreshRoute(); }); });
""", """function earlyTheme() {
  let t = 'system'; try { t = localStorage.getItem(KEY + '.theme') || 'system'; } catch (e) {}
  const dark = t === 'dark' || (t === 'system' && mq.matches);
  document.documentElement.className = dark ? 'th-dark' : 'th-light';
}
earlyTheme();
showGate('loading');
getRedirectResult(fbAuth).catch(() => {});
onAuthStateChanged(fbAuth, (u) => {
  if (u) { if (!SYNC.user || SYNC.user.uid !== u.uid) bootUser(u); }
  else showGate('signin');
});
""")

# 8. Sign-in screen markup and styles.
sub('<div id="toast" role="status" aria-live="polite"></div>', """<div id="toast" role="status" aria-live="polite"></div>
<div id="gate" class="gate"><div class="gate-card"><div class="mark" aria-hidden="true"><i></i><i></i><i></i></div><h1>Flip Ledger</h1><div id="gateBody" class="gate-body"><span class="spin" role="status" aria-label="Loading"></span></div></div></div>
<script>setTimeout(function(){if(!window.__flLoaded){var b=document.getElementById('gateBody');if(b)b.innerHTML='<p>Flip Ledger couldn\\'t load. Check your connection and reload.</p>';}},10000);</script>""")
sub("</style>", """
/* ---------- Sign-in ---------- */
.gate{position:fixed;inset:0;z-index:100;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:24px 24px calc(24px + env(safe-area-inset-bottom))}
.gate[hidden]{display:none}
.gate-card{width:min(380px,100%);display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;animation:tin .4s cubic-bezier(.22,1,.36,1)}
.gate .mark{width:64px;height:64px;border-radius:18px;padding:0 16px;gap:7px}
.gate .mark i{height:4px;border-radius:2px}
.gate h1{margin:12px 0 0;font-size:40px;line-height:44px;font-weight:600;letter-spacing:-.035em}
.gate-body{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;min-height:150px}
.gate-body p{margin:0;font-size:17px;line-height:1.5;color:var(--t2)}
.gate .gbtn{width:100%;height:52px;font-size:17px;margin-top:20px;gap:12px;background:var(--s1);box-shadow:var(--card-shadow),inset 0 0 0 1px var(--line)}
.gate .gbtn:hover{background:var(--s2)}
.gate .err{font-size:14px;color:var(--neg);min-height:21px}
.gate .fine{font-size:13px;color:var(--t3)}
.spin{width:22px;height:22px;margin-top:24px;border-radius:50%;border:2px solid var(--s3);border-top-color:var(--t2);animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>""")

out = ROOT / "index.html"
out.write_text(src, encoding="utf-8")
print("wrote", out, len(src), "bytes")
