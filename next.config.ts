import type { NextConfig } from 'next'


export default {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
} satisfies NextConfig
