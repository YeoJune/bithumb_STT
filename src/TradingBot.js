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

  // 트레일링 스탑 모니터링 시작
  async startTrailingStop(market, holding) {
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

      // 고점 계산: 현재가와 매수가 중 높은 값으로 시작
      const tickerResponse = await this.dataProvider.getTicker(market);
      const ticker = Array.isArray(tickerResponse)
        ? tickerResponse[0]
        : tickerResponse;

      if (!ticker || !ticker.trade_price) {
        this.logger.log(
          `⚠️ ${market} 트레일링 스탑 시작 실패: 현재가 정보 없음`
        );
        return false;
      }

      const currentPrice = parseFloat(ticker.trade_price);

      if (isNaN(currentPrice) || currentPrice <= 0) {
        this.logger.log(
          `⚠️ ${market} 트레일링 스탑 시작 실패: 현재가 데이터 오류 ${ticker.trade_price}`
        );
        return false;
      }

      const buyPrice = holding.price;

      // 고점은 최소한 매수가 이상이어야 함
      const initialHighestPrice = Math.max(currentPrice, buyPrice);
      const trailingStopPrice =
        initialHighestPrice * (1 - this.trailingStopRatio);

      this.holdings[market] = {
        ...holding,
        state: "trailing_stop",
        balance: holdingInfo.balance,
        locked: holdingInfo.locked,
        totalQty: holdingInfo.totalQty,
        highestPrice: initialHighestPrice,
        trailingStopPrice: trailingStopPrice,
      };

      await this.dataManager.saveData({
        holdings: this.holdings,
        stats: this.stats,
      });

      this.logger.log(`📈 ${market} 트레일링 스탑 시작`);
      this.logger.log(
        `📊 ${market} 매수가: ${buyPrice.toLocaleString()}원, 현재가: ${currentPrice.toLocaleString()}원, 고점: ${initialHighestPrice.toLocaleString()}원, 스탑: ${trailingStopPrice.toLocaleString()}원`
      );
      return true;
    } catch (error) {
      this.logger.log(`⚠️ ${market} 트레일링 스탑 시작 실패: ${error.message}`);
      return false;
    }
  }

  // 트레일링 스탑 매도 실행
  async executeTrailingStop(market, holding) {
    try {
      // 실제 보유 수량 확인 후 시장가 매도
      const holdingInfo = await this.executionEngine.getHolding(market);
      const sellableQty = holdingInfo.balance + holdingInfo.locked;

      if (sellableQty <= 0) {
        this.logger.log(`⚠️ ${market} 트레일링 스탑 시 보유량 없음`);
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
          `⚠️ ${market} 트레일링 스탑 매도 후 현재가 조회 실패, 매수가로 대체`
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
        `🎯 ${market} 트레일링 스탑 매도: ${
          profit > 0 ? "+" : ""
        }${profit.toFixed(2)}% (고점 대비 ${
          this.trailingStopRatio * 100
        }% 하락)`
      );
      return true;
    } catch (error) {
      this.logger.log(`❌ ${market} 트레일링 스탑 매도 실패: ${error.message}`);
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

            // 10초 후 트레일링 스탑 시작
            await new Promise((r) => setTimeout(r, 10 * 1000));

            await this.startTrailingStop(market, this.holdings[market]);
          } else if (orderStatus === "wait") {
            // 미처리 매수 주문 체크 - 주문 생성 시간으로부터 2분 경과 시 취소
            const orderAge = Date.now() - holding.buyTime;
            const maxWaitTime = 2 * 60 * 1000; // 2분

            if (orderAge > maxWaitTime) {
              this.logger.log(
                `⏰ ${market} 매수 주문 2분 경과로 취소: ${holding.uuid}`
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
        } else if (holding.state === "bought") {
          // bought 상태 → 트레일링 스탑 시작
          await this.startTrailingStop(market, this.holdings[market]);
        } else if (holding.state === "trailing_stop") {
          // 트레일링 스탑 로직
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

          // 기존 손절 조건 확인 (우선순위)
          if (currentPrice <= lossTarget) {
            this.logger.log(
              `🚨 ${market} 손절 조건: ${currentPrice.toLocaleString()}원 <= ${lossTarget.toLocaleString()}원`
            );
            await this.stopLoss(market, holding);
            continue;
          }

          // 트레일링 스탑 로직
          let updated = false;

          // 고점 갱신 체크 (현재가가 고점보다 높고, 유의미한 상승인 경우)
          if (currentPrice > holding.highestPrice) {
            const priceIncrease =
              (currentPrice - holding.highestPrice) / holding.highestPrice;

            // 최소 0.1% 이상 상승했을 때만 고점 갱신 (노이즈 방지)
            if (priceIncrease >= 0.001) {
              const newStopPrice = currentPrice * (1 - this.trailingStopRatio);
              const oldHighest = holding.highestPrice;
              const oldStop = holding.trailingStopPrice;

              this.holdings[market].highestPrice = currentPrice;
              this.holdings[market].trailingStopPrice = newStopPrice;
              updated = true;

              this.logger.log(
                `📈 ${market} 고점 갱신: ${oldHighest.toLocaleString()}원 → ${currentPrice.toLocaleString()}원 (+${(
                  priceIncrease * 100
                ).toFixed(2)}%)`
              );
              this.logger.log(
                `🎯 ${market} 스탑 조정: ${oldStop.toLocaleString()}원 → ${newStopPrice.toLocaleString()}원`
              );
            }
          }

          // 트레일링 스탑 조건 확인
          if (currentPrice <= holding.trailingStopPrice) {
            this.logger.log(
              `🎯 ${market} 트레일링 스탑 발동: ${currentPrice.toLocaleString()}원 <= ${holding.trailingStopPrice.toLocaleString()}원`
            );
            await this.executeTrailingStop(market, holding);
            continue;
          } // 상태 업데이트가 있었다면 저장
          if (updated) {
            await this.dataManager.saveData({
              holdings: this.holdings,
              stats: this.stats,
            });
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

          // 기존 매도 주문들 모두 취소 (트레일링 스탑 방식이므로)
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

              // 고점 계산 로직: 기존 고점 > 현재가 > 매수가 순으로 우선순위
              let highestPrice = currentPrice;

              // 기존 봇 데이터에 고점 정보가 있다면 비교
              if (
                botData?.highestPrice &&
                !isNaN(botData.highestPrice) &&
                botData.highestPrice > highestPrice
              ) {
                highestPrice = botData.highestPrice;
              }

              // 매수가보다는 높아야 함 (최소 고점 = 매수가)
              if (highestPrice < buyPrice) {
                highestPrice = buyPrice;
              }

              // 트레일링 스탑 가격 계산
              const trailingStopPrice =
                highestPrice * (1 - this.trailingStopRatio);

              this.holdings[market] = {
                state: "trailing_stop",
                price: buyPrice,
                balance: availableQty,
                locked: lockedQty,
                totalQty: totalQty,
                buyTime: botData?.buyTime || Date.now(),
                uuid: botData?.uuid || null,
                highestPrice: highestPrice,
                trailingStopPrice: trailingStopPrice,
                recovered: true,
              };
              syncCount++;
              this.logger.log(
                `✨ ${market} 트레일링 스탑 재시작: ${totalQty}개`
              );
              this.logger.log(
                `📊 ${market} 매수가: ${buyPrice.toLocaleString()}원, 현재가: ${currentPrice.toLocaleString()}원, 고점: ${highestPrice.toLocaleString()}원, 스탑: ${trailingStopPrice.toLocaleString()}원`
              );
            } catch (error) {
              this.logger.log(
                `⚠️ ${market} 트레일링 스탑 재시작 실패: ${error.message}`
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

        for (const market of markets.slice(0, 100)) {
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
