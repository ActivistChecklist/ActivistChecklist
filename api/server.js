const dotenv = require('dotenv');
const cors = require('@fastify/cors');
const helmet = require('@fastify/helmet');
const rateLimit = require('@fastify/rate-limit');
const contactRoutes = require('./contact');
const counterRoutes = require('./counter');
const subscribeRoutes = require('./subscribe');
const crowdinStatsRoutes = require('./crowdin-stats');

dotenv.config();

/** One-line suffix for analytics counter (no PII). */
function counterLogSuffix(body) {
  if (!body || typeof body !== 'object') return '';
  const parts = [];
  if (typeof body.url === 'string' && body.url) {
    const u = body.url.length > 72 ? `${body.url.slice(0, 69)}…` : body.url;
    parts.push(`page=${u}`);
  }
  if (typeof body.name === 'string' && body.name) {
    parts.push(`event=${body.name}`);
  }
  return parts.length ? ` ${parts.join(' ')}` : '';
}

async function app (fastify, opts) {
  // Use the root logger here, not `request.log`: the child logger binds `reqId`,
  // and pino-pretty prints bindings on a second line after every message.
  fastify.addHook('onResponse', (request, reply, done) => {
    const pathOnly = request.url.split('?')[0];
    const ms =
      reply.elapsedTime != null ? `${Math.round(reply.elapsedTime)}ms` : '';
    let extra = '';
    if (pathOnly.endsWith('/counter')) {
      extra = counterLogSuffix(request.body);
    }
    request.server.log.info(
      `${request.method} ${pathOnly} ${reply.statusCode} ${ms}${extra}`
    );
    done();
  });

  // Register rate limiting (global default)
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      return request.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || request.headers['x-real-ip']
        || request.ip;
    }
  });

  // Register security plugins
  await fastify.register(helmet, {
    // Enable all security headers including CSP
    // Since this is an API-only server, we can use strict CSP
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],  // Deny everything by default
        mediaSrc: ["'self'"],
        frameAncestors: ["'none'"],  // Prevent embedding in iframes
      }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" },
    hsts: {
      maxAge: 15552000,  // 180 days
      includeSubDomains: true,
      preload: true
    }
  });

  // Register CORS plugin
  await fastify.register(cors, {
    origin: [
      'https://activistchecklist.org',
      'http://localhost:3000',
      'https://localhost:3000',
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  });

  // Register all routes under /api prefix
  fastify.register(async function (fastify, opts) {
    // Tester route
    fastify.get('/hello', async (request, reply) => {
      return { message: 'Hello World' }; // Automatically serialized to JSON
    });

    // Register routes
    await fastify.register(contactRoutes);
    await fastify.register(counterRoutes);
    await fastify.register(subscribeRoutes);
    await fastify.register(crowdinStatsRoutes);
    
  }, { prefix: '/api-server' });
}

module.exports = app;

// Passed to Fastify(). fastify-cli only merges this with `fastify start --options`.
// Do not set `logger` here: CLI merges would lose pino-pretty; api/start.js sets logger: true.
module.exports.options = {
  disableRequestLogging: true
};