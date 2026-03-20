module.exports = {
  apps: [
    {
      name: "shobu-pool-creator",
      script: "npm",
      args: "run pool-creator",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        FORCE_TUNNEL: "true",
      },
    },
    {
      name: "shobu-settler",
      script: "npm",
      args: "run settler",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        FORCE_TUNNEL: "true",
      },
    },
    {
      name: "shobu-analyst",
      script: "npm",
      args: "run analyst",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        FORCE_TUNNEL: "true",
      },
    },
    {
      name: "shobu-orchestrator",
      script: "npm",
      args: "run orchestrator",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        FORCE_TUNNEL: "true",
      },
    }
  ]
};
