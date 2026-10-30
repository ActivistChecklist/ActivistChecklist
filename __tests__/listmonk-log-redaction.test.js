import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { redactSubscriberForLog } = require('../lib/listmonk');

describe('redactSubscriberForLog', () => {
  it('replaces email, name and attribs and keeps the debugging fields', () => {
    const redacted = redactSubscriberForLog({
      id: 42,
      email: 'someone@example.com',
      name: 'Someone',
      attribs: { city: 'Somewhere' },
      status: 'enabled',
    });
    expect(redacted).toEqual({
      id: 42,
      email: '[REDACTED]',
      name: '[REDACTED]',
      attribs: '[REDACTED]',
      status: 'enabled',
    });
  });

  it('redacts a subscriber nested under data, two levels deep', () => {
    const redacted = redactSubscriberForLog({
      message: 'E-mail already exists',
      data: { data: { id: 7, email: 'someone@example.com', name: 'Someone' } },
    });
    expect(redacted).toEqual({
      message: 'E-mail already exists',
      data: { data: { id: 7, email: '[REDACTED]', name: '[REDACTED]' } },
    });
    expect(JSON.stringify(redacted)).not.toContain('someone@example.com');
  });

  it('does not add redaction markers for fields that were absent', () => {
    expect(redactSubscriberForLog({ message: 'Unauthorized' })).toEqual({
      message: 'Unauthorized',
    });
  });

  it('does not mutate the original object', () => {
    const original = { email: 'someone@example.com', data: { name: 'Someone' } };
    redactSubscriberForLog(original);
    expect(original).toEqual({ email: 'someone@example.com', data: { name: 'Someone' } });
  });

  it.each([null, undefined, 'plain string', 503])('passes %p through unchanged', (value) => {
    expect(redactSubscriberForLog(value)).toBe(value);
  });
});
