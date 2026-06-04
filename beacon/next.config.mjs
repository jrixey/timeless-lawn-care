/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep server-only deps (pg, bcryptjs) out of the client bundle.
  serverExternalPackages: ["pg", "bcryptjs"],
  webpack: (config) => {
    // Allow NodeNext-style `.js` import specifiers to resolve to `.ts`/`.tsx`.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
