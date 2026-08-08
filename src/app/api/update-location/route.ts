import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, lat, lng, accuracy, ts } = body || {};

    if (!token || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameters: token, lat, lng' },
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
        { error: 'This tracking link has expired (valid for 24 hours).' },
        { status: 410 }
      );
    }

    // Insert new location record into location_updates
    const { data: updateRecord, error: insertError } = await supabase
      .from('location_updates')
      .insert([
        {
          token,
          lat: Number(lat),
          lng: Number(lng),
          accuracy: accuracy !== undefined ? Number(accuracy) : null,
          ts: ts ? Number(ts) : Date.now(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting location update:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: updateRecord.id });
  } catch (err: any) {
    console.error('Unexpected error in /api/update-location:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
