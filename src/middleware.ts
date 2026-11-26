import { clerkMiddleware } from '@clerk/astro/server';
import { defineMiddleware, sequence } from 'astro:middleware';

const trailingSlashRedirect = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return next();
  }

  const { pathname, search } = url;
  const hasFileExtension = /\/[^/]+\.[^/]+$/.test(pathname);
  const isInternalOrApi =
    pathname.startsWith('/api/') || pathname.startsWith('/_') || pathname.startsWith('/pagefind/');

  if (pathname !== '/' && !pathname.endsWith('/') && !hasFileExtension && !isInternalOrApi) {
    return context.redirect(`${pathname}/${search}`, 301);
  }

  const response = await next();

  // Fallback for retired or ad-hoc `/compare/<a>-vs-<b>/` URLs: 301 to the interactive
  // comparison tool instead of returning 404.
  if (response.status === 404) {
    const compareMatch = /^\/compare\/([a-z0-9._-]+)-vs-([a-z0-9._-]+)\/$/i.exec(pathname);
    if (compareMatch) {
      const ids = encodeURIComponent(`${compareMatch[1]},${compareMatch[2]}`);
      return context.redirect(`/compare/?ids=${ids}`, 301);
    }
  }

  return response;
});

export const onRequest = sequence(trailingSlashRedirect, clerkMiddleware());
