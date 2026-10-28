const dotenv = require('dotenv');
const https = require('https');
const url = require('url');
dotenv.config();

// Subscriber email addresses are PII and this client's output is captured by PM2
// into include/.pm2/logs/ac-api-out.log, which is long-lived and on disk. Log
// what is useful for debugging a delivery problem — status, list, subscriber id —
// and never the address itself. See __tests__/listmonk-log-redaction.test.js.
function redactSubscriberForLog(value) {
  if (!value || typeof value !== 'object') return value;
  const { email, name, attribs, ...rest } = value;
  const redacted = { ...rest };
  if (email !== undefined) redacted.email = '[REDACTED]';
  if (name !== undefined) redacted.name = '[REDACTED]';
  if (attribs !== undefined) redacted.attribs = '[REDACTED]';
  // Listmonk nests the subscriber one or two levels deep under `data`.
  if (rest.data !== undefined) redacted.data = redactSubscriberForLog(rest.data);
  return redacted;
}

class ListmonkClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.LISTMONK_API_URL;
    this.apiUser = config.apiUser || process.env.LISTMONK_API_USER;
    this.apiToken = config.apiToken || process.env.LISTMONK_API_TOKEN;
    this.useTokenAuth = config.useTokenAuth || process.env.LISTMONK_USE_TOKEN_AUTH === 'true';
    this.defaultListId = parseInt(
      config.defaultListId || process.env.LISTMONK_DEFAULT_LIST_ID || '3',
      10,
    );
    // Cloudflare Access service token. Lets Access gate /api/subscribers to
    // ac-api alone instead of bypassing it for the whole internet.
    this.cfAccessClientId = config.cfAccessClientId || process.env.LISTMONK_CF_ACCESS_CLIENT_ID;
    this.cfAccessClientSecret =
      config.cfAccessClientSecret || process.env.LISTMONK_CF_ACCESS_CLIENT_SECRET;

    console.log('ListmonkClient initialized with:', {
      baseUrl: this.baseUrl,
      useTokenAuth: this.useTokenAuth,
      hasApiUser: !!this.apiUser,
      hasApiToken: !!this.apiToken,
      hasCfAccessToken: !!(this.cfAccessClientId && this.cfAccessClientSecret),
      defaultListId: this.defaultListId,
    });

    if (!this.baseUrl) {
      throw new Error('Listmonk API URL is required');
    }
    if (!this.apiUser || !this.apiToken) {
      throw new Error('Listmonk API credentials are required');
    }
    // Half a service token is a typo, not a choice. Sending neither header
    // would surface later as an Access redirect that is hard to trace back.
    if (!this.cfAccessClientId !== !this.cfAccessClientSecret) {
      throw new Error(
        'LISTMONK_CF_ACCESS_CLIENT_ID and LISTMONK_CF_ACCESS_CLIENT_SECRET must be set together',
      );
    }
  }

  getAuthHeaders() {
    const headers = this.useTokenAuth
      ? { Authorization: `token ${this.apiUser}:${this.apiToken}` }
      : {
          Authorization:
            'Basic ' + Buffer.from(`${this.apiUser}:${this.apiToken}`).toString('base64'),
        };
    if (this.cfAccessClientId) {
      headers['CF-Access-Client-Id'] = this.cfAccessClientId;
      headers['CF-Access-Client-Secret'] = this.cfAccessClientSecret;
    }
    return headers;
  }

  async addSubscriber({
    email,
    name,
    status = 'enabled',
    lists = undefined,
    attribs = {},
    preconfirm_subscriptions = true,
  }) {
    if (!email) {
      return {
        success: false,
        status: 400,
        error: 'Email is required',
      };
    }

    // Get name from email if not provided
    const subscriberName = name || email.split('@')[0];

    // Use default list if none provided, ensure all list IDs are integers
    const subscriberLists = (lists || [this.defaultListId]).map((id) => parseInt(id));

    const payload = {
      email,
      name: subscriberName,
      status,
      lists: subscriberLists,
      attribs,
      preconfirm_subscriptions,
    };

    const postData = JSON.stringify(payload);
    const parsedUrl = new url.URL(`${this.baseUrl}/api/subscribers`);

    console.log('Attempting to add subscriber:', {
      endpoint: parsedUrl.toString(),
      lists: subscriberLists,
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...this.getAuthHeaders(),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsedData = JSON.parse(data);
            // Never log the response body: it echoes back the subscriber's
            // email and name. Status is all that is useful here.
            console.log('Listmonk API response:', {
              status: res.statusCode,
              ok: res.statusCode >= 200 && res.statusCode < 300,
            });

            if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 409) {
              resolve({
                success: true,
                status: 200,
                data: parsedData.data || {},
              });
            } else {
              console.error('Listmonk API error:', {
                status: res.statusCode,
                data: redactSubscriberForLog(parsedData),
                endpoint: parsedUrl.toString(),
              });
              const errMsg =
                process.env.NODE_ENV === 'production'
                  ? 'Something went wrong. Please try again.'
                  : parsedData.message || 'Unknown error occurred';
              resolve({ success: false, status: res.statusCode, error: errMsg });
            }
          } catch (error) {
            // Not the error itself: a JSON.parse message quotes the body. A
            // 302 or 403 here usually means Cloudflare Access refused the
            // service token.
            console.error('Error parsing Listmonk API response:', {
              status: res.statusCode,
              contentType: res.headers['content-type'],
              endpoint: parsedUrl.toString(),
            });
            const errMsg =
              process.env.NODE_ENV === 'production'
                ? 'Something went wrong. Please try again.'
                : 'Failed to parse API response';
            resolve({ success: false, status: 500, error: errMsg });
          }
        });
      });

      req.on('error', (error) => {
        console.error('Listmonk API request failed:', {
          error: error.message,
          endpoint: parsedUrl.toString(),
        });
        const errMsg =
          process.env.NODE_ENV === 'production'
            ? 'Something went wrong. Please try again.'
            : error.message;
        resolve({ success: false, status: 500, error: errMsg });
      });

      req.write(postData);
      req.end();
    });
  }
}

module.exports = ListmonkClient;
module.exports.redactSubscriberForLog = redactSubscriberForLog;
