import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";

const nextConfig: NextConfig = {
  output: "standalone",
  // iconsax-react ships individual ESM files that must be transpiled
  // for the Next.js standalone production build to bundle them correctly.
  // Without this, icons render as blank grey squares in the built app.
  transpilePackages: ["iconsax-react"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        // Proxy all /api/v1/* requests to the NestJS backend.
        // This means the browser only needs to know the Next.js origin;
        // CORS is handled server-side and NEXT_PUBLIC_API_URL can be omitted.
        source: "/api/v1/:path*",
        destination: `${BACKEND_URL}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
