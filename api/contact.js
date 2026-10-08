const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const openpgp = require('openpgp');
const https = require('https');
dotenv.config();

class PGPMailer {
  constructor(config) {
    if (!config.resendApiKey) {
      throw new Error('Resend API key is required');
    }
    if (!config.publicKeyPath) {
      throw new Error('PGP public key path is required');
    }

    this.resendApiKey = config.resendApiKey;
    this.publicKeyPath = config.publicKeyPath;
  }

  async encryptMessage(message) {
    if (!fs.existsSync(this.publicKeyPath)) {
      throw new Error(`PGP public key file not found at: ${this.publicKeyPath}`);
    }

    const publicKeyArmored = await fs.promises.readFile(this.publicKeyPath, 'utf8');
    const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });

    const encrypted = await openpgp.encrypt({
      message: await openpgp.createMessage({ text: message }),
      encryptionKeys: publicKey,
      format: 'armored',
    });

    return encrypted;
  }

  async sendEncryptedEmail(from, to, subject, encryptedContent) {
    if (!encryptedContent) {
      throw new Error('Encrypted content is required');
    }

    const postData = JSON.stringify({
      from,
      to: [to],
      subject,
      text: encryptedContent,
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const response = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              success: true,
              httpCode: res.statusCode,
              response,
            });
          } else {
            resolve({
              success: false,
              httpCode: res.statusCode,
              response,
            });
          }
        });
      });

      req.on('error', (error) => {
        console.error('Error sending email:', error);
        resolve({
          success: false,
          httpCode: 500,
          response: { error: error.message },
        });
      });

      req.write(postData);
      req.end();
    });
  }
}

// Request schema for Fastify validation
const contactSchema = {
  body: {
    type: 'object',
    required: ['message', 'responseType'],
    properties: {
      message: {
        type: 'string',
        maxLength: 5000,
        minLength: 1,
      },
      responseType: {
        type: 'string',
        enum: ['none', 'email', 'signal_username', 'signal_phone'],
      },
      email: {
        anyOf: [{ type: 'null' }, { type: 'string' }],
      },
      signalUsername: {
        anyOf: [{ type: 'null' }, { type: 'string' }],
      },
      signalPhone: {
        anyOf: [{ type: 'null' }, { type: 'string' }],
      },
      pagePath: {
        type: 'string',
      },
    },
    allOf: [
      {
        if: {
          properties: { responseType: { const: 'email' } },
        },
        then: {
          required: ['email'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              minLength: 1,
            },
          },
        },
      },
      {
        if: {
          properties: { responseType: { const: 'signal_username' } },
        },
        then: {
          required: ['signalUsername'],
          properties: {
            signalUsername: {
              type: 'string',
              minLength: 5,
            },
          },
        },
      },
      {
        if: {
          properties: { responseType: { const: 'signal_phone' } },
        },
        then: {
          required: ['signalPhone'],
          properties: {
            signalPhone: {
              type: 'string',
              minLength: 5,
            },
          },
        },
      },
    ],
  },
};

async function handleContactForm(req, reply) {
  try {
    const data = req.body;
    const responseType = data.responseType || 'none';
    let contactInfo = '';

    switch (responseType) {
      case 'email':
        contactInfo = `## Response requested by email:\n${data.email || ''}`;
        break;
      case 'signal_username':
        contactInfo = `## Response requested by Signal username:\n${data.signalUsername || ''}`;
        break;
      case 'signal_phone':
        contactInfo = `## Response requested by Signal phone:\n${data.signalPhone || ''}`;
        break;
      default:
        contactInfo = '## No response requested';
    }

    // Create subject preview from message
    let preview = data.message
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (preview.length > 50) {
      preview = `${preview.substring(0, 47)}...`;
    }

    // Add timestamp and contact info to message
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'UTC' });
    const pagePath = data.pagePath || 'unknown';
    const messageWithTime = `ActivistChecklist.org Contact Form\n\n## Message received:\n${timestamp}\n\n## Sent from page:\n${pagePath}\n\n${contactInfo}\n\n## Message:\n${data.message}`;

    const config = {
      resendApiKey: process.env.RESEND_API_KEY,
      publicKeyPath: path.join(
        __dirname,
        '../public/files/publickey.contact@activistchecklist.org.asc',
      ),
    };

    // Check for required environment variables
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }

    const mailer = new PGPMailer(config);

    // Encrypt message
    let encrypted;
    try {
      encrypted = await mailer.encryptMessage(messageWithTime);
    } catch (error) {
      console.error('Encryption error:', error);
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Something went wrong. Please try again later.'
          : error.message;
      reply.code(500).send({ error: message });
      return;
    }

    // Send email
    try {
      const result = await mailer.sendEncryptedEmail(
        'Activist Checklist Contact Form <contact@activistchecklist.org>',
        'contact@activistchecklist.org',
        `Contact Form: ${preview}`,
        encrypted,
      );

      if (result.success) {
        return { success: true, message: 'Message sent successfully' };
      } else {
        console.error('Email send failed:', result.response);
        const message =
          process.env.NODE_ENV === 'production'
            ? 'Something went wrong. Please try again later.'
            : result.response?.error || JSON.stringify(result.response);
        reply.code(result.httpCode || 500).send({ error: message });
      }
    } catch (error) {
      console.error('Email send error:', error);
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Something went wrong. Please try again later.'
          : error.message;
      reply.code(500).send({ error: message });
    }
  } catch (error) {
    // Handle validation errors specifically
    if (error.validation) {
      const payload =
        process.env.NODE_ENV === 'production'
          ? { error: 'Invalid form data' }
          : {
              error: 'Validation Error',
              message: 'Invalid form data',
              details: error.validation.map((err) => ({
                field: err.instancePath.replace('/', '') || 'form',
                message: err.message,
              })),
            };
      reply.code(400).send(payload);
      return;
    }

    // Handle other errors
    console.error('Contact form error:', error);
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Something went wrong. Please try again later.'
        : error.message;
    reply.code(500).send({ error: message });
  }
}

// Fastify plugin
async function contactRoutes(fastify, options) {
  fastify.post(
    '/contact',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
        },
      },
      schema: contactSchema,
      bodyLimit: 10240, // 10KB limit
    },
    handleContactForm,
  );
}

module.exports = contactRoutes;
