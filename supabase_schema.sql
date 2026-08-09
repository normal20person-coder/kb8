-- =========================================================
-- GeoConsent Live Location Tracker - Supabase SQL Schema
-- Run this script in the Supabase SQL Editor
-- =========================================================

-- 1. Create user_profiles table for medical & emergency contact metadata
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    blood_group TEXT NOT NULL,
    emergency_contact TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create tracking_links table
CREATE TABLE IF NOT EXISTS public.tracking_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    label TEXT,
    blood_group TEXT,
    emergency_contact TEXT,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 3. Create location_updates table
CREATE TABLE IF NOT EXISTS public.location_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL REFERENCES public.tracking_links(token) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    battery_level DOUBLE PRECISION,
    is_sos BOOLEAN NOT NULL DEFAULT FALSE,
    ts BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_id ON public.user_profiles(id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_token ON public.tracking_links(token);
CREATE INDEX IF NOT EXISTS idx_tracking_links_owner_id ON public.tracking_links(owner_id);
CREATE INDEX IF NOT EXISTS idx_location_updates_token ON public.location_updates(token);
CREATE INDEX IF NOT EXISTS idx_location_updates_created_at ON public.location_updates(created_at);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_updates ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for user_profiles
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.user_profiles;
CREATE POLICY "Users can insert their own profile"
ON public.user_profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
CREATE POLICY "Users can view their own profile"
ON public.user_profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
CREATE POLICY "Users can update their own profile"
ON public.user_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- 7. RLS Policies for tracking_links
DROP POLICY IF EXISTS "Owners can insert their tracking links" ON public.tracking_links;
CREATE POLICY "Owners can insert their tracking links"
ON public.tracking_links FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can select their tracking links" ON public.tracking_links;
CREATE POLICY "Owners can select their tracking links"
ON public.tracking_links FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Public can select active tracking links" ON public.tracking_links;
CREATE POLICY "Public can select active tracking links"
ON public.tracking_links FOR SELECT
TO anon, authenticated
USING (active = true AND expires_at > NOW());

DROP POLICY IF EXISTS "Owners can update their tracking links" ON public.tracking_links;
CREATE POLICY "Owners can update their tracking links"
ON public.tracking_links FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete their tracking links" ON public.tracking_links;
CREATE POLICY "Owners can delete their tracking links"
ON public.tracking_links FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete location updates for their links" ON public.location_updates;
CREATE POLICY "Owners can delete location updates for their links"
ON public.location_updates FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tracking_links
        WHERE tracking_links.token = location_updates.token
        AND tracking_links.owner_id = auth.uid()
    )
);

-- 8. RLS Policies for location_updates
DROP POLICY IF EXISTS "Anyone can insert location updates" ON public.location_updates;
CREATE POLICY "Anyone can insert location updates"
ON public.location_updates FOR INSERT
TO anon, authenticated
WITH CHECK (true);

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

-- 9. Enable Realtime Replication for location_updates table
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

-- 10. Create Latest Location Updates View for high-performance telemetry queries
CREATE OR REPLACE VIEW public.latest_location_updates AS
SELECT DISTINCT ON (token)
    id, token, lat, lng, accuracy, speed, heading, battery_level, is_sos, ts, created_at
FROM public.location_updates
ORDER BY token, created_at DESC;

-- 11. Function to purge location updates older than 24 hours (Automated Privacy Cleanup)
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

