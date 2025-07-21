const path = require("path");
const { HistoricalDataProvider } = require("./HistoricalDataProvider");
const TradingBot = require("../src/TradingBot");
const BithumbAPI = require("../src/BithumbAPI");
const TradingEngine = require("../src/TradingEngine");
const DataManager = require("../src/DataManager");
const Logger = require("../src/Logger");

/**
 * 백테스트 실행기
 * 과거 데이터를 이용한 전략 테스트
 */
class BacktestRunner {
  constructor(config = {}) {
    this.config = {
      startDate: config.startDate,
      endDate: config.endDate,
      markets: config.markets || ["KRW-BTC", "KRW-ETH"],
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
      speed: config.speed || 1, // 시뮬레이션 속도 (1 = 실시간, 0 = 최대 속도)
      ...config,
    };

    this.logger = new Logger({
      logFile: path.join(process.cwd(), `logs/backtest_${Date.now()}.log`),
      level: config.logLevel || "info",
    });

    this.dataProvider = new HistoricalDataProvider();
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

      // 2. 백테스트 환경 설정
      const backtestData = this.dataProvider.createBacktestData(
        this.config.markets,
        this.config.startDate,
        this.config.endDate
      );

      // 3. 트레이딩 봇 초기화
      const bot = await this.initializeTradingBot(backtestData);

      // 4. 시뮬레이션 실행
      await this.runSimulation(bot, backtestData);

      // 5. 결과 분석
      await this.analyzeResults(bot);

      // 6. 결과 저장
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

    for (const market of this.config.markets) {
      const fileName = `${market}_minutes1_${this.config.startDate}_${this.config.endDate}.json`;
      const filePath = path.join(this.dataProvider.dataDir, fileName);

      if (!require("fs").existsSync(filePath)) {
        this.logger.info(`📥 ${market} 데이터 다운로드 중...`);
        await this.dataProvider.downloadCandles(
          market,
          this.config.startDate,
          this.config.endDate,
          "minutes",
          1
        );
      } else {
        this.logger.info(`📁 ${market} 기존 데이터 사용`);
      }

      // 데이터 품질 검증
      const validation = this.dataProvider.validateData(fileName);
      if (!validation.valid) {
        throw new Error(`${market} 데이터 품질 검증 실패: ${validation.error}`);
      }

      this.logger.info(
        `✅ ${market}: ${validation.totalCandles}개 캔들 (${validation.gaps.length}개 갭)`
      );
    }
  }

  // 트레이딩 봇 초기화
  async initializeTradingBot(backtestData) {
    const api = new BithumbAPI({
      isLive: false,
      backtestData: backtestData,
    });

    const executionEngine = new TradingEngine(api, false);
    executionEngine.resetBacktestState(this.config.initialBalance);

    const dataManager = new DataManager({
      dataFile: path.join(process.cwd(), "backtest_data.json"),
    });

    const bot = new TradingBot(
      this.config,
      api, // dataProvider
      executionEngine,
      dataManager,
      this.logger
    );

    await bot.init();
    return bot;
  }

