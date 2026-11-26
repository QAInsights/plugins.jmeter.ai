import fs from 'node:fs';
import path from 'node:path';

const HOST = 'plugins.jmeter.ai';
const SITE = `https://${HOST}`;
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

interface PluginEntry {
  id: string;
  stats?: { trendingDelta?: number };
}

async function verifyKeyLocation(keyLocation: string, expectedKey: string): Promise<boolean> {
  const res = await fetch(keyLocation);
  if (!res.ok) {
    console.error(
      `[indexnow] Key verification file not reachable at ${keyLocation} (HTTP ${res.status}). Publish public/${expectedKey}.txt (or set INDEXNOW_KEY_LOCATION) before enabling INDEXNOW_KEY.`,
    );
    return false;
  }
  const body = (await res.text()).trim();
  if (body !== expectedKey) {
    console.error(`[indexnow] Key file at ${keyLocation} does not match INDEXNOW_KEY.`);
    return false;
  }
  return true;
}

async function main() {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) {
    console.log('[indexnow] INDEXNOW_KEY not set — skipping IndexNow submission.');
    return;
  }

  const keyLocation = process.env.INDEXNOW_KEY_LOCATION?.trim() || `${SITE}/${key}.txt`;
  const verified = await verifyKeyLocation(keyLocation, key);
  if (!verified) {
    process.exitCode = 1;
    return;
  }

  const plugins = JSON.parse(
    fs.readFileSync(path.resolve('src/data/plugins_data.json'), 'utf8'),
  ) as PluginEntry[];

  const topUpdated = [...plugins]
    .sort((a, b) => (b.stats?.trendingDelta ?? 0) - (a.stats?.trendingDelta ?? 0))
    .slice(0, 50)
    .map((p) => `${SITE}/plugin/${p.id}/`);

  const urlList = [
    `${SITE}/`,
    `${SITE}/recently-updated/`,
    `${SITE}/potentially-abandoned/`,
    `${SITE}/category/`,
    `${SITE}/compare/`,
    `${SITE}/blog/`,
    ...topUpdated,
  ];

  const payload = { host: HOST, key, keyLocation, urlList };
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });

  console.log(`[indexnow] Submitted ${urlList.length} URLs — HTTP ${res.status}`);
  if (!res.ok) {
    const text = await res.text();
    console.error(`[indexnow] Submission rejected (HTTP ${res.status}): ${text}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[indexnow] Submission failed:', err);
  process.exitCode = 1;
});
