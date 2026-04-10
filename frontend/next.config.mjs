/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Keep these packages as external on the server so Turbopack doesn't
  // try to bundle Node.js built-ins (stream, http, etc.) that they need.
  serverExternalPackages: [
    '@openserv-labs/client',
    'axios',
    'pinata',
    'starkzap',
    'ethers',
  ],
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });
    if (!isServer) {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            net: false,
            tls: false,
            crypto: false,
            os: false,
            path: false,
            stream: false,
        };
    }
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
  turbopack: {
    resolveAlias: {
        // Only alias packages that are safe to stub everywhere (logging/optional)
        "pino-pretty": "./empty.js",
        "lokijs": "./empty.js",
        "encoding": "./empty.js",
    }
  },
}

export default nextConfig
