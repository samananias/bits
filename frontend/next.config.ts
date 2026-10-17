import type { NextConfig } from "next";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from project root .env
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

// BACKEND_URL:
//   LOCAL  → set in root-level .env  (e.g. http://localhost:3001)
//   DOCKER → set in docker-compose.yml (e.g. http://backend:3001)
const rawBackendUrl = process.env.BACKEND_URL || "http://localhost:3001";
const backendUrl = rawBackendUrl.replace(/\/api\/?$/, "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    // Force Turbopack to use the frontend folder as the project root.
    // Otherwise it climbs up to the .git folder in the parent directory
    // and fails to resolve tailwindcss.
    root: process.cwd(),
  },
  webpack: (config) => {
    const isPolling = process.env.WATCHPACK_POLLING === 'true' || process.env.CHOKIDAR_USEPOLLING === 'true';
    config.watchOptions = {
      ignored: ['**/node_modules/**', '**/.next/**'],
      ...(isPolling ? { poll: 1000, aggregateTimeout: 300 } : {}),
    };
    return config;
  },
  async rewrites() {
    return [
      {
        // Forward all /api/* requests to the backend,
        // EXCEPT routes handled by Next.js server-side route handlers.
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
        missing: [
          {
            type: 'header',
            key: 'x-nextjs-route-handler',
          },
        ],
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://portfolio-ibem.vercel.app https://*.vercel.app http://localhost:* http://127.0.0.1:*",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
