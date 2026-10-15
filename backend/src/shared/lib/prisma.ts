import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { PrismaClient } from '@prisma/client';

declare global {
    var prisma: PrismaClient | undefined;
}

export const prisma =
    global.prisma ||
    new PrismaClient({
        log: [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
        ],
    });

if (process.env.NODE_ENV !== 'production') {
    global.prisma = prisma;
}

// Log slow queries (>50ms) or all queries if DEBUG_PRISMA=true
// @ts-ignore - Prisma event typing
prisma.$on('query', (e: { query: string; duration: number }) => {
    if (e.duration > 50 || process.env.DEBUG_PRISMA === 'true') {
        console.log(`[Prisma Slow Query - ${e.duration}ms] ${e.query.slice(0, 150)}`);
    }
});