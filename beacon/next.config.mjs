/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep server-only deps (pg) out of the client bundle.
  serverExternalPackages: ["pg", "bcryptjs"],
};

export default nextConfig;
