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
 * Queue a video job (jobId = videoId, so a video is never queued twice). A finished or failed job
 * with the same id is removed first, which is how "retry" works.
 */
async function enqueueVideo(queues, videoId) {
  const existing = await queues.videos.getJob(videoId);
  if (existing) {
    const state = await existing.getState();
    if (state !== 'completed' && state !== 'failed') return existing;
    await existing.remove();
  }
  return queues.videos.add('make', { videoId }, { jobId: videoId, ...VIDEO_JOB_OPTS });
}

module.exports = { QUEUE, VIDEO_JOB_OPTS, createQueues, enqueueVideo };
