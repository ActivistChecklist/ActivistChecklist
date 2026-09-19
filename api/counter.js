const dotenv = require('dotenv');
const { createFastifyPlugin } = require('@activistchecklist/umami-extra-privacy/fastify');

dotenv.config();

module.exports = createFastifyPlugin({
  route: '/counter',
  level: 'geo-hash',
  rateLimit: {
    max: 200,
    timeWindow: '1 minute',
  },
});
