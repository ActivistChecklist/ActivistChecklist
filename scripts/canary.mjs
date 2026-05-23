#!/usr/bin/env node
/**
 * Warrant canary generator for ActivistChecklist.org
 *
 * Fetches NTP time, the latest RSS headline, and the latest Monero block as
 * datestamp proofs. Builds a message, signs it with GPG, and writes it to
 * public/files/canary.txt.
 *
 * Requires:
 *   - GPG installed and a signing key in your keyring
 *   - GPG_KEY_ID env var set to the long key ID (~/.bashrc or .env)
 *   - rss-parser installed (pnpm add rss-parser)
 *
 * Usage:
 *   GPG_KEY_ID=ABCD1234EF567890 node scripts/canary/generate.mjs
 *   GPG_KEY_ID=ABCD1234EF567890 node scripts/canary/generate.mjs --no-prompt
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, env } from 'node:process';
import dgram from 'node:dgram';
import Parser from 'rss-parser';

const execFileAsync = promisify(execFile);

// ---------- Constants ----------

const ORGANIZATION = 'ActivistChecklist.org';

const RSS_URL = 'https://www.theguardian.com/us-news/us-politics/rss';
const RSS_NAME = 'The Guardian US Politics';

const ATTESTATIONS = [
  'maintains full control of its infrastructure, deployment credentials, and the PGP key used to sign this statement',
  'has not been compelled to modify the site, inject tracking code, or alter content served to visitors',
  'has not granted covert access to our systems to any third party',
  'has not received any legal demand for user data that we were prohibited from disclosing',
];

// ---------- Paths ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// scripts/canary/ -> scripts/ -> project root
const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'public', 'files', 'canary.txt');
const TEMP_DIR = path.join(__dirname, '.tmp');
const TEMP_MESSAGE_FILE = path.join(TEMP_DIR, 'temp_canary_message.txt');

// ---------- Args & env ----------

const args = process.argv.slice(2);
const NO_PROMPT = args.includes('--no-prompt') || args.includes('--non-interactive');
const isInteractive = stdout.isTTY && !NO_PROMPT;

const GPG_KEY_ID = env.GPG_KEY_ID?.trim();
if (!GPG_KEY_ID) {
  console.error('Error: GPG_KEY_ID env var is not set.');
  console.error('Find your key ID with: gpg --list-secret-keys --keyid-format=long');
  console.error('Then run: GPG_KEY_ID=YOUR_KEY_ID node scripts/canary/generate.mjs');
  process.exit(1);
}

// ---------- Utilities ----------

function formatUtc(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

let rlInstance = null;
function getReadline() {
  if (!rlInstance) {
    rlInstance = createInterface({ input: stdin, output: stdout });
  }
  return rlInstance;
}

async function ask(prompt) {
  return (await getReadline().question(prompt)).trim();
}

async function askYesNo(prompt) {
  while (true) {
    const answer = (await ask(prompt)).toLowerCase();
    if (answer === 'y' || answer === 'yes') return true;
    if (answer === 'n' || answer === 'no') return false;
    console.log("Please answer 'y' or 'n'.");
  }
}

// ---------- NTP ----------

function queryNtp(server, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    const packet = Buffer.alloc(48);
    packet[0] = 0x1b; // LI=0, VN=3, Mode=3 (client)

    const cleanup = () => {
      try { client.close(); } catch {}
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, timeoutMs);

    client.once('message', (msg) => {
      clearTimeout(timer);
      cleanup();
      try {
        // Transmit timestamp lives at bytes 40-47
        const secs = msg.readUInt32BE(40);
        const fracs = msg.readUInt32BE(44);
        const unixSecs = secs - 2208988800; // NTP epoch (1900) to Unix epoch (1970)
        const ms = (fracs / 0x100000000) * 1000;
        resolve(new Date(unixSecs * 1000 + ms));
      } catch (err) {
        reject(err);
      }
    });

    client.once('error', (err) => {
      clearTimeout(timer);
      cleanup();
      reject(err);
    });

    client.send(packet, 123, server, (err) => {
      if (err) {
        clearTimeout(timer);
        cleanup();
        reject(err);
      }
    });
  });
}

async function getNtpTime() {
  const servers = [
    'pool.ntp.org',
    'time.nist.gov',
    'time.google.com',
    '0.pool.ntp.org',
    '1.pool.ntp.org',
  ];
  for (const server of servers) {
    try {
      console.log(`Fetching time from NTP server ${server}...`);
      const date = await queryNtp(server);
      const formatted = formatUtc(date);
      console.log(`Successfully fetched NTP time: ${formatted}`);
      return formatted;
    } catch (err) {
      console.log(`NTP error from ${server}: ${err.message}`);
    }
  }
  console.log('Could not fetch NTP time. Falling back to system time.');
  return formatUtc(new Date());
}

// ---------- RSS ----------

async function getRssHeadline() {
  console.log(`Fetching ${RSS_NAME} headline from ${RSS_URL}...`);

  try {
    const parser = new Parser({ timeout: 15000 });
    const feed = await parser.parseURL(RSS_URL);

    if (!feed.items?.length) {
      console.log(`No entries found in RSS feed: ${RSS_URL}`);
      return null;
    }

    const withDates = [];
    for (const item of feed.items) {
      const dateStr = item.isoDate || item.pubDate;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          withDates.push({ item, ts: d.getTime() });
        }
      }
    }

    let selected;
    if (withDates.length) {
      withDates.sort((a, b) => b.ts - a.ts);
      selected = withDates[0].item;
      console.log(`Selected most recent entry from ${formatUtc(new Date(withDates[0].ts))}`);
    } else {
      selected = feed.items[0];
      console.log('No parseable dates, using first entry in feed order');
    }

    return {
      title: selected.title || 'Untitled',
      link: selected.link || '',
    };
  } catch (err) {
    console.log(`Error fetching RSS headline: ${err.message}`);
    return null;
  }
}

// ---------- Monero ----------

async function getMoneroLatestBlock() {
  const nodes = [
    'http://node.community.rino.io:18081/json_rpc',
    'http://node.sethforprivacy.com:18089/json_rpc',
    'http://xmr.fail:18081/json_rpc',
    'http://nodes.hashvault.pro:18081/json_rpc',
  ];

  const payload = {
    jsonrpc: '2.0',
    id: '0',
    method: 'get_last_block_header',
  };

  for (const url of nodes) {
    try {
      console.log(`Fetching Monero block from ${url}...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        console.log(`HTTP ${res.status} from ${url}`);
        continue;
      }
      const data = await res.json();
      const header = data?.result?.block_header;
      if (!header || header.height == null || !header.hash || header.timestamp == null) {
        console.log(`Unexpected response shape from ${url}`);
        continue;
      }
      const timeStr = formatUtc(new Date(header.timestamp * 1000));
      console.log(`Got Monero block: Height=${header.height}, Hash=${header.hash.slice(0, 10)}...`);
      return {
        height: header.height,
        hash: header.hash,
        time: timeStr,
      };
    } catch (err) {
      console.log(`Error fetching from ${url}: ${err.message}`);
    }
  }

  console.log('Could not fetch Monero block data from any RPC node');
  return null;
}

// ---------- Message ----------

async function collectAttestations() {
  if (!isInteractive) {
    console.log('Non-interactive mode: including all attestations.');
    return ATTESTATIONS;
  }

  console.log('\nConfirm each attestation:');
  const selected = [];
  for (const att of ATTESTATIONS) {
    const ok = await askYesNo(`Confirm: '${ORGANIZATION} ${att}' (y/n): `);
    if (ok) selected.push(att);
  }
  if (!selected.length) {
    const proceed = await askYesNo('No attestations confirmed. Proceed anyway? (y/n): ');
    if (!proceed) return null;
  }
  return selected;
}

async function buildMessage() {
  const [nistTime, rss, monero] = await Promise.all([
    getNtpTime(),
    getRssHeadline(),
    getMoneroLatestBlock(),
  ]);

  if (!nistTime || !rss || !monero) {
    const missing = [
      !nistTime && 'NTP time',
      !rss && 'RSS headline',
      !monero && 'Monero block',
    ].filter(Boolean);
    console.error(`Could not fetch: ${missing.join(', ')}`);
    return null;
  }

  const selected = await collectAttestations();
  if (selected === null) return null;

  let note = null;
  if (isInteractive) {
    const noteIn = await ask('\nAdd an optional note (press Enter to skip): ');
    if (noteIn) note = noteIn;
  }

  const dateStr = formatDate(new Date());

  let msg = `${ORGANIZATION} Warrant Canary · ${nistTime}\n\n`;
  msg += `As of ${dateStr}, ${ORGANIZATION}:\n\n`;
  for (const att of selected) {
    msg += `* ${att}\n`;
  }
  if (note) msg += `\nNOTE: ${note}\n`;
  msg += '\nDatestamp Proof:\n';
  msg += `  News headline: ${rss.title}\n`;
  msg += `  News URL:      ${rss.link}\n`;
  msg += `  XMR block:     #${monero.height}, ${monero.time}\n`;
  msg += `  Block hash:    ${monero.hash}\n\n`;
  return msg;
}

// ---------- GPG ----------

async function signWithGpg(message) {
  await fs.mkdir(TEMP_DIR, { recursive: true });
  await fs.writeFile(TEMP_MESSAGE_FILE, message.replace(/\s+$/, '') + '\n', { encoding: 'utf8' });

  const signedPath = `${TEMP_MESSAGE_FILE}.asc`;
  try { await fs.unlink(signedPath); } catch {}

  try {
    console.log(`Signing with GPG key ${GPG_KEY_ID}...`);
    const { stdout: gpgStdout } = await execFileAsync('gpg', [
      '--batch', '--yes',
      '--clearsign',
      '--default-key', GPG_KEY_ID,
      TEMP_MESSAGE_FILE,
    ]);

    let signed;
    try {
      signed = await fs.readFile(signedPath, 'utf8');
      console.log(`GPG signing successful (read from ${signedPath}).`);
    } catch {
      if (gpgStdout) {
        signed = gpgStdout;
        console.log('GPG signing successful (read from stdout).');
      } else {
        console.error('GPG produced no signed output.');
        return null;
      }
    }

    return signed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error("'gpg' command not found. Install with: brew install gnupg");
    } else {
      console.error(`GPG signing error: ${err.stderr || err.message}`);
    }
    return null;
  } finally {
    try { await fs.unlink(TEMP_MESSAGE_FILE); } catch {}
    try { await fs.unlink(signedPath); } catch {}
  }
}

// ---------- Save ----------

async function saveCanary(signedMessage) {
  try {
    await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
    await fs.writeFile(OUTPUT_FILE, signedMessage, { encoding: 'utf8' });
    console.log(`Canary saved to ${OUTPUT_FILE}`);
    return true;
  } catch (err) {
    console.error(`Error saving canary: ${err.message}`);
    return false;
  }
}

// ---------- Main ----------

async function main() {
  console.log('Generating warrant canary...');
  if (!isInteractive) console.log('Running in non-interactive mode.');

  const message = await buildMessage();
  if (!message) {
    console.error('Failed to build message.');
    process.exit(1);
  }

  console.log('\n--- Warrant Canary Preview ---');
  console.log(message);
  console.log('------------------------------');

  if (isInteractive) {
    const ok = await askYesNo('\nSign with GPG? (y/n): ');
    if (!ok) {
      console.log('Cancelled.');
      if (rlInstance) rlInstance.close();
      return;
    }
  } else {
    console.log('Auto-confirming GPG signing.');
  }

  const signed = await signWithGpg(message);
  if (!signed) {
    console.error('GPG signing failed.');
    if (rlInstance) rlInstance.close();
    process.exit(1);
  }

  if (!(await saveCanary(signed))) {
    if (rlInstance) rlInstance.close();
    process.exit(1);
  }

  console.log('\nDone.');
  if (rlInstance) rlInstance.close();
}

main().catch((err) => {
  console.error(err);
  if (rlInstance) rlInstance.close();
  process.exit(1);
});
