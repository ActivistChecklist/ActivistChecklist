import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Load the CommonJS route and its https dependency through Node's own require,
// so the spy below replaces the same https.request that api/contact.js calls.
const require = createRequire(import.meta.url);
const https = require('https');
const Fastify = require('fastify');
const contactRoutes = require('../api/contact');

// PGP covers the body, not the headers. The subject reaches Resend, the mail
// relays and Proton in plaintext, so nothing the visitor typed may end up in it.

/** Stub the Resend call and return the JSON payloads it would have sent. */
function captureResendPayloads() {
  const payloads = [];
  vi.spyOn(https, 'request').mockImplementation((options, onResponse) => {
    const req = new EventEmitter();
    let body = '';
    req.write = (chunk) => {
      body += chunk;
    };
    req.end = () => {
      payloads.push(JSON.parse(body));
      const res = new EventEmitter();
      res.statusCode = 200;
      onResponse(res);
      res.emit('data', '{"id":"stub"}');
      res.emit('end');
    };
    return req;
  });
  return payloads;
}

async function submit(body) {
  const app = Fastify();
  await app.register(contactRoutes);
  const res = await app.inject({ method: 'POST', url: '/contact', payload: body });
  await app.close();
  return res;
}

describe('contact form email subject', () => {
  let payloads;

  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 'test-key');
    payloads = captureResendPayloads();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('keeps a short message, which used to fit whole, out of the subject', async () => {
    const message = 'Phones seized in Springfield';
    const res = await submit({ message, responseType: 'none' });

    expect(res.statusCode).toBe(200);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].subject).toMatch(/^Contact Form \([0-9a-f]{8}\)$/);
    expect(payloads[0].subject).not.toContain('Springfield');
  });

  it('keeps the start of a long message and the contact details out of the subject', async () => {
    const message = `Our group had phones seized at the march, what should we do next? ${'x'.repeat(200)}`;
    await submit({
      message,
      responseType: 'email',
      email: 'organizer@example.org',
      pagePath: '/guides/protest/',
    });

    const { subject, text } = payloads[0];
    expect(subject).toMatch(/^Contact Form \([0-9a-f]{8}\)$/);
    for (const word of ['Our', 'group', 'phones', 'march', 'organizer', 'example', 'protest']) {
      expect(subject).not.toContain(word);
    }
    // Everything the visitor supplied goes only into the encrypted body.
    expect(text).toMatch(/^-----BEGIN PGP MESSAGE-----/);
    expect(text).not.toContain('phones');
    expect(text).not.toContain('organizer@example.org');
  });

  it('gives each submission its own reference', async () => {
    await submit({ message: 'same text', responseType: 'none' });
    await submit({ message: 'same text', responseType: 'none' });

    expect(payloads).toHaveLength(2);
    expect(payloads[0].subject).not.toBe(payloads[1].subject);
  });
});
