import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, name, emergency_contact, blood_group, address } = body || {};

    if (!token) {
      return NextResponse.json(
        { error: 'Missing required parameter: token' },
        { status: 400 }
      );
    }

    // Validate token exists, is active, and not expired
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
        { error: 'This tracking link has been deactivated.' },
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

    const updatePayload: Record<string, string | null> = {};
    if (name !== undefined) updatePayload.label = name ? String(name).trim() : null;
    if (emergency_contact !== undefined) updatePayload.emergency_contact = emergency_contact ? String(emergency_contact).trim() : null;
    if (blood_group !== undefined) updatePayload.blood_group = blood_group ? String(blood_group).trim() : null;
    if (address !== undefined) updatePayload.address = address ? String(address).trim() : null;

    const { data, error } = await supabase
      .from('tracking_links')
      .update(updatePayload)
      .eq('token', token)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, tracking_link: data });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error)?.message || 'Server error' }, { status: 500 });
  }
}
