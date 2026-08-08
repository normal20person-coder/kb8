-- =========================================================
-- GeoConsent Live Location Tracker - Supabase SQL Schema
-- Run this script in the Supabase SQL Editor
-- =========================================================

-- 1. Create tracking_links table
CREATE TABLE IF NOT EXISTS public.tracking_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2. Create location_updates table
CREATE TABLE IF NOT EXISTS public.location_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL REFERENCES public.tracking_links(token) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    ts BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_tracking_links_token ON public.tracking_links(token);
CREATE INDEX IF NOT EXISTS idx_tracking_links_owner_id ON public.tracking_links(owner_id);
CREATE INDEX IF NOT EXISTS idx_location_updates_token ON public.location_updates(token);
CREATE INDEX IF NOT EXISTS idx_location_updates_created_at ON public.location_updates(created_at);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.tracking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_updates ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for tracking_links
-- Allow owners to insert their own tracking links
DROP POLICY IF EXISTS "Owners can insert their tracking links" ON public.tracking_links;
CREATE POLICY "Owners can insert their tracking links"
ON public.tracking_links FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- Allow owners to select their own tracking links
DROP POLICY IF EXISTS "Owners can select their tracking links" ON public.tracking_links;
CREATE POLICY "Owners can select their tracking links"
ON public.tracking_links FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

-- Allow anyone to check valid/active tracking links by token (for participant verification)
DROP POLICY IF EXISTS "Public can select active tracking links" ON public.tracking_links;
CREATE POLICY "Public can select active tracking links"
ON public.tracking_links FOR SELECT
TO anon, authenticated
USING (active = true AND expires_at > NOW());

-- Allow owners to update their tracking links (e.g. deactivate)
DROP POLICY IF EXISTS "Owners can update their tracking links" ON public.tracking_links;
CREATE POLICY "Owners can update their tracking links"
ON public.tracking_links FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id);

-- 6. RLS Policies for location_updates
-- Allow anyone (participants) to insert location updates (FK constraint ensures valid token)
DROP POLICY IF EXISTS "Anyone can insert location updates for valid token" ON public.location_updates;
DROP POLICY IF EXISTS "Anyone can insert location updates" ON public.location_updates;

CREATE POLICY "Anyone can insert location updates"
ON public.location_updates FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Allow owners to select location updates only for links they own
DROP POLICY IF EXISTS "Owners can view location updates for their links" ON public.location_updates;
CREATE POLICY "Owners can view location updates for their links"
ON public.location_updates FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tracking_links
        WHERE tracking_links.token = location_updates.token
        AND tracking_links.owner_id = auth.uid()
    )
);

-- 7. Enable Realtime Replication for location_updates table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'location_updates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.location_updates;
  END IF;
END $$;

-- 8. Create Latest Location Updates View for high-performance telemetry queries
CREATE OR REPLACE VIEW public.latest_location_updates AS
SELECT DISTINCT ON (token)
    id, token, lat, lng, accuracy, ts, created_at
FROM public.location_updates
ORDER BY token, created_at DESC;

-- 9. Function to purge location updates older than 24 hours (Automated Privacy Cleanup)
CREATE OR REPLACE FUNCTION public.purge_expired_location_updates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.location_updates
    WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;

