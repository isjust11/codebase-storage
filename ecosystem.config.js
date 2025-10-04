module.exports = {
  apps: [
    {
      name: 'codebase-storage',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      // Auto restart settings
      max_restarts: 10,
      min_uptime: '10s',
      
      // Log settings
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Memory settings
      max_memory_restart: '1G',
      
      // Advanced settings
      watch: false, // Set to true for development
      ignore_watch: ['node_modules', 'logs'],
      
      // Health check
      health_check_grace_period: 3000,
    }
  ]
};