  // 시뮬레이션 실행
  async runSimulation(bot, backtestData) {
    this.logger.info("🚀 시뮬레이션 시작");

    const startTime = new Date(this.config.startDate);
    const endTime = new Date(this.config.endDate);
    const currentTime = new Date(startTime);

    let cycleCount = 0;
    let lastDayStats = null;

    while (currentTime < endTime) {
      // API에 현재 시간 설정
      bot.dataProvider.setCurrentTime(currentTime);

      // 주문 체결 시뮬레이션
      for (const market of this.config.markets) {
        const ticker = await bot.dataProvider.getTicker(market);
        if (ticker) {
          bot.executionEngine.simulateOrderExecution(
            market,
            ticker.trade_price
          );
        }
      }

      // 트레이딩 사이클 실행
      try {
        await bot.runTradingCycle();
      } catch (error) {
        this.logger.warn(`⚠️ 트레이딩 사이클 오류: ${error.message}`);
      }

      // 일일 통계 수집
      const dayKey = currentTime.toISOString().slice(0, 10);
      if (!lastDayStats || lastDayStats !== dayKey) {
        await this.collectDailyStats(bot, currentTime);
        lastDayStats = dayKey;
      }

      // 시간 진행 (30초 간격)
      currentTime.setSeconds(currentTime.getSeconds() + 30);
      cycleCount++;

      // 진행률 표시
      if (cycleCount % 1000 === 0) {
        const progress =
          ((currentTime - startTime) / (endTime - startTime)) * 100;
        this.logger.info(
          `📈 진행률: ${progress.toFixed(1)}% (${currentTime
            .toISOString()
            .slice(0, 16)})`
        );
      }

      // 속도 조절
      if (this.config.speed > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.config.speed));
      }
    }

    this.logger.info(`🎯 시뮬레이션 완료: ${cycleCount}회 사이클 실행`);
  }

  // 일일 통계 수집
  async collectDailyStats(bot, date) {
    const stats = bot.getStats();
    const balance = await bot.executionEngine.getBalance();
    const holdings = await bot.executionEngine.getAllHoldings();

    // 보유 자산 평가
    let totalHoldingValue = 0;
    for (const [market, holding] of Object.entries(holdings)) {
      try {
        const ticker = await bot.dataProvider.getTicker(market);
        if (ticker) {
          totalHoldingValue += holding.totalQty * ticker.trade_price;
        }
      } catch (error) {
        // 티커 조회 실패 시 매수가로 평가
        totalHoldingValue += holding.totalQty * (holding.avgBuyPrice || 0);
      }
    }

    const totalAssets = balance + totalHoldingValue;
    const profit = totalAssets - this.config.initialBalance;
    const profitRate = (profit / this.config.initialBalance) * 100;

    const dailyStat = {
      date: date.toISOString().slice(0, 10),
      balance: balance,
      totalHoldingValue: totalHoldingValue,
      totalAssets: totalAssets,
      profit: profit,
      profitRate: profitRate,
      trades: stats.trades,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate,
      holdingsCount: Object.keys(holdings).length,
    };

    this.results.dailyStats.push(dailyStat);

    this.logger.debug(
      `📊 ${dailyStat.date}: 총자산 ${totalAssets.toLocaleString()}원 (${
        profitRate > 0 ? "+" : ""
      }${profitRate.toFixed(2)}%)`
    );
  }

  // 결과 분석
  async analyzeResults(bot) {
    this.logger.info("📊 결과 분석 중...");

    const finalStats = bot.getStats();
    const finalBalance = await bot.executionEngine.getBalance();
    const finalHoldings = await bot.executionEngine.getAllHoldings();
    const backtestResult = bot.executionEngine.getBacktestResult();

    // 최종 자산 평가
    let finalHoldingValue = 0;
    for (const [market, holding] of Object.entries(finalHoldings)) {
      finalHoldingValue += holding.totalQty * (holding.avgBuyPrice || 0);
    }

    const finalAssets = finalBalance + finalHoldingValue;
    const totalProfit = finalAssets - this.config.initialBalance;
    const totalProfitRate = (totalProfit / this.config.initialBalance) * 100;

    // 최대 손실 계산 (MDD)
    let maxAssets = this.config.initialBalance;
    let maxDrawdown = 0;
    let maxDrawdownRate = 0;

    this.results.dailyStats.forEach((stat) => {
      maxAssets = Math.max(maxAssets, stat.totalAssets);
      const drawdown = maxAssets - stat.totalAssets;
      const drawdownRate = (drawdown / maxAssets) * 100;

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownRate = drawdownRate;
      }
    });

    // Sharpe Ratio 계산 (간단한 버전)
    const dailyReturns = this.results.dailyStats
      .map((stat, index) => {
        if (index === 0) return 0;
        const prevAssets = this.results.dailyStats[index - 1].totalAssets;
        return (stat.totalAssets - prevAssets) / prevAssets;
      })
      .slice(1);

    const avgDailyReturn =
      dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
    const stdDailyReturn = Math.sqrt(
      dailyReturns.reduce(
        (sum, ret) => sum + Math.pow(ret - avgDailyReturn, 2),
        0
      ) / dailyReturns.length
    );
    const sharpeRatio =
      stdDailyReturn > 0
        ? (avgDailyReturn / stdDailyReturn) * Math.sqrt(365)
        : 0;

    this.results.finalStats = {
      // 기본 정보
      duration: `${this.config.startDate} ~ ${this.config.endDate}`,
      tradingDays: this.results.dailyStats.length,

      // 수익성
      initialBalance: this.config.initialBalance,
      finalBalance: finalBalance,
      finalHoldingValue: finalHoldingValue,
      finalAssets: finalAssets,
      totalProfit: totalProfit,
      totalProfitRate: totalProfitRate,

      // 거래 통계
      totalTrades: finalStats.trades,
      winningTrades: finalStats.wins,
      losingTrades: finalStats.losses,
      winRate: finalStats.winRate,
      avgTradesPerDay: finalStats.trades / this.results.dailyStats.length,

      // 리스크 지표
      maxDrawdown: maxDrawdown,
      maxDrawdownRate: maxDrawdownRate,
      sharpeRatio: sharpeRatio,

      // 기타
      finalHoldings: Object.keys(finalHoldings).length,
      backtestDuration: Date.now() - this.results.startTime,
    };

    // 결과 로깅
    this.logger.info("📈 === 백테스트 결과 ===");
    this.logger.info(`🏦 최종 자산: ${finalAssets.toLocaleString()}원`);
    this.logger.info(
      `💰 총 수익: ${
        totalProfit > 0 ? "+" : ""
      }${totalProfit.toLocaleString()}원 (${
        totalProfitRate > 0 ? "+" : ""
      }${totalProfitRate.toFixed(2)}%)`
    );
    this.logger.info(
      `📊 총 거래: ${finalStats.trades}회 (승률: ${finalStats.winRate}%)`
    );
    this.logger.info(
      `📉 최대 손실: ${maxDrawdown.toLocaleString()}원 (${maxDrawdownRate.toFixed(
        2
      )}%)`
    );
    this.logger.info(`📈 샤프 비율: ${sharpeRatio.toFixed(3)}`);
  }

  // 결과 저장
  async saveResults() {
    const dataManager = new DataManager();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `backtest_${this.config.startDate}_${this.config.endDate}_${timestamp}.json`;

    const resultPath = await dataManager.saveBacktestResult(
      this.results,
      fileName
    );
    this.logger.info(`💾 결과 저장 완료: ${resultPath}`);

    // 요약 파일도 생성
    const summary = {
      config: this.config,
      finalStats: this.results.finalStats,
      createdAt: new Date().toISOString(),
    };

    const summaryPath = resultPath.replace(".json", "_summary.json");
    require("fs").writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    return resultPath;
  }

  // 결과 비교 (여러 백테스트 결과 비교)
  static async compareResults(resultFiles) {
    const results = [];

    for (const file of resultFiles) {
      try {
        const dataManager = new DataManager();
        const result = await dataManager.loadBacktestResult(file);
        results.push({
          file,
          stats: result.finalStats,
        });
      } catch (error) {
        console.error(`결과 로드 실패: ${file} - ${error.message}`);
      }
    }

    // 성능 순으로 정렬
    results.sort((a, b) => b.stats.totalProfitRate - a.stats.totalProfitRate);

    console.log("\n📊 백테스트 결과 비교");
    console.log("─".repeat(100));
    console.log("순위 | 파일명 | 수익률 | 총거래 | 승률 | MDD | 샤프");
    console.log("─".repeat(100));

    results.forEach((result, index) => {
      const stats = result.stats;
      console.log(
        `${(index + 1).toString().padStart(2)} | ` +
          `${result.file.slice(0, 20).padEnd(20)} | ` +
          `${stats.totalProfitRate.toFixed(2).padStart(6)}% | ` +
          `${stats.totalTrades.toString().padStart(5)} | ` +
          `${stats.winRate.padStart(5)}% | ` +
          `${stats.maxDrawdownRate.toFixed(2).padStart(5)}% | ` +
          `${stats.sharpeRatio.toFixed(3).padStart(5)}`
      );
    });

    return results;
  }
}

