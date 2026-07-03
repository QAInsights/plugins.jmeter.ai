import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import HealthBadge from '../../src/components/HealthBadge.astro';
import type { HealthInfo } from '../../src/utils/health';

async function render(props: { health?: HealthInfo; size?: 'sm' | 'md' }) {
  const container = await AstroContainer.create();
  const html = await container.renderToString(HealthBadge, { props });
  return { html };
}

describe('HealthBadge', () => {
  it('should render empty string when health is undefined', async () => {
    const { html } = await render({});
    expect(html.trim()).toBe('');
  });

  it('should render empty string when health label is Unknown', async () => {
    const { html } = await render({
      health: {
        score: 0,
        label: 'Unknown',
        stars: 0,
        openIssues: 0,
        archived: false,
        lastCommitAt: null,
        lastReleaseAt: null,
        license: 'N/A',
        repoUrl: '',
      },
    });
    expect(html.trim()).toBe('');
  });

  it('should render Active label and relative time when health is Active', async () => {
    // Commit pushed yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const { html } = await render({
      health: {
        score: 95,
        label: 'Active',
        stars: 150,
        openIssues: 2,
        archived: false,
        lastCommitAt: yesterday.toISOString(),
        lastReleaseAt: yesterday.toISOString(),
        license: 'Apache-2.0',
        repoUrl: 'https://github.com/owner/repo',
      },
    });

    expect(html).toContain('Active');
    expect(html).toContain('updated yesterday');
    expect(html).toContain('text-green-700');
  });

  it('should render Archived label when health is Archived', async () => {
    const { html } = await render({
      health: {
        score: 15,
        label: 'Archived',
        stars: 50,
        openIssues: 0,
        archived: true,
        lastCommitAt: '2020-01-01T12:00:00Z',
        lastReleaseAt: '2020-01-01T12:00:00Z',
        license: 'MIT',
        repoUrl: 'https://github.com/owner/repo',
      },
    });

    expect(html).toContain('Archived');
    expect(html).toContain('text-rose-700');
  });
});
