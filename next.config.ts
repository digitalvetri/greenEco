import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Middleware buffers request bodies; the default cap (10MB) would truncate an
     * upload before our own MAX_UPLOAD_MB check could return a clean 413.
     * Keep this comfortably above MAX_UPLOAD_MB so the app-level limit is authoritative.
     */
    proxyClientMaxBodySize: "32mb",
  },
};

export default nextConfig;
