const fs = require("fs");
const path = require("path");

/**
 * 백테스트용 데이터 제공자
 * BithumbAPI와 동일한 인터페이스를 제공하여
 * 저장된 데이터를 사용한 백테스트 실행
 */
class BacktestDataProvider {
  constructor(config = {}) {
    this.dataDir = config.dataDir || path.join(process.cwd(), "backtest_data");
    this.currentTime = config.currentTime || new Date();
    this.candleData = {};
    this.mockAccounts = {
      KRW: {
        currency: "KRW",
        balance: config.initialBalance || 1000000,
        locked: 0,
      },
    };
    this.mockOrders = {};
    this.orderCounter = 0;
  }

  // 캔들 데이터 로드
  loadCandleData(market, startDate, endDate, unit = 1) {
    const fileName = `${market}_candles_${unit}m_${startDate}_${endDate}.json`;
    const filePath = path.join(this.dataDir, fileName);

    if (!fs.existsSync(filePath)) {
      throw new Error(`백테스트 데이터 파일이 없습니다: ${fileName}`);
    }

    this.candleData[`${market}_${unit}`] = JSON.parse(
      fs.readFileSync(filePath, "utf8")
    );
  }

  // 현재 시점의 캔들 데이터 조회
  async getCandles(market, count = 1, to = null, unit = 1) {
    const key = `${market}_${unit}`;
    if (!this.candleData[key]) {
      return [];
    }

    const targetTime = to ? new Date(to) : this.currentTime;
    const candles = this.candleData[key];

    // 현재 시점 이전의 캔들들만 필터링
    const validCandles = candles.filter(
      (candle) => new Date(candle.candle_date_time_kst) <= targetTime
    );

    // 최신순으로 정렬하고 count만큼 반환
    return validCandles
      .sort(
        (a, b) =>
          new Date(b.candle_date_time_kst) - new Date(a.candle_date_time_kst)
      )
      .slice(0, count);
  }

  // 최적화된 캔들 조회 (단위 자동 선택)
  async getOptimizedCandles(market, requiredMinutes, to = null) {
    // 지원되는 단위들 중 가장 큰 약수 찾기
    const units = [240, 60, 30, 15, 10, 5, 3, 1];
    const unit = units.find((u) => requiredMinutes % u === 0) || 1;
    const count = Math.ceil(requiredMinutes / unit);

    return await this.getCandles(market, count, to, unit);
  }

  // 일봉 조회
  async getDayCandles(market, count = 1, to = null) {
    return await this.getCandles(market, count, to, 1440); // 1일 = 1440분
  }

  // 현재가 조회 (현재 시점의 최신 캔들 가격)
  async getTicker(markets) {
    if (typeof markets === "string") {
      markets = markets.split(",");
    }

    const results = [];
    for (const market of markets) {
      const candles = await this.getCandles(market.trim(), 1);
      if (candles.length > 0) {
        const candle = candles[0];
        results.push({
          market: market.trim(),
          trade_price: candle.trade_price,
          trade_timestamp: new Date(candle.candle_date_time_kst).getTime(),
          opening_price: candle.opening_price,
          high_price: candle.high_price,
          low_price: candle.low_price,
          prev_closing_price: candle.prev_closing_price || candle.trade_price,
          acc_trade_price_24h: candle.candle_acc_trade_price,
          acc_trade_volume_24h: candle.candle_acc_trade_volume,
          timestamp: new Date(candle.candle_date_time_kst).getTime(),
        });
      }
    }

    return markets.length === 1 ? results[0] : results;
  }

  // 호가 조회 (모의 데이터)
  async getOrderbook(markets) {
    const ticker = await this.getTicker(markets);
    const price = parseFloat(ticker.trade_price);

    return {
      market: ticker.market,
      timestamp: Date.now(),
      total_ask_size: 100,
      total_bid_size: 100,
      orderbook_units: [
        {
          ask_price: price * 1.001,
          bid_price: price * 0.999,
          ask_size: 10,
          bid_size: 10,
        },
      ],
    };
  }

