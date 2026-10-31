// A small encrypted store for each signed-in user's own bank link (the Plaid access token).
//
// Tokens are encrypted with AES-256-GCM before they are saved, using VAULT_KEY (32 random bytes, base64), and each
// record is bound to its user so one user's record cannot be decrypted as another's. They are never sent to the
// browser. Without VAULT_KEY the vault is unavailable, so own-bank linking stays off.
//
// Hosted: saved in Netlify Blobs (part of the site, no extra account). Local development: a JSON file.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hosted } = require('./clerk');

const ID = /^[A-Za-z0-9_-]{1,100}$/;

function keyFrom(env = process.env) {
  const raw = (env.VAULT_KEY || '').trim();
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
}

function encrypt(plain, key, aad) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

function decrypt(blob, key, aad) {
  const [v, iv, tag, ct] = String(blob).split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('unreadable vault record');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}

/** A JSON file, for local development and tests. */
function fileStore(file) {
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  return {
    async get(k) { return read()[k] ?? null; },
    async set(k, v) { const all = read(); all[k] = v; fs.writeFileSync(file, JSON.stringify(all)); },
    async delete(k) { const all = read(); delete all[k]; fs.writeFileSync(file, JSON.stringify(all)); }
  };
}

/** Netlify Blobs, for the hosted site. `event` connects the blobs context in a Lambda-style function. */
function blobsStore(event) {
  const { connectLambda, getStore } = require('@netlify/blobs');
  if (event && event.blobs) connectLambda(event);
  const store = getStore({ name: 'vault', consistency: 'strong' });
  return {
    get: k => store.get(k),
    set: (k, v) => store.set(k, v),
    delete: k => store.delete(k)
  };
}

function makeVault(key, store) {
  const name = (userId, provider) => {
    if (!ID.test(String(userId)) || !ID.test(String(provider))) throw new Error('invalid vault name');
    return `${provider}/${userId}`;
  };
  return {
    available: !!key,
    async put(userId, provider, record) {
      if (!key) throw new Error('vault is not configured');
      const k = name(userId, provider);
      await store.set(k, encrypt(JSON.stringify(record), key, k));
    },
    async get(userId, provider) {
      if (!key) return null;
      const k = name(userId, provider);
      const blob = await store.get(k);
      if (!blob) return null;
      try { return JSON.parse(decrypt(blob, key, k)); } catch { return null; }
    },
    async remove(userId, provider) {
      await store.delete(name(userId, provider));
    }
  };
}

/** The vault for this request: Blobs on the hosted site, a file when developing. */
function vaultFor(event, env = process.env) {
  const store = hosted(env) ? blobsStore(event) : fileStore(env.VAULT_FILE || path.join(os.tmpdir(), 'cashpilot-vault.json'));
  return makeVault(keyFrom(env), store);
}

module.exports = { vaultFor, makeVault, fileStore, encrypt, decrypt, keyFrom };
