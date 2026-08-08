import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.split(' ')[1];

    let userId: string | null = null;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const { owner_id } = await req.json().catch(() => ({ owner_id: null }));
    const targetOwnerId = userId || owner_id;

    if (!targetOwnerId) {
      return NextResponse.json({ error: 'Unauthorized: Missing owner_id' }, { status: 401 });
    }

    // Generate random 16-character token
    const tokenBytes = new Uint8Array(12);
    crypto.getRandomValues(tokenBytes);
    const trackingToken = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');

    // 24 hours expiration
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('tracking_links')
      .insert([
        {
          owner_id: targetOwnerId,
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
