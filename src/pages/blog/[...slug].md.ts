import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { filterDrafts } from '../../utils/blog';

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  const rawPosts: unknown = await getCollection('blog');
  const allPosts = Array.isArray(rawPosts) ? (rawPosts as Array<CollectionEntry<'blog'>>) : [];
  const posts = filterDrafts(allPosts);
  return posts.map((post) => ({
    params: { slug: post.id },
    props: { post },
  }));
};

export const GET: APIRoute = ({ props }) => {
  const post = (props as { post: CollectionEntry<'blog'> }).post;
  const canonical = `https://plugins.jmeter.ai/blog/${post.id}/`;
  const tags = (post.data.tags || []).join(', ');
  const header = [
    `# ${post.data.title}`,
    '',
    `> ${post.data.description}`,
    '',
    `- **Canonical URL**: ${canonical}`,
    `- **Author**: ${post.data.author}`,
    `- **Published**: ${post.data.pubDate.toISOString().slice(0, 10)}`,
    ...(post.data.updatedDate
      ? [`- **Updated**: ${post.data.updatedDate.toISOString().slice(0, 10)}`]
      : []),
    ...(tags ? [`- **Tags**: ${tags}`] : []),
    '',
    '---',
    '',
  ].join('\n');

  return new Response(`${header}${post.body || ''}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
