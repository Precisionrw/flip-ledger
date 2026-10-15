# Flip Ledger

Profit estimator and inventory tracker for flipping GPUs, PC parts and whole PCs.
Live at https://precisionrw.github.io/flip-ledger/

- `index.html` is the whole app. It's built from `Design/flip-ledger.html` (the Claude Design export) plus `build/sync.js` (Google sign-in and Firebase sync).
- To rebuild after changing either file: `python build/build.py`
- `database.rules.json` holds the Firebase Realtime Database rules. Paste it into Firebase › Realtime Database › Rules.
