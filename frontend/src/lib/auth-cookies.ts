import { NextRequest, NextResponse } from 'next/server'

export interface AuthCookieBaseOptions {
  httpOnly: boolean
  secure: boolean
  sameSite: 'none' | 'lax'
  path: string
  partitioned?: boolean
}

/**
 * Returns cookie options tailored for both standalone browser tabs and cross-origin iframes
 * (e.g. embedding BITS inside web-portfolio at /quests/bits and /messenger).
 *
 * When served over HTTPS (production/Vercel), uses SameSite=None; Secure; Partitioned (CHIPS)
 * so modern browsers accept and send the auth cookies within cross-site iframes without
 * being blocked by third-party cookie restrictions.
 * When served over local HTTP (development), falls back to SameSite=Lax; Secure=false.
 */
export function getAuthCookieBase(request?: NextRequest): AuthCookieBaseOptions {
  const isHttps =
    process.env.COOKIE_SECURE === 'true' ||
    process.env.VERCEL === '1' ||
    process.env.NODE_ENV === 'production' ||
    request?.nextUrl?.protocol === 'https:' ||
    request?.headers.get('x-forwarded-proto') === 'https'

  if (isHttps) {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      partitioned: true,
    }
  }

  return {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
  }
}

/**
 * Clears auth cookies ensuring path and security flags match the set configuration.
 */
export function clearAuthCookies(response: NextResponse, request?: NextRequest) {
  const cookieBase = getAuthCookieBase(request)

  response.cookies.set('auth_token', '', {
    ...(cookieBase as any),
    maxAge: 0,
    expires: new Date(0),
  })

  response.cookies.set('refresh_token', '', {
    ...(cookieBase as any),
    maxAge: 0,
    expires: new Date(0),
  })
}
