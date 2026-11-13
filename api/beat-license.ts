import { defaultDeps, authConfigured } from '../lib/env';
import { COOKIE_ACCESS, parseCookies } from '../lib/cookies';
import { json } from '../lib/http';
import { getCatalogBeat } from '../lib/beats';
import { getBeatLicense, getUser } from '../lib/supabase';

/** Returns the signed-in buyer's verified license for one beat. */
export async function GET(request: Request): Promise<Response> {
  const d = defaultDeps();
  if (!authConfigured(d.env)) return json({ error: 'not_configured' }, 503);
  const beat = getCatalogBeat(new URL(request.url).searchParams.get('beat'));
  if (!beat) return json({ error: 'not_found', message: 'That beat does not exist.' }, 404);
  const token = parseCookies(request.headers.get('cookie'))[COOKIE_ACCESS];
  if (!token) return json({ error: 'signed_out' }, 401);
  try {
    const user = await getUser(d, token);
    if (!user) return json({ error: 'signed_out' }, 401);
    const row = await getBeatLicense(d, token, beat.id);
    if (!row) return json({ licensed: false });
    return json({
      licensed: true,
      license: {
        id: row.id,
        beatId: row.beat_id,
        beatTitle: row.beat_title,
        producer: row.producer,
        licensee: user.email,
        licensedAt: row.created_at,
        version: row.license_version,
      },
    });
  } catch {
    return json({ error: 'unavailable', message: 'Licensing is unavailable. Run the beat-license database migration, then try again.' }, 503);
  }
}
