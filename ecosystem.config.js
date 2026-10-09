module.exports = {
  apps: [
    {
      name: 'ac-api',
      script: './api/start.js',

      // Auto-restart configuration
      autorestart: true, // Auto restart if process crashes
      max_restarts: 10, // Max restarts in 1 minute before giving up
      min_uptime: '10s', // Min uptime before considering app stable

      // Exponential backoff restart delay to prevent rapid restarts
      exp_backoff_restart_delay: 100, // Start with 100ms delay, increases exponentially

      // Memory management
      max_memory_restart: '500M', // Restart if memory usage exceeds 500MB

      // Environment
      env: {
        NODE_ENV: 'production',
        API_PORT: process.env.API_PORT || 4321,
        API_HOST: process.env.API_HOST || '127.0.0.1',
      },

      // Logging disabled by default in production
      // Uncomment and create ./logs directory if you need logging:
      // log_file: './logs/api-combined.log',
      // out_file: './logs/api-out.log',
      // error_file: './logs/api-error.log',
      // log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Process management
      instances: 1, // Single instance for simplicity
      exec_mode: 'fork', // Fork mode (vs cluster)

      // Health monitoring
      health_check_grace_period: 3000, // Grace period for health checks

      // Optional: Restart daily at 3 AM to clear any potential memory leaks
      // cron_restart: '0 3 * * *',

      // Don't restart on clean exit (exit code 0)
      stop_exit_codes: [0],

      // Kill timeout
      kill_timeout: 5000,
    },
  ],
};
