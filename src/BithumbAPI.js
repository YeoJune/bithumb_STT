const crypto = require("crypto");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const querystring = require("querystring");
const { v4: uuidv4 } = require("uuid");

/**
 * 빗썸 API 통신 및 데이터 소스 관리
 * 실거래와 백테스트 모드를 지원
 *
 * 지원하는 API:
 * - Public API: 마켓 정보, 캔들 데이터, 체결 내역, 현재가, 호가, 경보제
 * - Private API: 계좌 조회, 주문 관리, 주문 가능 정보
 *
 * 지원하지 않는 API (별도 클래스에서 구현):
 * - 입금/출금 관련 API
 * - 기타 API (입출금 현황, API 키 리스트)
 */
class BithumbAPI {
  constructor(config = {}) {
    this.accessKey = config.accessKey;
    this.secretKey = config.secretKey;
    this.baseUrl = config.baseUrl || "https://api.bithumb.com";
    this.isLive = config.isLive !== false; // 기본값은 실거래 모드

    // Rate limiting
    this.requestCount = 0;
    this.lastRequestTime = 0;

    // 백테스트용 데이터
    this.backtestData = config.backtestData || null;
    this.currentTime = config.currentTime || null;
  }

  // JWT 인증
  generateJWT(query = null) {
    if (!this.isLive) return null; // 백테스트 모드에서는 JWT 불필요

    const payload = {
      access_key: this.accessKey,
      nonce: uuidv4(),
      timestamp: Date.now(),
    };

    if (query) {
      const hash = crypto
        .createHash("SHA512")
        .update(query, "utf-8")
        .digest("hex");
      payload.query_hash = hash;
      payload.query_hash_alg = "SHA512";
    }

    return jwt.sign(payload, this.secretKey);
  }

  // 속도 제한
  async rateLimit() {
    if (!this.isLive) return; // 백테스트 모드에서는 rate limit 불필요

    const now = Date.now();
    if (now - this.lastRequestTime > 1000) {
      this.requestCount = 0;
      this.lastRequestTime = now;
    }
    if (this.requestCount >= 100) {
      await new Promise((r) =>
        setTimeout(r, 1000 - (now - this.lastRequestTime))
      );
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
    }
    this.requestCount++;
    await new Promise((r) => setTimeout(r, 50));
  }

