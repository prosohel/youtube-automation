// Cloudflare R2 (S3-compatible) as the video store. STORAGE=r2 uploads every finished video, thumbnail and
// script; the dashboard streams them from R2 through short-lived signed links; local copies are removed a few
// days after publishing (and fetched back from R2 if a publisher needs one again). STORAGE=local: nothing here runs.
// R2 has no egress fees and 10 GB free, so a year of Shorts costs well under $1 a month.

const fs = require('fs');
const path = require('path');
const cfg = require('./config');

let client = null;
function s3() {
  if (client) return client;
  const { S3Client } = require('@aws-sdk/client-s3');
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.r2.accessKey, secretAccessKey: cfg.r2.secret },
  });
  return client;
}

/** True when STORAGE=r2 and every credential is set. */
const enabled = () => cfg.storage === 'r2' && Boolean(cfg.r2.accountId && cfg.r2.accessKey && cfg.r2.secret && cfg.r2.bucket);

/** What is missing for R2, as a short list (for the settings page / startup log). */
function missing() {
  if (cfg.storage !== 'r2') return [];
  return ['accountId', 'accessKey', 'secret', 'bucket'].filter((k) => !cfg.r2[k]).map((k) => `R2_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`);
}

const TYPES = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const contentType = (file) => TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';

/** Object key for a video's file: videos/<brand or cli>/<id>/<kind>.<ext> (the id groups the files, the brand makes browsing easy). */
function keyFor({ id, brandId }, kind, file) {
  const safe = (s) => String(s || 'cli').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  return `${cfg.r2.prefix ? `${cfg.r2.prefix.replace(/\/+$/, '')}/` : ''}videos/${safe(brandId)}/${safe(id)}/${kind}${path.extname(file).toLowerCase()}`;
}

async function upload(localFile, key) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await s3().send(new PutObjectCommand({ Bucket: cfg.r2.bucket, Key: key, Body: fs.createReadStream(localFile), ContentType: contentType(localFile), ContentLength: fs.statSync(localFile).size }));
  return key;
}

/**
 * Upload a video's files. files: { video, thumb, script } local paths (missing ones skipped).
 * Returns { video, thumb, script } keys for the ones uploaded.
 */
async function uploadVideoFiles(video, files) {
  const out = {};
  for (const kind of ['video', 'thumb', 'script']) {
    const f = files[kind];
    if (f && fs.existsSync(f)) out[kind] = await upload(f, keyFor(video, kind, f));
  }
  return out;
}

/** A signed GET link valid for `seconds` (default 1 hour). */
async function signedUrl(key, seconds = 3600) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: cfg.r2.bucket, Key: key }), { expiresIn: seconds });
}

/** Download a key back to a local file (a publisher needs the mp4 after the local copy was cleaned up). */
async function download(key, localFile) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const res = await s3().send(new GetObjectCommand({ Bucket: cfg.r2.bucket, Key: key }));
  fs.mkdirSync(path.dirname(localFile), { recursive: true });
  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(localFile);
    res.Body.on('error', reject);
    w.on('error', reject);
    w.on('finish', resolve);
    res.Body.pipe(w);
  });
  return localFile;
}

async function remove(keys) {
  const { DeleteObjectsCommand } = require('@aws-sdk/client-s3');
  const list = keys.filter(Boolean);
  if (!list.length) return;
  await s3().send(new DeleteObjectsCommand({ Bucket: cfg.r2.bucket, Delete: { Objects: list.map((Key) => ({ Key })) } }));
}

/**
 * Remove a video's local files once it is safe: it has R2 copies, it is not waiting to be published anywhere,
 * and its files are older than keepDays. Returns the paths removed.
 */
function cleanLocal(video, { keepDays = cfg.r2.keepDays, now = Date.now() } = {}) {
  const r2 = video.files && video.files.r2;
  if (!r2 || !r2.video) return [];
  const pending = Object.values(video.publish || {}).some((p) => p && ['pending', 'queued', 'processing', 'uploading'].includes(p.status));
  if (pending) return [];
  const removed = [];
  for (const kind of ['video', 'thumb']) {
    const f = video.files[kind];
    if (!f || !r2[kind] || !fs.existsSync(f)) continue;
    if (now - fs.statSync(f).mtimeMs < keepDays * 86400000) continue;
    fs.rmSync(f, { force: true });
    removed.push(f);
  }
  return removed;
}

module.exports = { enabled, missing, keyFor, upload, uploadVideoFiles, signedUrl, download, remove, cleanLocal, contentType };
