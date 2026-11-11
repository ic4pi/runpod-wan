import { next } from '@vercel/edge';
import { defaultDeps } from './lib/env';
import { decide } from './lib/gate';

/** The paywall. Runs before any file under /bakery, /beet or /sprouts is served. */
export const config = { matcher: ['/bakery/:path*', '/beet/:path*', '/sprouts/:path*'] };

export default async function middleware(request: Request): Promise<Response> {
  const result = await decide({ url: request.url, cookie: request.headers.get('cookie') }, defaultDeps());
  if (!result.allow) {
    return new Response(null, { status: 302, headers: { Location: new URL(result.redirect, request.url).toString(), 'Cache-Control': 'private, no-store' } });
  }
  const headers = new Headers();
  for (const c of result.setCookies) headers.append('Set-Cookie', c);
  return next({ headers });
}
