/**
 * CLI 인터페이스
 * 키보드 입력, 대시보드, 통계 표시
 */
class CLIInterface {
  constructor(tradingBot, logger) {
    this.tradingBot = tradingBot;
    this.logger = logger;
    this.isRunning = false;
    this.dashboardInterval = null;

    this.setupKeyboardHandler();
  }

  // 키보드 입력 설정
  setupKeyboardHandler() {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", this.handleKeypress.bind(this));
    } else {
      this.logger.log(
        "⚠️ TTY 모드가 아닙니다. 키보드 단축키를 사용할 수 없습니다."
      );
    }
  }

  // 키보드 입력 처리
  handleKeypress(key) {
    if (key === "q" || key === "\u0003") {
      this.stop();
      return;
    }
    if (key === "s") this.showStats();
    if (key === "h") this.showHelp();
    if (key === "r") this.synchronizeState();
    if (key === "b") this.showBacktestMenu();
  }

  // 인터페이스 시작
  start() {
    this.isRunning = true;
    this.logger.log("🎮 CLI 인터페이스 시작");

    // 대시보드 주기적 업데이트
    this.dashboardInterval = setInterval(() => {
      this.drawDashboard();
    }, 1000);

    this.showWelcome();
  }

  // 인터페이스 중지
  stop() {
    this.isRunning = false;

    if (this.dashboardInterval) {
      clearInterval(this.dashboardInterval);
      this.dashboardInterval = null;
    }

    this.logger.log("👋 사용자 요청으로 봇을 종료합니다");
    console.log("\n👋 봇을 종료합니다...");
    process.exit(0);
  }

  // 환영 메시지
  showWelcome() {
    console.clear();
    console.log("🚀 빗썸 트레이딩 봇이 시작되었습니다!");
    console.log("📖 [h] 키를 눌러 도움말을 확인하세요");
    console.log("─".repeat(60));
  }

  // 실시간 대시보드
  drawDashboard() {
    if (!this.isRunning) return;

    const stats = this.tradingBot.getStats();

    console.clear();
    console.log(
      "┌─ Bithumb Trading Bot ─────────────────────────────────────────┐"
    );
    console.log(
      `│ 📦 Holdings: ${Object.keys(stats.holdings).length}개 | ⏱️ ${
        stats.runtime
      }m | 🎯 ${stats.winRate}% (${stats.wins}/${stats.losses}) │`
    );
    console.log(
      `│ 📈 P&L: ${
        stats.totalProfit > 0 ? "+" : ""
      }${stats.totalProfit.toLocaleString()}원 │`
    );
    console.log(
      "├────────────────────────────────────────────────────────────────┤"
    );
    console.log(`│ 🔍 ${stats.currentScan.padEnd(58)} │`);
    console.log(`│ 📝 ${stats.lastActivity.slice(0, 58).padEnd(58)} │`);
    console.log(
      "├────────────────────────────────────────────────────────────────┤"
    );
    console.log(
      "│ Commands: [q]uit | [s]tats | [h]elp | [r]ecover | [b]acktest  │"
    );
    console.log(
      "└────────────────────────────────────────────────────────────────┘"
    );
  }

  // 상세 통계 표시
  showStats() {
    console.clear();
    const stats = this.tradingBot.getStats();

    console.log("📊 === 트레이딩 통계 ===");
    console.log(`런타임: ${stats.runtime}분`);
    console.log(`총 거래: ${stats.trades}회`);
    console.log(`성공: ${stats.wins}회, 실패: ${stats.losses}회`);
    console.log(`승률: ${stats.winRate}%`);
    console.log(`총 수익: ${stats.totalProfit.toLocaleString()}원`);
    console.log("\n보유 종목:");

    Object.entries(stats.holdings).forEach(([market, holding]) => {
      const status = holding.recovered
        ? `${holding.state} (복구됨)`
        : holding.state;
      const qtyInfo = holding.totalQty
        ? `총 ${holding.totalQty}개 (가용 ${holding.balance || 0}, 주문중 ${
            holding.locked || 0
          })`
        : `${holding.qty || 0}개`;
      console.log(`  ${market}: ${qtyInfo} (${status})`);
    });

    console.log("\n아무 키나 누르면 돌아갑니다...");
    process.stdin.once("data", () => {});
  }

  // 도움말 표시
  showHelp() {
    console.clear();
    console.log("📖 === 빗썸 트레이딩 봇 ===");
    console.log(`매수 금액: ${this.tradingBot.buyAmount.toLocaleString()}원`);
    console.log(
      `익절/손절: ${(this.tradingBot.profitRatio * 100).toFixed(1)}% / ${(
        this.tradingBot.lossRatio * 100
      ).toFixed(1)}%`
    );
    console.log("\nCommands:");
    console.log("  [q] quit - 봇 종료");
    console.log("  [s] stats - 상세 통계");
    console.log("  [h] help - 도움말");
    console.log("  [r] recover - 완전 동기화");
    console.log("  [b] backtest - 백테스트 메뉴");
    console.log("\n특징:");
    console.log("- 프로그램 재시작 시 자동으로 기존 보유 종목 복구");
    console.log("- 익절 주문 누락 시 자동 등록");
    console.log("- 모든 매도는 보유량 100% 처리");
    console.log("- 중복 매도 주문 방지");
    console.log("- 지갑과 bot_data 완전 동기화");
    console.log("- 백테스트 지원");
    console.log("\n아무 키나 누르면 돌아갑니다...");
    process.stdin.once("data", () => {});
  }

  // 백테스트 메뉴
  async showBacktestMenu() {
    console.clear();
    console.log("🔬 === 백테스트 메뉴 ===");
    console.log("1. 새로운 백테스트 실행");
    console.log("2. 백테스트 결과 조회");
    console.log("3. 과거 데이터 다운로드");
    console.log("0. 메인 메뉴로 돌아가기");
    console.log("\n선택하세요 (0-3): ");

    // 키 입력 대기 구현 필요
    // 현재는 간단히 돌아가기
    console.log("백테스트 기능은 별도 명령어로 실행하세요:");
    console.log("node backtest/BacktestRunner.js --help");
    console.log("\n아무 키나 누르면 돌아갑니다...");
    process.stdin.once("data", () => {});
  }

  // 상태 동기화
  async synchronizeState() {
    console.clear();
    console.log("🔄 상태 동기화를 시작합니다...");

    try {
      await this.tradingBot.synchronizeState();
      console.log("✅ 동기화가 완료되었습니다");
    } catch (error) {
      console.log(`❌ 동기화 실패: ${error.message}`);
    }

    console.log("\n아무 키나 누르면 돌아갑니다...");
    process.stdin.once("data", () => {});
  }

  // 진행률 표시
  showProgress(current, total, message = "") {
    const percentage = ((current / total) * 100).toFixed(1);
    const progressBar = "█".repeat(Math.floor((current / total) * 30));
    const emptyBar = "░".repeat(30 - Math.floor((current / total) * 30));

    process.stdout.write(
      `\r${message} [${progressBar}${emptyBar}] ${percentage}% (${current}/${total})`
    );
  }

  // 에러 표시
  showError(error) {
    console.log(`\n❌ 오류: ${error.message}`);
    if (error.stack) {
      console.log(`상세: ${error.stack}`);
    }
  }

  // 성공 메시지 표시
  showSuccess(message) {
    console.log(`\n✅ ${message}`);
  }

  // 경고 메시지 표시
  showWarning(message) {
    console.log(`\n⚠️ ${message}`);
  }

  // 테이블 형태 데이터 표시
  showTable(headers, rows) {
    // 컬럼 너비 계산
    const colWidths = headers.map((header, i) => {
      const maxContentWidth = Math.max(
        ...rows.map((row) => (row[i] || "").toString().length)
      );
      return Math.max(header.length, maxContentWidth);
    });

    // 헤더 출력
    const headerLine = headers
      .map((header, i) => header.padEnd(colWidths[i]))
      .join(" | ");
    console.log(headerLine);
    console.log("─".repeat(headerLine.length));

    // 데이터 출력
    rows.forEach((row) => {
      const rowLine = row
        .map((cell, i) => (cell || "").toString().padEnd(colWidths[i]))
        .join(" | ");
      console.log(rowLine);
    });
  }

  // 입력 프롬프트 (간단한 구현)
  async prompt(question) {
    return new Promise((resolve) => {
      console.log(question);
      process.stdin.once("data", (data) => {
        resolve(data.toString().trim());
      });
    });
  }
}

module.exports = CLIInterface;
