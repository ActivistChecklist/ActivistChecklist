const dotenv = require('dotenv');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { createGeoPreservingAnonymousIP } = require('./utils/ip-anonymization');
dotenv.config();

async function sendUmamiEvent(payload, userAgent) {
  // Check which configuration to use: Cloud or Self-hosted
  const isCloud = !!process.env.UMAMI_API_KEY && !!process.env.UMAMI_WEBSITE_ID;
  const isSelfHosted = !!process.env.UMAMI_API_CLIENT_USER_ID && !!process.env.UMAMI_API_CLIENT_SECRET && !!process.env.UMAMI_WEBSITE_ID;
  
  // Determine endpoint
  let umamiHost = process.env.UMAMI_API_CLIENT_ENDPOINT || process.env.UMAMI_HOST;
  
  if (!umamiHost) {
    console.error('Missing endpoint configuration - UMAMI_API_CLIENT_ENDPOINT or UMAMI_HOST required');
    const err = process.env.NODE_ENV === 'production'
      ? 'Something went wrong.'
      : 'Missing endpoint configuration - UMAMI_API_CLIENT_ENDPOINT or UMAMI_HOST required';
    return { success: false, error: err };
  }
  
  // For self-hosted configuration
  const websiteId = process.env.UMAMI_WEBSITE_ID;
  const userId = process.env.UMAMI_API_CLIENT_USER_ID;
  const appSecret = process.env.UMAMI_API_CLIENT_SECRET;
  
  // For cloud configuration
  const apiKey = process.env.UMAMI_API_KEY;
  
  // Check required configuration
  if (!isCloud && !isSelfHosted) {
    console.error('Invalid configuration:', {
      hasCloud: isCloud,
      hasSelfHosted: isSelfHosted,
      hasApiKey: !!apiKey,
      hasWebsiteId: !!websiteId,
      hasUserId: !!userId,
      hasAppSecret: !!appSecret,
      hasUmamiHost: !!umamiHost
    });
    const err = process.env.NODE_ENV === 'production'
      ? 'Something went wrong.'
      : 'Invalid Umami configuration (Cloud or Self-hosted credentials required)';
    return { success: false, error: err };
  }

  // For Cloud, use the default Umami Cloud endpoint if not specified
  if (isCloud && !umamiHost) {
    umamiHost = 'https://cloud.umami.is';
  }

  // Ensure umamiHost has a protocol
  if (!umamiHost.startsWith('http://') && !umamiHost.startsWith('https://')) {
    umamiHost = 'https://' + umamiHost;
  }
  
  const useHttps = umamiHost.startsWith('https://');

  // Extract hostname without protocol
  const urlObj = new URL(umamiHost);
  const hostname = urlObj.hostname;
  const port = urlObj.port || (useHttps ? 443 : 80);
  
  // Create the endpoint path
  const endpointPath = '/api/send';
  
  // Set website ID for the payload
  payload.website = websiteId;
  
  const data = {
    type: "event",
    payload
  };

  const postData = JSON.stringify(data);
  
  // Initialize headers
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'User-Agent': userAgent || 'Mozilla/5.0 (compatible; UmamiTest/1.0)'
  };
  
  // Add authentication headers based on configuration
  if (isCloud) {
    // Cloud authentication with API key (using x-umami-api-key header)
    headers['x-umami-api-key'] = apiKey;
  } else {
    // Self-hosted authentication with timestamp and hash
    const timestamp = Date.now();
    const hash = crypto
      .createHash('sha256')
      .update(`${timestamp}:${userId}:${appSecret}`)
      .digest('hex');
    
    headers['x-umami-timestamp'] = timestamp.toString();
    headers['x-umami-hash'] = hash;
    headers['x-umami-id'] = userId;
  }
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: hostname,
      port: port,
      path: endpointPath,
      method: 'POST',
      headers: headers
    };

    const requestLib = useHttps ? https : http;
    const req = requestLib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, response: data });
        } else {
          console.error('Umami API error:', {
            status: res.statusCode,
            statusText: res.statusMessage,
            data,
            headers: res.headers
          });
          const err = process.env.NODE_ENV === 'production'
            ? 'Something went wrong.'
            : (data || res.statusMessage || `HTTP ${res.statusCode}`);
          resolve({ success: false, error: err });
        }
      });
    });

    req.on('error', (error) => {
      console.error('Error sending Umami event:', error);
      const err = process.env.NODE_ENV === 'production'
        ? 'Something went wrong.'
        : error.message;
      resolve({ success: false, error: err });
    });

    req.write(postData);
    req.end();
  });
}

async function sendEvent(request) {
  const userAgent = request.body.userAgent || request.headers['user-agent'] || '';
  
  // Get client IP from request headers
  const forwardedFor = request.headers['x-forwarded-for'];
  const clientIP = forwardedFor ? forwardedFor.split(',')[0] : request.headers['x-real-ip'] || request.ip;
  
  // Anonymize the IP address
  const anonymizedIP = createGeoPreservingAnonymousIP(clientIP);

  // Create the basic payload
  const payload = {
    url: request.body.url || request.raw.url,
    hostname: request.body.hostname || request.headers.host,
    referrer: request.body.referrer || request.headers.referer || '',
    title: request.body.title || '',
    language: request.body.language || '',
    screen: request.body.screen || '',
    name: request.body.name || '',
    data: request.body.data,
    ip: anonymizedIP
  };

  return sendUmamiEvent(payload, userAgent);
}

async function counterPlugin(fastify, options) {
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  fastify.post('/counter', {
    config: {
      rateLimit: {
        max: 200,
        timeWindow: '1 minute'
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['hostname', 'url'],
        properties: {
          hostname: { type: 'string' },
          url: { type: 'string' },
          referrer: { type: 'string' },
          title: { type: 'string' },
          language: { type: 'string' },
          screen: { type: 'string' },
          userAgent: { type: 'string' },
          name: { type: 'string' },
          data: { type: 'object' }
        },
        additionalProperties: true,
      }
    }
  }, async (request, reply) => {
    return sendEvent(request);
  });
}

module.exports = counterPlugin;