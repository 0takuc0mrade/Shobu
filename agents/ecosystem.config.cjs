module.exports = {
  apps: [
    {
      name: "shobu-orchestrator",
      script: "npm",
      args: "run start:orchestrator", 
      watch: false,
      max_memory_restart: "250M",
      env: {
        NODE_ENV: "production",
      },
      exp_backoff_restart_delay: 5000,
      max_restarts: 5,
      min_uptime: "10s",
    },
    {
      name: "shobu-pool-creator",
      script: "npm",
      args: "run start:pool-creator",
      watch: false,
      max_memory_restart: "250M",
      env: {
        NODE_ENV: "production",
      },
      exp_backoff_restart_delay: 5000,
      max_restarts: 5,
      min_uptime: "10s",
    },
    {
      name: "shobu-settler",
      script: "npm",
      args: "run start:settler",
      watch: false,
      max_memory_restart: "250M",
      env: {
        NODE_ENV: "production",
      },
      exp_backoff_restart_delay: 5000,
      max_restarts: 5,
      min_uptime: "10s",
    },
    {
      name: "shobu-analyst",
      script: "npm",
      args: "run start:analyst",
      watch: false,
      max_memory_restart: "250M",
      env: {
        NODE_ENV: "production",
      },
      exp_backoff_restart_delay: 5000,
      max_restarts: 5,
      min_uptime: "10s",
    }
  ]
};
