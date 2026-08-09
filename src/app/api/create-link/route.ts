import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: Missing authorization header' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid or expired auth token' }, { status: 401 });
    }

    let label: string | null = null;
    let emergency_contact: string | null = null;
    let expirationHours = 24;

    try {
      const body = await req.json();
      if (body) {
        if (body.label && typeof body.label === 'string') label = body.label.trim();
        if (body.emergency_contact && typeof body.emergency_contact === 'string') emergency_contact = body.emergency_contact.trim();
        if (body.expiration_hours && !isNaN(Number(body.expiration_hours))) {
          expirationHours = Math.max(1, Math.min(168, Number(body.expiration_hours)));
        }
      }
    } catch {
      // Body is optional
    }

    // Generate random 24-character hex token (12 bytes)
    const tokenBytes = new Uint8Array(12);
    crypto.getRandomValues(tokenBytes);
    const trackingToken = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');

    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('tracking_links')
      .insert([
        {
          owner_id: user.id,
          token: trackingToken,
          label,
          emergency_contact,
          expires_at: expiresAt,
          active: true,
        },
      ])
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

