const crypto = require("crypto");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const querystring = require("querystring");
const { v4: uuidv4 } = require("uuid");

/**
 * 빗썸 API 클라이언트
 * 순수하게 API 호출만 담당
 */
class BithumbAPI {
  constructor(config = {}) {
    this.accessKey = config.accessKey;
    this.secretKey = config.secretKey;
    this.baseUrl = config.baseUrl || "https://api.bithumb.com";

    // Rate limiting 설정
    this.rateLimitAmount = config.api?.rateLimit || 100;
    this.rateLimitInterval = config.api?.rateLimitInterval || 1000;
    this.requestCount = 0;
    this.lastRequestTime = 0;
  }

  // JWT 인증
  generateJWT(query = null) {
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
    const now = Date.now();
    if (now - this.lastRequestTime > this.rateLimitInterval) {
      this.requestCount = 0;
      this.lastRequestTime = now;
    }
    if (this.requestCount >= this.rateLimitAmount) {
      await new Promise((r) =>
        setTimeout(r, this.rateLimitInterval - (now - this.lastRequestTime))
      );
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
    }
    this.requestCount++;
  }

  // Public API 호출
  async publicApi(endpoint, params = {}) {
    await this.rateLimit();
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await axios.get(url, { params });
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

  // === Public API 메서드들 ===

  // 마켓 코드 조회
  async getMarkets(isDetails = false) {
    return await this.publicApi("/v1/market/all", { isDetails });
  }

  // 캔들 조회 (기본 1분 단위)
  async getCandles(market, count = 1, to = null, unit = 1) {
    const params = { market, count };
    if (to) params.to = to;
    return await this.publicApi(`/v1/candles/minutes/${unit}`, params);
  }

  // 최적화된 캔들 조회 (필요한 분 수에 따라 단위 자동 선택)
  async getOptimizedCandles(market, requiredMinutes, to = null) {
    // 지원되는 단위들 중 가장 큰 약수 찾기
    const units = [240, 60, 30, 15, 10, 5, 3, 1];
    const unit = units.find((u) => requiredMinutes % u === 0) || 1;
    const count = Math.ceil(requiredMinutes / unit);

    const params = { market, count };
    if (to) params.to = to;

    return await this.publicApi(`/v1/candles/minutes/${unit}`, params);
  }

  // 일봉 조회
  async getDayCandles(market, count = 1, to = null) {
    const params = { market, count };
    if (to) params.to = to;
    return await this.publicApi("/v1/candles/days", params);
  }

  // 현재가 조회
  async getTicker(markets) {
    if (Array.isArray(markets)) {
      markets = markets.join(",");
    }
    return await this.publicApi("/v1/ticker", { markets });
  }

  // 호가 조회
  async getOrderbook(markets) {
    if (Array.isArray(markets)) {
      markets = markets.join(",");
    }
    return await this.publicApi("/v1/orderbook", { markets });
  }

  // 체결 내역 조회
  async getTrades(market, count = 1) {
    return await this.publicApi("/v1/trades/ticks", { market, count });
  }

  // === Private API 메서드들 ===

  // 계좌 조회
  async getAccounts() {
    return await this.privateApi("GET", "/v1/accounts");
  }

  // 주문 조회
  async getOrder(uuid) {
    return await this.privateApi("GET", "/v1/order", { uuid });
  }

  // 주문 목록 조회
  async getOrders(state = null, market = null) {
    const params = {};
    if (state) params.state = state;
    if (market) params.market = market;
    return await this.privateApi("GET", "/v1/orders", params);
  }

  // 주문하기
  async placeOrder(params) {
    return await this.privateApi("POST", "/v1/orders", params);
  }

  // 주문 취소
  async cancelOrder(uuid) {
    return await this.privateApi("DELETE", "/v1/order", { uuid });
  }

  // 주문 가능 정보
  async getOrderChance(market) {
    return await this.privateApi("GET", "/v1/orders/chance", { market });
  }

  // === 편의 메서드들 ===

  // 거래량 순 마켓 조회
  async getMarketsByVolume() {
    try {
      const markets = await this.getMarkets(false);
      const krwMarkets = markets.filter((m) => m.market.startsWith("KRW-"));
      const marketCodes = krwMarkets.map((m) => m.market).join(",");
      const tickers = await this.getTicker(marketCodes);

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
}

module.exports = BithumbAPI;
