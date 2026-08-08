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

    // Generate random 24-character hex token (12 bytes)
    const tokenBytes = new Uint8Array(12);
    crypto.getRandomValues(tokenBytes);
    const trackingToken = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');

    // 24 hours expiration
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('tracking_links')
      .insert([
        {
          owner_id: user.id,
          token: trackingToken,
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
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

