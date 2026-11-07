const fs = require('fs');
const { spawn } = require('child_process');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) =>
      reject(new Error(`Could not start "${cmd}": ${e.message}. Is it installed and on PATH?`))
    );
    p.on('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${cmd} exited with ${code}\n${err.slice(-1500)}`))
    );
  });
}

/** Pull the first JSON object/array out of an LLM reply, tolerating ``` fences. */
function parseJson(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.search(/[\[{]/);
  if (start === -1) throw new Error('No JSON found in model reply');
  const open = cleaned[start];
  const close = open === '{' ? '}' : ']';
  const end = cleaned.lastIndexOf(close);
  return JSON.parse(cleaned.slice(start, end + 1));
}

function slugify(s) {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
  // Non-Latin titles (e.g. Bangla) slugify to nothing; use a time stamp so runs never overwrite each other.
  return slug || `video-${localTime().replace(/:/g, '')}`;
}

const pad = (n) => String(n).padStart(2, '0');

/** HH:MM:SS in the machine's own time zone (TZ=Asia/Dhaka in Docker), not UTC. */
const localTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** YYYY-MM-DD in the machine's own time zone. */
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const log = (...a) => console.log(`[${localTime()}]`, ...a);

module.exports = { ensureDir, run, parseJson, slugify, log, localTime, localDate };
