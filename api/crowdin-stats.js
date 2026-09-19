const https = require('https');

// Public stats endpoint — no auth required for public Crowdin projects
const STATS_URL = 'https://badges.awesome-crowdin.com/stats-17633866-883364.json';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cache = null; // { data, fetchedAt }

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000, headers: { Accept: 'application/json' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function parseProgress(raw) {
  return (raw?.progress ?? []).map(({ data }) => ({
    id: data.language?.twoLettersCode ?? data.languageId,
    name: data.language?.name ?? data.languageId,
    translated: parseInt(data.translationProgress) || 0,
    approved: parseInt(data.approvalProgress) || 0,
    words: {
      total: data.words?.total ?? 0,
      translated: data.words?.translated ?? 0,
      approved: data.words?.approved ?? 0,
    },
  }));
}

async function getStats() {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { languages: cache.data, fetchedAt: new Date(cache.fetchedAt).toISOString(), cached: true };
  }
  const raw = await fetchJson(STATS_URL);
  const languages = parseProgress(raw);
  cache = { data: languages, fetchedAt: now };
  return { languages, fetchedAt: new Date(now).toISOString(), cached: false };
}

async function crowdinStatsPlugin(fastify) {
  fastify.get('/crowdin-stats', {
    config: {
      rateLimit: { max: 60, timeWindow: '1 minute' },
    },
  }, async (request, reply) => {
    try {
      const stats = await getStats();
      reply.header('Cache-Control', 'public, max-age=3600');
      return stats;
    } catch (err) {
      fastify.log.error(`crowdin-stats fetch failed: ${err.message}`);
      if (cache) {
        reply.header('Cache-Control', 'public, max-age=3600');
        return { languages: cache.data, fetchedAt: new Date(cache.fetchedAt).toISOString(), cached: true, stale: true };
      }
      reply.status(503);
      return { error: 'Translation stats temporarily unavailable' };
    }
  });
}

module.exports = crowdinStatsPlugin;
