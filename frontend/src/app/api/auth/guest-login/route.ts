import { NextRequest, NextResponse } from 'next/server';
import { getAuthCookieBase } from '@/lib/auth-cookies';

export async function POST(request: NextRequest) {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';

    try {
        const body = await request.json().catch(() => ({}));

        const res = await fetch(`${backendUrl}/api/auth/guest-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await res.json();

        if (!res.ok) {
            return NextResponse.json(data, { status: res.status });
        }

        const { accessToken, ...safeData } = data;

        const response = NextResponse.json(
            { ...safeData, success: true },
            { status: 200 }
        );

        const cookieBase = getAuthCookieBase(request);

        // 45-minute ephemeral guest access token
        response.cookies.set('auth_token', accessToken, {
            ...(cookieBase as any),
            maxAge: 45 * 60,
        });

        // Ensure no leftover refresh token from previous accounts remains
        response.cookies.delete('refresh_token');
        response.cookies.set('refresh_token', '', {
            ...(cookieBase as any),
            maxAge: 0,
            expires: new Date(0),
        });

        return response;
    } catch {
        return NextResponse.json(
            { message: 'Network error. Could not reach the authentication server.' },
            { status: 503 }
        );
    }
}
