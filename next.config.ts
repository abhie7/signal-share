import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Custom server handles all requests — disable Next.js built-in server features
  // that conflict with our Fastify setup
};

export default nextConfig;
