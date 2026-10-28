import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const ListmonkClient = require('../lib/listmonk');

const BASE = {
  baseUrl: 'https://listmonk.example.com',
  apiUser: 'api_user',
  apiToken: 'api-token-value',
  useTokenAuth: true,
};

describe('ListmonkClient Cloudflare Access service token', () => {
  let logSpy;

  // Keep the developer's own .env out of these cases: the constructor falls
  // back to process.env for anything the config object leaves unset.
  beforeEach(() => {
    vi.stubEnv('LISTMONK_CF_ACCESS_CLIENT_ID', '');
    vi.stubEnv('LISTMONK_CF_ACCESS_CLIENT_SECRET', '');
    vi.stubEnv('LISTMONK_USE_TOKEN_AUTH', '');
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sends only the Listmonk Authorization header when no token is set', () => {
    const headers = new ListmonkClient(BASE).getAuthHeaders();
    expect(headers).toEqual({ Authorization: 'token api_user:api-token-value' });
  });

  it('adds both CF-Access headers when the token is configured', () => {
    const headers = new ListmonkClient({
      ...BASE,
      cfAccessClientId: 'abc.access',
      cfAccessClientSecret: 'cf-secret-value',
    }).getAuthHeaders();
    expect(headers).toEqual({
      Authorization: 'token api_user:api-token-value',
      'CF-Access-Client-Id': 'abc.access',
      'CF-Access-Client-Secret': 'cf-secret-value',
    });
  });

  it('reads the token from env vars', () => {
    vi.stubEnv('LISTMONK_CF_ACCESS_CLIENT_ID', 'env.access');
    vi.stubEnv('LISTMONK_CF_ACCESS_CLIENT_SECRET', 'env-secret');
    const headers = new ListmonkClient(BASE).getAuthHeaders();
    expect(headers['CF-Access-Client-Id']).toBe('env.access');
    expect(headers['CF-Access-Client-Secret']).toBe('env-secret');
  });

  it('keeps the CF-Access headers alongside Basic auth', () => {
    const headers = new ListmonkClient({
      ...BASE,
      useTokenAuth: false,
      cfAccessClientId: 'abc.access',
      cfAccessClientSecret: 'cf-secret-value',
    }).getAuthHeaders();
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(headers['CF-Access-Client-Id']).toBe('abc.access');
  });

  it.each([
    ['id without secret', { cfAccessClientId: 'abc.access' }],
    ['secret without id', { cfAccessClientSecret: 'cf-secret-value' }],
  ])('refuses a half-configured token (%s)', (_label, extra) => {
    expect(() => new ListmonkClient({ ...BASE, ...extra })).toThrow(/must be set together/);
  });

  it('never logs the token values', () => {
    new ListmonkClient({
      ...BASE,
      cfAccessClientId: 'abc.access',
      cfAccessClientSecret: 'cf-secret-value',
    });
    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).not.toContain('cf-secret-value');
    expect(logged).not.toContain('abc.access');
    expect(logged).toContain('"hasCfAccessToken":true');
  });
});
