import { describe, it, expect } from 'vitest';
import {
  parseMavenCoordinates,
  extractJMeterVersionFromPom,
  resolvePomProperty,
  parseChangelogCompatibility,
  formatJMeterCompatibility,
} from '../../src/utils/jmeterCompatibility';

describe('parseMavenCoordinates', () => {
  it('parses a Maven Central repo1.maven.org URL', () => {
    const result = parseMavenCoordinates(
      'https://repo1.maven.org/maven2/kg/apc/jmeter-plugins-casutg/3.1.1/jmeter-plugins-casutg-3.1.1.jar',
    );
    expect(result).toEqual({
      groupId: 'kg.apc',
      artifactId: 'jmeter-plugins-casutg',
      version: '3.1.1',
      pomUrl:
        'https://repo1.maven.org/maven2/kg/apc/jmeter-plugins-casutg/3.1.1/jmeter-plugins-casutg-3.1.1.pom',
    });
  });

  it('parses a search.maven.org remotecontent URL', () => {
    const result = parseMavenCoordinates(
      'https://search.maven.org/remotecontent?filepath=kg/apc/jmeter-plugins-casutg/3.1.1/jmeter-plugins-casutg-3.1.1.jar',
    );
    expect(result?.pomUrl).toBe(
      'https://repo1.maven.org/maven2/kg/apc/jmeter-plugins-casutg/3.1.1/jmeter-plugins-casutg-3.1.1.pom',
    );
  });

  it('handles classifiers and still points at the base POM', () => {
    const result = parseMavenCoordinates(
      'https://repo1.maven.org/maven2/com/qainsights/jmeter-agent/2.0.9/jmeter-agent-2.0.9-jar-with-dependencies.jar',
    );
    expect(result?.pomUrl).toBe(
      'https://repo1.maven.org/maven2/com/qainsights/jmeter-agent/2.0.9/jmeter-agent-2.0.9.pom',
    );
  });

  it('returns null for GitHub release URLs', () => {
    const result = parseMavenCoordinates(
      'https://github.com/QAInsights/jmeter-ai/releases/download/v2.0.9/jmeter-agent-2.0.9.jar',
    );
    expect(result).toBeNull();
  });

  it('returns null for non-Maven host URLs', () => {
    const result = parseMavenCoordinates(
      'https://example.com/plugins/my-plugin/1.0/my-plugin-1.0.jar',
    );
    expect(result).toBeNull();
  });
});

describe('resolvePomProperty', () => {
  const pom = `
    <project>
      <properties>
        <jmeter.version>5.6.2</jmeter.version>
      </properties>
    </project>
  `;

  it('returns literal values unchanged', () => {
    expect(resolvePomProperty('5.2.1', pom)).toBe('5.2.1');
  });

  it('resolves a property reference from the POM', () => {
    expect(resolvePomProperty('${jmeter.version}', pom)).toBe('5.6.2');
  });

  it('returns null for an unresolved property', () => {
    expect(resolvePomProperty('${missing}', pom)).toBeNull();
  });
});

describe('extractJMeterVersionFromPom', () => {
  it('extracts the ApacheJMeter_core version from a POM', () => {
    const pom = `
      <project>
        <dependencies>
          <dependency>
            <groupId>org.apache.jmeter</groupId>
            <artifactId>ApacheJMeter_core</artifactId>
            <version>5.2.1</version>
          </dependency>
        </dependencies>
      </project>
    `;
    expect(extractJMeterVersionFromPom(pom)).toBe('5.2.1');
  });

  it('resolves property references in the dependency version', () => {
    const pom = `
      <project>
        <properties>
          <jmeter.version>5.6.2</jmeter.version>
        </properties>
        <dependencies>
          <dependency>
            <groupId>org.apache.jmeter</groupId>
            <artifactId>ApacheJMeter_core</artifactId>
            <version>\${jmeter.version}</version>
          </dependency>
        </dependencies>
      </project>
    `;
    expect(extractJMeterVersionFromPom(pom)).toBe('5.6.2');
  });

  it('matches any ApacheJMeter_* artifact', () => {
    const pom = `
      <project>
        <dependencies>
          <dependency>
            <groupId>org.apache.jmeter</groupId>
            <artifactId>ApacheJMeter_http</artifactId>
            <version>5.6.3</version>
          </dependency>
        </dependencies>
      </project>
    `;
    expect(extractJMeterVersionFromPom(pom)).toBe('5.6.3');
  });

  it('returns null when no JMeter dependency is present', () => {
    const pom = `
      <project>
        <dependencies>
          <dependency>
            <groupId>org.example</groupId>
            <artifactId>some-lib</artifactId>
            <version>1.0.0</version>
          </dependency>
        </dependencies>
      </project>
    `;
    expect(extractJMeterVersionFromPom(pom)).toBeNull();
  });
});

describe('parseChangelogCompatibility', () => {
  it('parses "JMeter X.Y+" patterns', () => {
    expect(parseChangelogCompatibility('New feature, requires JMeter 5.2+')).toBe('5.2');
  });

  it('parses "JMeter version X.Y or later"', () => {
    expect(parseChangelogCompatibility('JMeter version 3.1 or later')).toBe('3.1');
  });

  it('parses "Updated JMeter dependencies to X.Y.Z"', () => {
    expect(parseChangelogCompatibility('Updated JMeter dependencies to 5.6.3')).toBe('5.6.3');
  });

  it('parses "compatible with JMeter X"', () => {
    expect(parseChangelogCompatibility('Now compatible with JMeter 4')).toBe('4');
  });

  it('ignores deprecation notices mentioning JMeter versions', () => {
    expect(parseChangelogCompatibility('Deprecated in favor of core JMeter 4.0+')).toBeNull();
  });

  it('ignores maximum-version phrasing', () => {
    expect(parseChangelogCompatibility('Only works with JMeter 2.12 and earlier')).toBeNull();
  });

  it('picks the highest version when multiple minimums are mentioned', () => {
    expect(parseChangelogCompatibility('Supports JMeter 5.0+ and JMeter 5.2+')).toBe('5.2');
  });
});

describe('formatJMeterCompatibility', () => {
  it('formats a patch version into a compact major.minor label', () => {
    expect(formatJMeterCompatibility('5.6.2')).toBe('JMeter 5.6+');
  });

  it('formats a minor version', () => {
    expect(formatJMeterCompatibility('5.2')).toBe('JMeter 5.2+');
  });

  it('formats a major-only version', () => {
    expect(formatJMeterCompatibility('5')).toBe('JMeter 5+');
  });

  it('returns null for missing values', () => {
    expect(formatJMeterCompatibility(null)).toBeNull();
    expect(formatJMeterCompatibility(undefined)).toBeNull();
    expect(formatJMeterCompatibility('')).toBeNull();
  });
});
