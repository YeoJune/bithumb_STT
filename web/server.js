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
    this.createPublicFiles();
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

    // 메인 페이지
    this.app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "public", "index.html"));
    });
  }

  // 퍼블릭 파일들 생성
  createPublicFiles() {
    const publicDir = path.join(__dirname, "public");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // HTML 파일 생성
    this.createIndexHTML();
    this.createStyleCSS();
    this.createAppJS();
  }

  createIndexHTML() {
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bithumb Trading Bot Dashboard</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>🚀 Bithumb Trading Bot Dashboard</h1>
            <div class="status-indicator">
                <span id="status-text">연결 중...</span>
                <div id="status-dot" class="status-dot"></div>
            </div>
        </header>

        <div class="dashboard-grid">
            <!-- 주요 지표 -->
            <div class="card stats-card">
                <h3>📊 주요 지표</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">런타임</span>
                        <span id="runtime" class="stat-value">0분</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">보유 종목</span>
                        <span id="holdings-count" class="stat-value">0개</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">총 거래</span>
                        <span id="total-trades" class="stat-value">0회</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">승률</span>
                        <span id="win-rate" class="stat-value">0%</span>
                    </div>
                </div>
            </div>

            <!-- 수익/손실 -->
            <div class="card profit-card">
                <h3>💰 수익/손실</h3>
                <div id="total-profit" class="profit-amount">+0원</div>
                <div class="profit-breakdown">
                    <span>성공: <span id="wins" class="win-count">0</span>회</span>
                    <span>실패: <span id="losses" class="loss-count">0</span>회</span>
                </div>
            </div>

            <!-- 현재 상태 -->
            <div class="card status-card">
                <h3>🔍 현재 상태</h3>
                <div class="status-info">
                    <p><strong>스캔:</strong> <span id="current-scan">대기 중...</span></p>
                    <p><strong>마지막 활동:</strong> <span id="last-activity">없음</span></p>
                </div>
            </div>

            <!-- 설정 정보 -->
            <div class="card config-card">
                <h3>⚙️ 설정</h3>
                <div id="config-info" class="config-info">
                    <p>매수 금액: <span id="buy-amount">0원</span></p>
                    <p>손절률: <span id="loss-ratio">0%</span></p>
                    <p>이동평균: <span id="ma-settings">5분/15분</span></p>
                </div>
            </div>

            <!-- 보유 종목 -->
            <div class="card holdings-card">
                <h3>📦 보유 종목</h3>
                <div id="holdings-list" class="holdings-list">
                    <p class="no-holdings">보유 종목이 없습니다.</p>
                </div>
            </div>

            <!-- 최근 로그 -->
            <div class="card logs-card">
                <h3>📋 최근 로그</h3>
                <div id="logs-container" class="logs-container">
                    <p class="no-logs">로그를 불러오는 중...</p>
                </div>
            </div>
        </div>

        <footer>
            <p>마지막 업데이트: <span id="last-update">-</span></p>
            <button id="refresh-btn" class="refresh-btn">🔄 새로고침</button>
        </footer>
    </div>

    <script src="app.js"></script>
</body>
</html>`;

    fs.writeFileSync(path.join(__dirname, "public", "index.html"), html);
  }

  createStyleCSS() {
    const css = `/* Bithumb Trading Bot Dashboard Styles */

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    color: #333;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

header {
    text-align: center;
    margin-bottom: 30px;
    color: white;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
}

header h1 {
    font-size: 2.5rem;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
}

.status-indicator {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255,255,255,0.1);
    padding: 10px 20px;
    border-radius: 25px;
    backdrop-filter: blur(10px);
}

.status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ff4444;
    animation: pulse 2s infinite;
}

.status-dot.connected {
    background: #44ff44;
}

.status-dot.standalone {
    background: #ffaa44;
}

@keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
}

.dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.card {
    background: white;
    border-radius: 15px;
    padding: 25px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.card:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 40px rgba(0,0,0,0.15);
}

.card h3 {
    margin-bottom: 20px;
    color: #5a67d8;
    font-size: 1.3rem;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 10px;
}

.stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
}

.stat-item {
    text-align: center;
    padding: 15px;
    background: #f7fafc;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
}

.stat-label {
    display: block;
    font-size: 0.9rem;
    color: #718096;
    margin-bottom: 5px;
}

.stat-value {
    display: block;
    font-size: 1.5rem;
    font-weight: bold;
    color: #2d3748;
}

.profit-card {
    text-align: center;
}

.profit-amount {
    font-size: 2.5rem;
    font-weight: bold;
    margin: 20px 0;
    color: #48bb78;
}

