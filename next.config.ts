import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  env: {
    // Baked into the app at build time so an open app can tell a newer build is live (spec 3.6).
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? `local-${Date.now()}`,
  },
  async headers() {
    return [
      { source: "/download/office-hub.apk", headers: [{ key: "Content-Type", value: "application/vnd.android.package-archive" }, { key: "Content-Disposition", value: "attachment; filename=office-hub.apk" }, { key: "Cache-Control", value: "no-cache" }] },
      { source: "/.well-known/assetlinks.json", headers: [{ key: "Content-Type", value: "application/json" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default withNextIntl(nextConfig);
