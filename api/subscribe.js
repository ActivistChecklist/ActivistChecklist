const ListmonkClient = require('../lib/listmonk');

function isUsernameValid(email) {
  const local = (email || '').split('@')[0];
  const periodCount = (local.match(/\./g) || []).length;
  return periodCount <= 3;
}

async function addSubscriber(request) {
  const { email, name } = request.body;

  if (!email || !isUsernameValid(email)) {
    return { success: false, error: 'Invalid email address.' };
  }

  try {
    const listmonk = new ListmonkClient();

    const result = await listmonk.addSubscriber({
      email,
      name: name || '',
    });

    return result;
  } catch (error) {
    console.error('Listmonk subscription error:', error);
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Something went wrong. Please try again.'
        : error.message;
    return { success: false, error: message };
  }
}

async function subscribePlugin(fastify, options) {
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    function (req, body, done) {
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        err.statusCode = 400;
        done(err, undefined);
      }
    },
  );

  fastify.post(
    '/subscribe',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
        },
      },
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string' },
            name: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      return addSubscriber(request);
    },
  );
}

module.exports = subscribePlugin;
