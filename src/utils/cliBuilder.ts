/**
 * Pure utility helpers for the JMeter CLI Command Builder tool.
 * All functions are side-effect free and safe to call during SSR. DOM and
 * localStorage I/O lives in src/pages/tools/cli-builder.astro, mirroring the
 * favorites.ts / FavoritesManager.astro split.
 */

export type CliOs = 'windows' | 'unix';

export type CliMode = 'run' | 'install' | 'full';

export interface CliBuilderState {
  os: CliOs;
  mode: CliMode;
  /** Path to the .jmx test plan. */
  testPlan: string;
  /** Path to the .jtl results file. */
  resultsFile: string;
  /** Path to the jmeter log file (optional). */
  logFile: string;
  /** Generate an HTML dashboard report after the run (-e -o). */
  generateReport: boolean;
  /** Output folder for the dashboard report. */
  reportDir: string;
  /** Delete the results file if it already exists (-f). */
  forceDeleteResults: boolean;
  /** Comma-separated remote hosts for distributed testing (-R). */
  remoteServers: string;
  /** -J key=value property overrides. */
  properties: string[];
  /** Plugin IDs to install via PluginsManagerCMD. */
  plugins: string[];
}

export const DEFAULT_CLI_STATE: CliBuilderState = {
  os: 'unix',
  mode: 'run',
  testPlan: 'test-plan.jmx',
  resultsFile: 'results.jtl',
  logFile: '',
  generateReport: true,
  reportDir: 'dashboard-report',
  forceDeleteResults: true,
  remoteServers: '',
  properties: [],
  plugins: [],
};

/** Plugins Manager command-line binary for the given OS. */
export function pluginManagerCmdName(os: CliOs): string {
  return os === 'windows' ? 'PluginsManagerCMD.bat' : 'PluginsManagerCMD.sh';
}

/** JMeter launcher binary for the given OS. */
export function jmeterCmdName(os: CliOs): string {
  return os === 'windows' ? 'jmeter.bat' : 'jmeter';
}

/** Plugin IDs from the JMeter Plugins registry are slug-like tokens. */
const PLUGIN_ID = /^[A-Za-z0-9._-]+$/;

/** Remote hosts for -R: hostnames, IPv4, and IPv6 literals only. */
const REMOTE_HOST = /^[A-Za-z0-9.:-]+$/;

/** -J property lines: identifier-like key, free-form value (may contain =). */
const PROPERTY_LINE = /^([A-Za-z0-9._-]+)=(.*)$/;

/**
 * Quote a token for the selected shell when it contains characters the shell
 * would interpret. Windows cmd doubles embedded quotes; POSIX shells use
 * single quotes with the '\'' escape. Applied to everything interpolated from
 * the share URL so a crafted link cannot smuggle extra shell syntax into the
 * generated command.
 */