.profit-amount.negative {
    color: #f56565;
}

.profit-breakdown {
    display: flex;
    justify-content: space-around;
    margin-top: 15px;
}

.win-count {
    color: #48bb78;
    font-weight: bold;
}

.loss-count {
    color: #f56565;
    font-weight: bold;
}

.status-info p {
    margin-bottom: 10px;
    padding: 10px;
    background: #f7fafc;
    border-radius: 8px;
    border-left: 4px solid #5a67d8;
}

.config-info p {
    margin-bottom: 8px;
    padding: 8px 12px;
    background: #edf2f7;
    border-radius: 6px;
}

.holdings-list {
    max-height: 200px;
    overflow-y: auto;
}

.holding-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px;
    margin-bottom: 8px;
    background: #f7fafc;
    border-radius: 8px;
    border-left: 4px solid #38b2ac;
}

.holding-market {
    font-weight: bold;
    color: #2d3748;
}

.holding-info {
    text-align: right;
    font-size: 0.9rem;
    color: #718096;
}

.logs-container {
    max-height: 300px;
    overflow-y: auto;
    background: #1a202c;
    border-radius: 8px;
    padding: 15px;
}

.log-entry {
    display: flex;
    gap: 10px;
    margin-bottom: 8px;
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
    line-height: 1.4;
}

.log-timestamp {
    color: #a0aec0;
    white-space: nowrap;
}

.log-level {
    font-weight: bold;
    min-width: 50px;
}

.log-level.info {
    color: #63b3ed;
}

.log-level.warn {
    color: #f6e05e;
}

.log-level.error {
    color: #fc8181;
}

.log-level.debug {
    color: #a0aec0;
}

.log-message {
    color: #e2e8f0;
    flex: 1;
}

.no-holdings, .no-logs {
    text-align: center;
    color: #a0aec0;
    font-style: italic;
    padding: 20px;
}

footer {
    text-align: center;
    color: white;
    margin-top: 30px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 20px;
}

.refresh-btn {
    background: linear-gradient(45deg, #667eea, #764ba2);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 25px;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
}

.refresh-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.3);
}

.refresh-btn:active {
    transform: translateY(0);
}

/* 반응형 디자인 */
@media (max-width: 768px) {
    .container {
        padding: 10px;
    }
    
    header {
        flex-direction: column;
        gap: 20px;
    }
    
    header h1 {
        font-size: 2rem;
    }
    
    .dashboard-grid {
        grid-template-columns: 1fr;
    }
    
    .stats-grid {
        grid-template-columns: 1fr;
    }
    
    footer {
        flex-direction: column;
    }
}

/* 스크롤바 스타일링 */
::-webkit-scrollbar {
    width: 8px;
}

::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
}

::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
}`;

    fs.writeFileSync(path.join(__dirname, "public", "style.css"), css);
  }

  createAppJS() {
    const js = `// Bithumb Trading Bot Dashboard JavaScript

class Dashboard {
    constructor() {
        this.isConnected = false;
        this.updateInterval = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startAutoUpdate();
        this.updateStatus();
    }

