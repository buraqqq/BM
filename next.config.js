// next-auth/react, modül yüklenirken `parseUrl(process.env.NEXTAUTH_URL)`
// çağırır; NEXTAUTH_URL boş string ("") olduğunda parseUrl `new URL("")` atar
// (ERR_INVALID_URL) ve build sırasında TÜM statik sayfaların prerender'ı
// düşer. next.config.js, `next build` + `next start` sırasında app
// modüllerinden ÖNCE yüklendiği için burada boş değeri güvenli bir URL'e
// sabitliyoruz (Vercel'de VERCEL_PROJECT_PRODUCTION_URL otomatik gelir).
if (!process.env.NEXTAUTH_URL) {
  const host =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000";
  const withScheme = /^https?:\/\//i.test(host) ? host : `https://${host}`;
  process.env.NEXTAUTH_URL = withScheme.replace(/\/+$/, "");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
