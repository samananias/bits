import { Request, Response, NextFunction } from 'express';

/**
 * Mask an email address to protect privacy in Guest/Demo Mode.
 * e.g., "maria.santos@avegabros.com" -> "m***s@avegabros.com"
 */
export function maskEmail(email: unknown): unknown {
    if (typeof email !== 'string' || !email.includes('@')) return email;
    const [local, domain] = email.split('@');
    if (!local || !domain) return '***@demo.local';
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Mask a phone / contact number to protect privacy in Guest/Demo Mode.
 * e.g., "09171234567" -> "***-***-4567"
 */
export function maskPhone(phone: unknown): unknown {
    if (typeof phone !== 'string') return phone;
    const trimmed = phone.trim();
    if (trimmed.length <= 4) return '****';
    const last4 = trimmed.slice(-4);
    return `***-***-${last4}`;
}

/**
 * Recursively mask sensitive fields (email, contactNumber) in an object or array.
 */
function maskSensitiveData<T>(data: T): T {
    if (!data || typeof data !== 'object') {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(item => maskSensitiveData(item)) as unknown as T;
    }

    const maskedObj: Record<string, unknown> = { ...(data as unknown as Record<string, unknown>) };

    for (const [key, value] of Object.entries(maskedObj)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'email' && typeof value === 'string') {
            maskedObj[key] = maskEmail(value);
        } else if ((lowerKey === 'contactnumber' || lowerKey === 'contact_number' || lowerKey === 'phone') && typeof value === 'string') {
            maskedObj[key] = maskPhone(value);
        } else if (value && typeof value === 'object') {
            maskedObj[key] = maskSensitiveData(value);
        }
    }

    return maskedObj as T;
}

/**
 * Global Guest Guard Middleware:
 * 1. Blocks all non-safe HTTP methods (POST, PUT, PATCH, DELETE) for guest sessions.
 *    Except allows guest-specific lifecycle routes (/api/auth/guest-view, /api/auth/logout).
 * 2. Automatically masks phone numbers and emails on all outgoing JSON responses
 *    when the request originated from a Guest Mode session.
 */
export const guestGuard = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user?.isGuest) {
        return next();
    }

    const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
    const isGuestAllowedAction =
        req.path === '/guest-view' ||
        req.path === '/api/auth/guest-view' ||
        req.originalUrl?.includes('/api/auth/guest-view') ||
        req.path === '/logout' ||
        req.path === '/api/auth/logout' ||
        req.originalUrl?.includes('/api/auth/logout');

    // 1. Enforce strict read-only mode on mutations
    if (!SAFE_METHODS.includes(req.method) && !isGuestAllowedAction) {
        res.status(403).json({
            success: false,
            message: 'Guest Mode is strictly read-only. Creating, editing, and deleting records are disabled in demo mode.',
            error: 'guest_read_only'
        });
        return;
    }

    // 2. Wrap res.json to mask sensitive PII (emails and phone numbers) in outgoing responses
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
        try {
            const maskedBody = maskSensitiveData(body);
            return originalJson(maskedBody);
        } catch {
            return originalJson(body);
        }
    };

    next();
};
