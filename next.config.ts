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
  async rewrites() {
    return {
      // beforeFiles: `next start` maps public/ to routes at BUILD time, so files
      // saveUpload()/putObject() write at RUNTIME (uploads, generated PDFs, AI
      // images) are invisible to that manifest and 404 even though they exist on
      // disk — confirmed via a live write+readback+HTTP-404 round trip. Must run
      // BEFORE the filesystem check (afterFiles only fires once that check has
      // already failed-and-cached a 404). See api/files/[...path]/route.ts.
      beforeFiles: [
        { source: "/uploads/:path*", destination: "/api/files/uploads/:path*" },
        { source: "/pdfs/:path*", destination: "/api/files/pdfs/:path*" },
      ],
    };
  },
};

export default nextConfig;
