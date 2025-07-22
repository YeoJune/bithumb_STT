/**
 * 핵심 트레이딩 로직
 * 실거래와 백테스트가 공통으로 사용하는 순수한 트레이딩 로직
 */
class TradingBot {
  constructor(config = {}, dataProvider, executionEngine, dataManager, logger) {
    // 설정값
    this.buyAmount = config.buyAmount || 10000;
    this.profitRatio = config.profitRatio || 0.05;
    this.lossRatio = config.lossRatio || 0.025;
    this.trailingStopRatio = config.trailingStopRatio || 0.01; // 고점 대비 1% 하락 시 매도
    this.buyFeeRate = config.fees?.buy || 0.0004; // 매수 수수료
    this.sellFeeRate = config.fees?.sell || 0.0004; // 매도 수수료
    this.timeframes = config.timeframes || {
      short: 3, // 일봉 기준 3일
      long: 30, // 일봉 기준 30일
      shortThreshold: 1.2,
      longThreshold: 1.2,
    };

    // 새로운 설정 추가
    this.movingAverages = config.movingAverages || {
      short: 10,
      long: 30,
    };
    this.volumeFilterInterval = (config.volumeFilterInterval || 30) * 1000; // 초를 밀리초로 변환

    // 거래 관련 설정
    this.minBuyAmount = config.trading?.minBuyAmount || 5000;
    this.orderTimeoutMinutes = config.trading?.orderTimeoutMinutes || 2;
    this.maxScanMarkets = config.trading?.maxScanMarkets || 50;

    // 의존성 주입
    this.dataProvider = dataProvider;
    this.executionEngine = executionEngine;
    this.dataManager = dataManager;
    this.logger = logger;

    // 상태
    this.holdings = {};
    this.watchList = new Map(); // 거래대금 필터 통과한 종목들 (market -> {shortRatio, longRatio})
    this.lastVolumeCheck = 0; // 마지막 볼륨 체크 시간
    this.stats = {
      trades: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      startTime: Date.now(),
      currentScan: "",
      lastActivity: "",
    };

    // 초기화
    this.init();
  }

