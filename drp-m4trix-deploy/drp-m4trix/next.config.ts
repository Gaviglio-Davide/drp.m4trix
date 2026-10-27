import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Su Vercel lasciamo il build standard; standalone serve solo in locale
  output: process.env.VERCEL ? undefined : "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
