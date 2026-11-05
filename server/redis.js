const Redis = require('ioredis');

/** Redis client. maxRetriesPerRequest: null is required for BullMQ's blocking commands. */
function createRedis(url = process.env.REDIS_URL || 'redis://redis:6379') {
  return new Redis(url, { maxRetriesPerRequest: null });
}

module.exports = { createRedis };