    setupEventListeners() {
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.updateAll();
        });

        // 페이지 가시성 변경 시 업데이트 주기 조정
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopAutoUpdate();
            } else {
                this.startAutoUpdate();
                this.updateAll();
            }
        });
    }

    startAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.updateInterval = setInterval(() => {
            this.updateAll();
        }, 2000); // 2초마다 업데이트
    }

    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    async updateAll() {
        try {
            await Promise.all([
                this.updateStatus(),
                this.updateStats(),
                this.updateHoldings(),
                this.updateLogs(),
                this.updateConfig()
            ]);
            this.updateLastUpdateTime();
        } catch (error) {
            console.error('업데이트 실패:', error);
        }
    }

    async updateStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            const statusText = document.getElementById('status-text');
            const statusDot = document.getElementById('status-dot');
            
            if (data.status === 'connected') {
                statusText.textContent = '봇 연결됨';
                statusDot.className = 'status-dot connected';
                this.isConnected = true;
            } else if (data.status === 'standalone') {
                statusText.textContent = '독립 실행';
                statusDot.className = 'status-dot standalone';
                this.isConnected = false;
            } else {
                statusText.textContent = '연결 안됨';
                statusDot.className = 'status-dot';
                this.isConnected = false;
            }
        } catch (error) {
            console.error('상태 업데이트 실패:', error);
            document.getElementById('status-text').textContent = '오류';
            document.getElementById('status-dot').className = 'status-dot';
            this.isConnected = false;
        }
    }

    async updateStats() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            
            document.getElementById('runtime').textContent = data.runtime + '분';
            document.getElementById('holdings-count').textContent = Object.keys(data.holdings || {}).length + '개';
            document.getElementById('total-trades').textContent = data.trades + '회';
            document.getElementById('win-rate').textContent = data.winRate + '%';
            
            const profitElement = document.getElementById('total-profit');
            const profit = data.totalProfit || 0;
            const profitText = (profit >= 0 ? '+' : '') + profit.toLocaleString() + '원';
            profitElement.textContent = profitText;
            profitElement.className = 'profit-amount ' + (profit >= 0 ? '' : 'negative');
            
            document.getElementById('wins').textContent = data.wins || 0;
            document.getElementById('losses').textContent = data.losses || 0;
            
            document.getElementById('current-scan').textContent = data.currentScan || '알 수 없음';
            document.getElementById('last-activity').textContent = data.lastActivity || '없음';
            
        } catch (error) {
            console.error('통계 업데이트 실패:', error);
        }
    }

    async updateHoldings() {
        try {
            const response = await fetch('/api/holdings');
            const data = await response.json();
            
            const holdingsList = document.getElementById('holdings-list');
            const holdings = data.holdings || {};
            
            if (Object.keys(holdings).length === 0) {
                holdingsList.innerHTML = '<p class="no-holdings">보유 종목이 없습니다.</p>';
                return;
            }
            
            let html = '';
            Object.entries(holdings).forEach(([market, holding]) => {
                const status = holding.recovered ? \`\${holding.state} (복구됨)\` : holding.state;
                const qtyInfo = holding.totalQty 
                    ? \`총 \${holding.totalQty}개\`
                    : \`\${holding.qty || 0}개\`;
                
                html += \`
                    <div class="holding-item">
                        <div class="holding-market">\${market}</div>
                        <div class="holding-info">
                            <div>\${qtyInfo}</div>
                            <div>\${status}</div>
                        </div>
                    </div>
                \`;
            });
            
            holdingsList.innerHTML = html;
        } catch (error) {
            console.error('보유 종목 업데이트 실패:', error);
        }
    }

    async updateLogs() {
        try {
            const response = await fetch('/api/logs');
            const data = await response.json();
            
            const logsContainer = document.getElementById('logs-container');
            const logs = data.logs || [];
            
            if (logs.length === 0) {
                logsContainer.innerHTML = '<p class="no-logs">로그가 없습니다.</p>';
                return;
            }
            
            let html = '';
            logs.reverse().slice(0, 20).forEach(log => {
                const timestamp = new Date(log.timestamp).toLocaleTimeString('ko-KR');
                html += \`
                    <div class="log-entry">
                        <span class="log-timestamp">\${timestamp}</span>
                        <span class="log-level \${log.level}">\${log.level.toUpperCase()}</span>
                        <span class="log-message">\${log.message}</span>
                    </div>
                \`;
            });
            
            logsContainer.innerHTML = html;
            
            // 스크롤을 맨 위로 (최신 로그가 위에 오도록)
            logsContainer.scrollTop = 0;
        } catch (error) {
            console.error('로그 업데이트 실패:', error);
        }
    }

    async updateConfig() {
        try {
            const response = await fetch('/api/config');
            const data = await response.json();
            
            if (data.error) {
                document.getElementById('buy-amount').textContent = '연결 안됨';
                document.getElementById('loss-ratio').textContent = '연결 안됨';
                document.getElementById('ma-settings').textContent = '연결 안됨';
                return;
            }
            
            document.getElementById('buy-amount').textContent = (data.buyAmount || 0).toLocaleString() + '원';
            document.getElementById('loss-ratio').textContent = ((data.lossRatio || 0) * 100).toFixed(1) + '%';
            
            const ma = data.movingAverages || { short: 5, long: 15 };
            document.getElementById('ma-settings').textContent = \`\${ma.short}분/\${ma.long}분\`;
            
        } catch (error) {
            console.error('설정 업데이트 실패:', error);
        }
    }

    updateLastUpdateTime() {
        const now = new Date();
        document.getElementById('last-update').textContent = now.toLocaleTimeString('ko-KR');
    }

    formatNumber(num) {
        return num.toLocaleString();
    }

    formatCurrency(amount) {
        const prefix = amount >= 0 ? '+' : '';
        return prefix + amount.toLocaleString() + '원';
    }
}

// 페이지 로드 시 대시보드 초기화
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});`;

    fs.writeFileSync(path.join(__dirname, "public", "app.js"), js);
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
