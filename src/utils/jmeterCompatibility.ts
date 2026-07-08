export interface MavenCoordinates {
  groupId: string;
  artifactId: string;
  version: string;
  pomUrl: string;
}

/**
 * Parse Maven coordinates from a download URL when it points to a Maven
 * Central artifact. Supports both repo1.maven.org and the
 * search.maven.org/remotecontent?filepath=... redirector.
 *
 * Returns null for non-Maven URLs (e.g. GitHub releases, custom hosts that
 * don't use the standard /maven2/ layout).
 */
export function parseMavenCoordinates(url: string): MavenCoordinates | null {
  try {
    const parsed = new URL(url);
    let mavenPath = '';

    if (parsed.hostname === 'search.maven.org' && parsed.pathname === '/remotecontent') {
      const filepath = parsed.searchParams.get('filepath');
      if (!filepath) return null;
      mavenPath = decodeURIComponent(filepath);
    } else {
      const parts = parsed.pathname.split('/maven2/');
      if (parts.length < 2) return null;
      mavenPath = parts.slice(1).join('/maven2/');
    }

    if (!mavenPath.endsWith('.jar')) return null;

    const withoutExt = mavenPath.slice(0, -4);
    const segments = withoutExt.split('/').filter(Boolean);
    if (segments.length < 3) return null;

    const filename = decodeURIComponent(segments[segments.length - 1]);
    const version = decodeURIComponent(segments[segments.length - 2]);
    const artifactId = decodeURIComponent(segments[segments.length - 3]);
    const groupSegments = segments.slice(0, -3).map((s) => decodeURIComponent(s));

    if (!artifactId || !version || version.includes('%') || version.includes('$')) {
      return null;
    }

    // The filename must start with <artifactId>-<version> (optionally followed
    // by a classifier). This guards against GitHub-style release URLs whose
    // final path segments happen to look like artifact/version but whose
    // filename does not match.
    if (!filename.startsWith(`${artifactId}-${version}`)) {
      return null;
    }

    const groupPath = groupSegments.join('/');
    const groupId = groupSegments.join('.');
    const pomPath = [groupPath, artifactId, version, `${artifactId}-${version}.pom`]
      .filter(Boolean)
      .join('/');

    return {
      groupId,
      artifactId,
      version,
      pomUrl: `https://repo1.maven.org/maven2/${pomPath}`,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a Maven POM property reference such as ${jmeter.version} using the
 * <properties> block of the POM. Returns the raw value if it is not a
 * reference. Recursively resolves chained references up to a safe depth.
 */
export function resolvePomProperty(rawValue: string, pomXml: string): string | null {
  let value = rawValue.trim();
  const seen = new Set<string>();

  for (let depth = 0; depth < 5; depth++) {
    const match = /^\$\{([^}]+)\}$/.exec(value);
    if (!match) return value;

    const propName = match[1];
    if (seen.has(propName)) return null;
    seen.add(propName);

    const propertiesMatch = /<properties>([\s\S]*?)<\/properties>/i.exec(pomXml);
    if (!propertiesMatch) return null;

    const propRegex = new RegExp(`<${propName}>([^<]+)</${propName}>`, 'i');
    const propMatch = propRegex.exec(propertiesMatch[1]);
    if (!propMatch) return null;

    value = propMatch[1].trim();
  }

  return value;
}

/**
 * Extract the JMeter version a plugin was compiled against by reading its POM
 * and looking for an org.apache.jmeter / ApacheJMeter_* dependency.
 *
 * The POM text is expected to be the raw Maven POM XML.
 */
export function extractJMeterVersionFromPom(pomXml: string): string | null {
  const normalized = pomXml.replace(/>\s+</g, '><');
  const dependencyRegex = /<dependency>([\s\S]*?)<\/dependency>/gi;
  let match: RegExpExecArray | null;

  while ((match = dependencyRegex.exec(normalized)) !== null) {
    const block = match[1];
    const groupMatch = /<groupId>([^<]+)<\/groupId>/i.exec(block);
    const artifactMatch = /<artifactId>([^<]+)<\/artifactId>/i.exec(block);
    const versionMatch = /<version>([^<]+)<\/version>/i.exec(block);

    if (!groupMatch || !artifactMatch || !versionMatch) continue;

    const groupId = groupMatch[1].trim();
    const artifactId = artifactMatch[1].trim();
    const rawVersion = versionMatch[1].trim();

    if (groupId === 'org.apache.jmeter' && artifactId.startsWith('ApacheJMeter_')) {
      const resolved = resolvePomProperty(rawVersion, pomXml);
      if (resolved && /^[\d.]/.test(resolved)) {
        return resolved;
      }
    }
  }

  return null;
}

function compareSemverDesc(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const an = aParts[i] ?? 0;
    const bn = bParts[i] ?? 0;
    if (an !== bn) return bn - an;
  }

  return 0;
}

function isLikelyMinimum(context: string): boolean {
  const lower = context.toLowerCase();
  const negative =
    /\b(earlier|lower|before|or lower|and lower|only|not supported|favor of|deprecated|replaced by|superseded|obsolete|in core|use core)\b/;
  return !negative.test(lower);
}

/**
 * Try to extract a minimum required JMeter version from a changelog/changes
 * text string. This is a best-effort fallback for plugins whose artifact is
 * not available on Maven Central.
 */
export function parseChangelogCompatibility(changes: string): string | null {
  if (!changes) return null;

  const text = changes.replace(/<[^>]+>/g, ' ');
  const patterns = [
    /JMeter\s+(?:version\s+)?v?(\d+(?:\.\d+){0,2})\s*\+/gi,
    /JMeter\s+(?:version\s+)?v?(\d+(?:\.\d+){0,2})\s*(?:or later|or newer|or higher|or superior|and above|and later|and up)/gi,
    /requires?\s+JMeter\s+(?:version\s+)?v?(\d+(?:\.\d+){0,2})/gi,
    /JMeter\s+(?:version\s+)?v?(\d+(?:\.\d+){0,2})\s*(?:required|needed|supported|minimum|min|or later|or newer|or higher|or superior|and above)/gi,
    /compatible with\s+JMeter\s+(?:version\s+)?v?(\d+(?:\.\d+){0,2})/gi,
    /JMeter dependencies (?:to|at)\s+v?(\d+(?:\.\d+){0,2})/gi,
    /(?:support|works|built|compiled).*?JMeter\s+(?:version\s+)?v?(\d+(?:\.\d+){0,2})/gi,
  ];

  const candidates: Array<{ version: string; index: number }> = [];

  for (const regex of patterns) {
    let m: RegExpExecArray | null;
    // Reset lastIndex in case regex is reused with g flag
    regex.lastIndex = 0;
    while ((m = regex.exec(text)) !== null) {
      const version = m[1];
      const start = Math.max(0, m.index - 60);
      const end = Math.min(text.length, m.index + m[0].length + 60);
      const context = text.slice(start, end);

      if (!isLikelyMinimum(context)) continue;

      candidates.push({ version, index: m.index });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => compareSemverDesc(a.version, b.version));
  return candidates[0].version;
}

function compactJMeterVersion(version: string): string | null {
  const parts = version.split('.').filter(Boolean);
  if (parts.length === 0) return null;
  return `${parts.slice(0, 2).join('.')}+`;
}

/**
 * Format a raw JMeter version (e.g. "5.6.2") into a compact version
 * suffix (e.g. "5.6+").
 *
 * Returns null for missing/empty values so callers can hide the badge.
 */
export function formatJMeterVersion(version: string | null | undefined): string | null {
  if (!version || typeof version !== 'string') return null;
  return compactJMeterVersion(version);
}

/**
 * Format a raw JMeter version into a full user-facing label
 * (e.g. "JMeter 5.6+").
 *
 * Returns null for missing/empty values so callers can hide the badge.
 */
export function formatJMeterCompatibility(version: string | null | undefined): string | null {
  const compact = formatJMeterVersion(version);
  return compact ? `JMeter ${compact}` : null;
}

/**
 * Build the accessible tooltip/title text for a JMeter compatibility value.
 */
export function getJMeterCompatibilityTitle(
  version: string | null | undefined,
): string | undefined {
  if (!version || typeof version !== 'string') return undefined;
  return `Requires JMeter ${version} or later`;
}