  // Public API 호출
  async publicApi(endpoint, params = {}) {
    if (!this.isLive) {
      // 백테스트 모드에서는 저장된 데이터 반환
      return this.getBacktestData(endpoint, params);
    }

    await this.rateLimit();
    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        params,
        headers: { accept: "application/json" },
      });
      return response.data;
    } catch (error) {
      throw new Error(
        `Public API 오류: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  // Private API 호출
  async privateApi(method, endpoint, params = {}) {
    if (!this.isLive) {
      // 백테스트 모드에서는 모의 응답 반환
      return this.getMockResponse(method, endpoint, params);
    }

    await this.rateLimit();
    try {
      const query = querystring.encode(params);
      const jwtToken = this.generateJWT(query);
      const config = {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
      };

      let response;
      if (method === "GET") {
        const url = query
          ? `${this.baseUrl}${endpoint}?${query}`
          : `${this.baseUrl}${endpoint}`;
        response = await axios.get(url, config);
      } else if (method === "POST") {
        response = await axios.post(
          `${this.baseUrl}${endpoint}`,
          params,
          config
        );
      } else if (method === "DELETE") {
        const url = `${this.baseUrl}${endpoint}?${query}`;
        response = await axios.delete(url, config);
      }

      return response.data;
    } catch (error) {
      throw new Error(
        `Private API 오류: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  // 백테스트용 데이터 조회
  getBacktestData(endpoint, params) {
    if (!this.backtestData) {
      throw new Error("백테스트 데이터가 설정되지 않았습니다");
    }

    // 엔드포인트별 데이터 반환 로직
    if (endpoint === "/v1/ticker") {
      return this.backtestData.getTicker(params.markets, this.currentTime);
    } else if (endpoint.startsWith("/v1/candles/minutes/")) {
      const unit = endpoint.split("/").pop();
      return this.backtestData.getCandles(
        params.market,
        params.count,
        this.currentTime,
        unit
      );
    } else if (endpoint === "/v1/candles/days") {
      return this.backtestData.getDayCandles(
        params.market,
        params.count,
        this.currentTime
      );
    } else if (endpoint === "/v1/candles/weeks") {
      return this.backtestData.getWeekCandles(
        params.market,
        params.count,
        this.currentTime
      );
    } else if (endpoint === "/v1/candles/months") {
      return this.backtestData.getMonthCandles(
        params.market,
        params.count,
        this.currentTime
      );
    } else if (endpoint === "/v1/trades/ticks") {
      return this.backtestData.getTrades(
        params.market,
        params.count,
        this.currentTime
      );
    } else if (endpoint === "/v1/orderbook") {
      return this.backtestData.getOrderbook(params.markets, this.currentTime);
    } else if (endpoint === "/v1/market/all") {
      return this.backtestData.getAllMarkets();
    } else if (endpoint === "/v1/market/virtual_asset_warning") {
      return this.backtestData.getMarketWarnings();
    }

    throw new Error(`지원하지 않는 백테스트 엔드포인트: ${endpoint}`);
  }

  // 백테스트용 모의 응답
  getMockResponse(method, endpoint, params) {
    // 모의 계좌 정보, 주문 응답 등
    if (endpoint === "/v1/accounts") {
      return this.backtestData.getAccounts();
    } else if (endpoint === "/v1/orders/chance") {
      return this.backtestData.getOrderChance(params.market);
    } else if (endpoint === "/v1/orders" && method === "GET") {
      return this.backtestData.getOrders(params);
    } else if (endpoint === "/v1/orders" && method === "POST") {
      return this.backtestData.placeOrder(params);
    } else if (endpoint === "/v1/order" && method === "GET") {
      return this.backtestData.getOrder(params.uuid);
    } else if (endpoint === "/v1/order" && method === "DELETE") {
      return this.backtestData.cancelOrder(params.uuid);
    }

    throw new Error(`지원하지 않는 백테스트 메서드: ${method} ${endpoint}`);
  }

  // 거래량 순 마켓 조회
  async getMarketsByVolume() {
    try {
      const markets = await this.publicApi("/v1/market/all", {
        isDetails: false,
      });
      const krwMarkets = markets.filter((m) => m.market.startsWith("KRW-"));
      const marketCodes = krwMarkets.map((m) => m.market).join(",");
      const tickers = await this.publicApi("/v1/ticker", {
        markets: marketCodes,
      });

      return tickers
        .sort(
          (a, b) =>
            parseFloat(b.acc_trade_price_24h) -
            parseFloat(a.acc_trade_price_24h)
        )
        .map((t) => t.market);
    } catch (error) {
      throw new Error(`마켓 조회 실패: ${error.message}`);
    }
  }

  // 캔들 데이터 조회
  async getCandles(market, count) {
    return await this.publicApi(`/v1/candles/minutes/1`, {
      market,
      count,
    });
  }

  // 티커 조회
  async getTicker(market) {
    const tickers = await this.publicApi("/v1/ticker", {
      markets: market,
    });
    return tickers[0];
  }

  // 호가 조회
  async getOrderbook(market) {
    const orderbooks = await this.publicApi("/v1/orderbook", {
      markets: market,
    });
    return orderbooks[0];
  }

  // ===========================================
  // Public API 추가 메서드들
  // ===========================================

  // 전체 마켓 코드 조회
  async getAllMarkets(isDetails = false) {
    return await this.publicApi("/v1/market/all", { isDetails });
  }

  // 분 캔들 조회 (다양한 단위 지원)
  async getMinuteCandles(unit, market, to = null, count = 1) {
    const params = { market, count };
    if (to) params.to = to;
    return await this.publicApi(`/v1/candles/minutes/${unit}`, params);
  }

  // 일 캔들 조회
  async getDayCandles(
    market,
    to = null,
    count = 1,
    convertingPriceUnit = null
  ) {
    const params = { market, count };
    if (to) params.to = to;
    if (convertingPriceUnit) params.convertingPriceUnit = convertingPriceUnit;
    return await this.publicApi("/v1/candles/days", params);
  }

  // 주 캔들 조회
  async getWeekCandles(market, to = null, count = 1) {
    const params = { market, count };
    if (to) params.to = to;
    return await this.publicApi("/v1/candles/weeks", params);
  }

  // 월 캔들 조회
  async getMonthCandles(market, to = null, count = 1) {
    const params = { market, count };
    if (to) params.to = to;
    return await this.publicApi("/v1/candles/months", params);
  }

  // 최근 체결 내역 조회
  async getTrades(market, to = null, count = 1, cursor = null, daysAgo = null) {
    const params = { market, count };
    if (to) params.to = to;
    if (cursor) params.cursor = cursor;
    if (daysAgo) params.daysAgo = daysAgo;
    return await this.publicApi("/v1/trades/ticks", params);
  }

  // 현재가 정보 조회 (복수 마켓 지원)
  async getTickers(markets) {
    if (Array.isArray(markets)) {
      markets = markets.join(",");
    }
    return await this.publicApi("/v1/ticker", { markets });
  }

  // 호가 정보 조회 (복수 마켓 지원)
  async getOrderbooks(markets) {
    if (Array.isArray(markets)) {
      markets = markets.join(",");
    }
    return await this.publicApi("/v1/orderbook", { markets });
  }

  // 경보제 조회
  async getMarketWarnings() {
    return await this.publicApi("/v1/market/virtual_asset_warning");
  }

  // ===========================================
  // Private API 추가 메서드들
  // ===========================================

  // 계좌 조회
  async getAccounts() {
    return await this.privateApi("GET", "/v1/accounts");
  }

  // 주문 가능 정보 조회
  async getOrderChance(market) {
    return await this.privateApi("GET", "/v1/orders/chance", { market });
  }

  // 주문 조회
  async getOrders(
    market = null,
    uuids = null,
    state = null,
    states = null,
    page = 1,
    limit = 100,
    orderBy = "desc"
  ) {
    const params = { page, limit, order_by: orderBy };
    if (market) params.market = market;
    if (uuids) params.uuids = Array.isArray(uuids) ? uuids : [uuids];
    if (state) params.state = state;
    if (states) params.states = Array.isArray(states) ? states : [states];
    return await this.privateApi("GET", "/v1/orders", params);
  }

  // 개별 주문 조회
  async getOrder(uuid) {
    return await this.privateApi("GET", "/v1/order", { uuid });
  }

  // 주문 등록
  async placeOrder(market, side, volume = null, price = null, ordType) {
    const params = {
      market,
      side,
      ord_type: ordType,
    };

    if (volume) params.volume = volume.toString();
    if (price) params.price = price.toString();

    return await this.privateApi("POST", "/v1/orders", params);
  }

  // 주문 취소
  async cancelOrder(uuid) {
    return await this.privateApi("DELETE", "/v1/order", { uuid });
  }

  // ===========================================
  // 편의 메서드들 (기존 호환성 유지)
  // ===========================================

  // 1분봉 캔들 조회 (기존 호환성)
  async getCandles(market, count) {
    return await this.getMinuteCandles(1, market, null, count);
  }

  // 단일 마켓 티커 조회 (기존 호환성)
  async getTicker(market) {
    const tickers = await this.getTickers(market);
    return Array.isArray(tickers) ? tickers[0] : tickers;
  }

  // 단일 마켓 호가 조회 (기존 호환성)
  async getOrderbook(market) {
    const orderbooks = await this.getOrderbooks(market);
    return Array.isArray(orderbooks) ? orderbooks[0] : orderbooks;
  }

  // 백테스트 시간 설정
  setCurrentTime(time) {
    this.currentTime = time;
  }

  // 백테스트 데이터 설정
  setBacktestData(backtestData) {
    this.backtestData = backtestData;
  }
}

module.exports = BithumbAPI;
