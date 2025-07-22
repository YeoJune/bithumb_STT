// Bithumb Trading Bot Dashboard JavaScript

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
    document.getElementById("refresh-btn").addEventListener("click", () => {
      this.updateAll();
    });

    // 페이지 가시성 변경 시 업데이트 주기 조정
    document.addEventListener("visibilitychange", () => {
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
        this.updateWatchList(),
        this.updateLogs(),
        this.updateConfig(),
      ]);
      this.updateLastUpdateTime();
    } catch (error) {
      console.error("업데이트 실패:", error);
    }
  }

  async updateStatus() {
    try {
      const response = await fetch("/api/status");
      const data = await response.json();

      const statusText = document.getElementById("status-text");
      const statusDot = document.getElementById("status-dot");

      if (data.status === "connected") {
        statusText.textContent = "봇 연결됨";
        statusDot.className = "status-dot connected";
        this.isConnected = true;
      } else if (data.status === "standalone") {
        statusText.textContent = "독립 실행";
        statusDot.className = "status-dot standalone";
        this.isConnected = false;
      } else {
        statusText.textContent = "연결 안됨";
        statusDot.className = "status-dot";
        this.isConnected = false;
      }
    } catch (error) {
      console.error("상태 업데이트 실패:", error);
      document.getElementById("status-text").textContent = "오류";
      document.getElementById("status-dot").className = "status-dot";
      this.isConnected = false;
    }
  }

  async updateStats() {
    try {
      const response = await fetch("/api/stats");
      const data = await response.json();

      document.getElementById("runtime").textContent = data.runtime + "분";
      document.getElementById("holdings-count").textContent =
        Object.keys(data.holdings || {}).length + "개";
      document.getElementById("total-trades").textContent = data.trades + "회";
      document.getElementById("win-rate").textContent = data.winRate + "%";

      const profitElement = document.getElementById("total-profit");
      const profit = data.totalProfit || 0;
      const profitText =
        (profit >= 0 ? "+" : "") + profit.toLocaleString() + "원";
      profitElement.textContent = profitText;
      profitElement.className =
        "profit-amount " + (profit >= 0 ? "" : "negative");

      document.getElementById("wins").textContent = data.wins || 0;
      document.getElementById("losses").textContent = data.losses || 0;

      document.getElementById("current-scan").textContent =
        data.currentScan || "알 수 없음";
      document.getElementById("last-activity").textContent =
        data.lastActivity || "없음";
    } catch (error) {
      console.error("통계 업데이트 실패:", error);
    }
  }

  async updateHoldings() {
    try {
      const response = await fetch("/api/holdings");
      const data = await response.json();

      const holdingsList = document.getElementById("holdings-list");
      const holdings = data.holdings || {};

      if (Object.keys(holdings).length === 0) {
        holdingsList.innerHTML =
          '<p class="no-holdings">보유 종목이 없습니다.</p>';
        return;
      }

      let html = "";
      Object.entries(holdings).forEach(([market, holding]) => {
        const status = holding.recovered
          ? `${holding.state} (복구됨)`
          : holding.state;
        const qtyInfo = holding.totalQty
          ? `총 ${holding.totalQty}개`
          : `${holding.qty || 0}개`;

        html += `
                    <div class="holding-item">
                        <div class="holding-market">${market}</div>
                        <div class="holding-info">
                            <div>${qtyInfo}</div>
                            <div>${status}</div>
                        </div>
                    </div>
                `;
      });

      holdingsList.innerHTML = html;
    } catch (error) {
      console.error("보유 종목 업데이트 실패:", error);
    }
  }

  async updateWatchList() {
    try {
      const response = await fetch("/api/watchlist");
      const data = await response.json();

      const watchlistList = document.getElementById("watchlist-list");
      const watchList = data.watchList || [];

      if (watchList.length === 0) {
        watchlistList.innerHTML =
          '<p class="no-watchlist">감시 대상이 없습니다.</p>';
        return;
      }

      let html = "";
      watchList.forEach((market) => {
        html += `
                    <div class="watchlist-item">
                        <div class="watchlist-market">${market}</div>
                        <div class="watchlist-status">🔍 모니터링</div>
                    </div>
                `;
      });

      watchlistList.innerHTML = html;
    } catch (error) {
      console.error("감시 대상 업데이트 실패:", error);
    }
  }

  async updateLogs() {
    try {
      const response = await fetch("/api/logs");
      const data = await response.json();

      const logsContainer = document.getElementById("logs-container");
      const logs = data.logs || [];

      if (logs.length === 0) {
        logsContainer.innerHTML = '<p class="no-logs">로그가 없습니다.</p>';
        return;
      }

      let html = "";
      logs
        .reverse()
        .slice(0, 20)
        .forEach((log) => {
          const timestamp = new Date(log.timestamp).toLocaleTimeString("ko-KR");
          html += `
                    <div class="log-entry">
                        <span class="log-timestamp">${timestamp}</span>
                        <span class="log-level ${
                          log.level
                        }">${log.level.toUpperCase()}</span>
                        <span class="log-message">${log.message}</span>
                    </div>
                `;
        });

      logsContainer.innerHTML = html;

      // 스크롤을 맨 위로 (최신 로그가 위에 오도록)
      logsContainer.scrollTop = 0;
    } catch (error) {
      console.error("로그 업데이트 실패:", error);
    }
  }

  async updateConfig() {
    try {
      const response = await fetch("/api/config");
      const data = await response.json();

      if (data.error) {
        document.getElementById("buy-amount").textContent = "연결 안됨";
        document.getElementById("loss-ratio").textContent = "연결 안됨";
        document.getElementById("ma-settings").textContent = "연결 안됨";
        return;
      }

      document.getElementById("buy-amount").textContent =
        (data.buyAmount || 0).toLocaleString() + "원";
      document.getElementById("loss-ratio").textContent =
        ((data.lossRatio || 0) * 100).toFixed(1) + "%";

      const ma = data.movingAverages || { short: 5, long: 15 };
      document.getElementById(
        "ma-settings"
      ).textContent = `${ma.short}분/${ma.long}분`;
    } catch (error) {
      console.error("설정 업데이트 실패:", error);
    }
  }

  updateLastUpdateTime() {
    const now = new Date();
    document.getElementById("last-update").textContent =
      now.toLocaleTimeString("ko-KR");
  }

  formatNumber(num) {
    return num.toLocaleString();
  }

  formatCurrency(amount) {
    const prefix = amount >= 0 ? "+" : "";
    return prefix + amount.toLocaleString() + "원";
  }
}

// 페이지 로드 시 대시보드 초기화
document.addEventListener("DOMContentLoaded", () => {
  new Dashboard();
});
