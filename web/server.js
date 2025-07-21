// 향후 웹 인터페이스를 위한 Express 서버
// 현재는 기본 구조만 제공

const express = require("express");
const path = require("path");
const TradingBot = require("../src/TradingBot");
const BithumbAPI = require("../src/BithumbAPI");
const TradingEngine = require("../src/TradingEngine");
const DataManager = require("../src/DataManager");
const Logger = require("../src/Logger");

class WebInterface {
  constructor(config = {}) {
    this.app = express();
    this.port = config.port || 3000;
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, "public")));
  }

  setupRoutes() {
    // API 라우트
    this.app.get("/api/status", (req, res) => {
      res.json({ status: "running", timestamp: new Date().toISOString() });
    });

    this.app.get("/api/stats", (req, res) => {
      // 봇 통계 정보 반환
      res.json({ message: "Stats endpoint - to be implemented" });
    });

    this.app.get("/api/holdings", (req, res) => {
      // 보유 종목 정보 반환
      res.json({ message: "Holdings endpoint - to be implemented" });
    });

    // 메인 페이지
    this.app.get("/", (req, res) => {
      res.send(`
        <html>
          <head>
            <title>Bithumb Trading Bot</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 50px; }
              .container { max-width: 800px; margin: 0 auto; }
              .card { border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 5px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🚀 Bithumb Trading Bot</h1>
              <div class="card">
                <h3>📊 Dashboard</h3>
                <p>웹 인터페이스는 향후 구현 예정입니다.</p>
                <p>현재는 CLI 인터페이스를 사용해주세요: <code>node index.js</code></p>
              </div>
              <div class="card">
                <h3>🔬 Backtest</h3>
                <p>백테스트 실행: <code>node backtest/BacktestRunner.js --help</code></p>
              </div>
              <div class="card">
                <h3>📈 Features</h3>
                <ul>
                  <li>실시간 트레이딩</li>
                  <li>백테스트 지원</li>
                  <li>모듈화된 아키텍처</li>
                  <li>CLI 인터페이스</li>
                  <li>웹 인터페이스 (계획 중)</li>
                </ul>
              </div>
            </div>
          </body>
        </html>
      `);
    });
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(
        `🌐 웹 인터페이스가 http://localhost:${this.port} 에서 실행 중입니다`
      );
    });
  }
}

// CLI 실행
if (require.main === module) {
  const webInterface = new WebInterface();
  webInterface.start();
}

module.exports = WebInterface;