// CLI 실행
if (require.main === module) {
  const args = process.argv.slice(2);
  const config = {};

  // 명령행 인수 파싱
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace("--", "");
    const value = args[i + 1];

    if (key === "help") {
      console.log(`
🔬 백테스트 실행기 사용법

node backtest/BacktestRunner.js [옵션]

옵션:
  --start-date YYYY-MM-DD    시작 날짜 (기본값: 30일 전)
  --end-date YYYY-MM-DD      종료 날짜 (기본값: 오늘)
  --markets BTC,ETH          테스트할 마켓 (기본값: BTC,ETH)
  --initial-balance 1000000  초기 자금 (기본값: 1,000,000)
  --buy-amount 10000         매수 금액 (기본값: 10,000)
  --profit-ratio 0.03        익절 비율 (기본값: 0.03)
  --loss-ratio 0.015         손절 비율 (기본값: 0.015)
  --speed 0                  시뮬레이션 속도 (기본값: 0=최대속도)

예시:
  node backtest/BacktestRunner.js --start-date 2024-01-01 --end-date 2024-03-31
      `);
      process.exit(0);
    }

    switch (key) {
      case "start-date":
        config.startDate = value;
        break;
      case "end-date":
        config.endDate = value;
        break;
      case "markets":
        config.markets = value.split(",").map((m) => `KRW-${m.trim()}`);
        break;
      case "initial-balance":
        config.initialBalance = parseInt(value);
        break;
      case "buy-amount":
        config.buyAmount = parseInt(value);
        break;
      case "profit-ratio":
        config.profitRatio = parseFloat(value);
        break;
      case "loss-ratio":
        config.lossRatio = parseFloat(value);
        break;
      case "speed":
        config.speed = parseInt(value);
        break;
    }
  }

  // 기본값 설정
  if (!config.startDate) {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    config.startDate = date.toISOString().slice(0, 10);
  }

  if (!config.endDate) {
    config.endDate = new Date().toISOString().slice(0, 10);
  }

  // 백테스트 실행
  const runner = new BacktestRunner(config);
  runner
    .run()
    .then((results) => {
      console.log("\n✅ 백테스트 완료!");
      console.log(
        `📊 총 수익률: ${results.finalStats.totalProfitRate.toFixed(2)}%`
      );
      console.log(`📈 총 거래: ${results.finalStats.totalTrades}회`);
      console.log(`🎯 승률: ${results.finalStats.winRate}%`);
    })
    .catch((error) => {
      console.error("❌ 백테스트 실패:", error.message);
      process.exit(1);
    });
}

module.exports = BacktestRunner;
