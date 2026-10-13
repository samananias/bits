import { NextRequest, NextResponse } from 'next/server';

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

        const cookieBase = {
            httpOnly: true,
            secure: process.env.COOKIE_SECURE === 'true',
            sameSite: 'lax' as const,
            path: '/',
        };

        // 45-minute ephemeral guest access token
        response.cookies.set('auth_token', accessToken, {
            ...cookieBase,
            maxAge: 45 * 60,
        });

        // Ensure no leftover refresh token from previous accounts remains
        response.cookies.delete('refresh_token');

        return response;
    } catch {
        return NextResponse.json(
            { message: 'Network error. Could not reach the authentication server.' },
            { status: 503 }
        );
    }
}
