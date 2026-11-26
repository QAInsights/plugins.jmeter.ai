export interface BlogPostLike {
  id: string;
  body?: string;
  data: {
    title: string;
    description: string;
    pubDate: Date;
    tags?: string[];
  };
}

export interface CrossLinkPlugin {
  id: string;
  name: string;
  vendor: string;
  description: string;
  stats?: {
    absoluteDownloads?: number;
    trendingDelta?: number;
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTags(tags?: string[]): Set<string> {
  return new Set((tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean));
}

export function getRelatedPosts<T extends BlogPostLike>(
  current: T,
  allPosts: readonly T[],
  limit = 3,
): T[] {
  const currentTags = normalizeTags(current.data.tags);
  return allPosts
    .filter((p) => p.id !== current.id)
    .map((post) => {
      const postTags = normalizeTags(post.data.tags);
      let overlap = 0;
      for (const tag of postTags) {
        if (currentTags.has(tag)) overlap++;
      }
      return { post, overlap };
    })
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      return b.post.data.pubDate.valueOf() - a.post.data.pubDate.valueOf();
    })
    .slice(0, limit)
    .map((entry) => entry.post);
}

export function getPrevNextPosts<T extends BlogPostLike>(
  current: T,
  sortedNewestFirst: readonly T[],
): { prev: T | null; next: T | null } {
  const idx = sortedNewestFirst.findIndex((p) => p.id === current.id);
  if (idx === -1) return { prev: null, next: null };
  return {
    // Newer post = next, older post = prev
    next: idx > 0 ? sortedNewestFirst[idx - 1] : null,
    prev: idx < sortedNewestFirst.length - 1 ? sortedNewestFirst[idx + 1] : null,
  };
}

function matchesPluginInText(plugin: CrossLinkPlugin, haystack: string): boolean {
  const id = plugin.id.trim();
  if (id.length >= 4) {
    const idRe = new RegExp(`(^|[^a-z0-9_-])${escapeRegex(id)}([^a-z0-9_-]|$)`, 'i');
    if (idRe.test(haystack)) return true;
  }

  // Match distinctive plugin names (>= 6 chars, avoiding overly generic 1-word names)
  const name = plugin.name.trim();
  if (name.length >= 8 && name.includes(' ')) {
    const nameRe = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
    if (nameRe.test(haystack)) return true;
  }

  return false;
}

export function findPluginsMentionedInPost<T extends CrossLinkPlugin>(
  post: BlogPostLike,
  plugins: readonly T[],
  limit = 6,
): T[] {
  const haystack = `${post.data.title}\n${post.data.description}\n${post.body || ''}`;
  return plugins
    .filter((plugin) => matchesPluginInText(plugin, haystack))
    .sort((a, b) => (b.stats?.absoluteDownloads ?? 0) - (a.stats?.absoluteDownloads ?? 0))
    .slice(0, limit);
}

export function findPostsForPlugin<T extends BlogPostLike>(
  plugin: CrossLinkPlugin,
  posts: readonly T[],
  limit = 4,
): T[] {
  return posts
    .filter((post) => {
      const haystack = `${post.data.title}\n${post.data.description}\n${post.body || ''}`;
      return matchesPluginInText(plugin, haystack);
    })
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
    .slice(0, limit);
}
