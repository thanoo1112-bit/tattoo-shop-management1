import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "sftkthsgldvyorydznyz.supabase.co",
        pathname: "/storage/v1/object/public/profile-avatars/**",
      },
    ],
  },
};

export default nextConfig;
