const { Queue } = require('bullmq');

const QUEUE = { videos: 'videos', publish: 'publish', ticks: 'ticks', maintenance: 'maintenance' };

// Real errors retry twice, 10 minutes apart. Crashes/shutdowns are "stalls", not attempts (see worker.js).
const VIDEO_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'fixed', delay: 600000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 500 },
};

function createQueues(connection) {
  return Object.fromEntries(Object.entries(QUEUE).map(([k, name]) => [k, new Queue(name, { connection })]));
}

/**
 * Add a job whose id makes it unique: while one with that id is waiting/running, nothing new is added.
 * A finished or failed one is removed first (BullMQ would otherwise silently ignore the add).
 */
async function addUnique(queue, name, data, jobId, opts = {}) {
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== 'completed' && state !== 'failed') return existing;
    await existing.remove();
  }
  return queue.add(name, data, { ...opts, jobId });
}

/** Queue a video job (jobId = videoId, so a video is never queued twice). Also how "retry" works. */
const enqueueVideo = (queues, videoId) => addUnique(queues.videos, 'make', { videoId }, videoId, VIDEO_JOB_OPTS);

module.exports = { QUEUE, VIDEO_JOB_OPTS, createQueues, enqueueVideo, addUnique };
