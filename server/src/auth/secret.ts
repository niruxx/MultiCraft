import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from '../utils/paths.js';

const SECRET_PATH = path.join(DATA_DIR, 'session.secret');

function loadOrCreateSecret(): string {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SECRET_PATH)) {
    return fs.readFileSync(SECRET_PATH, 'utf8').trim();
  }
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_PATH, secret, { mode: 0o600 });
  return secret;
}

export const SESSION_SECRET = process.env.MULTICRAFT_SESSION_SECRET ?? loadOrCreateSecret();
