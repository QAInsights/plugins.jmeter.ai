/**
 * Configure Cloudflare Workers secrets from the local .env and deploy.
 *
 * Usage:
 *   node scripts/deploy-cloudflare.mjs            # secrets check only
 *   node scripts/deploy-cloudflare.mjs --deploy   # ...then build + deploy
 *
 * What it does:
 *   1. Verifies `wrangler` is authenticated.
 *   2. Pushes runtime secrets via `wrangler secret put` (values are piped over stdin).
 *   3. Optionally builds and deploys to Cloudflare Workers.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');

/**
 * Parse .env text into a plain object.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseDotEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    val = val.replace(/\s+#.*$/, '');
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

/**
 * Resolve runtime worker secrets from parsed .env.
 * @param {Record<string, string>} env
 * @returns {Record<string, string>}
 */
export function resolveSecrets(env) {
  const pairs = {
    CLERK_SECRET_KEY: env.CLERK_SECRET_KEY,
    CLERK_WEBHOOK_SECRET: env.CLERK_WEBHOOK_SECRET,
    GITHUB_TOKEN: env.GITHUB_TOKEN,
  };
  return Object.fromEntries(Object.entries(pairs).filter(([, v]) => v));
}

/** Run wrangler with args; secret values go over stdin. */
function wrangler(args, { input } = {}) {
  const res = spawnSync('npx', ['wrangler', ...args], {
    cwd: ROOT,
    shell: true,
    input: input === undefined ? undefined : `${input}\n`,
    encoding: 'utf8',
    stdio: input === undefined ? ['inherit', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  });
  return {
    ok: res.status === 0,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

function pushSecrets(secrets) {
  for (const [name, value] of Object.entries(secrets)) {
    const res = wrangler(['versions', 'secret', 'put', name], { input: value });
    if (!res.ok) {
      // Fallback to plain secret put if versions secret put fails
      const fallback = wrangler(['secret', 'put', name], { input: value });
      if (!fallback.ok) {
        console.warn(`Could not set secret ${name} via wrangler (can be set in dashboard).`);
        continue;
      }
    }
    console.log(`Set secret ${name}.`);
  }
}

function main() {
  if (!fs.existsSync(ENV_FILE)) {
    console.warn('.env not found — proceeding with environment variables.');
  }

  const whoami = wrangler(['whoami']);
  if (!whoami.ok) {
    console.error('wrangler is not authenticated. Run: npx wrangler login');
    process.exit(1);
  }
  console.log('wrangler authenticated.');

  if (fs.existsSync(ENV_FILE)) {
    const secrets = resolveSecrets(parseDotEnv(fs.readFileSync(ENV_FILE, 'utf8')));
    pushSecrets(secrets);
  }

  if (process.argv.includes('--deploy')) {
    console.log('\nBuilding and deploying to Cloudflare...');
    const build = spawnSync('npm', ['run', 'build'], { cwd: ROOT, shell: true, stdio: 'inherit' });
    if (build.status !== 0) process.exit(build.status ?? 1);

    const deploy = spawnSync('npx', ['wrangler', 'deploy'], {
      cwd: ROOT,
      shell: true,
      stdio: 'inherit',
    });
    process.exit(deploy.status ?? 0);
  }

  console.log('\nDone. Next: npm run build && npx wrangler deploy');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
