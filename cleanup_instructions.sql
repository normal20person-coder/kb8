-- =========================================================
-- GeoConsent - Data Cleanup & Maintenance Scripts
-- =========================================================

-- 1. Manual Cleanup: Delete location updates older than 24 hours
DELETE FROM public.location_updates 
WHERE created_at < NOW() - INTERVAL '24 hours';

-- 2. Manual Cleanup: Delete expired tracking links
DELETE FROM public.tracking_links 
WHERE expires_at < NOW();

-- 3. Automatic Cleanup using Supabase pg_cron (Optional)
-- If pg_cron extension is enabled in Supabase (Database -> Extensions -> pg_cron):
-- Run this to create an automated hourly cron job that purges 24h old location data:

/*
SELECT cron.schedule(
    'purge-old-locations-job',
    '0 * * * *', -- runs every hour at minute 0
    $$ 
      DELETE FROM public.location_updates WHERE created_at < NOW() - INTERVAL '24 hours';
      DELETE FROM public.tracking_links WHERE expires_at < NOW() - INTERVAL '48 hours';
    $$
);
*/
