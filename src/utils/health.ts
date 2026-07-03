export interface GitHubSignals {
  stars?: number;
  forks?: number;
  openIssues?: number;
  archived?: boolean;
  pushedAt?: string; // ISO date string
  updatedAt?: string; // ISO date string
  latestReleaseAt?: string; // ISO date string
  license?: string;
  fetchedAt?: string; // ISO date string
}

export interface HealthInfo {
  score: number; // 0-100
  label: 'Active' | 'Maintained' | 'Stale' | 'Archived' | 'Unknown';
  stars: number;
  openIssues: number;
  archived: boolean;
  lastCommitAt: string | null;
  lastReleaseAt: string | null;
  license: string;
  repoUrl: string;
}

export const HEALTH_THRESHOLDS = {
  ACTIVE: 70,
  MAINTAINED: 40,
  STALE: 1,
};

export function parseGitHubRepo(
  url: string | undefined | null,
): { owner: string; repo: string } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'github.com' && host !== 'www.github.com') {
      return null;
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    let repo = parts[1];
    if (repo.endsWith('.git')) {
      repo = repo.slice(0, -4);
    }
    return { owner, repo };
  } catch {
    return null;
  }
}

function getMonthsDiff(d1: Date, d2: Date): number {
  return (d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

function calculateRecencyScore(pushedAt: string | undefined, now: Date): number {
  if (!pushedAt) return 0;
  const pushedDate = new Date(pushedAt);
  if (isNaN(pushedDate.getTime())) return 0;
  const months = getMonthsDiff(now, pushedDate);
  if (months <= 1) return 50;
  if (months >= 24) return 0;
  return Math.max(0, Math.min(50, 50 * (1 - (months - 1) / (24 - 1))));
}

function calculateStarsScore(stars: number | undefined): number {
  const val = stars ?? 0;
  if (val <= 0) return 0;
  // Natural log scaling, saturating at 500 stars
  const denom = Math.log(501);
  const score = 25 * (Math.log(val + 1) / denom);
  return Math.max(0, Math.min(25, score));
}

function calculateReleaseScore(latestReleaseAt: string | undefined, now: Date): number {
  if (!latestReleaseAt) return 0;
  const releaseDate = new Date(latestReleaseAt);
  if (isNaN(releaseDate.getTime())) return 0;
  const months = getMonthsDiff(now, releaseDate);
  if (months <= 3) return 15;
  if (months >= 36) return 0;
  return Math.max(0, Math.min(15, 15 * (1 - (months - 3) / (36 - 3))));
}

function calculateIssueBurdenScore(
  openIssues: number | undefined,
  stars: number | undefined,
): number {
  const issues = openIssues ?? 0;
  const starsCount = stars ?? 0;
  const ratio = issues / (starsCount + 1);
  // Penalize ratio: ratio of 0.5 or above gets 0 points.
  return Math.max(0, Math.min(10, 10 - ratio * 20));
}

export function computeHealth(
  signals: GitHubSignals | undefined | null,
  now = new Date(),
): HealthInfo {
  const defaultHealth: HealthInfo = {
    score: 0,
    label: 'Unknown',
    stars: 0,
    openIssues: 0,
    archived: false,
    lastCommitAt: null,
    lastReleaseAt: null,
    license: 'N/A',
    repoUrl: '',
  };

  if (!signals || Object.keys(signals).length === 0) {
    return defaultHealth;
  }

  const archived = signals.archived ?? false;
  const recency = calculateRecencyScore(signals.pushedAt, now);
  const starsScore = calculateStarsScore(signals.stars);
  const release = calculateReleaseScore(signals.latestReleaseAt, now);
  const burden = calculateIssueBurdenScore(signals.openIssues, signals.stars);

  let score = Math.round(recency + starsScore + release + burden);
  if (archived) {
    score = Math.min(score, 20); // capped low
  }

  let label: HealthInfo['label'] = 'Unknown';
  if (archived) {
    label = 'Archived';
  } else if (score >= HEALTH_THRESHOLDS.ACTIVE) {
    label = 'Active';
  } else if (score >= HEALTH_THRESHOLDS.MAINTAINED) {
    label = 'Maintained';
  } else if (score >= HEALTH_THRESHOLDS.STALE) {
    label = 'Stale';
  } else {
    label = 'Stale'; // if score is 0 but signals exist, label is Stale
  }

  return {
    score,
    label,
    stars: signals.stars ?? 0,
    openIssues: signals.openIssues ?? 0,
    archived,
    lastCommitAt: signals.pushedAt ?? null,
    lastReleaseAt: signals.latestReleaseAt ?? null,
    license: signals.license ?? 'N/A',
    repoUrl: '', // will be set dynamically in enrichment
  };
}

export interface EnrichedGitHubInfo {
  stars: number;
  license: string;
  health: HealthInfo;
}

export function enrichPluginWithHealth<T>(
  plugin: T,
  health?: HealthInfo,
): T & { githubInfo?: EnrichedGitHubInfo } {
  if (!health || health.label === 'Unknown') {
    return plugin as any;
  }
  return {
    ...plugin,
    githubInfo: {
      stars: health.stars,
      license: health.license,
      health,
    },
  };
}
