import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/auth/refresh
 * Calls the backend refresh endpoint, which reads the refresh_token cookie,
 * validates it against the DB, rotates it, and returns new token values.
 * The Next.js handler sets them as HttpOnly cookies — identical to the login flow.
 */
export async function POST(request: NextRequest) {
    try {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001'

        // Forward cookies from the browser so the backend can read refresh_token
        const cookieHeader = request.headers.get('cookie') || ''
        const res = await fetch(`${backendUrl}/api/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookieHeader,
            },
        })

        const data = await res.json()

        const errorResponse = NextResponse.json(data, { status: res.status })

        if (!res.ok) {
            // If the backend rejects the refresh (e.g. expired or invalid), 
            // clear the HttpOnly cookies on the frontend ONLY if the token was actually invalid or expired.
            // Do NOT delete auth_token if no refresh token was provided (e.g. Guest Mode or stateless access).
            const isRevocationOrExpiry = data?.error === 'invalid_refresh_token' || data?.error === 'refresh_token_expired'
            if (isRevocationOrExpiry) {
                errorResponse.cookies.delete('auth_token')
                errorResponse.cookies.delete('refresh_token')
            }
            return errorResponse
        }

        // Strip token values from the browser-facing response body — they must
        // only live in HttpOnly cookies, never in client-accessible JSON.
        const { accessToken, refreshToken: refreshTokenValue, ...safeData } = data

        const response = NextResponse.json({ ...safeData, success: true })

        const cookieBase = {
            httpOnly: true,
            secure: process.env.COOKIE_SECURE === 'true',
            sameSite: 'lax' as const,
            path: '/',
        }

        // Set new access token cookie (1 hour)
        if (accessToken) {
            response.cookies.set('auth_token', accessToken, {
                ...cookieBase,
                maxAge: 60 * 60,
            })
        }

        // Set new refresh token cookie (7 days)
        if (refreshTokenValue) {
            response.cookies.set('refresh_token', refreshTokenValue, {
                ...cookieBase,
                maxAge: 7 * 24 * 60 * 60,
            })
        }

        return response
    } catch (error) {
        console.error('[/api/auth/refresh] Error:', error)
        return NextResponse.json(
            { success: false, message: 'Failed to refresh token' },
            { status: 500 }
        )
    }
}
