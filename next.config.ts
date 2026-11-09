import type { NextConfig } from "next";

const nextConfig = {
  serverExternalPackages: ["@prisma/client", "@react-pdf/renderer", "jimp", "exceljs", "nodemailer", "web-push"],
  outputFileTracingExcludes: {
    "*": [
      "./data/**",
      "./data/files/**",
      "/srv/samba/**",
      "/srv/samba/share/**",
      "./.wave-a/**",
      "./.next.bak/**",
      "./.next.prev/**",
    ],
  },
  experimental: {
    proxyClientMaxBodySize: "5gb",
    serverActions: { bodySizeLimit: "5gb" },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Общие заголовки без CSP — для всех путей, включая /api/chat/blobs/*.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self), geolocation=()" },
        ],
      },
      {
        // P0 XSS hotfix: глобальный CSP из headers() перетирает CSP роута, поэтому
        // /api/chat/blobs/* исключён — CSP (sandbox) ставит сам роут.
        source: "/:path((?!api/chat/blobs/).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "media-src 'self' blob:",
              "font-src 'self'",
              "connect-src 'self' https://*.push.apple.com https://fcm.googleapis.com https://updates.push.services.mozilla.com stun:stun.l.google.com:19302",
              "worker-src 'self' blob:",
              "frame-src 'self'",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig as NextConfig;
