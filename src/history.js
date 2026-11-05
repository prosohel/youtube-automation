const fs = require('fs');
const cfg = require('./config');

/** Past videos ({ topic, title, url, theme, at }), used to avoid repeating topics and themes. */
const fileBackend = {
  load() {
    try {
      return JSON.parse(fs.readFileSync(cfg.HISTORY_FILE, 'utf8'));
    } catch {
      return [];
    }
  },
  save(entry) {
    const h = fileBackend.load();
    h.push(entry);
    fs.writeFileSync(cfg.HISTORY_FILE, JSON.stringify(h, null, 2));
  },
};

let backend = fileBackend;

/** The CLI keeps history.json; the worker swaps in its Redis-backed list. load() must be synchronous. */
function setHistoryBackend(b) {
  backend = b || fileBackend;
}

const loadHistory = () => backend.load();
const saveHistory = (entry) => backend.save({ ...entry, at: new Date().toISOString() });

module.exports = { loadHistory, saveHistory, setHistoryBackend };
