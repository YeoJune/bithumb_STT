const crypto = require("crypto");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const querystring = require("querystring");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

class BithumbTradingBot {
  constructor(config = {}) {
    this.accessKey = process.env.BITHUMB_ACCESS_KEY;
    this.secretKey = process.env.BITHUMB_SECRET_KEY;

    if (!this.accessKey || !this.secretKey) {
      console.log(
        "❌ .env 파일에 BITHUMB_ACCESS_KEY, BITHUMB_SECRET_KEY 설정 필요"
      );
      process.exit(1);
    }

    this.buyAmount = config.buyAmount || 10000;
    this.profitRatio = config.profitRatio || 0.05;
    this.lossRatio = config.lossRatio || 0.025;
    this.buyFeeRate = 0.0004; // 매수 수수료 0.04%
    this.sellFeeRate = 0.0004; // 매도 수수료 0.04%
    this.timeframes = config.timeframes || {
      short: 15,
      long: 60,
      shortThreshold: 1.2,
      longThreshold: 1.2,
    };

    this.baseUrl = "https://api.bithumb.com";
    this.requestCount = 0;
    this.lastRequestTime = 0;

    this.dataFile = path.join(__dirname, "bot_data.json");
    this.logFile = path.join(
      __dirname,
      `logs/bot_${this.toKSTISOString(new Date()).slice(0, 10)}.log`
    );

    // 로그 디렉토리 생성
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // 먼저 stats 객체 초기화
    this.stats = {
      trades: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      startTime: Date.now(),
      currentScan: "",
      lastActivity: "",
    };

    // 그 다음에 데이터 로드
    this.loadPersistentData();

    // 키보드 입력 설정
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", this.handleKeypress.bind(this));
  }

