import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import TableOfContents from '../../src/components/TableOfContents.astro';

async function render(headings: { depth: number; slug: string; text: string }[]) {
  const container = await AstroContainer.create();
  const html = await container.renderToString(TableOfContents, {
    props: { headings },
  });
  return { html };
}

describe('TableOfContents', () => {
  it('should render nothing for empty headings', async () => {
    const { html } = await render([]);
    expect(html).not.toContain('<nav');
  });

  it('should render nothing when only h1 headings', async () => {
    const { html } = await render([{ depth: 1, slug: 'intro', text: 'Intro' }]);
    expect(html).not.toContain('<nav');
  });

  it('should render nothing when only h4+ headings', async () => {
    const { html } = await render([{ depth: 4, slug: 'details', text: 'Details' }]);
    expect(html).not.toContain('<nav');
  });

  it('should render h2 headings', async () => {
    const { html } = await render([{ depth: 2, slug: 'section-1', text: 'Section 1' }]);
    expect(html).toContain('Section 1');
    expect(html).toContain('href="#section-1"');
  });

  it('should render h3 headings', async () => {
    const { html } = await render([{ depth: 3, slug: 'subsection', text: 'Subsection' }]);
    expect(html).toContain('Subsection');
  });

  it('should add ml-4 class to h3 entries', async () => {
    const { html } = await render([{ depth: 3, slug: 'sub', text: 'Sub' }]);
    expect(html).toContain('ml-4');
  });

  it('should not add ml-4 class to h2 entries', async () => {
    const { html } = await render([{ depth: 2, slug: 'main', text: 'Main' }]);
    expect(html).not.toContain('ml-4');
  });

  it('should set data-slug attribute on links', async () => {
    const { html } = await render([{ depth: 2, slug: 'my-section', text: 'My Section' }]);
    expect(html).toContain('data-slug="my-section"');
  });

  it('should filter out h1 and h4+ from mixed headings', async () => {
    const headings = [
      { depth: 1, slug: 'title', text: 'Title' },
      { depth: 2, slug: 'section', text: 'Section' },
      { depth: 3, slug: 'subsection', text: 'Subsection' },
      { depth: 4, slug: 'deep', text: 'Deep' },
      { depth: 5, slug: 'deeper', text: 'Deeper' },
    ];
    const { html } = await render(headings);
    expect(html).toContain('Section');
    expect(html).toContain('Subsection');
    expect(html).not.toContain('Title');
    expect(html).not.toContain('Deep');
    expect(html).not.toContain('Deeper');
  });

  it('should render "On this page" header', async () => {
    const { html } = await render([{ depth: 2, slug: 's', text: 'S' }]);
    expect(html).toContain('On this page');
  });
});
