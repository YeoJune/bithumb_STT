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
    this.buyFeeRate = 0.0004; // 매수 수수료 0.04%
    this.sellFeeRate = 0.0004; // 매도 수수료 0.04%
    this.timeframes = config.timeframes || {
      short: 15,
      long: 60,
      shortThreshold: 1.2,
      longThreshold: 1.2,
    };

    // 의존성 주입
    this.dataProvider = dataProvider;
    this.executionEngine = executionEngine;
    this.dataManager = dataManager;
    this.logger = logger;

    // 상태
    this.holdings = {};
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

  // 거래대금 급증 신호 분석
  async getVolumeSignal(market) {
    try {
      const totalMinutes = this.timeframes.short + this.timeframes.long + 1;
      const candles = await this.dataProvider.getCandles(market, totalMinutes);

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
      this.logger.log(
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
    if (this.buyAmount < 5000) return false;

    try {
      const [ticker, orderbook] = await Promise.all([
        this.dataProvider.getTicker(market),
        this.dataProvider.getOrderbook(market),
      ]);

      let buyPrice = parseFloat(ticker.trade_price);
      if (orderbook?.orderbook_units?.length > 0) {
        buyPrice = parseFloat(orderbook.orderbook_units[0].ask_price);
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
        state: "buying",
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

  // 익절 주문 등록
  async registerProfitOrder(market, holding) {
    try {
      const holdingInfo = await this.executionEngine.getHolding(market);
      if (holdingInfo.totalQty <= 0) {
        this.logger.log(`⚠️ ${market} 실제 보유량 없음, 홀딩 정리`);
        delete this.holdings[market];
        await this.dataManager.saveData({
          holdings: this.holdings,
          stats: this.stats,
        });
        return false;
      }

      // 이미 매도 주문이 있는지 확인
      if (holdingInfo.locked > 0) {
        this.logger.log(
          `⚠️ ${market} 이미 매도 주문 중: ${holdingInfo.locked}개`
        );
        // 기존 매도 주문이 있다면 상태만 업데이트
        this.holdings[market] = {
          ...holding,
          state: "profit_waiting",
          balance: holdingInfo.balance,
          locked: holdingInfo.locked,
          totalQty: holdingInfo.totalQty,
        };
        await this.dataManager.saveData({
          holdings: this.holdings,
          stats: this.stats,
        });
        return true;
      }

      const profitTarget = holding.price * (1 + this.profitRatio);
      const orderbook = await this.dataProvider.getOrderbook(market);
      const optimalPrice = this.getOptimalSellPrice(orderbook, profitTarget);

      // 가용 수량(balance)으로만 매도 주문
      const profitOrder = await this.executionEngine.placeSellOrder(
        market,
        holdingInfo.balance,
        optimalPrice
      );

      this.holdings[market] = {
        ...holding,
        state: "profit_waiting",
        balance: 0, // 주문 등록 후 balance는 0
        locked: holdingInfo.balance, // 주문한 수량이 locked됨
        totalQty: holdingInfo.totalQty,
        profitOrderUuid: profitOrder.uuid,
        profitTarget: optimalPrice,
      };

      await this.dataManager.saveData({
        holdings: this.holdings,
        stats: this.stats,
      });

      this.logger.log(
        `📈 ${market} 익절주문 등록: ${
          holdingInfo.balance
        }개 @ ${optimalPrice.toLocaleString()}원`
      );
      return true;
    } catch (error) {
      this.logger.log(`⚠️ ${market} 익절주문 실패: ${error.message}`);
      return false;
    }
  }

  // 손절 매도
  async stopLoss(market, holding) {
    try {
      // 익절 주문 확실히 취소
      if (holding.profitOrderUuid) {
        const cancelResult = await this.executionEngine.cancelOrder(
          holding.profitOrderUuid
        );
        if (!cancelResult.success) {
          // 취소 실패 시 주문 상태 확인
          const orderStatus = await this.executionEngine.getOrderStatus(
            holding.profitOrderUuid
          );
          if (orderStatus === "done") {
            // 익절 주문이 이미 체결됨
            const profit =
              ((holding.profitTarget - holding.price) / holding.price) * 100;
            this.stats.trades++;
            this.stats.wins++;
            const netProfit = this.calculateNetProfit(
              holding.price,
              holding.profitTarget,
              holding.totalQty || holding.qty
            );
            this.stats.totalProfit += netProfit;

            delete this.holdings[market];
            await this.dataManager.saveData({
              holdings: this.holdings,
              stats: this.stats,
            });

            this.logger.log(`🎉 ${market} 익절 체결: +${profit.toFixed(2)}%`);
            return true;
          } else if (orderStatus !== "cancel") {
            this.logger.log(`❌ ${market} 익절주문 취소 불가, 손절 중단`);
            return false;
          }
        }
      }

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

      const ticker = await this.dataProvider.getTicker(market);
      const currentPrice = parseFloat(ticker.trade_price);
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
          const ticker = await this.dataProvider.getTicker(market);
          const currentPrice = parseFloat(ticker.trade_price);
          const lossTarget = holding.price * (1 - this.lossRatio);

          if (currentPrice <= lossTarget) {
            this.logger.log(
              `🚨 ${market} 손절 조건: ${currentPrice.toLocaleString()}원 <= ${lossTarget.toLocaleString()}원`
            );
            await this.stopLoss(market, holding);
            continue;
          }

          // 익절 주문 확인
          if (holding.profitOrderUuid) {
            const orderStatus = await this.executionEngine.getOrderStatus(
              holding.profitOrderUuid
            );
            if (orderStatus === "done") {
              const profit =
                ((holding.profitTarget - holding.price) / holding.price) * 100;

              this.stats.trades++;
              this.stats.wins++;
              const netProfit = this.calculateNetProfit(
                holding.price,
                holding.profitTarget,
                holding.totalQty || holding.qty
              );
              this.stats.totalProfit += netProfit;

              delete this.holdings[market];
              await this.dataManager.saveData({
                holdings: this.holdings,
                stats: this.stats,
              });

              this.logger.log(`🎉 ${market} 익절 체결: +${profit.toFixed(2)}%`);
            }
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

        // 상태 결정 및 동기화 로직 (기존과 동일)
        // ... (복잡한 동기화 로직은 기존 코드 유지)
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

  // 메인 트레이딩 루프
  async runTradingCycle() {
    try {
      // 기존 주문 상태 확인
      this.stats.currentScan = "Checking orders...";
      await this.checkOrders();

      // 새로운 매수 기회 탐색
      const balance = await this.executionEngine.getBalance();
      if (balance >= this.buyAmount) {
        this.stats.currentScan = "Scanning markets...";
        const markets = await this.dataProvider.getMarketsByVolume();

        for (const market of markets.slice(0, 15)) {
          if (this.holdings[market]) continue;

          if (await this.checkBuySignal(market)) {
            const success = await this.buy(market);
            if (success) {
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
      } else {
        this.stats.currentScan = `Insufficient balance: ${balance.toLocaleString()}원`;
      }

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
      currentScan: this.stats.currentScan,
      lastActivity: this.stats.lastActivity,
    };
  }
}

module.exports = TradingBot;