  // 지속성 데이터 저장
  loadPersistentData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, "utf8"));
        this.holdings = data.holdings || {};

        // 통계 정보 복원
        if (data.stats) {
          this.stats.trades = data.stats.trades || 0;
          this.stats.wins = data.stats.wins || 0;
          this.stats.losses = data.stats.losses || 0;
          this.stats.totalProfit = data.stats.totalProfit || 0;
        }

        this.log(
          `📂 기존 데이터 로드: ${
            Object.keys(this.holdings).length
          }개 보유종목, ${this.stats.trades}회 거래이력`
        );
      } else {
        this.holdings = {};
        this.log("📂 새로운 데이터 파일 생성");
      }
    } catch (error) {
      this.log(`⚠️ 데이터 로드 실패: ${error.message}`);
      this.holdings = {};
    }
  }

  // 수수료를 고려한 실제 수익 계산
  calculateNetProfit(buyPrice, sellPrice, quantity) {
    const grossBuyAmount = buyPrice * quantity;
    const buyFee = grossBuyAmount * this.buyFeeRate;
    const totalBuyAmount = grossBuyAmount + buyFee;

    const grossSellAmount = sellPrice * quantity;
    const sellFee = grossSellAmount * this.sellFeeRate;
    const netSellAmount = grossSellAmount - sellFee;

    return netSellAmount - totalBuyAmount;
  }

  savePersistentData() {
    try {
      const data = {
        holdings: this.holdings,
        lastUpdate: new Date().toISOString(),
        stats: {
          trades: this.stats.trades,
          wins: this.stats.wins,
          losses: this.stats.losses,
          totalProfit: this.stats.totalProfit,
        },
      };
      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      this.log(`⚠️ 데이터 저장 실패: ${error.message}`);
    }
  }

  toKSTISOString(date = new Date()) {
    // UTC 기준 시간에 9시간 더하기
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);

    // ISO 문자열로 만들고 Z 대신 +09:00 붙이기
    return kst.toISOString().replace("Z", "+09:00");
  }

  // 로깅
  log(message) {
    const now = new Date();
    const kstTime = now.toLocaleTimeString("en-US", {
      hour12: false, // 24시간제
      timeZone: "Asia/Seoul",
    });
    const logMessage = `[${kstTime}] ${message}`;

    console.log(logMessage);

    try {
      const timestamp = this.toKSTISOString(now);
      const fileMessage = `${timestamp} ${message}\n`;
      fs.appendFileSync(this.logFile, fileMessage);
    } catch (error) {
      console.log(`⚠️ 로그 파일 저장 실패: ${error.message}`);
    }

    this.stats.lastActivity = message;
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

  // Public API
  async publicApi(endpoint, params = {}) {
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

  // Private API
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

  // 계좌의 모든 보유 종목 조회
  async getAllHoldings() {
    try {
      const accounts = await this.privateApi("GET", "/v1/accounts");
      const holdings = {};

      for (const account of accounts) {
        if (account.currency === "KRW" || account.currency === "P") continue;

        const balance = parseFloat(account.balance);
        const locked = parseFloat(account.locked);
        if (balance > 0 || locked > 0) {
          const market = `KRW-${account.currency}`;
          holdings[market] = {
            currency: account.currency,
            balance: balance,
            locked: locked,
            totalQty: balance + locked,
            avgBuyPrice: parseFloat(account.avg_buy_price || 0),
          };
        }
      }

      return holdings;
    } catch (error) {
      this.log(`계좌 조회 실패: ${error.message}`);
      return {};
    }
  }

  // 모든 활성 주문 조회
  async getAllActiveOrders() {
    try {
      const orders = await this.privateApi("GET", "/v1/orders", {
        state: "wait",
      });
      return orders || [];
    } catch (error) {
      this.log(`활성 주문 조회 실패: ${error.message}`);
      return [];
    }
  }

  // 완전한 상태 동기화
  async synchronizeState() {
    try {
      this.log("🔄 지갑과 bot_data 동기화 시작...");

      const [actualHoldings, activeOrders] = await Promise.all([
        this.getAllHoldings(),
        this.getAllActiveOrders(),
      ]);

      // 모든 관련 마켓 수집
      const allMarkets = new Set([
        ...Object.keys(actualHoldings),
        ...Object.keys(this.holdings),
        ...activeOrders.map((o) => o.market),
      ]);

      let syncCount = 0;

      for (const market of allMarkets) {
        const actualData = actualHoldings[market];
        const buyOrders = activeOrders.filter(
          (o) => o.market === market && o.side === "bid"
        );
        const sellOrders = activeOrders.filter(
          (o) => o.market === market && o.side === "ask"
        );
        const botData = this.holdings[market];

        // 상태 결정 및 동기화
        if (buyOrders.length > 0) {
          // 매수 주문 있음
          this.holdings[market] = {
            state: "buying",
            price: parseFloat(buyOrders[0].price),
            qty: parseFloat(buyOrders[0].volume),
            buyTime: botData?.buyTime || Date.now(),
            uuid: buyOrders[0].uuid,
          };
          syncCount++;
          this.log(`🔄 ${market} 매수 주문 동기화`);
        } else {
          // 매도 주문 있음
          const totalQty = actualData ? actualData.totalQty : 0;
          const lockedQty = actualData ? actualData.locked : 0;
          const availableQty = actualData ? actualData.balance : 0;

          if (availableQty < 0.00000001) {
            // 보유 중 + 매도 주문 있음
            const buyPrice =
              actualData.avgBuyPrice > 0
                ? actualData.avgBuyPrice
                : parseFloat(sellOrders[0].price) / (1 + this.profitRatio);

            this.holdings[market] = {
              state: "profit_waiting",
              price: buyPrice,
              balance: availableQty,
              locked: lockedQty,
              totalQty: totalQty,
              buyTime: botData?.buyTime || Date.now(),
              uuid: botData?.uuid || null,
              profitOrderUuid: sellOrders[0].uuid,
              profitTarget: parseFloat(sellOrders[0].price),
              recovered: true,
            };
            syncCount++;
            this.log(
              `🔄 ${market} 익절 대기 동기화: 총 ${totalQty}개 (가용 ${availableQty}, 주문중 ${lockedQty})`
            );
          } else {
            // 보유 중 + 익절 주문 없거나 수량 불일치 → 기존 주문 정리 후 새로 등록

            // 기존 매도 주문들 모두 취소
            for (const order of sellOrders) {
              try {
                await this.privateApi("DELETE", "/v1/order", {
                  uuid: order.uuid,
                });
                this.log(`🚫 ${market} 기존 매도주문 취소: ${order.uuid}`);
              } catch (error) {
                this.log(`⚠️ ${market} 주문 취소 실패: ${error.message}`);
              }
            }

            // 잠시 대기 후 새로운 익절 주문 등록
            await new Promise((r) => setTimeout(r, 500));

            const buyPrice =
              actualData.avgBuyPrice > 0 ? actualData.avgBuyPrice : 0;

            if (buyPrice > 0) {
              try {
                // 유효한 마켓인지 확인
                const tickers = await this.publicApi("/v1/ticker", {
                  markets: market,
                });

                if (
                  !tickers ||
                  tickers.length === 0 ||
                  !tickers[0] ||
                  !tickers[0].trade_price
                ) {
                  this.log(`⚠️ ${market} 유효하지 않은 마켓, 스킵`);
                  continue;
                }

                const profitTarget = buyPrice * (1 + this.profitRatio);
                const orderbook = await this.getOrderbook(market);
                const optimalPrice = this.getOptimalSellPrice(
                  orderbook,
                  profitTarget
                );

                const totalQty = actualData.totalQty;

                const profitOrder = await this.privateApi(
                  "POST",
                  "/v1/orders",
                  {
                    market,
                    side: "ask",
                    ord_type: "limit",
                    volume: totalQty.toString(),
                    price: optimalPrice.toString(),
                  }
                );

                this.holdings[market] = {
                  state: "profit_waiting",
                  price: buyPrice,
                  balance: 0, // 주문 등록 후 balance는 0이 됨
                  locked: totalQty, // 전체 수량이 locked됨
                  totalQty: totalQty,
                  buyTime: botData?.buyTime || Date.now(),
                  uuid: botData?.uuid || null,
                  profitOrderUuid: profitOrder.uuid,
                  profitTarget: optimalPrice,
                  recovered: true,
                };
                syncCount++;
                this.log(
                  `✨ ${market} 익절주문 등록: ${totalQty}개 @ ${optimalPrice.toLocaleString()}원`
                );
              } catch (error) {
                this.log(`⚠️ ${market} 익절주문 등록 실패: ${error.message}`);
              }
            } else {
              this.log(`⚠️ ${market} 매수가 정보 없음, 스킵`);
            }
          }
        }
      }

      this.savePersistentData();
      this.log(`✅ 동기화 완료: ${syncCount}개 항목 처리`);
    } catch (error) {
      this.log(`❌ 동기화 실패: ${error.message}`);
    }
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
      this.log(`마켓 조회 실패: ${error.message}`);
      return [];
    }
  }

  // 거래대금 급증 신호
  async getVolumeSignal(market) {
    try {
      const totalMinutes = this.timeframes.short + this.timeframes.long + 1;
      const candles = await this.publicApi(`/v1/candles/minutes/1`, {
        market,
        count: totalMinutes,
      });

      if (!candles || candles.length < totalMinutes) return null;

      const getVolume = (candle) => parseFloat(candle.candle_acc_trade_price);
      const currentVolume = getVolume(candles[0]);

      const shortCandles = candles.slice(1, this.timeframes.short + 1);
      const shortAvg =
        shortCandles.reduce((sum, candle) => sum + getVolume(candle), 0) /
        shortCandles.length;

      const longStart = this.timeframes.short + 1;
      const longEnd = longStart + this.timeframes.long;
      const longCandles = candles.slice(longStart, longEnd);
      const longAvg =
        longCandles.reduce((sum, candle) => sum + getVolume(candle), 0) /
        longCandles.length;

      const shortSignal =
        currentVolume > shortAvg * this.timeframes.shortThreshold;
      const longSignal = shortAvg > longAvg * this.timeframes.longThreshold;

      return {
        signal: shortSignal && longSignal,
        shortRatio: (currentVolume / shortAvg).toFixed(2),
        longRatio: (shortAvg / longAvg).toFixed(2),
      };
    } catch (error) {
      return null;
    }
  }

  // 매수 신호 확인
  async checkBuySignal(market) {
    this.stats.currentScan = `Scanning ${market}...`;
    const volumeSignal = await this.getVolumeSignal(market);
    if (!volumeSignal) return false;

    this.stats.currentScan = `${market} (${volumeSignal.shortRatio}x/${volumeSignal.longRatio}x)`;

    if (volumeSignal.signal) {
      this.log(
        `🎯 ${market} 거래대금 급증 (${volumeSignal.shortRatio}x/${volumeSignal.longRatio}x)`
      );
    }

    return volumeSignal.signal;
  }

  // 유효숫자 조정
  adjustNumber(volume) {
    if (volume <= 0) return 0;
    const str = volume.toExponential();
    const [mantissa, exponent] = str.split("e");
    const significant = parseFloat(mantissa).toFixed(2);
    return parseFloat(parseFloat(significant + "e" + exponent).toFixed(8));
  }

  // 호가 조회
  async getOrderbook(market) {
    try {
      const orderbooks = await this.publicApi("/v1/orderbook", {
        markets: market,
      });
      return orderbooks[0];
    } catch (error) {
      this.log(`호가 조회 실패 ${market}: ${error.message}`);
      return null;
    }
  }

  // 최적 매도가 계산
  getOptimalSellPrice(orderbook, targetPrice) {
    if (!orderbook?.orderbook_units) return targetPrice;

    for (const unit of orderbook.orderbook_units) {
      const askPrice = parseFloat(unit.ask_price);
      if (askPrice >= targetPrice) return askPrice;
    }
    return this.adjustNumber(targetPrice);
  }

  // 실제 보유 수량 조회 (balance와 locked 구분)
  async getActualHolding(market) {
    try {
      const accounts = await this.privateApi("GET", "/v1/accounts");
      const currency = market.split("-")[1];
      const account = accounts.find((acc) => acc.currency === currency);

      if (!account) {
        return { balance: 0, locked: 0, totalQty: 0 };
      }

      const balance = parseFloat(account.balance || 0);
      const locked = parseFloat(account.locked || 0);

      return {
        balance: balance,
        locked: locked,
        totalQty: balance + locked,
      };
    } catch (error) {
      this.log(`${market} 보유량 조회 실패: ${error.message}`);
      return { balance: 0, locked: 0, totalQty: 0 };
    }
  }

  // 매수 주문
  async buy(market) {
    if (this.buyAmount < 5000) return false;

    try {
      const [tickers, orderbook] = await Promise.all([
        this.publicApi("/v1/ticker", { markets: market }),
        this.getOrderbook(market),
      ]);

      let buyPrice = parseFloat(tickers[0].trade_price);
      if (orderbook?.orderbook_units?.length > 0) {
        buyPrice = parseFloat(orderbook.orderbook_units[0].ask_price);
      }

      const rawQty = this.buyAmount / buyPrice;
      const adjustedQty = this.adjustNumber(rawQty);

      if (adjustedQty <= 0) {
        this.log(`❌ ${market} 조정된 수량이 0입니다`);
        return false;
      }

      const buyOrder = await this.privateApi("POST", "/v1/orders", {
        market,
        side: "bid",
        ord_type: "limit",
        volume: adjustedQty.toString(),
        price: buyPrice.toString(),
      });

      this.holdings[market] = {
        state: "buying",
        price: buyPrice,
        qty: adjustedQty,
        buyTime: Date.now(),
        uuid: buyOrder.uuid,
      };

      this.savePersistentData();
      this.log(
        `✅ ${market} 매수주문: ${adjustedQty}개 @ ${buyPrice.toLocaleString()}원`
      );
      return true;
    } catch (error) {
      this.log(`❌ ${market} 매수 실패: ${error.message}`);
      return false;
    }
  }

  // 익절 주문 등록
  async registerProfitOrder(market, holding) {
    try {
      const holdingInfo = await this.getActualHolding(market);
      if (holdingInfo.totalQty <= 0) {
        this.log(`⚠️ ${market} 실제 보유량 없음, 홀딩 정리`);
        delete this.holdings[market];
        this.savePersistentData();
        return false;
      }

      // 이미 매도 주문이 있는지 확인
      if (holdingInfo.locked > 0) {
        this.log(`⚠️ ${market} 이미 매도 주문 중: ${holdingInfo.locked}개`);
        // 기존 매도 주문이 있다면 상태만 업데이트
        this.holdings[market] = {
          ...holding,
          state: "profit_waiting",
          balance: holdingInfo.balance,
          locked: holdingInfo.locked,
          totalQty: holdingInfo.totalQty,
        };
        this.savePersistentData();
        return true;
      }

      const profitTarget = holding.price * (1 + this.profitRatio);
      const orderbook = await this.getOrderbook(market);
      const optimalPrice = this.getOptimalSellPrice(orderbook, profitTarget);

      // 가용 수량(balance)으로만 매도 주문
      const profitOrder = await this.privateApi("POST", "/v1/orders", {
        market,
        side: "ask",
        ord_type: "limit",
        volume: holdingInfo.balance.toString(),
        price: optimalPrice.toString(),
      });

      this.holdings[market] = {
        ...holding,
        state: "profit_waiting",
        balance: 0, // 주문 등록 후 balance는 0
        locked: holdingInfo.balance, // 주문한 수량이 locked됨
        totalQty: holdingInfo.totalQty,
        profitOrderUuid: profitOrder.uuid,
        profitTarget: optimalPrice,
      };

      this.savePersistentData();
      this.log(
        `📈 ${market} 익절주문 등록: ${
          holdingInfo.balance
        }개 @ ${optimalPrice.toLocaleString()}원`
      );
      return true;
    } catch (error) {
      this.log(`⚠️ ${market} 익절주문 실패: ${error.message}`);
      return false;
    }
  }

  // 손절 매도
  async stopLoss(market, holding) {
    try {
      // 익절 주문 확실히 취소
      if (holding.profitOrderUuid) {
        let cancelSuccess = false;

        for (let i = 0; i < 3; i++) {
          try {
            await this.privateApi("DELETE", "/v1/order", {
              uuid: holding.profitOrderUuid,
            });
            this.log(`🚫 ${market} 익절주문 취소 완료`);
            cancelSuccess = true;
            break;
          } catch (error) {
            this.log(
              `⚠️ ${market} 익절주문 취소 시도 ${i + 1}/3 실패: ${
                error.message
              }`
            );
            if (i < 2) await new Promise((r) => setTimeout(r, 1000));
          }
        }

        if (!cancelSuccess) {
          try {
            const order = await this.privateApi("GET", "/v1/order", {
              uuid: holding.profitOrderUuid,
            });
            if (order.state === "done") {
              const profit =
                ((holding.profitTarget - holding.price) / holding.price) * 100;
              this.stats.trades++;
              this.stats.wins++;
              // 수수료를 고려한 실제 수익 계산
              const netProfit = this.calculateNetProfit(
                holding.price,
                holding.profitTarget,
                holding.totalQty || holding.qty
              );
              this.stats.totalProfit += netProfit;

              delete this.holdings[market];
              this.savePersistentData();

              this.log(`🎉 ${market} 익절 체결: +${profit.toFixed(2)}%`);
              return true;
            } else if (order.state === "cancel") {
              this.log(`✅ ${market} 익절주문 이미 취소됨`);
              cancelSuccess = true;
            } else {
              this.log(`❌ ${market} 익절주문 취소 불가, 손절 중단`);
              return false;
            }
          } catch (error) {
            this.log(
              `❌ ${market} 익절주문 상태 확인 실패, 손절 중단: ${error.message}`
            );
            return false;
          }
        }

        await new Promise((r) => setTimeout(r, 500));
      }

      // 실제 보유 수량 확인 후 시장가 매도
      const holdingInfo = await this.getActualHolding(market);
      const sellableQty = holdingInfo.balance + holdingInfo.locked; // 전체 수량으로 매도

      if (sellableQty <= 0) {
        this.log(`⚠️ ${market} 손절 시 보유량 없음`);
        delete this.holdings[market];
        this.savePersistentData();
        return false;
      }

      const sellOrder = await this.privateApi("POST", "/v1/orders", {
        market,
        side: "ask",
        ord_type: "market",
        volume: sellableQty.toString(),
      });

      const tickers = await this.publicApi("/v1/ticker", { markets: market });
      const currentPrice = parseFloat(tickers[0].trade_price);
      const profit = ((currentPrice - holding.price) / holding.price) * 100;

      this.stats.trades++;
      // 수수료를 고려한 실제 수익 계산
      const netProfit = this.calculateNetProfit(
        holding.price,
        currentPrice,
        sellableQty
      );
      this.stats.totalProfit += netProfit;
      if (profit > 0) this.stats.wins++;
      else this.stats.losses++;

      delete this.holdings[market];
      this.savePersistentData();

      this.log(
        `✅ ${market} 손절: ${profit > 0 ? "+" : ""}${profit.toFixed(2)}%`
      );
      return true;
    } catch (error) {
      this.log(`❌ ${market} 손절 실패: ${error.message}`);
      return false;
    }
  }

  // 주문 상태 확인
  async checkOrders() {
    for (const [market, holding] of Object.entries(this.holdings)) {
      try {
        if (holding.state === "buying") {
          // 매수 주문 확인
          const order = await this.privateApi("GET", "/v1/order", {
            uuid: holding.uuid,
          });
          if (order.state === "done") {
            const executedVolume = parseFloat(order.executed_volume);
            const avgPrice = parseFloat(order.price);

            this.log(
              `🎯 ${market} 매수 체결: ${executedVolume}개 @ ${avgPrice.toLocaleString()}원`
            );

            this.holdings[market] = {
              ...holding,
              state: "bought",
              balance: executedVolume,
              locked: 0,
              totalQty: executedVolume,
              price: avgPrice,
            };

            // 3초 후 익절 주문 등록
            await new Promise((r) => setTimeout(r, 3000));

            await this.registerProfitOrder(market, this.holdings[market]);
          }
        } else if (holding.state === "bought") {
          // bought 상태 → 익절 주문 등록
          await this.registerProfitOrder(market, this.holdings[market]);
        } else if (holding.state === "profit_waiting") {
          // 손절 조건 확인
          const tickers = await this.publicApi("/v1/ticker", {
            markets: market,
          });
          const currentPrice = parseFloat(tickers[0].trade_price);
          const lossTarget = holding.price * (1 - this.lossRatio);

          if (currentPrice <= lossTarget) {
            this.log(
              `🚨 ${market} 손절 조건: ${currentPrice.toLocaleString()}원 <= ${lossTarget.toLocaleString()}원`
            );
            await this.stopLoss(market, holding);
            continue;
          }

          // 익절 주문 확인
          if (holding.profitOrderUuid) {
            const profitOrder = await this.privateApi("GET", "/v1/order", {
              uuid: holding.profitOrderUuid,
            });
            if (profitOrder.state === "done") {
              const profit =
                ((holding.profitTarget - holding.price) / holding.price) * 100;

              this.stats.trades++;
              this.stats.wins++;
              // 수수료를 고려한 실제 수익 계산
              const netProfit = this.calculateNetProfit(
                holding.price,
                holding.profitTarget,
                holding.totalQty || holding.qty
              );
              this.stats.totalProfit += netProfit;

              delete this.holdings[market];
              this.savePersistentData();

              this.log(`🎉 ${market} 익절 체결: +${profit.toFixed(2)}%`);
            }
          }
        }
      } catch (error) {
        this.log(`🔍 ${market} 주문 확인 실패, 정리: ${error.message}`);
        delete this.holdings[market];
        this.savePersistentData();
      }
    }
  }

  // 잔액 확인
  async getBalance() {
    try {
      const accounts = await this.privateApi("GET", "/v1/accounts");
      const krwAccount = accounts.find((acc) => acc.currency === "KRW");
      return parseFloat(krwAccount?.balance || 0);
    } catch (error) {
      this.log(`잔액 조회 실패: ${error.message}`);
      return 0;
    }
  }

  // 키보드 입력 처리
  handleKeypress(key) {
    if (key === "q" || key === "\u0003") {
      this.log("👋 사용자 요청으로 봇을 종료합니다");
      console.log("\n👋 봇을 종료합니다...");
      process.exit(0);
    }
    if (key === "s") this.showStats();
    if (key === "h") this.showHelp();
    if (key === "r") this.synchronizeState();
  }

  // 통계 표시
  showStats() {
    console.clear();
    const runtime = Math.floor((Date.now() - this.stats.startTime) / 1000 / 60);
    const winRate =
      this.stats.trades > 0
        ? ((this.stats.wins / this.stats.trades) * 100).toFixed(1)
        : "0.0";

    console.log("📊 === 트레이딩 통계 ===");
    console.log(`런타임: ${runtime}분`);
    console.log(`총 거래: ${this.stats.trades}회`);
    console.log(`성공: ${this.stats.wins}회, 실패: ${this.stats.losses}회`);
    console.log(`승률: ${winRate}%`);
    console.log(`총 수익: ${this.stats.totalProfit.toLocaleString()}원`);
    console.log("\n보유 종목:");
    for (const [market, holding] of Object.entries(this.holdings)) {
      const status = holding.recovered
        ? `${holding.state} (복구됨)`
        : holding.state;
      const qtyInfo = holding.totalQty
        ? `총 ${holding.totalQty}개 (가용 ${holding.balance || 0}, 주문중 ${
            holding.locked || 0
          })`
        : `${holding.qty || 0}개`;
      console.log(`  ${market}: ${qtyInfo} (${status})`);
    }
    console.log("\n아무 키나 누르면 돌아갑니다...");
    process.stdin.once("data", () => {});
  }

  // 도움말
  showHelp() {
    console.clear();
    console.log("📖 === 빗썸 트레이딩 봇 ===");
    console.log(`매수 금액: ${this.buyAmount.toLocaleString()}원`);
    console.log(
      `익절/손절: ${(this.profitRatio * 100).toFixed(1)}% / ${(
        this.lossRatio * 100
      ).toFixed(1)}%`
    );
    console.log("Commands:");
    console.log("  [q] quit - 봇 종료");
    console.log("  [s] stats - 상세 통계");
    console.log("  [h] help - 도움말");
    console.log("  [r] recover - 완전 동기화");
    console.log("\n특징:");
    console.log("- 프로그램 재시작 시 자동으로 기존 보유 종목 복구");
    console.log("- 익절 주문 누락 시 자동 등록");
    console.log("- 모든 매도는 보유량 100% 처리");
    console.log("- 중복 매도 주문 방지");
    console.log("- 지갑과 bot_data 완전 동기화");
    console.log("\n아무 키나 누르면 돌아갑니다...");
    process.stdin.once("data", () => {});
  }

  // 대시보드
  drawDashboard() {
    console.clear();
    const runtime = Math.floor((Date.now() - this.stats.startTime) / 1000 / 60);
    const winRate =
      this.stats.trades > 0
        ? ((this.stats.wins / this.stats.trades) * 100).toFixed(1)
        : "0.0";

    console.log(
      "┌─ Bithumb Trading Bot ─────────────────────────────────────────┐"
    );
    console.log(
      `│ 📦 Holdings: ${
        Object.keys(this.holdings).length
      }개 | ⏱️ ${runtime}m | 🎯 ${winRate}% (${this.stats.wins}/${
        this.stats.losses
      }) │`
    );
    console.log(
      `│ 📈 P&L: ${
        this.stats.totalProfit > 0 ? "+" : ""
      }${this.stats.totalProfit.toLocaleString()}원 │`
    );
    console.log(
      "├────────────────────────────────────────────────────────────────┤"
    );
    console.log(`│ 🔍 ${this.stats.currentScan.padEnd(58)} │`);
    console.log(`│ 📝 ${this.stats.lastActivity.slice(0, 58).padEnd(58)} │`);
    console.log(
      "├────────────────────────────────────────────────────────────────┤"
    );
    console.log(
      "│ Commands: [q]uit | [s]tats | [h]elp | [r]ecover               │"
    );
    console.log(
      "└────────────────────────────────────────────────────────────────┘"
    );
  }

  // 메인 루프
  async run() {
    this.log(
      `🚀 빗썸 트레이딩 봇 시작 (매수: ${this.buyAmount.toLocaleString()}원)`
    );
    this.log(
      `📊 설정: 익절 ${(this.profitRatio * 100).toFixed(1)}%, 손절 ${(
        this.lossRatio * 100
      ).toFixed(1)}%`
    );

    if (Object.keys(this.holdings).length > 0) {
      this.log("🔄 기존 보유 종목 모니터링 재개");
    }

    // 지갑과 bot_data 완전 동기화
    await this.synchronizeState();

    // 대시보드 주기적 업데이트
    setInterval(() => this.drawDashboard(), 1000);

    while (true) {
      try {
        // 기존 주문 상태 확인
        this.stats.currentScan = "Checking orders...";
        await this.checkOrders();

        // 새로운 매수 기회 탐색
        const balance = await this.getBalance();
        if (balance >= this.buyAmount) {
          this.stats.currentScan = "Scanning markets...";
          const markets = await this.getMarketsByVolume();

          for (const market of markets.slice(0, 15)) {
            if (this.holdings[market]) continue;

            if (await this.checkBuySignal(market)) {
              const success = await this.buy(market);
              if (success) {
                const newBalance = await this.getBalance();
                if (newBalance < this.buyAmount) {
                  this.log(
                    `💰 잔액 부족으로 매수 중단: ${newBalance.toLocaleString()}원`
                  );
                  break;
                }
              }
            }
          }
        } else {
          this.stats.currentScan = `Insufficient balance: ${balance.toLocaleString()}원`;
        }

        // 대기
        this.stats.currentScan = "Waiting...";
        for (let i = 0; i < 30; i++) {
          this.stats.currentScan = `Next cycle in ${30 - i}s`;
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (error) {
        this.log(`❌ 메인 루프 오류: ${error.message}`);
        this.stats.currentScan = "Error occurred, retrying...";
        await new Promise((r) => setTimeout(r, 30000));
      }
    }
  }
}

// 설정
const config = {
  buyAmount: 10000, // 1만원씩 매수
  profitRatio: 0.03, // 3% 익절
  lossRatio: 0.015, // 1.5% 손절
  timeframes: {
    short: 5, // 단기 평균 5분
    long: 60, // 장기 평균 60분
    shortThreshold: 1.8, // 현재 vs 단기 1.8배
    longThreshold: 1.4, // 단기 vs 장기 1.4배
  },
};

const bot = new BithumbTradingBot(config);

// 안전한 종료 처리
process.on("SIGINT", () => {
  console.log("\n🔄 프로그램을 안전하게 종료합니다...");
  bot.log("💾 프로그램 종료 - 데이터 저장됨");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🔄 시스템 종료 신호 수신...");
  bot.log("💾 시스템 종료 - 데이터 저장됨");
  process.exit(0);
});

// 예외 처리
process.on("uncaughtException", (error) => {
  console.log(`💥 예상치 못한 오류: ${error.message}`);
  bot.log(`💥 예상치 못한 오류: ${error.message}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.log(`🚫 처리되지 않은 Promise 거부:`, reason);
  bot.log(`🚫 처리되지 않은 Promise 거부: ${reason}`);
});

// 실행
bot.run().catch((error) => {
  console.log(`💥 봇 실행 실패: ${error.message}`);
  process.exit(1);
});

module.exports = BithumbTradingBot;