  // 체결 내역 조회 (모의 데이터)
  async getTrades(market, count = 1) {
    const ticker = await this.getTicker(market);
    const results = [];

    for (let i = 0; i < count; i++) {
      results.push({
        market: market,
        trade_price: ticker.trade_price,
        trade_volume: Math.random() * 10,
        timestamp: Date.now() - i * 1000,
        ask_bid: Math.random() > 0.5 ? "BID" : "ASK",
      });
    }

    return results;
  }

  // === Private API 메서드들 (모의) ===

  // 계좌 조회
  async getAccounts() {
    return Object.values(this.mockAccounts);
  }

  // 주문하기
  async placeOrder(params) {
    const uuid = `backtest_${++this.orderCounter}`;
    const order = {
      uuid,
      market: params.market,
      side: params.side,
      ord_type: params.ord_type,
      volume: params.volume,
      price: params.price || "0",
      state: "done",
      executed_volume: params.volume,
      created_at: this.currentTime.toISOString(),
    };

    this.mockOrders[uuid] = order;

    // 계좌 잔액 업데이트 (간단한 로직)
    if (params.side === "bid") {
      // 매수: KRW 차감, 코인 추가
      const cost = parseFloat(params.price) * parseFloat(params.volume);
      this.mockAccounts.KRW.balance -= cost;

      const currency = params.market.split("-")[1];
      if (!this.mockAccounts[currency]) {
        this.mockAccounts[currency] = { currency, balance: 0, locked: 0 };
      }
      this.mockAccounts[currency].balance += parseFloat(params.volume);
    } else {
      // 매도: 코인 차감, KRW 추가
      const revenue = parseFloat(params.price) * parseFloat(params.volume);
      this.mockAccounts.KRW.balance += revenue;

      const currency = params.market.split("-")[1];
      if (this.mockAccounts[currency]) {
        this.mockAccounts[currency].balance -= parseFloat(params.volume);
      }
    }

    return order;
  }

  // 주문 조회
  async getOrder(uuid) {
    return this.mockOrders[uuid] || null;
  }

  // 주문 목록 조회
  async getOrders(state = null, market = null) {
    return Object.values(this.mockOrders).filter((order) => {
      if (state && order.state !== state) return false;
      if (market && order.market !== market) return false;
      return true;
    });
  }

  // 주문 취소
  async cancelOrder(uuid) {
    if (this.mockOrders[uuid]) {
      this.mockOrders[uuid].state = "cancel";
      return { success: true };
    }
    return { success: false };
  }

  // 시간 설정 (백테스트용)
  setCurrentTime(time) {
    this.currentTime = new Date(time);
  }

  // 백테스트 상태 초기화
  resetBacktestState(initialBalance = 1000000) {
    this.mockAccounts = {
      KRW: { currency: "KRW", balance: initialBalance, locked: 0 },
    };
    this.mockOrders = {};
    this.orderCounter = 0;
  }

  // 마켓 코드 조회 (백테스트용)
  async getMarkets(isDetails = false) {
    // 백테스트에서는 로드된 캔들 데이터 기반으로 마켓 목록 반환
    const markets = [];
    for (const key of Object.keys(this.candleData)) {
      const market = key.split("_")[0]; // "KRW-BTC_5" -> "KRW-BTC"
      if (!markets.includes(market)) {
        markets.push({
          market: market,
          korean_name: market.replace("KRW-", ""),
          english_name: market.replace("KRW-", ""),
        });
      }
    }
    return markets;
  }

  // 거래량 순 마켓 조회 (백테스트용)
  async getMarketsByVolume() {
    try {
      const markets = await this.getMarkets(false);
      const krwMarkets = markets.filter((m) => m.market.startsWith("KRW-"));
      const marketCodes = krwMarkets.map((m) => m.market);
      const tickers = await this.getTicker(marketCodes);

      return tickers
        .sort(
          (a, b) =>
            parseFloat(b.acc_trade_price_24h || 0) -
            parseFloat(a.acc_trade_price_24h || 0)
        )
        .map((t) => t.market);
    } catch (error) {
      // 백테스트에서는 에러 발생 시 기본 마켓 목록 반환
      return Object.keys(this.candleData)
        .map((key) => key.split("_")[0])
        .filter((value, index, self) => self.indexOf(value) === index);
    }
  }
}

module.exports = BacktestDataProvider;
