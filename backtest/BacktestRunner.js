const path = require("path");
const BithumbAPI = require("../src/BithumbAPI");
const BacktestDataProvider = require("./BacktestDataProvider");
const BacktestDataCollector = require("./BacktestDataCollector");
const TradingBot = require("../src/TradingBot");
const TradingEngine = require("../src/TradingEngine");
const DataManager = require("../src/DataManager");
const Logger = require("../src/Logger");

/**
 * 백테스트 실행기
 * 깔끔한 인터페이스 분리로 과거 데이터를 이용한 전략 테스트
 */
class BacktestRunner {
  constructor(config = {}) {
    this.config = {
      markets: config.markets || [], // null이면 모든 KRW 마켓 사용
      startDate: config.startDate || "2024-01-01",
      endDate: config.endDate || "2024-12-31",
      unit: config.unit || 1, // 분봉 단위
      initialBalance: config.initialBalance || 1000000,
      buyAmount: config.buyAmount || 10000,
      profitRatio: config.profitRatio || 0.03,
      lossRatio: config.lossRatio || 0.015,
      timeframes: config.timeframes || {
        short: 5,
        long: 60,
        shortThreshold: 1.8,
        longThreshold: 1.4,
      },
      speed: config.speed || 1,
      ...config,
    };

    this.logger = new Logger({
      logFile: path.join(process.cwd(), `logs/backtest_${Date.now()}.log`),
      level: config.logLevel || "info",
    });

    // 백테스트용 데이터 제공자 초기화
    this.dataProvider = new BacktestDataProvider({
      initialBalance: this.config.initialBalance,
      dataDir: path.join(process.cwd(), "backtest_data"),
    });

    this.results = {
      startTime: Date.now(),
      config: this.config,
      trades: [],
      dailyStats: [],
      finalStats: {},
    };
  }

  // 백테스트 실행
  async run() {
    try {
      this.logger.info("🔬 백테스트 시작");
      this.logger.info(
        `📅 기간: ${this.config.startDate} ~ ${this.config.endDate}`
      );
      this.logger.info(
        `💰 초기 자금: ${this.config.initialBalance.toLocaleString()}원`
      );
      this.logger.info(`🎯 대상 마켓: ${this.config.markets.join(", ")}`);

      // 1. 데이터 준비
      await this.prepareData();

      // 2. 트레이딩 봇 초기화
      const bot = await this.initializeTradingBot();

      // 3. 시뮬레이션 실행
      await this.runSimulation(bot);

      // 4. 결과 분석
      await this.analyzeResults();

      // 5. 결과 저장
      await this.saveResults();

      this.logger.info("✅ 백테스트 완료");
      return this.results;
    } catch (error) {
      this.logger.error(`❌ 백테스트 실패: ${error.message}`);
      throw error;
    }
  }

  // 데이터 준비
  async prepareData() {
    this.logger.info("📊 과거 데이터 준비 중...");

    // 데이터 수집기로 필요한 데이터 다운로드
    const api = new BithumbAPI();
    const collector = new BacktestDataCollector(api);

    let markets;

    // 특정 마켓이 지정된 경우 해당 마켓만 사용
    if (this.config.markets && this.config.markets.length > 0) {
      markets = this.config.markets;
      this.logger.info(`📋 지정된 마켓 사용: ${markets.join(", ")}`);
    } else {
      // 모든 KRW 마켓 조회
      this.logger.info("🔍 거래 가능한 모든 KRW 마켓 조회 중...");
      try {
        const allMarkets = await api.getMarkets(false);
        markets = allMarkets
          .filter((m) => m.market.startsWith("KRW-"))
          .map((m) => m.market);

        this.logger.info(`📋 발견된 KRW 마켓: ${markets.length}개`);
        this.logger.info(
          `📋 마켓 목록: ${markets.slice(0, 10).join(", ")}${
            markets.length > 10 ? ` 외 ${markets.length - 10}개` : ""
          }`
        );
      } catch (error) {
        this.logger.error(`❌ 마켓 목록 조회 실패: ${error.message}`);
        // 기본값 사용
        markets = ["KRW-BTC"];
        this.logger.info(`📋 기본 마켓 사용: ${markets.join(", ")}`);
      }
    }

    let successCount = 0;
    let failCount = 0;

    for (const market of markets) {
      this.logger.info(`📥 ${market} 캔들 데이터 수집 중...`);

      try {
        await collector.collectCandles(
          market,
          this.config.startDate,
          this.config.endDate,
          this.config.unit
        );

        // 백테스트 데이터 제공자에 데이터 로드
        this.dataProvider.loadCandleData(
          market,
          this.config.startDate,
          this.config.endDate,
          this.config.unit
        );

        this.logger.info(`✅ ${market}: 데이터 로드 완료`);
        successCount++;
      } catch (error) {
        this.logger.error(`❌ ${market} 데이터 준비 실패: ${error.message}`);
        failCount++;
        // 개별 마켓 실패는 전체를 중단하지 않음
        continue;
      }
    }

    this.logger.info(
      `✅ 데이터 준비 완료 - 성공: ${successCount}개, 실패: ${failCount}개`
    );

    if (successCount === 0) {
      throw new Error("모든 마켓의 데이터 수집에 실패했습니다.");
    }
  }

