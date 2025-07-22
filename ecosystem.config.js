module.exports = {
  apps: [
    {
      name: "bithumb-trading-bot",
      script: "index.js",
      cwd: "./",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production",
      },
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_file: "./logs/pm2-combined.log",
      time: true,
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // 종료 처리
      kill_timeout: 5000,
      listen_timeout: 3000,

      // 재시작 설정
      max_restarts: 10,
      min_uptime: "10s",

      // 로그 로테이션
      max_size: "10M",
      retain: 5,

      // 모니터링
      monitoring: false,

      // 클러스터 설정 (이 봇은 단일 인스턴스로 실행)
      exec_mode: "fork",
    },
  ],

  deploy: {
    production: {
      user: "node",
      host: "localhost",
      ref: "origin/main",
      repo: "git@github.com:YeoJune/bithumb_STT.git",
      path: "/var/www/production",
      "post-deploy":
        "npm install && pm2 reload ecosystem.config.js --env production",
    },
  },
};
