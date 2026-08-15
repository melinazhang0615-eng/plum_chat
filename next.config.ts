import type { NextConfig } from "next";

const apiOrigin = process.env.PLUM_API_ORIGIN ?? "http://127.0.0.1:8180";

/**
 * Response headers that are safe to set without knowing anything about the page.
 *
 * A Content-Security-Policy is deliberately *not* here: Next injects inline bootstrap scripts, so
 * a useful CSP needs a per-request nonce threaded through middleware, and a wrong one blanks the
 * app. That is its own change (P1), not a line in this list.
 */
const securityHeaders = [
  // Stop the browser from re-guessing a response's type. Uploaded portraits are served through the
  // API, and a sniffed image/* that is really text/html is the classic stored-XSS route.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Full URLs leak: /chat/<characterId> and ?work_id=<draft> end up in third-party referer logs.
  // Same-origin keeps the path internal and sends only the origin to anyone else.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing in Plum asks for these, so pre-emptively deny them; an injected iframe cannot either.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/products/plum/:path*",
        destination: `${apiOrigin}/api/v1/products/plum/:path*`,
      },
      {
        source: "/auth/google/callback",
        destination: `${apiOrigin}/api/v1/products/plum/auth/oauth/google/callback`,
      },
    ];
  },
};

export default nextConfig;