  // 트레이딩 봇 초기화
  async initializeTradingBot() {
    this.logger.info("🤖 트레이딩 봇 초기화 중...");

    // TradingEngine에 백테스트 데이터 제공자 연결
    const tradingEngine = new TradingEngine(this.dataProvider, false); // false = 백테스트 모드

    // DataManager 인스턴스 생성 (백테스트용)
    const dataManager = new DataManager({
      dataFile: path.join(process.cwd(), `backtest_data_${Date.now()}.json`),
      backupEnabled: false, // 백테스트에서는 백업 비활성화
    });

    // TradingBot 생성 (constructor: config, dataProvider, executionEngine, dataManager, logger)
    const bot = new TradingBot(
      this.config,
      this.dataProvider,
      tradingEngine,
      dataManager,
      this.logger
    );

    this.logger.info("✅ 트레이딩 봇 초기화 완료");
    return bot;
  }

  // 시뮬레이션 실행
  async runSimulation(bot) {
    this.logger.info("🚀 시뮬레이션 시작");

    const startDate = new Date(this.config.startDate);
    const endDate = new Date(this.config.endDate);
    const currentTime = new Date(startDate);

    let stepCount = 0;
    const totalMinutes = Math.floor((endDate - startDate) / (1000 * 60));

    while (currentTime <= endDate) {
      // 데이터 제공자의 현재 시간 설정
      this.dataProvider.setCurrentTime(currentTime);

      try {
        // 봇 실행 (현재 시점의 데이터로)
        await bot.runTradingCycle();

        // 거래 기록 수집
        if (bot.lastTrade) {
          this.results.trades.push({
            ...bot.lastTrade,
            timestamp: currentTime.toISOString(),
          });
          bot.lastTrade = null; // 초기화
        }

        // 진행률 표시
        if (stepCount % 1440 === 0) {
          // 하루마다
          const progress = (
            ((currentTime - startDate) / (endDate - startDate)) *
            100
          ).toFixed(1);
          this.logger.info(
            `📈 진행률: ${progress}% (${
              currentTime.toISOString().split("T")[0]
            })`
          );

          // 일별 통계 수집
          await this.collectDailyStats(currentTime);
        }
      } catch (error) {
        this.logger.error(
          `⚠️ 시뮬레이션 오류 (${currentTime.toISOString()}): ${error.message}`
        );
      }

      // 다음 시점으로 이동 (분봉 단위)
      currentTime.setMinutes(currentTime.getMinutes() + this.config.unit);
      stepCount++;

      // 속도 조절
      if (this.config.speed > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.config.speed));
      }
    }

    this.logger.info("✅ 시뮬레이션 완료");
  }

  // 일별 통계 수집
  async collectDailyStats(date) {
    const accounts = await this.dataProvider.getAccounts();
    const totalBalance = accounts.reduce((sum, account) => {
      if (account.currency === "KRW") {
        return sum + parseFloat(account.balance);
      }
      return sum; // 코인 가치 계산은 복잡하므로 일단 KRW만
    }, 0);

    this.results.dailyStats.push({
      date: date.toISOString().split("T")[0],
      balance: totalBalance,
      trades: this.results.trades.length,
      profit: totalBalance - this.config.initialBalance,
    });
  }

  // 결과 분석
  async analyzeResults() {
    this.logger.info("📊 결과 분석 중...");

    const accounts = await this.dataProvider.getAccounts();
    const finalBalance =
      accounts.find((acc) => acc.currency === "KRW")?.balance || 0;

    const totalTrades = this.results.trades.length;
    const profitableTrades = this.results.trades.filter(
      (t) => t.profit > 0
    ).length;
    const totalProfit = finalBalance - this.config.initialBalance;
    const returnRate = (totalProfit / this.config.initialBalance) * 100;

    this.results.finalStats = {
      초기자금: this.config.initialBalance,
      최종자금: finalBalance,
      총수익: totalProfit,
      수익률: returnRate,
      총거래: totalTrades,
      수익거래: profitableTrades,
      승률: totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0,
      기간: `${this.config.startDate} ~ ${this.config.endDate}`,
      실행시간: Date.now() - this.results.startTime,
    };

    this.logger.info("✅ 결과 분석 완료");
    this.logger.info(
      `💰 최종 결과: ${totalProfit.toLocaleString()}원 (${returnRate.toFixed(
        2
      )}%)`
    );
  }

  // 결과 저장
  async saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backtest_result_${timestamp}.json`;
    const filepath = path.join(process.cwd(), "backtest_results", filename);

    // 디렉토리 생성
    const fs = require("fs");
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
    this.logger.info(`💾 결과 저장: ${filename}`);
  }

  // 결과 비교 (정적 메서드)
  static async compareResults(resultFiles) {
    const fs = require("fs");
    const results = resultFiles.map((file) => {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      return {
        file: path.basename(file),
        ...data.finalStats,
      };
    });

    // 수익률 기준 정렬
    results.sort((a, b) => b.수익률 - a.수익률);

    console.table(results);
    return results;
  }
}

module.exports = BacktestRunner;

// 직접 실행 시 테스트 실행
if (require.main === module) {
  const runner = new BacktestRunner({
    // markets: ["KRW-BTC"], // 주석 처리하여 모든 KRW 마켓 사용
    startDate: "2025-07-11",
    endDate: "2025-07-14",
    unit: 5, // 5분봉
    initialBalance: 1000000,
    speed: 0, // 최고 속도
  });

  runner
    .run()
    .then((results) => {
      console.log("\n🎉 백테스트 완료!");
      console.table(results.finalStats);
    })
    .catch((error) => {
      console.error("❌ 백테스트 실패:", error.message);
    });
}
