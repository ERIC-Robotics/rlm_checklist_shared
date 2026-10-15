/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: ["192.168.156.45"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