export function quoteIfNeeded(path: string, os: CliOs): string {
  const needsQuote =
    os === 'windows' ? /[\s"&|<>^%]/.test(path) : /[\s"'\\$`;&|<>(){}[\]!*?#~]/.test(path);
  if (!needsQuote) return path;
  if (os === 'windows') return `"${path.replace(/"/g, '""')}"`;
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

/** Normalize a property list: trim, drop blanks, keep only valid key=value lines. */
export function normalizeProperties(properties: string[]): string[] {
  return properties.map((p) => p.trim()).filter((p) => PROPERTY_LINE.test(p));
}

/** Normalize a comma-separated remote server list, dropping non-host tokens. */
export function normalizeRemoteServers(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => REMOTE_HOST.test(s));
}

/**
 * Build the PluginsManagerCMD install command for the selected plugins.
 * Returns null when no plugins are selected.
 */
export function buildInstallCommand(state: CliBuilderState): string | null {
  const plugins = state.plugins.map((p) => p.trim()).filter((p) => PLUGIN_ID.test(p));
  if (plugins.length === 0) return null;
  return `${pluginManagerCmdName(state.os)} install ${plugins.join(',')}`;
}

/**
 * Build the headless `jmeter` run command. The test plan is required;
 * returns null without one.
 */
export function buildRunCommand(state: CliBuilderState): string | null {
  const plan = state.testPlan.trim();
  if (!plan) return null;

  const parts: string[] = [jmeterCmdName(state.os), '-n', '-t', quoteIfNeeded(plan, state.os)];

  const results = state.resultsFile.trim();
  if (results) {
    if (state.forceDeleteResults) parts.push('-f');
    parts.push('-l', quoteIfNeeded(results, state.os));
  }

  const log = state.logFile.trim();
  if (log) parts.push('-j', quoteIfNeeded(log, state.os));

  const remotes = normalizeRemoteServers(state.remoteServers);
  if (remotes.length > 0) parts.push('-R', remotes.join(','));

  for (const prop of normalizeProperties(state.properties)) {
    const eq = prop.indexOf('=');
    const key = prop.slice(0, eq);
    const value = prop.slice(eq + 1);
    parts.push(`-J${key}=${quoteIfNeeded(value, state.os)}`);
  }

  if (state.generateReport) {
    const dir = state.reportDir.trim() || 'dashboard-report';
    parts.push('-e', '-o', quoteIfNeeded(dir, state.os));
  }

  return parts.join(' ');
}

/**
 * Build the command list for the selected mode. `full` mode returns the
 * install command (if any) followed by the run command.
 */
export function buildCommands(state: CliBuilderState): string[] {
  const install = buildInstallCommand(state);
  const run = buildRunCommand(state);
  switch (state.mode) {
    case 'install':
      return install ? [install] : [];
    case 'run':
      return run ? [run] : [];
    case 'full':
      return [install, run].filter((c): c is string => c !== null);
  }
}

/** Serialize state to URL query params (only non-default values). */
export function serializeCliState(state: CliBuilderState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.os !== DEFAULT_CLI_STATE.os) params.set('os', state.os);
  // Always persist mode once plugins are in play, otherwise a reload of the
  // share URL cannot distinguish an explicit "run" choice from the default.
  if (state.mode !== DEFAULT_CLI_STATE.mode || state.plugins.length > 0)
    params.set('mode', state.mode);
  if (state.testPlan !== DEFAULT_CLI_STATE.testPlan) params.set('plan', state.testPlan);
  if (state.resultsFile !== DEFAULT_CLI_STATE.resultsFile) params.set('results', state.resultsFile);
  if (state.logFile) params.set('log', state.logFile);
  if (state.generateReport !== DEFAULT_CLI_STATE.generateReport)
    params.set('report', state.generateReport ? '1' : '0');
  if (state.reportDir !== DEFAULT_CLI_STATE.reportDir) params.set('reportdir', state.reportDir);
  if (state.forceDeleteResults !== DEFAULT_CLI_STATE.forceDeleteResults)
    params.set('force', state.forceDeleteResults ? '1' : '0');
  if (state.remoteServers.trim()) params.set('remote', state.remoteServers.trim());
  const props = normalizeProperties(state.properties);
  if (props.length > 0) params.set('props', props.join('\n'));
  if (state.plugins.length > 0) params.set('plugins', state.plugins.join(','));
  return params;
}

/** Parse query params back into state, falling back to defaults. */
export function parseCliState(params: URLSearchParams): CliBuilderState {
  const state: CliBuilderState = { ...DEFAULT_CLI_STATE };
  const os = params.get('os');
  if (os === 'windows' || os === 'unix') state.os = os;
  const mode = params.get('mode');
  if (mode === 'run' || mode === 'install' || mode === 'full') state.mode = mode;
  const plan = params.get('plan');
  if (plan) state.testPlan = plan;
  const results = params.get('results');
  if (results) state.resultsFile = results;
  const log = params.get('log');
  if (log) state.logFile = log;
  const report = params.get('report');
  if (report === '0') state.generateReport = false;
  if (report === '1') state.generateReport = true;
  const reportDir = params.get('reportdir');
  if (reportDir) state.reportDir = reportDir;
  const force = params.get('force');
  if (force === '0') state.forceDeleteResults = false;
  if (force === '1') state.forceDeleteResults = true;
  const remote = params.get('remote');
  if (remote) state.remoteServers = remote;
  const props = params.get('props');
  if (props)
    state.properties = props
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
  const plugins = params.get('plugins');
  if (plugins)
    state.plugins = plugins
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  return state;
}
