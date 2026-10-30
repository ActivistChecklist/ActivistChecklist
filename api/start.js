const dotenv = require('dotenv');
const Fastify = require('fastify');
const app = require('./server.js');

// Load .env.production if NODE_ENV is production, otherwise load .env
// override: the file must win over inherited values. PM2 is started from a shell
// that has already sourced .env.production (run-with-repo-node.sh), stores that
// environment, and replays it on every `pm2 restart`. Without override, a rotated
// secret in the file never reaches the running API.
dotenv.config({
  path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env',
  override: true,
});

// Instantiate Fastify with the options from server.js (logger is not in server.js so CLI pretty-logs still work)
// disableRequestLogging: Fastify's default logger writes an "incoming request"
// and a "request completed" line for every call. The onResponse hook in
// server.js already logs one concise line per request, so the built-in pair was
// pure duplication — 1.47M of the 1.8M lines in a 351MB log.
const server = Fastify({
  logger: true,
  disableRequestLogging: true,
  ...(app.options || {}),
});

// Register your application as a normal plugin
server.register(app);

console.log(process.env.API_PORT);

// Start listening
const start = async () => {
  try {
    await server.listen({
      port: process.env.API_PORT || 4321,
      host: process.env.API_HOST || '0.0.0.0',
    });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
