import { clerkMiddleware } from '@clerk/astro/server';
import { defineMiddleware, sequence } from 'astro:middleware';

const trailingSlashRedirect = defineMiddleware((context, next) => {
  const { request, url } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return next();
  }

  const { pathname, search } = url;
  const hasFileExtension = /\/[^/]+\.[^/]+$/.test(pathname);
  const isInternalOrApi =
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_') ||
    pathname.startsWith('/pagefind/');

  if (pathname !== '/' && !pathname.endsWith('/') && !hasFileExtension && !isInternalOrApi) {
    return context.redirect(`${pathname}/${search}`, 301);
  }

  return next();
});

export const onRequest = sequence(trailingSlashRedirect, clerkMiddleware());
