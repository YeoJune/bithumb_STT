/**
 * 개선된 CLI 인터페이스
 * 키보드 입력, 대시보드, 통계 표시
 */
class CLIInterface {
  constructor(tradingBot, logger) {
    this.tradingBot = tradingBot;
    this.logger = logger;
    this.isRunning = false;
    this.dashboardInterval = null;
    this.lastLogMessages = [];
    this.maxLogDisplay = 5;

    // ANSI 색상 코드
    this.colors = {
      reset: "\x1b[0m",
      bright: "\x1b[1m",
      dim: "\x1b[2m",
      red: "\x1b[31m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      blue: "\x1b[34m",
      magenta: "\x1b[35m",
      cyan: "\x1b[36m",
      white: "\x1b[37m",
      gray: "\x1b[90m",
      bgRed: "\x1b[41m",
      bgGreen: "\x1b[42m",
      bgYellow: "\x1b[43m",
    };

    this.setupKeyboardHandler();
  }

  // 색상 적용 헬퍼
  colorize(text, color) {
    return `${color}${text}${this.colors.reset}`;
  }

  // 키보드 입력 설정
  setupKeyboardHandler() {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", this.handleKeypress.bind(this));
    } else {
      this.logger.warn(
        "TTY 모드가 아닙니다. 키보드 단축키를 사용할 수 없습니다."
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
    if (key === "l") this.showLogs();
    if (key === "c") this.clearLogs();
  }

  // 로그 메시지 추가
  addLogMessage(message, level = "info") {
    const timestamp = new Date().toLocaleTimeString("ko-KR");
    const logEntry = {
      timestamp,
      message: message.replace(/[\x1b\u001b]\[[0-9;]*m/g, ""), // ANSI 색상 코드 제거
      level,
    };

    this.lastLogMessages.unshift(logEntry);
    if (this.lastLogMessages.length > 20) {
      this.lastLogMessages = this.lastLogMessages.slice(0, 20);
    }
  }

  // 인터페이스 시작
  start() {
    this.isRunning = true;
    this.logger.system("CLI 인터페이스 시작");

    // 로거에 CLI 인터페이스 연결
    const originalLog = this.logger.log.bind(this.logger);
    this.logger.log = (message, level = "info") => {
      originalLog(message, level);
      this.addLogMessage(message, level);
    };

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

    this.logger.system("사용자 요청으로 봇을 종료합니다");
    console.log(this.colorize("\n👋 봇을 종료합니다...", this.colors.yellow));
    process.exit(0);
  }

  // 환영 메시지
  showWelcome() {
    console.clear();
    console.log(
      this.colorize("🚀 빗썸 트레이딩 봇이 시작되었습니다!", this.colors.green)
    );
    console.log(
      this.colorize("📖 [h] 키를 눌러 도움말을 확인하세요", this.colors.cyan)
    );
    console.log("─".repeat(80));
  }

  // 실시간 대시보드 (개선된 디자인)
  drawDashboard() {
    if (!this.isRunning) return;

    const stats = this.tradingBot.getStats();
    const profitColor =
      stats.totalProfit >= 0 ? this.colors.green : this.colors.red;
    const profitPrefix = stats.totalProfit >= 0 ? "+" : "";

    console.clear();

    // 헤더
    console.log(
      this.colorize(
        "┌─ Bithumb Trading Bot Dashboard ─────────────────────────────────┐",
        this.colors.cyan
      )
    );

    // 주요 지표
    const holdingsCount = Object.keys(stats.holdings).length;
    console.log(
      `│ ${this.colorize("📦 Holdings:", this.colors.white)} ${this.colorize(
        holdingsCount + "개",
        this.colors.yellow
      )} | ${this.colorize("⏱️ Runtime:", this.colors.white)} ${this.colorize(
        stats.runtime + "m",
        this.colors.yellow
      )} | ${this.colorize("🎯 Win Rate:", this.colors.white)} ${this.colorize(
        stats.winRate + "%",
        this.colors.yellow
      )} (${stats.wins}/${stats.losses}) │`
    );

    // 수익/손실
    console.log(
      `│ ${this.colorize("📈 P&L:", this.colors.white)} ${this.colorize(
        profitPrefix + stats.totalProfit.toLocaleString() + "원",
        profitColor
      )}`.padEnd(80) + " │"
    );

    console.log(
      this.colorize(
        "├──────────────────────────────────────────────────────────────────┤",
        this.colors.cyan
      )
    );

    // 현재 상태
    console.log(
      `│ ${this.colorize("🔍 Status:", this.colors.white)} ${stats.currentScan
        .slice(0, 50)
        .padEnd(50)} │`
    );
    console.log(
      `│ ${this.colorize(
        "📝 Activity:",
        this.colors.white
      )} ${stats.lastActivity.slice(0, 48).padEnd(48)} │`
    );

    console.log(
      this.colorize(
        "├──────────────────────────────────────────────────────────────────┤",
        this.colors.cyan
      )
    );

    // 최근 로그 (최대 5개)
    console.log(
      `│ ${this.colorize("📋 Recent Logs:", this.colors.white)}`.padEnd(80) +
        " │"
    );
    const recentLogs = this.lastLogMessages.slice(0, this.maxLogDisplay);

    if (recentLogs.length === 0) {
      console.log(
        `│ ${this.colorize("  No logs yet...", this.colors.gray)}`.padEnd(80) +
          " │"
      );
    } else {
      recentLogs.forEach((log) => {
        const levelColor = this.getLevelColor(log.level);
        const timeStr = this.colorize(`[${log.timestamp}]`, this.colors.gray);
        const levelStr = this.colorize(
          `[${log.level.toUpperCase()}]`,
          levelColor
        );
        const message = log.message.slice(0, 45);
        console.log(`│  ${timeStr} ${levelStr} ${message}`.padEnd(80) + " │");
      });
    }

    // 빈 라인으로 로그 영역 채우기
    const emptyLines = this.maxLogDisplay - recentLogs.length;
    for (let i = 0; i < emptyLines; i++) {
      console.log("│".padEnd(79) + " │");
    }

    console.log(
      this.colorize(
        "├──────────────────────────────────────────────────────────────────┤",
        this.colors.cyan
      )
    );

    // 명령어
    console.log(
      `│ ${this.colorize("Commands:", this.colors.white)} ${this.colorize(
        "[q]",
        this.colors.yellow
      )}uit | ${this.colorize("[s]", this.colors.yellow)}tats | ${this.colorize(
        "[h]",
        this.colors.yellow
      )}elp | ${this.colorize(
        "[r]",
        this.colors.yellow
      )}ecover | ${this.colorize(
        "[l]",
        this.colors.yellow
      )}ogs | ${this.colorize("[c]", this.colors.yellow)}lear │`
    );

    console.log(
      this.colorize(
        "└──────────────────────────────────────────────────────────────────┘",
        this.colors.cyan
      )
    );
  }

  // 로그 레벨별 색상 반환
  getLevelColor(level) {
    const colors = {
      debug: this.colors.gray,
      info: this.colors.cyan,
      warn: this.colors.yellow,
      error: this.colors.red,
    };
    return colors[level] || this.colors.white;
  }

  // 로그 화면 표시
  showLogs() {
    console.clear();
    console.log(
      this.colorize("📋 === 최근 로그 (최대 20개) ===", this.colors.cyan)
    );

    if (this.lastLogMessages.length === 0) {
      console.log(this.colorize("로그가 없습니다.", this.colors.gray));
    } else {
      this.lastLogMessages.forEach((log) => {
        const levelColor = this.getLevelColor(log.level);
        const timeStr = this.colorize(`[${log.timestamp}]`, this.colors.gray);
        const levelStr = this.colorize(
          `[${log.level.toUpperCase()}]`,
          levelColor
        );
        console.log(`${timeStr} ${levelStr} ${log.message}`);
      });
    }

    console.log(
      this.colorize("\n아무 키나 누르면 돌아갑니다...", this.colors.yellow)
    );
    process.stdin.once("data", () => {});
  }

  // 로그 클리어
  clearLogs() {
    this.lastLogMessages = [];
    this.logger.info("로그가 클리어되었습니다.");
  }

  // 상세 통계 표시
  showStats() {
    console.clear();
    const stats = this.tradingBot.getStats();

    console.log(this.colorize("📊 === 트레이딩 통계 ===", this.colors.cyan));
    console.log(
      `${this.colorize("런타임:", this.colors.white)} ${this.colorize(
        stats.runtime + "분",
        this.colors.yellow
      )}`
    );
    console.log(
      `${this.colorize("총 거래:", this.colors.white)} ${this.colorize(
        stats.trades + "회",
        this.colors.yellow
      )}`
    );
    console.log(
      `${this.colorize("성공:", this.colors.white)} ${this.colorize(
        stats.wins + "회",
        this.colors.green
      )}, ${this.colorize("실패:", this.colors.white)} ${this.colorize(
        stats.losses + "회",
        this.colors.red
      )}`
    );
    console.log(
      `${this.colorize("승률:", this.colors.white)} ${this.colorize(
        stats.winRate + "%",
        this.colors.yellow
      )}`
    );

    const profitColor =
      stats.totalProfit >= 0 ? this.colors.green : this.colors.red;
    const profitPrefix = stats.totalProfit >= 0 ? "+" : "";
    console.log(
      `${this.colorize("총 수익:", this.colors.white)} ${this.colorize(
        profitPrefix + stats.totalProfit.toLocaleString() + "원",
        profitColor
      )}`
    );

    console.log(this.colorize("\n보유 종목:", this.colors.cyan));

    const holdings = Object.entries(stats.holdings);
    if (holdings.length === 0) {
      console.log(this.colorize("  보유 종목이 없습니다.", this.colors.gray));
    } else {
      holdings.forEach(([market, holding]) => {
        const status = holding.recovered
          ? `${holding.state} (복구됨)`
          : holding.state;
        const qtyInfo = holding.totalQty
          ? `총 ${holding.totalQty}개 (가용 ${holding.balance || 0}, 주문중 ${
              holding.locked || 0
            })`
          : `${holding.qty || 0}개`;
        console.log(
          `  ${this.colorize(
            market + ":",
            this.colors.white
          )} ${qtyInfo} (${status})`
        );
      });
    }

    console.log(
      this.colorize("\n아무 키나 누르면 돌아갑니다...", this.colors.yellow)
    );
    process.stdin.once("data", () => {});
  }

  // 도움말 표시
  showHelp() {
    console.clear();
    console.log(this.colorize("📖 === 빗썸 트레이딩 봇 ===", this.colors.cyan));
    console.log(
      `${this.colorize("매수 금액:", this.colors.white)} ${this.colorize(
        this.tradingBot.buyAmount.toLocaleString() + "원",
        this.colors.yellow
      )}`
    );
    console.log(
      `${this.colorize("익절/손절:", this.colors.white)} ${this.colorize(
        (this.tradingBot.profitRatio * 100).toFixed(1) + "%",
        this.colors.green
      )} / ${this.colorize(
        (this.tradingBot.lossRatio * 100).toFixed(1) + "%",
        this.colors.red
      )}`
    );

    console.log(this.colorize("\nCommands:", this.colors.cyan));
    console.log(`  ${this.colorize("[q]", this.colors.yellow)} quit - 봇 종료`);
    console.log(
      `  ${this.colorize("[s]", this.colors.yellow)} stats - 상세 통계`
    );
    console.log(`  ${this.colorize("[h]", this.colors.yellow)} help - 도움말`);
    console.log(
      `  ${this.colorize("[r]", this.colors.yellow)} recover - 완전 동기화`
    );
    console.log(
      `  ${this.colorize("[l]", this.colors.yellow)} logs - 최근 로그 조회`
    );
    console.log(
      `  ${this.colorize("[c]", this.colors.yellow)} clear - 로그 클리어`
    );
    console.log(
      `  ${this.colorize("[b]", this.colors.yellow)} backtest - 백테스트 메뉴`
    );

    console.log(this.colorize("\n특징:", this.colors.cyan));
    console.log("- 프로그램 재시작 시 자동으로 기존 보유 종목 복구");
    console.log("- 익절 주문 누락 시 자동 등록");
    console.log("- 모든 매도는 보유량 100% 처리");
    console.log("- 중복 매도 주문 방지");
    console.log("- 지갑과 bot_data 완전 동기화");
    console.log("- 백테스트 지원");
    console.log("- 실시간 웹 대시보드 지원");

    console.log(
      this.colorize("\n아무 키나 누르면 돌아갑니다...", this.colors.yellow)
    );
    process.stdin.once("data", () => {});
  }

  // 백테스트 메뉴
  async showBacktestMenu() {
    console.clear();
    console.log(this.colorize("🔬 === 백테스트 메뉴 ===", this.colors.cyan));
    console.log("1. 새로운 백테스트 실행");
    console.log("2. 백테스트 결과 조회");
    console.log("3. 과거 데이터 다운로드");
    console.log("0. 메인 메뉴로 돌아가기");
    console.log("\n선택하세요 (0-3): ");

    // 현재는 간단히 안내만 표시
    console.log(
      this.colorize(
        "백테스트 기능은 별도 명령어로 실행하세요:",
        this.colors.yellow
      )
    );
    console.log(
      this.colorize("node backtest/BacktestRunner.js --help", this.colors.cyan)
    );
    console.log(
      this.colorize("\n아무 키나 누르면 돌아갑니다...", this.colors.yellow)
    );
    process.stdin.once("data", () => {});
  }

  // 상태 동기화
  async synchronizeState() {
    console.clear();
    console.log(
      this.colorize("🔄 상태 동기화를 시작합니다...", this.colors.yellow)
    );

    try {
      await this.tradingBot.synchronizeState();
      console.log(
        this.colorize("✅ 동기화가 완료되었습니다", this.colors.green)
      );
    } catch (error) {
      console.log(
        this.colorize(`❌ 동기화 실패: ${error.message}`, this.colors.red)
      );
    }

    console.log(
      this.colorize("\n아무 키나 누르면 돌아갑니다...", this.colors.yellow)
    );
    process.stdin.once("data", () => {});
  }

  // 진행률 표시
  showProgress(current, total, message = "") {
    const percentage = ((current / total) * 100).toFixed(1);
    const progressBar = "█".repeat(Math.floor((current / total) * 30));
    const emptyBar = "░".repeat(30 - Math.floor((current / total) * 30));

    process.stdout.write(
      `\r${message} [${this.colorize(
        progressBar,
        this.colors.green
      )}${this.colorize(emptyBar, this.colors.gray)}] ${this.colorize(
        percentage + "%",
        this.colors.cyan
      )} (${current}/${total})`
    );
  }

  // 에러 표시
  showError(error) {
    console.log(this.colorize(`\n❌ 오류: ${error.message}`, this.colors.red));
    if (error.stack) {
      console.log(this.colorize(`상세: ${error.stack}`, this.colors.gray));
    }
  }

  // 성공 메시지 표시
  showSuccess(message) {
    console.log(this.colorize(`\n✅ ${message}`, this.colors.green));
  }

  // 경고 메시지 표시
  showWarning(message) {
    console.log(this.colorize(`\n⚠️ ${message}`, this.colors.yellow));
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
      .map((header, i) =>
        this.colorize(header.padEnd(colWidths[i]), this.colors.cyan)
      )
      .join(" | ");
    console.log(headerLine);
    console.log("─".repeat(headerLine.replace(/\x1b\[[0-9;]*m/g, "").length));

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
      console.log(this.colorize(question, this.colors.cyan));
      process.stdin.once("data", (data) => {
        resolve(data.toString().trim());
      });
    });
  }
}

module.exports = CLIInterface;