  async init() {
    // 기존 데이터 로드
    const savedData = await this.dataManager.loadData();
    if (savedData) {
      this.holdings = savedData.holdings || {};
      if (savedData.stats) {
        this.stats.trades = savedData.stats.trades || 0;
        this.stats.wins = savedData.stats.wins || 0;
        this.stats.losses = savedData.stats.losses || 0;
        this.stats.totalProfit = savedData.stats.totalProfit || 0;
      }
      this.logger.log(
        `📂 기존 데이터 로드: ${
          Object.keys(this.holdings).length
        }개 보유종목, ${this.stats.trades}회 거래이력`
      );
    } else {
      this.logger.log("📂 새로운 데이터 파일 생성");
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

  // 최적화된 캔들 단위 계산 (중복 제거)
  getOptimalUnit(totalMinutes) {
    const units = [240, 60, 30, 15, 10, 5, 3, 1];
    const unit = units.find((u) => totalMinutes % u === 0) || 1;
    return { unit, count: Math.ceil(totalMinutes / unit) };
  }

  // 거래대금 급증 신호 분석 (일봉 기준)
  async getVolumeSignal(market) {
    try {
      // timeframes 설정 사용: short와 long을 일 단위로 활용
      const shortDays = this.timeframes.short;
      const longDays = this.timeframes.long;
      const count = longDays + 1; // 최신 캔들을 버리기 위해 +1

      // 일봉 데이터 조회
      const candles = await this.dataProvider.getDayCandles(
        market,
        count,
        null
      );

      if (!candles || candles.length < count) {
        return null;
      }

      const getVolume = (candle) => parseFloat(candle.candle_acc_trade_price);
      const currentVolume = getVolume(candles[1]); // 2번째 캔들부터 사용 (어제 거래량)

      // 단기: 2번째 캔들부터 short일간의 평균
      const shortCandles = candles.slice(1, 1 + shortDays);
      const shortAvg =
        shortCandles.reduce((sum, candle) => sum + getVolume(candle), 0) /
        shortCandles.length;

      // 장기: 단기 이후부터 long일간의 평균 (겹치지 않게)
      const longStart = 1 + shortDays;
      const longCandles = candles.slice(longStart, longStart + longDays);
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

  // 이동평균 계산 (기존 호환성 유지)
  async getMovingAverages(market) {
    try {
      const unit = 1;
      const count = Math.ceil(this.movingAverages.long / unit) + 1; // 최신 캔들을 버리기 위해 +1
      const candles = await this.dataProvider.getCandles(
        market,
        count,
        null,
        unit
      );

      const prices = candles
        .slice(1)
        .map((candle) => parseFloat(candle.trade_price)); // 2번째 캔들부터 사용

      // 단기 이동평균: 최신부터 short 시간만큼
      const shortCandleCount = Math.ceil(this.movingAverages.short / unit);
      const shortMA =
        prices
          .slice(0, shortCandleCount)
          .reduce((sum, price) => sum + price, 0) / shortCandleCount;

      // 장기 이동평균: 전체 데이터 (long 시간)
      const longMA =
        prices.reduce((sum, price) => sum + price, 0) / prices.length;

      return { shortMA, longMA };
    } catch (error) {
      return null;
    }
  }

  /**
   * @private
   * 현재와 직전 시점의 단기/장기 이동평균을 계산합니다.
   * "교차 시점"을 정확히 감지하기 위해 사용됩니다.
   */
  async _getMAValues(market) {
    try {
      const unit = 1;
      // 직전 값을 계산하기 위해 필요한 캔들 수 + 1 + 최신 캔들 제외 1 = +2
      const count = Math.ceil(this.movingAverages.long / unit) + 2;
      const candles = await this.dataProvider.getCandles(
        market,
        count,
        null,
        unit
      );

      // 캔들이 충분하지 않으면 계산 불가
      if (candles.length < count) {
        return null;
      }

      const prices = candles.slice(1).map((c) => parseFloat(c.trade_price)); // 2번째 캔들부터 사용

      const shortN = Math.ceil(this.movingAverages.short / unit);
      const longN = Math.ceil(this.movingAverages.long / unit);

      // 숫자 배열의 평균을 계산하는 작은 헬퍼 함수
      const average = (arr) =>
        arr.reduce((sum, val) => sum + val, 0) / arr.length;

      // 현재 시점의 이동평균 (prices 배열의 0번 인덱스부터 시작)
      const shortMA_now = average(prices.slice(0, shortN));
      const longMA_now = average(prices.slice(0, longN));

      // 직전 시점의 이동평균 (prices 배열의 1번 인덱스부터 시작)
      const shortMA_prev = average(prices.slice(1, shortN + 1));
      const longMA_prev = average(prices.slice(1, longN + 1));

      return {
        shortMA_now,
        longMA_now,
        shortMA_prev,
        longMA_prev,
      };
    } catch (error) {
      this.logger.log(`❌ ${market} 이동평균 계산 실패: ${error.message}`);
      return null;
    }
  }

  // 골든크로스 확인 (단기MA가 장기MA를 상향 "돌파"하는 순간)
  async checkGoldenCross(market) {
    const maValues = await this._getMAValues(market);
    if (!maValues) return false;

    const { shortMA_now, longMA_now, shortMA_prev, longMA_prev } = maValues;

    // 조건: (이전에는 단기MA가 장기MA보다 아래에 있었고) AND (현재는 단기MA가 장기MA보다 위에 있다)
    const isGoldenCross =
      shortMA_prev <= longMA_prev && shortMA_now > longMA_now;

    return isGoldenCross;
  }

  // 데드크로스 확인 (단기MA가 장기MA를 하향 "돌파"하는 순간)
  async checkDeadCross(market) {
    const maValues = await this._getMAValues(market);
    if (!maValues) return false;

    const { shortMA_now, longMA_now, shortMA_prev, longMA_prev } = maValues;

    // 조건: (이전에는 단기MA가 장기MA보다 위에 있었고) AND (현재는 단기MA가 장기MA보다 아래에 있다)
    const isDeadCross = shortMA_prev >= longMA_prev && shortMA_now < longMA_now;

    return isDeadCross;
  }

  // 매수 신호 확인 (거래대금 + 골든크로스)
  async checkBuySignal(market) {
    this.stats.currentScan = `Scanning ${market}...`;
    const volumeSignal = await this.getVolumeSignal(market);
    if (!volumeSignal || !volumeSignal.signal) return false;

    // 골든크로스 확인
    const isGoldenCross = await this.checkGoldenCross(market);
    if (!isGoldenCross) return false;

    this.stats.currentScan = `${market} (${volumeSignal.shortRatio}x/${volumeSignal.longRatio}x + GC)`;
    this.logger.log(
      `🎯 ${market} 매수신호: 거래대금 급증 (${volumeSignal.shortRatio}x/${volumeSignal.longRatio}x) + 골든크로스`
    );

    return true;
  }

  // 유효숫자 조정
  adjustNumber(volume) {
    if (volume <= 0) return 0;
    const str = volume.toExponential();
    const [mantissa, exponent] = str.split("e");
    const significant = parseFloat(mantissa).toFixed(2);
    return parseFloat(parseFloat(significant + "e" + exponent).toFixed(8));
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

  // 매수 주문
  async buy(market) {
    if (this.buyAmount < this.minBuyAmount) return false;

    try {
      const [tickerResponse, orderbook] = await Promise.all([
        this.dataProvider.getTicker(market),
        this.dataProvider.getOrderbook(market),
      ]);

      const ticker = Array.isArray(tickerResponse)
        ? tickerResponse[0]
        : tickerResponse;

      if (!ticker || !ticker.trade_price) {
        this.logger.log(`❌ ${market} 현재가 정보 없음`);
        return false;
      }

      let buyPrice = parseFloat(ticker.trade_price);

      if (isNaN(buyPrice) || buyPrice <= 0) {
        this.logger.log(
          `❌ ${market} 현재가 데이터 오류: ${ticker.trade_price}`
        );
        return false;
      }

      if (orderbook?.orderbook_units?.length > 0) {
        const askPrice = parseFloat(orderbook.orderbook_units[0].ask_price);
        if (!isNaN(askPrice) && askPrice > 0) {
          buyPrice = askPrice;
        }
      }

      const rawQty = this.buyAmount / buyPrice;
      const adjustedQty = this.adjustNumber(rawQty);

      if (adjustedQty <= 0) {
        this.logger.log(`❌ ${market} 조정된 수량이 0입니다`);
        return false;
      }

      const buyOrder = await this.executionEngine.placeBuyOrder(
        market,
        adjustedQty,
        buyPrice
      );

      this.holdings[market] = {
        state: "holding", // "buying" 대신 "holding"으로 변경
        price: buyPrice,
        qty: adjustedQty,
        buyTime: Date.now(),
        uuid: buyOrder.uuid,
      };

      await this.dataManager.saveData({
        holdings: this.holdings,
        stats: this.stats,
      });

      this.logger.log(
        `✅ ${market} 매수주문: ${adjustedQty}개 @ ${buyPrice.toLocaleString()}원`
      );
      return true;
    } catch (error) {
      this.logger.log(`❌ ${market} 매수 실패: ${error.message}`);
      return false;
    }
  }

  // 손절 매도
  async stopLoss(market, holding) {
    try {
      // 실제 보유 수량 확인 후 시장가 매도
      const holdingInfo = await this.executionEngine.getHolding(market);
      const sellableQty = holdingInfo.balance + holdingInfo.locked;

      if (sellableQty <= 0) {
        this.logger.log(`⚠️ ${market} 손절 시 보유량 없음`);
        delete this.holdings[market];
        await this.dataManager.saveData({
          holdings: this.holdings,
          stats: this.stats,
        });
        return false;
      }

      const sellOrder = await this.executionEngine.placeMarketSellOrder(
        market,
        sellableQty
      );

      const tickerResponse = await this.dataProvider.getTicker(market);
      const ticker = Array.isArray(tickerResponse)
        ? tickerResponse[0]
        : tickerResponse;
      let currentPrice = ticker?.trade_price
        ? parseFloat(ticker.trade_price)
        : holding.price;

      if (isNaN(currentPrice)) {
        this.logger.log(
          `⚠️ ${market} 손절 매도 후 현재가 조회 실패, 매수가로 대체`
        );
        currentPrice = holding.price;
      }

      const profit = ((currentPrice - holding.price) / holding.price) * 100;

      this.stats.trades++;
      const netProfit = this.calculateNetProfit(
        holding.price,
        currentPrice,
        sellableQty
      );
      this.stats.totalProfit += netProfit;
      if (profit > 0) this.stats.wins++;
      else this.stats.losses++;

      delete this.holdings[market];
      await this.dataManager.saveData({
        holdings: this.holdings,
        stats: this.stats,
      });

      this.logger.log(
        `✅ ${market} 손절: ${profit > 0 ? "+" : ""}${profit.toFixed(2)}%`
      );
      return true;
    } catch (error) {
      this.logger.log(`❌ ${market} 손절 실패: ${error.message}`);
      return false;
    }
  }

  // 데드크로스 매도
  async deadCrossSell(market, holding) {
    try {
      // 실제 보유 수량 확인 후 시장가 매도
      const holdingInfo = await this.executionEngine.getHolding(market);
      const sellableQty = holdingInfo.balance + holdingInfo.locked;

      if (sellableQty <= 0) {
        this.logger.log(`⚠️ ${market} 데드크로스 매도 시 보유량 없음`);
        delete this.holdings[market];
        await this.dataManager.saveData({
          holdings: this.holdings,
          stats: this.stats,
        });
        return false;
      }

      const sellOrder = await this.executionEngine.placeMarketSellOrder(
        market,
        sellableQty
      );

      const tickerResponse = await this.dataProvider.getTicker(market);
      const ticker = Array.isArray(tickerResponse)
        ? tickerResponse[0]
        : tickerResponse;
      let currentPrice = ticker?.trade_price
        ? parseFloat(ticker.trade_price)
        : holding.price;

      if (isNaN(currentPrice)) {
        this.logger.log(
          `⚠️ ${market} 데드크로스 매도 후 현재가 조회 실패, 매수가로 대체`
        );
        currentPrice = holding.price;
      }

      const profit = ((currentPrice - holding.price) / holding.price) * 100;

      this.stats.trades++;
      const netProfit = this.calculateNetProfit(
        holding.price,
        currentPrice,
        sellableQty
      );
      this.stats.totalProfit += netProfit;
      if (profit > 0) this.stats.wins++;
      else this.stats.losses++;

      delete this.holdings[market];
      await this.dataManager.saveData({
        holdings: this.holdings,
        stats: this.stats,
      });

      this.logger.log(
        `💀 ${market} 데드크로스 매도: ${profit > 0 ? "+" : ""}${profit.toFixed(
          2
        )}%`
      );
      return true;
    } catch (error) {
      this.logger.log(`❌ ${market} 데드크로스 매도 실패: ${error.message}`);
      return false;
    }
  }

  // 주문 상태 확인
  async checkOrders() {
    for (const [market, holding] of Object.entries(this.holdings)) {
      try {
        if (holding.state === "buying") {
          // 매수 주문 확인
          const orderStatus = await this.executionEngine.getOrderStatus(
            holding.uuid
          );
          if (orderStatus === "done") {
            const orderInfo = await this.executionEngine.getOrderInfo(
              holding.uuid
            );
            const executedVolume = parseFloat(orderInfo.executed_volume);
            const avgPrice = parseFloat(orderInfo.price);

            this.logger.log(
              `🎯 ${market} 매수 체결: ${executedVolume}개 @ ${avgPrice.toLocaleString()}원`
            );

            this.holdings[market] = {
              ...holding,
              state: "holding", // 직접 holding 상태로 변경
              balance: executedVolume,
              locked: 0,
              totalQty: executedVolume,
              price: avgPrice,
            };

            await this.dataManager.saveData({
              holdings: this.holdings,
              stats: this.stats,
            });
          } else if (orderStatus === "wait") {
            // 미처리 매수 주문 체크 - 주문 생성 시간으로부터 설정된 시간 경과 시 취소
            const orderAge = Date.now() - holding.buyTime;
            const maxWaitTime = this.orderTimeoutMinutes * 60 * 1000; // 분을 밀리초로 변환

            if (orderAge > maxWaitTime) {
              this.logger.log(
                `⏰ ${market} 매수 주문 ${this.orderTimeoutMinutes}분 경과로 취소: ${holding.uuid}`
              );

              try {
                await this.executionEngine.cancelOrder(holding.uuid);
                delete this.holdings[market];
                await this.dataManager.saveData({
                  holdings: this.holdings,
                  stats: this.stats,
                });
                this.logger.log(`🚫 ${market} 매수 주문 취소 완료`);
              } catch (cancelError) {
                this.logger.log(
                  `⚠️ ${market} 매수 주문 취소 실패: ${cancelError.message}`
                );
                // 취소 실패 시에도 홀딩에서 제거 (주문이 이미 처리되었을 가능성)
                delete this.holdings[market];
                await this.dataManager.saveData({
                  holdings: this.holdings,
                  stats: this.stats,
                });
              }
            }
          }
        } else if (holding.state === "holding") {
          // 보유 중 - 데드크로스 또는 손절 확인
          const tickerResponse = await this.dataProvider.getTicker(market);
          const ticker = Array.isArray(tickerResponse)
            ? tickerResponse[0]
            : tickerResponse;

          if (!ticker || !ticker.trade_price) {
            this.logger.log(`⚠️ ${market} 현재가 정보 없음, 스킵`);
            continue;
          }

          const currentPrice = parseFloat(ticker.trade_price);

          if (isNaN(currentPrice) || currentPrice <= 0) {
            this.logger.log(
              `⚠️ ${market} 현재가 데이터 오류: ${ticker.trade_price}, 스킵`
            );
            continue;
          }

          const lossTarget = holding.price * (1 - this.lossRatio);

          // 손절 조건 확인 (우선순위)
          if (currentPrice <= lossTarget) {
            this.logger.log(
              `🚨 ${market} 손절 조건: ${currentPrice.toLocaleString()}원 <= ${lossTarget.toLocaleString()}원`
            );
            await this.stopLoss(market, holding);
            continue;
          }

          // 데드크로스 조건 확인
          const isDeadCross = await this.checkDeadCross(market);
          if (isDeadCross) {
            this.logger.log(`💀 ${market} 데드크로스 감지`);
            await this.deadCrossSell(market, holding);
            continue;
          }
        }
      } catch (error) {
        this.logger.log(`🔍 ${market} 주문 확인 실패, 정리: ${error.message}`);
        delete this.holdings[market];
        await this.dataManager.saveData({
          holdings: this.holdings,
          stats: this.stats,
        });
      }
    }
  }

  // 완전한 상태 동기화
  async synchronizeState() {
    try {
      this.logger.log("🔄 지갑과 bot_data 동기화 시작...");

      const [actualHoldings, activeOrders] = await Promise.all([
        this.executionEngine.getAllHoldings(),
        this.executionEngine.getAllActiveOrders(),
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
          this.logger.log(`🔄 ${market} 매수 주문 동기화`);
        } else if (actualData && actualData.totalQty > 0) {
          // 보유 중인 경우
          const totalQty = actualData.totalQty;
          const availableQty = actualData.balance;
          const lockedQty = actualData.locked;

          // 기존 매도 주문들 모두 취소
          for (const order of sellOrders) {
            try {
              await this.executionEngine.cancelOrder(order.uuid);
              this.logger.log(`🚫 ${market} 기존 매도주문 취소: ${order.uuid}`);
            } catch (error) {
              this.logger.log(`⚠️ ${market} 주문 취소 실패: ${error.message}`);
            }
          }

          // 잠시 대기
          await new Promise((r) => setTimeout(r, 500));

          const buyPrice =
            actualData.avgBuyPrice > 0 ? actualData.avgBuyPrice : 0;

          if (buyPrice > 0) {
            try {
              // 현재 가격과 기존 고점 정보를 종합하여 정확한 고점 계산
              const tickerResponse = await this.dataProvider.getTicker(market);
              const ticker = Array.isArray(tickerResponse)
                ? tickerResponse[0]
                : tickerResponse;

              if (!ticker || !ticker.trade_price) {
                this.logger.log(`⚠️ ${market} 현재가 정보 없음, 스킵`);
                continue;
              }

              const currentPrice = parseFloat(ticker.trade_price);

              if (isNaN(currentPrice) || currentPrice <= 0) {
                this.logger.log(
                  `⚠️ ${market} 현재가 데이터 오류: ${ticker.trade_price}, 스킵`
                );
                continue;
              }

              // 보유 종목을 holding 상태로 설정
              this.holdings[market] = {
                state: "holding",
                price: buyPrice,
                balance: availableQty,
                locked: lockedQty,
                totalQty: totalQty,
                buyTime: botData?.buyTime || Date.now(),
                uuid: botData?.uuid || null,
                recovered: true,
              };
              syncCount++;
              this.logger.log(
                `✨ ${market} 보유 종목 복구: ${totalQty}개 @ ${buyPrice.toLocaleString()}원`
              );
            } catch (error) {
              this.logger.log(
                `⚠️ ${market} 보유 종목 복구 실패: ${error.message}`
              );
            }
          } else {
            this.logger.log(`⚠️ ${market} 매수가 정보 없음, 스킵`);
          }
        } else {
          // 보유량 없고 주문도 없으면 봇 데이터에서 제거
          if (botData) {
            delete this.holdings[market];
            this.logger.log(`🗑️ ${market} 보유량 없음, 봇 데이터 정리`);
          }
        }
      }

      await this.dataManager.saveData({
        holdings: this.holdings,
        stats: this.stats,
      });
      this.logger.log(`✅ 동기화 완료: ${syncCount}개 항목 처리`);
    } catch (error) {
      this.logger.log(`❌ 동기화 실패: ${error.message}`);
    }
  }

  // 거래대금 필터링으로 감시 대상 업데이트
  async updateVolumeWatchList() {
    try {
      this.stats.currentScan = "Volume filtering...";
      const markets = await this.dataProvider.getMarketsByVolume();
      const newWatchList = new Map();

      for (const market of markets.slice(0, this.maxScanMarkets)) {
        if (this.holdings[market]) continue; // 이미 보유 중인 종목 제외

        const volumeSignal = await this.getVolumeSignal(market);
        if (volumeSignal && volumeSignal.signal) {
          newWatchList.set(market, {
            shortRatio: volumeSignal.shortRatio,
            longRatio: volumeSignal.longRatio,
          });
        }
      }

      this.watchList = newWatchList;
      this.stats.currentScan = `Watch list: ${this.watchList.size} markets`;

      if (this.watchList.size > 0) {
        this.logger.log(
          `👀 감시 대상 업데이트: ${Array.from(this.watchList.keys()).join(
            ", "
          )}`
        );
      }
    } catch (error) {
      this.logger.log(`❌ 거래대금 필터링 실패: ${error.message}`);
    }
  }

  // 감시 대상의 골든크로스 신호 확인
  async checkSignalsForWatchList() {
    if (this.watchList.size === 0) return;

    const balance = await this.executionEngine.getBalance();
    if (balance < this.buyAmount) {
      this.stats.currentScan = `Insufficient balance: ${balance.toLocaleString()}원`;
      return;
    }

    for (const [market, ratios] of this.watchList) {
      if (this.holdings[market]) {
        this.watchList.delete(market); // 이미 매수한 종목은 감시에서 제거
        continue;
      }

      this.stats.currentScan = `Checking ${market} for golden cross...`;

      // 골든크로스 확인
      const isGoldenCross = await this.checkGoldenCross(market);
      if (isGoldenCross) {
        this.logger.log(`⭐ ${market} 골든크로스 감지, 매수 시도`);
        const success = await this.buy(market);
        if (success) {
          this.watchList.delete(market); // 매수 성공 시 감시에서 제거
          const newBalance = await this.executionEngine.getBalance();
          if (newBalance < this.buyAmount) {
            this.logger.log(
              `💰 잔액 부족으로 매수 중단: ${newBalance.toLocaleString()}원`
            );
            break;
          }
        }
      }
    }
  }

  // 보유 종목의 매도 신호 확인
  async checkHoldingSignals() {
    // checkOrders에서 이미 처리하므로 별도 로직 불필요
    // 하지만 명시적으로 호출할 수 있도록 유지
    await this.checkOrders();
  }

  // 메인 트레이딩 루프 (2단계 모니터링)
  async runTradingCycle() {
    try {
      const now = Date.now();

      // Interval마다 거래대금 필터링
      if (now - this.lastVolumeCheck >= this.volumeFilterInterval) {
        await this.updateVolumeWatchList();
        this.lastVolumeCheck = now;
      }

      // 5초마다 신호 확인
      await this.checkSignalsForWatchList();
      await this.checkHoldingSignals();

      return true;
    } catch (error) {
      this.logger.log(`❌ 트레이딩 사이클 오류: ${error.message}`);
      this.stats.currentScan = "Error occurred, retrying...";
      return false;
    }
  }

  // 통계 정보 조회
  getStats() {
    const runtime = Math.floor((Date.now() - this.stats.startTime) / 1000 / 60);
    const winRate =
      this.stats.trades > 0
        ? ((this.stats.wins / this.stats.trades) * 100).toFixed(1)
        : "0.0";

    return {
      runtime,
      trades: this.stats.trades,
      wins: this.stats.wins,
      losses: this.stats.losses,
      winRate,
      totalProfit: this.stats.totalProfit,
      holdings: this.holdings,
      watchList: this.watchList,
      currentScan: this.stats.currentScan,
      lastActivity: this.stats.lastActivity,
    };
  }
}

module.exports = TradingBot;
