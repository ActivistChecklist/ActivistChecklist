import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as openpgp from 'openpgp';

// public/.well-known/security.txt (RFC 9116) tells researchers how to report a
// security problem. Its Expires field is required, and scanners treat an
// expired file as no file at all, so this test starts failing 30 days before
// the date. That failure is the renewal reminder.
//
// To renew: set Expires in public/.well-known/security.txt to a date less than
// a year out (RFC 9116 recommends under a year), commit, and deploy.

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const FILE = path.join(PUBLIC, '.well-known', 'security.txt');
const SITE = 'https://activistchecklist.org';
const DAY_MS = 24 * 60 * 60 * 1000;
const RENEW_WITHIN_DAYS = 30;
const MAX_DAYS_OUT = 366;

const lines = fs.readFileSync(FILE, 'utf8').split(/\r?\n/);
const contentLines = lines.filter((line) => line.trim() !== '' && !line.startsWith('#'));
const fields = contentLines
  .map((line) => line.match(/^([A-Za-z0-9-]+):\s*(\S.*)$/))
  .filter(Boolean)
  .map(([, name, value]) => ({ name: name.toLowerCase(), value: value.trim() }));
const values = (name) => fields.filter((f) => f.name === name).map((f) => f.value);

describe('public/.well-known/security.txt', () => {
  test('every line is a comment or a "Field: value" pair', () => {
    expect(fields.length).toBe(contentLines.length);
  });

  test('has at least one Contact, each an https, mailto or tel URI', () => {
    const contacts = values('contact');
    expect(contacts.length).toBeGreaterThan(0);
    for (const contact of contacts) {
      expect(contact).toMatch(/^(https:\/\/|mailto:|tel:)/);
    }
  });

  test(`Expires is more than ${RENEW_WITHIN_DAYS} days away`, () => {
    const expires = values('expires');
    expect(expires).toHaveLength(1);
    const date = new Date(expires[0]);
    expect(Number.isNaN(date.getTime()), `Expires is not a date: ${expires[0]}`).toBe(false);
    const daysLeft = Math.floor((date.getTime() - Date.now()) / DAY_MS);
    expect(
      daysLeft,
      `security.txt Expires is ${expires[0]} (${daysLeft} days from now). ` +
        'Renew it: set Expires in public/.well-known/security.txt to a date less ' +
        'than a year out, commit, and deploy.',
    ).toBeGreaterThan(RENEW_WITHIN_DAYS);
  });

  test('Expires is less than a year away', () => {
    const date = new Date(values('expires')[0]);
    const daysOut = (date.getTime() - Date.now()) / DAY_MS;
    expect(daysOut).toBeLessThanOrEqual(MAX_DAYS_OUT);
  });

  test('Canonical is the URL the file is served from', () => {
    expect(values('canonical')).toEqual([`${SITE}/.well-known/security.txt`]);
  });

  test('lists Preferred-Languages at most once', () => {
    expect(values('preferred-languages').length).toBeLessThanOrEqual(1);
  });

  test('the Encryption key is a file we publish and the fingerprint matches it', async () => {
    const encryption = values('encryption');
    const keyUrl = encryption.find((v) => v.startsWith(`${SITE}/`));
    const fingerprint = encryption.find((v) => v.startsWith('openpgp4fpr:'));
    expect(keyUrl).toBeDefined();
    expect(fingerprint).toBeDefined();

    const keyPath = path.join(PUBLIC, decodeURIComponent(new URL(keyUrl).pathname));
    expect(fs.existsSync(keyPath), `${keyUrl} has no file in public/`).toBe(true);

    const key = await openpgp.readKey({ armoredKey: fs.readFileSync(keyPath, 'utf8') });
    expect(fingerprint.slice('openpgp4fpr:'.length).toLowerCase()).toBe(key.getFingerprint());
  });
});
