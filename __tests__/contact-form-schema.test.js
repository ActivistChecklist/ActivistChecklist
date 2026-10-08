import { describe, it, expect } from 'vitest';
import { formSchema, MAX_CHARS, RESPONSE_OPTIONS } from '../components/forms/contactFormSchema';

// Helper to parse with the schema and return success/error
const parse = (data) => formSchema.safeParse(data);

// Base valid data for tests
const validBase = {
  message: 'Hello, this is a test message.',
  responseType: 'none',
  email: '',
  signalUsername: '',
  signalPhone: '',
};

describe('Contact form schema', () => {
  describe('constants', () => {
    it('MAX_CHARS is 5000', () => {
      expect(MAX_CHARS).toBe(5000);
    });

    it('RESPONSE_OPTIONS has 4 options', () => {
      expect(RESPONSE_OPTIONS).toHaveLength(4);
    });

    it('RESPONSE_OPTIONS values are none, signal_username, signal_phone, email', () => {
      const values = RESPONSE_OPTIONS.map((o) => o.value);
      expect(values).toEqual(['none', 'signal_username', 'signal_phone', 'email']);
    });
  });

  describe('message validation', () => {
    it('rejects empty message', () => {
      const result = parse({ ...validBase, message: '' });
      expect(result.success).toBe(false);
    });

    it('accepts valid message', () => {
      const result = parse(validBase);
      expect(result.success).toBe(true);
    });

    it('rejects message exceeding MAX_CHARS', () => {
      const result = parse({ ...validBase, message: 'a'.repeat(MAX_CHARS + 1) });
      expect(result.success).toBe(false);
    });

    it('accepts message at exactly MAX_CHARS', () => {
      const result = parse({ ...validBase, message: 'a'.repeat(MAX_CHARS) });
      expect(result.success).toBe(true);
    });
  });

  describe('responseType validation', () => {
    it('accepts all valid response types', () => {
      for (const opt of RESPONSE_OPTIONS) {
        const data = { ...validBase, responseType: opt.value };
        // For non-'none' types, provide the required contact info
        if (opt.value === 'email') data.email = 'test@example.com';
        if (opt.value === 'signal_username') data.signalUsername = 'testuser.12';
        if (opt.value === 'signal_phone') data.signalPhone = '+15551234567';

        const result = parse(data);
        expect(result.success, `responseType '${opt.value}' should be valid`).toBe(true);
      }
    });

    it('rejects invalid response type', () => {
      const result = parse({ ...validBase, responseType: 'telegram' });
      expect(result.success).toBe(false);
    });
  });

  describe('email validation', () => {
    it('accepts valid email when responseType is email', () => {
      const result = parse({ ...validBase, responseType: 'email', email: 'user@example.com' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email format', () => {
      const result = parse({ ...validBase, responseType: 'email', email: 'not-an-email' });
      expect(result.success).toBe(false);
    });

    it('fails cross-field validation when email is empty but responseType is email', () => {
      const result = parse({ ...validBase, responseType: 'email', email: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('signal username validation', () => {
    it('accepts valid username like snowden.04', () => {
      const result = parse({
        ...validBase,
        responseType: 'signal_username',
        signalUsername: 'snowden.04',
      });
      expect(result.success).toBe(true);
    });

    it('strips @ prefix and lowercases', () => {
      const result = parse({
        ...validBase,
        responseType: 'signal_username',
        signalUsername: '@Snowden.04',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.signalUsername).toBe('@snowden.04');
      }
    });

    it('rejects usernames shorter than 3 characters', () => {
      const result = parse({ ...validBase, responseType: 'signal_username', signalUsername: 'ab' });
      expect(result.success).toBe(false);
    });

    it('rejects usernames with invalid characters', () => {
      const result = parse({
        ...validBase,
        responseType: 'signal_username',
        signalUsername: 'user name!.04',
      });
      expect(result.success).toBe(false);
    });

    it('rejects usernames not ending with .NN', () => {
      const result = parse({
        ...validBase,
        responseType: 'signal_username',
        signalUsername: 'snowden',
      });
      expect(result.success).toBe(false);
    });

    it('fails cross-field validation when username is empty but responseType is signal_username', () => {
      const result = parse({ ...validBase, responseType: 'signal_username', signalUsername: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('signal phone validation', () => {
    it('accepts phone number when responseType is signal_phone', () => {
      const result = parse({
        ...validBase,
        responseType: 'signal_phone',
        signalPhone: '+15551234567',
      });
      expect(result.success).toBe(true);
    });

    it('fails cross-field validation when phone is empty but responseType is signal_phone', () => {
      const result = parse({ ...validBase, responseType: 'signal_phone', signalPhone: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('cross-field validation', () => {
    it('passes when responseType is none with no contact info', () => {
      const result = parse(validBase);
      expect(result.success).toBe(true);
    });

    it('allows empty contact fields when responseType is none', () => {
      const result = parse({
        message: 'test',
        responseType: 'none',
        email: '',
        signalUsername: '',
        signalPhone: '',
      });
      expect(result.success).toBe(true);
    });
  });
});
