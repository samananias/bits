import { NextRequest, NextResponse } from 'next/server';
import { getAuthCookieBase } from '@/lib/auth-cookies';

export async function POST(request: NextRequest) {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';

    try {
        const body = await request.json().catch(() => ({}));
        const cookieHeader = request.headers.get('cookie') || '';

        const res = await fetch(`${backendUrl}/api/auth/guest-view`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookieHeader,
            },
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

        if (accessToken) {
            response.cookies.set('auth_token', accessToken, {
                ...(cookieBase as any),
                maxAge: 45 * 60,
            });
        }

        return response;
    } catch {
        return NextResponse.json(
            { message: 'Network error. Could not switch guest role view.' },
            { status: 503 }
        );
    }
}
