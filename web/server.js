/**
 * 웹 인터페이스 서버
 * Express 기반 실시간 대시보드
 */

const express = require("express");
const path = require("path");
const fs = require("fs");

class WebInterface {
  constructor(tradingBot = null, config = {}) {
    this.app = express();
    this.port = config.port || 3000;
    this.tradingBot = tradingBot;
    this.isStandalone = !tradingBot; // 독립 실행 모드 여부

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, "public")));

    // CORS 설정
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
      );
      next();
    });
  }

  setupRoutes() {
    // API 라우트
    this.app.get("/api/status", (req, res) => {
      res.json({
        status: this.tradingBot ? "connected" : "standalone",
        timestamp: new Date().toISOString(),
        server: "running",
      });
    });

    this.app.get("/api/stats", (req, res) => {
      if (!this.tradingBot) {
        return res.json({
          error: "Bot not connected",
          runtime: 0,
          trades: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          totalProfit: 0,
          holdings: {},
          currentScan: "Disconnected",
          lastActivity: "Bot not running",
        });
      }

      try {
        const stats = this.tradingBot.getStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/holdings", (req, res) => {
      if (!this.tradingBot) {
        return res.json({ holdings: {} });
      }

      try {
        const stats = this.tradingBot.getStats();
        res.json({ holdings: stats.holdings });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/logs", (req, res) => {
      try {
        // 로그 파일에서 최근 로그 읽기
        const logFiles = fs
          .readdirSync(path.join(process.cwd(), "logs"))
          .filter((f) => f.endsWith(".log"));
        if (logFiles.length === 0) {
          return res.json({ logs: [] });
        }

        const latestLogFile = logFiles.sort().pop();
        const logPath = path.join(process.cwd(), "logs", latestLogFile);
        const logContent = fs.readFileSync(logPath, "utf8");
        const logs = logContent
          .split("\n")
          .filter((line) => line.trim())
          .slice(-50) // 최근 50개
          .map((line) => {
            const match = line.match(
              /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+\d{2}:\d{2}) \[(\w+)\] (.+)$/
            );
            if (match) {
              return {
                timestamp: match[1],
                level: match[2].toLowerCase(),
                message: match[3],
              };
            }
            return {
              timestamp: new Date().toISOString(),
              level: "info",
              message: line,
            };
          });

        res.json({ logs });
      } catch (error) {
        res.json({ logs: [], error: error.message });
      }
    });

    this.app.get("/api/config", (req, res) => {
      if (!this.tradingBot) {
        return res.json({ error: "Bot not connected" });
      }

      try {
        res.json({
          buyAmount: this.tradingBot.buyAmount,
          profitRatio: this.tradingBot.profitRatio,
          lossRatio: this.tradingBot.lossRatio,
          movingAverages: this.tradingBot.movingAverages || {
            short: 5,
            long: 15,
          },
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/watchlist", (req, res) => {
      if (!this.tradingBot) {
        return res.json({ watchList: [] });
      }

      try {
        const watchListArray = this.tradingBot.watchList
          ? Array.from(this.tradingBot.watchList.entries()).map(
              ([market, ratios]) => ({
                market,
                shortRatio: ratios.shortRatio,
                longRatio: ratios.longRatio,
              })
            )
          : [];
        res.json({
          watchList: watchListArray,
          count: watchListArray.length,
          lastUpdate: new Date().toISOString(),
        });
      } catch (error) {
        res.status(500).json({ error: error.message, watchList: [] });
      }
    });

    // 메인 페이지
    this.app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "public", "index.html"));
    });
  }

  // 트레이딩 봇 연결
  connectBot(tradingBot) {
    this.tradingBot = tradingBot;
    this.isStandalone = false;
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(
        `🌐 웹 대시보드가 http://localhost:${this.port} 에서 실행 중입니다`
      );
    });
  }
}

// CLI 실행 (독립 모드)
if (require.main === module) {
  const webInterface = new WebInterface();
  webInterface.start();
}

module.exports = WebInterface;
