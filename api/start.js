const dotenv = require('dotenv');
const Fastify = require('fastify');
const app = require('./server.js');

// Load .env.production if NODE_ENV is production, otherwise load .env
dotenv.config({
  path: process.env.NODE_ENV === 'production' 
    ? '.env.production'
    : '.env'
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
      host: process.env.API_HOST || '0.0.0.0'
    });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start(); 