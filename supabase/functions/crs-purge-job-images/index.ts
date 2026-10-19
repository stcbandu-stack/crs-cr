// Daily job-photo retention, called by pg_cron (crs_private.purge_job_images).
// crs_take_expired_job_images() strips photos older than 6 months from the job
// orders and returns their file names; this function deletes the files, since
// storage objects can only be removed through the Storage API.
//
// Deploy with verify_jwt = false; auth is the same x-notify-secret as crs-line-notify.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const BUCKET = 'crs-job-images';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  const { data: ok } = await sb.rpc('crs_notify_secret_ok', { p: req.headers.get('x-notify-secret') ?? '' });
  if (ok !== true) return new Response('Unauthorized', { status: 401 });

  const { data: names, error } = await sb.rpc('crs_take_expired_job_images');
  if (error) {
    console.error('crs_take_expired_job_images failed:', error.message);
    return new Response(error.message, { status: 500 });
  }

  // Files that fail to delete stay in the bucket and are picked up again tomorrow.
  let removed = 0;
  for (let i = 0; i < names.length; i += 100) {
    const batch = names.slice(i, i + 100);
    const { error: rmError } = await sb.storage.from(BUCKET).remove(batch);
    if (rmError) console.error('remove failed:', rmError.message);
    else removed += batch.length;
  }

  console.log(`Purged ${removed}/${names.length} expired job photos`);
  return new Response(JSON.stringify({ expired: names.length, removed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
