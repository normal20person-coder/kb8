import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, lat, lng, accuracy, speed, heading, battery_level, is_sos, ts } = body || {};

    if (!token || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameters: token, lat, lng' },
        { status: 400 }
      );
    }

    const latitude = Number(lat);
    const longitude = Number(lng);

    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
      return NextResponse.json(
        { error: 'Invalid latitude coordinate. Must be between -90 and 90.' },
        { status: 400 }
      );
    }

    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { error: 'Invalid longitude coordinate. Must be between -180 and 180.' },
        { status: 400 }
      );
    }

    // Validate token status in tracking_links
    const { data: link, error: linkError } = await supabase
      .from('tracking_links')
      .select('id, active, expires_at')
      .eq('token', token)
      .single();

    if (linkError || !link) {
      return NextResponse.json(
        { error: 'Tracking link not found or invalid token.' },
        { status: 404 }
      );
    }

    if (!link.active) {
      return NextResponse.json(
        { error: 'This tracking link has been deactivated by the owner.' },
        { status: 403 }
      );
    }

    const isExpired = new Date(link.expires_at).getTime() < Date.now();
    if (isExpired) {
      return NextResponse.json(
        { error: 'This tracking link has expired.' },
        { status: 410 }
      );
    }

    // Insert new location record into location_updates
    const { data: updateRecord, error: insertError } = await supabase
      .from('location_updates')
      .insert([
        {
          token,
          lat: latitude,
          lng: longitude,
          accuracy: accuracy !== undefined && !isNaN(Number(accuracy)) ? Number(accuracy) : null,
          speed: speed !== undefined && !isNaN(Number(speed)) ? Number(speed) : null,
          heading: heading !== undefined && !isNaN(Number(heading)) ? Number(heading) : null,
          battery_level: battery_level !== undefined && !isNaN(Number(battery_level)) ? Number(battery_level) : null,
          is_sos: Boolean(is_sos),
          ts: ts && !isNaN(Number(ts)) ? Number(ts) : Date.now(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting location update:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: updateRecord.id });
  } catch (err: unknown) {
    console.error('Unexpected error in /api/update-location:', err);
    return NextResponse.json(
      { error: (err as Error)?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
