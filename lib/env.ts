export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SESSION_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  SITE_URL?: string;
}

export interface Deps {
  env: Env;
  fetch: typeof fetch;
  now: () => number; // ms
}

export function defaultDeps(): Deps {
  const e = process.env;
  return {
    env: {
      SUPABASE_URL: e.SUPABASE_URL?.replace(/\/+$/, ''),
      SUPABASE_ANON_KEY: e.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: e.SUPABASE_SERVICE_ROLE_KEY,
      SESSION_SECRET: e.SESSION_SECRET,
      STRIPE_SECRET_KEY: e.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: e.STRIPE_WEBHOOK_SECRET,
      SITE_URL: e.SITE_URL?.replace(/\/+$/, ''),
    },
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
  };
}

/** Auth needs these three. Without them every paid page stays locked. */
export const authConfigured = (env: Env) => !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SESSION_SECRET);
