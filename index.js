require("dotenv").config();

// 모듈 임포트
const TradingBot = require("./src/TradingBot");
const BithumbAPI = require("./src/BithumbAPI");
const TradingEngine = require("./src/TradingEngine");
const DataManager = require("./src/DataManager");
const Logger = require("./src/Logger");
const CLIInterface = require("./src/interfaces/CLIInterface");

// 레거시 래퍼 클래스 (기존 인터페이스 호환성 유지)
class BithumbTradingBot {
  constructor(config = {}) {
    // 환경 변수 확인
    const accessKey = process.env.BITHUMB_ACCESS_KEY;
    const secretKey = process.env.BITHUMB_SECRET_KEY;

    if (!accessKey || !secretKey) {
      console.log(
        "❌ .env 파일에 BITHUMB_ACCESS_KEY, BITHUMB_SECRET_KEY 설정 필요"
      );
      process.exit(1);
    }

    // 모듈 초기화
    this.logger = new Logger();

    this.dataManager = new DataManager();

    this.api = new BithumbAPI({
      accessKey,
      secretKey,
      isLive: true,
      api: config.api, // API 설정 전달
    });

    this.executionEngine = new TradingEngine(this.api, true, config);

    this.tradingBot = new TradingBot(
      config,
      this.api,
      this.executionEngine,
      this.dataManager,
      this.logger
    );

    this.cliInterface = new CLIInterface(this.tradingBot, this.logger);

    // 안전한 종료 처리
    this.setupSignalHandlers();
  }

  // 신호 핸들러 설정
  setupSignalHandlers() {
    process.on("SIGINT", () => {
      console.log("\n🔄 프로그램을 안전하게 종료합니다...");
      this.logger.log("💾 프로그램 종료 - 데이터 저장됨");
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("\n🔄 시스템 종료 신호 수신...");
      this.logger.log("💾 시스템 종료 - 데이터 저장됨");
      process.exit(0);
    });

    process.on("uncaughtException", (error) => {
      console.log(`💥 예상치 못한 오류: ${error.message}`);
      this.logger.log(`💥 예상치 못한 오류: ${error.message}`);
      process.exit(1);
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.log(`🚫 처리되지 않은 Promise 거부:`, reason);
      this.logger.log(`🚫 처리되지 않은 Promise 거부: ${reason}`);
    });
  }

  // 메인 실행 메서드
  async run() {
    try {
      this.logger.log(
        `🚀 빗썸 트레이딩 봇 시작 (매수: ${this.tradingBot.buyAmount.toLocaleString()}원)`
      );
      this.logger.log(
        `📊 설정: 손절 ${(this.tradingBot.lossRatio * 100).toFixed(1)}%, MA ${
          this.tradingBot.movingAverages.short
        }분/${this.tradingBot.movingAverages.long}분`
      );

      if (Object.keys(this.tradingBot.holdings).length > 0) {
        this.logger.log("🔄 기존 보유 종목 모니터링 재개");
      }

      // 지갑과 bot_data 완전 동기화
      await this.tradingBot.synchronizeState();

      // CLI 인터페이스 시작
      this.cliInterface.start();

      // 메인 트레이딩 루프
      while (true) {
        const success = await this.tradingBot.runTradingCycle();

        if (!success) {
          await new Promise((r) => setTimeout(r, this.refreshInterval * 1000));
          continue;
        }

        // 대기
        this.tradingBot.stats.currentScan = "Waiting...";
        for (let i = 0; i < this.refreshInterval; i++) {
          this.tradingBot.stats.currentScan = `Next cycle in ${
            this.refreshInterval - i
          }s`;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    } catch (error) {
      this.logger.log(`💥 봇 실행 실패: ${error.message}`);
      throw error;
    }
  }

  // 레거시 메서드들 (기존 코드와의 호환성 유지)
  log(message) {
    this.logger.log(message);
  }

  async synchronizeState() {
    return await this.tradingBot.synchronizeState();
  }

  // 기존에 사용되던 속성들을 프록시로 연결
  get buyAmount() {
    return this.tradingBot.buyAmount;
  }
  get profitRatio() {
    return this.tradingBot.profitRatio;
  }
  get lossRatio() {
    return this.tradingBot.lossRatio;
  }
  get holdings() {
    return this.tradingBot.holdings;
  }
  get stats() {
    return this.tradingBot.stats;
  }
}

// 설정
const config = {
  refreshInterval: 5, // 5초마다 메인 루프 실행
  volumeFilterInterval: 60, // 60초마다 거래대금 필터링
  buyAmount: 10000, // 1만원씩 매수
  profitRatio: 0.03, // 3% 익절 (사용 안함)
  lossRatio: 0.015, // 1.5% 손절

  // 이동평균 설정 (분 단위)
  movingAverages: {
    short: 10, // 단기 이동평균 10분
    long: 60, // 장기 이동평균 60분
  },

  // 거래대금 필터 (기존 유지)
  timeframes: {
    short: 10, // 단기 평균 10분
    long: 180, // 장기 평균 180분
    shortThreshold: 1.5, // 현재 vs 단기 1.5배
    longThreshold: 2, // 단기 vs 장기 2배
  },

  // 수수료 설정
  fees: {
    buy: 0.0004, // 매수 수수료 0.04%
    sell: 0.0004, // 매도 수수료 0.04%
  },

  // 거래 관련 설정
  trading: {
    minBuyAmount: 5000, // 최소 매수 금액
    orderTimeoutMinutes: 2, // 주문 대기 시간 (분)
    maxScanMarkets: 50, // 최대 스캔 종목 수
  },

  // 백테스트 설정
  backtest: {
    initialBalance: 1000000, // 백테스트 초기 자금
  },

  // API 설정
  api: {
    rateLimit: 100, // API 호출 제한 (횟수)
    rateLimitInterval: 1000, // API 제한 간격 (밀리초)
  },
};

const bot = new BithumbTradingBot(config);

// 실행
bot.run().catch((error) => {
  console.log(`💥 봇 실행 실패: ${error.message}`);
  process.exit(1);
});

module.exports = BithumbTradingBot;
