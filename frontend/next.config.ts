import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      // Allow images from the local dev backend
      { protocol: "http", hostname: "localhost", port: "8000" },
      // Allow images from Railway production backend
      { protocol: "https", hostname: "*.railway.app" },
      // Allow images from Supabase Storage (generated + uploaded images)
      { protocol: "https", hostname: "*.supabase.co" },
      // Allow images from any custom domain (set via env var)
      ...(process.env.NEXT_PUBLIC_API_URL
        ? (() => {
            try {
              const u = new URL(process.env.NEXT_PUBLIC_API_URL);
              return [{ protocol: u.protocol.replace(":", "") as "https" | "http", hostname: u.hostname }];
            } catch {
              return [];
            }
          })()
        : []),
    ],
  },
};

export default nextConfig;
