const fs = require("fs");
const path = require("path");
const axios = require("axios");

/**
 * 과거 데이터 제공자 (백테스트용)
 * 파일 수집과 데이터 제공을 담당
 */
class HistoricalDataProvider {
  constructor(config = {}) {
    this.dataDir =
      config.dataDir || path.join(process.cwd(), "historical_data");
    this.baseUrl = config.baseUrl || "https://api.upbit.com";
    this.maxRequestsPerSecond = config.maxRequestsPerSecond || 8; // 업비트 API 제한
    this.lastRequestTime = 0;

    this.ensureDataDirectory();
  }

  // 데이터 디렉토리 생성
  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // API 요청 제한
  async rateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000 / this.maxRequestsPerSecond;

    if (timeSinceLastRequest < minInterval) {
      await new Promise((resolve) =>
        setTimeout(resolve, minInterval - timeSinceLastRequest)
      );
    }

    this.lastRequestTime = Date.now();
  }

  // 캔들 데이터 다운로드
  async downloadCandles(
    market,
    startDate,
    endDate,
    unit = "minutes",
    count = 1
  ) {
    const fileName = `${market}_${unit}${count}_${startDate}_${endDate}.json`;
    const filePath = path.join(this.dataDir, fileName);

    // 이미 파일이 존재하면 로드
    if (fs.existsSync(filePath)) {
      console.log(`📁 기존 데이터 로드: ${fileName}`);
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }

    console.log(
      `📥 데이터 다운로드 시작: ${market} (${startDate} ~ ${endDate})`
    );

    const allCandles = [];
    let currentDate = new Date(endDate);
    const start = new Date(startDate);

    while (currentDate > start) {
      await this.rateLimit();

      try {
        const response = await axios.get(
          `${this.baseUrl}/v1/candles/${unit}/${count}`,
          {
            params: {
              market: market,
              to: currentDate.toISOString(),
              count: 200, // 최대 200개씩
            },
            headers: {
              Accept: "application/json",
            },
          }
        );

        const candles = response.data;
        if (!candles || candles.length === 0) break;

        allCandles.unshift(...candles);

        // 가장 오래된 캔들의 시간으로 이동
        const oldestCandle = candles[candles.length - 1];
        currentDate = new Date(oldestCandle.candle_date_time_kst);

        console.log(
          `📊 ${market}: ${allCandles.length}개 캔들 수집됨 (${oldestCandle.candle_date_time_kst})`
        );

        // 시작 날짜에 도달했으면 중단
        if (currentDate <= start) break;

        // 너무 빠른 요청 방지
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ ${market} 데이터 다운로드 실패: ${error.message}`);
        break;
      }
    }

    // 시작 날짜 이후 데이터만 필터링
    const filteredCandles = allCandles.filter((candle) => {
      const candleDate = new Date(candle.candle_date_time_kst);
      return candleDate >= start && candleDate <= new Date(endDate);
    });

    // 파일 저장
    const dataToSave = {
      market,
      unit,
      count,
      startDate,
      endDate,
      totalCandles: filteredCandles.length,
      downloadedAt: new Date().toISOString(),
      candles: filteredCandles,
    };

    fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
    console.log(`💾 ${fileName} 저장 완료 (${filteredCandles.length}개 캔들)`);

    return dataToSave;
  }

  // 여러 마켓의 데이터 일괄 다운로드
  async downloadMultipleMarkets(
    markets,
    startDate,
    endDate,
    unit = "minutes",
    count = 1
  ) {
    const results = {};

    for (let i = 0; i < markets.length; i++) {
      const market = markets[i];
      console.log(`📈 [${i + 1}/${markets.length}] ${market} 처리 중...`);

      try {
        results[market] = await this.downloadCandles(
          market,
          startDate,
          endDate,
          unit,
          count
        );
      } catch (error) {
        console.error(`❌ ${market} 다운로드 실패: ${error.message}`);
        results[market] = { error: error.message };
      }
    }

    return results;
  }

  // 마켓 목록 조회
  async getAvailableMarkets() {
    try {
      const response = await axios.get(`${this.baseUrl}/v1/market/all`);
      const markets = response.data;

      // KRW 마켓만 필터링
      const krwMarkets = markets
        .filter((market) => market.market.startsWith("KRW-"))
        .map((market) => market.market);

      return krwMarkets;
    } catch (error) {
      throw new Error(`마켓 목록 조회 실패: ${error.message}`);
    }
  }

  // 다운로드된 데이터 목록 조회
  getDownloadedDataList() {
    try {
      const files = fs.readdirSync(this.dataDir);
      const dataFiles = files
        .filter((file) => file.endsWith(".json"))
        .map((file) => {
          const filePath = path.join(this.dataDir, file);
          const stat = fs.statSync(filePath);

          // 파일명에서 정보 추출
          const parts = file.replace(".json", "").split("_");
          const market = parts[0];
          const unit = parts[1];
          const startDate = parts[2];
          const endDate = parts[3];

          return {
            fileName: file,
            market,
            unit,
            startDate,
            endDate,
            size: stat.size,
            createdAt: stat.mtime,
            path: filePath,
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);

      return dataFiles;
    } catch (error) {
      console.error(`데이터 목록 조회 실패: ${error.message}`);
      return [];
    }
  }

  // 특정 데이터 파일 로드
  loadDataFile(fileName) {
    try {
      const filePath = path.join(this.dataDir, fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`파일을 찾을 수 없습니다: ${fileName}`);
      }

      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      throw new Error(`데이터 로드 실패: ${error.message}`);
    }
  }

  // 백테스트용 데이터 래퍼 생성
  createBacktestData(markets, startDate, endDate) {
    const dataCache = {};

    // 각 마켓의 데이터 로드
    markets.forEach((market) => {
      const fileName = `${market}_minutes1_${startDate}_${endDate}.json`;
      try {
        const data = this.loadDataFile(fileName);
        dataCache[market] = data.candles;
      } catch (error) {
        console.warn(
          `⚠️ ${market} 데이터를 찾을 수 없습니다: ${error.message}`
        );
        dataCache[market] = [];
      }
    });

    return new BacktestDataWrapper(dataCache, markets);
  }

  // 데이터 품질 검증
  validateData(fileName) {
    try {
      const data = this.loadDataFile(fileName);
      const candles = data.candles;

      if (!candles || !Array.isArray(candles)) {
        return { valid: false, error: "캔들 데이터가 없습니다" };
      }

      // 시간 연속성 검증
      const gaps = [];
      for (let i = 1; i < candles.length; i++) {
        const prev = new Date(candles[i - 1].candle_date_time_kst);
        const curr = new Date(candles[i].candle_date_time_kst);
        const expectedDiff = 60 * 1000; // 1분 간격

        const actualDiff = Math.abs(curr - prev);
        if (actualDiff > expectedDiff * 1.5) {
          // 1.5분 이상 차이
          gaps.push({
            index: i,
            prev: candles[i - 1].candle_date_time_kst,
            curr: candles[i].candle_date_time_kst,
            gap: actualDiff / 1000 / 60, // 분 단위
          });
        }
      }

      return {
        valid: gaps.length === 0,
        totalCandles: candles.length,
        timeRange: {
          start: candles[0]?.candle_date_time_kst,
          end: candles[candles.length - 1]?.candle_date_time_kst,
        },
        gaps: gaps,
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // 저장 공간 정리
  cleanupOldData(daysToKeep = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const files = fs.readdirSync(this.dataDir);
      let deletedCount = 0;

      files.forEach((file) => {
        const filePath = path.join(this.dataDir, file);
        const stat = fs.statSync(filePath);

        if (stat.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      });

      console.log(`🗑️ ${deletedCount}개의 오래된 데이터 파일을 삭제했습니다`);
      return deletedCount;
    } catch (error) {
      console.error(`데이터 정리 실패: ${error.message}`);
      return 0;
    }
  }
}

/**
 * 백테스트용 데이터 래퍼
 */
class BacktestDataWrapper {
  constructor(dataCache, markets) {
    this.dataCache = dataCache;
    this.markets = markets;
    this.mockAccounts = {};
    this.mockOrders = {};
    this.orderCounter = 0;
  }

  // 캔들 데이터 조회
  getCandles(market, count, currentTime) {
    const candles = this.dataCache[market] || [];

    // 현재 시간 기준으로 과거 데이터 반환
    const currentIndex = candles.findIndex(
      (candle) => new Date(candle.candle_date_time_kst) <= new Date(currentTime)
    );

    if (currentIndex === -1) return [];

    return candles.slice(
      Math.max(0, currentIndex - count + 1),
      currentIndex + 1
    );
  }

  // 티커 데이터 조회
  getTicker(market, currentTime) {
    const candles = this.getCandles(market, 1, currentTime);
    if (candles.length === 0) return null;

    const candle = candles[0];
    return [
      {
        market: market,
        trade_price: candle.trade_price,
        acc_trade_price_24h: candle.candle_acc_trade_price,
        // 필요한 다른 필드들...
      },
    ];
  }

  // 호가 데이터 조회 (모의)
  getOrderbook(market, currentTime) {
    const ticker = this.getTicker(market, currentTime);
    if (!ticker || ticker.length === 0) return null;

    const price = ticker[0].trade_price;
    const spread = price * 0.001; // 0.1% 스프레드 가정

    return [
      {
        market: market,
        orderbook_units: [
          {
            ask_price: price + spread,
            bid_price: price - spread,
            ask_size: 1.0,
            bid_size: 1.0,
          },
        ],
      },
    ];
  }

  // 마켓 목록
  getAllMarkets() {
    return this.markets.map((market) => ({ market }));
  }

  // 모의 계좌 정보
  getAccounts() {
    return Object.values(this.mockAccounts);
  }

  // 모의 주문
  placeOrder(params) {
    const uuid = `mock_${++this.orderCounter}`;
    this.mockOrders[uuid] = {
      uuid,
      ...params,
      state: "done",
      executed_volume: params.volume,
      created_at: new Date().toISOString(),
    };
    return { uuid };
  }

  // 모의 주문 조회
  getOrder(uuid) {
    return this.mockOrders[uuid] || null;
  }

  // 모의 주문 취소
  cancelOrder(uuid) {
    if (this.mockOrders[uuid]) {
      this.mockOrders[uuid].state = "cancel";
    }
    return { success: true };
  }

  // 활성 주문 조회
  getOrders(state) {
    return Object.values(this.mockOrders).filter(
      (order) => order.state === state
    );
  }
}

module.exports = { HistoricalDataProvider, BacktestDataWrapper };
