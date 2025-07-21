/**
 * 거래 실행 엔진
 * 실거래/백테스트 모드에 따른 거래 실행
 */
class TradingEngine {
  constructor(api, isLive = true) {
    this.api = api;
    this.isLive = isLive;

    // 백테스트용 모의 상태
    this.mockBalance = isLive ? 0 : 1000000; // 백테스트 시작 자금 100만원
    this.mockHoldings = {};
    this.mockOrders = {};
    this.orderCounter = 0;
  }

  // 매수 주문
  async placeBuyOrder(market, volume, price) {
    if (this.isLive) {
      return await this.api.placeOrder({
        market,
        side: "bid",
        ord_type: "limit",
        volume: volume.toString(),
        price: price.toString(),
      });
    } else {
      // 백테스트 모의 매수
      const uuid = `mock_${++this.orderCounter}`;
      const totalCost = price * volume * 1.0004; // 수수료 포함

      if (this.mockBalance < totalCost) {
        throw new Error("잔액 부족");
      }

      this.mockBalance -= totalCost;
      this.mockOrders[uuid] = {
        uuid,
        market,
        side: "bid",
        ord_type: "limit",
        volume: volume.toString(),
        price: price.toString(),
        state: "done",
        executed_volume: volume.toString(),
        created_at: new Date().toISOString(),
      };

      // 보유량 업데이트
      if (!this.mockHoldings[market]) {
        this.mockHoldings[market] = {
          currency: market.split("-")[1],
          balance: 0,
          locked: 0,
          totalQty: 0,
          avgBuyPrice: 0,
        };
      }

      this.mockHoldings[market].balance += volume;
      this.mockHoldings[market].totalQty += volume;
      this.mockHoldings[market].avgBuyPrice = price;

      return { uuid };
    }
  }

  // 매도 주문
  async placeSellOrder(market, volume, price) {
    if (this.isLive) {
      return await this.api.placeOrder({
        market,
        side: "ask",
        ord_type: "limit",
        volume: volume.toString(),
        price: price.toString(),
      });
    } else {
      // 백테스트 모의 매도
      const uuid = `mock_${++this.orderCounter}`;
      const holding = this.mockHoldings[market];

      if (!holding || holding.balance < volume) {
        throw new Error("보유량 부족");
      }

      // 주문 등록 (locked 상태)
      holding.balance -= volume;
      holding.locked += volume;

      this.mockOrders[uuid] = {
        uuid,
        market,
        side: "ask",
        ord_type: "limit",
        volume: volume.toString(),
        price: price.toString(),
        state: "wait",
        executed_volume: "0",
        created_at: new Date().toISOString(),
      };

      return { uuid };
    }
  }

  // 시장가 매도
  async placeMarketSellOrder(market, volume) {
    if (this.isLive) {
      return await this.api.placeOrder({
        market,
        side: "ask",
        ord_type: "market",
        volume: volume.toString(),
      });
    } else {
      // 백테스트 모의 시장가 매도
      const uuid = `mock_${++this.orderCounter}`;
      const holding = this.mockHoldings[market];

      if (!holding || holding.balance + holding.locked < volume) {
        throw new Error("보유량 부족");
      }

      // 현재 시장가로 즉시 체결
      const ticker = await this.api.getTicker(market);
      const currentPrice = parseFloat(ticker.trade_price);
      const totalReceived = currentPrice * volume * 0.9996; // 수수료 차감

      this.mockBalance += totalReceived;

      // 보유량에서 차감
      if (holding.locked >= volume) {
        holding.locked -= volume;
      } else {
        const remainingVolume = volume - holding.locked;
        holding.locked = 0;
        holding.balance -= remainingVolume;
      }

      holding.totalQty -= volume;

      // 보유량이 0이면 삭제
      if (holding.totalQty <= 0) {
        delete this.mockHoldings[market];
      }

      this.mockOrders[uuid] = {
        uuid,
        market,
        side: "ask",
        ord_type: "market",
        volume: volume.toString(),
        price: currentPrice.toString(),
        state: "done",
        executed_volume: volume.toString(),
        created_at: new Date().toISOString(),
      };

      return { uuid };
    }
  }

  // 주문 취소
  async cancelOrder(uuid) {
    if (this.isLive) {
      try {
        await this.api.cancelOrder(uuid);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    } else {
      // 백테스트 모의 주문 취소
      const order = this.mockOrders[uuid];
      if (!order) {
        return { success: false, error: "주문을 찾을 수 없습니다" };
      }

      if (order.state === "done") {
        return { success: false, error: "이미 체결된 주문입니다" };
      }

      // locked 수량을 balance로 복구
      const market = order.market;
      const volume = parseFloat(order.volume);
      const holding = this.mockHoldings[market];

      if (holding && order.side === "ask") {
        holding.balance += volume;
        holding.locked -= volume;
      }

      order.state = "cancel";
      return { success: true };
    }
  }

  // 주문 상태 조회
  async getOrderStatus(uuid) {
    if (this.isLive) {
      const order = await this.api.getOrder(uuid);
      return order.state;
    } else {
      const order = this.mockOrders[uuid];
      return order ? order.state : "cancel";
    }
  }

  // 주문 정보 조회
  async getOrderInfo(uuid) {
    if (this.isLive) {
      return await this.api.getOrder(uuid);
    } else {
      return this.mockOrders[uuid] || null;
    }
  }

  // 실제 보유 수량 조회
  async getHolding(market) {
    if (this.isLive) {
      const accounts = await this.api.getAccounts();
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
    } else {
      const holding = this.mockHoldings[market];
      if (!holding) {
        return { balance: 0, locked: 0, totalQty: 0 };
      }

      return {
        balance: holding.balance,
        locked: holding.locked,
        totalQty: holding.totalQty,
      };
    }
  }

  // 모든 보유 종목 조회
  async getAllHoldings() {
    if (this.isLive) {
      const accounts = await this.api.getAccounts();
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
    } else {
      return { ...this.mockHoldings };
    }
  }

  // 모든 활성 주문 조회
  async getAllActiveOrders() {
    if (this.isLive) {
      return await this.api.getOrders("wait");
    } else {
      return Object.values(this.mockOrders).filter(
        (order) => order.state === "wait"
      );
    }
  }

  // 잔액 조회
  async getBalance() {
    if (this.isLive) {
      const accounts = await this.api.getAccounts();
      const krwAccount = accounts.find((acc) => acc.currency === "KRW");
      return parseFloat(krwAccount?.balance || 0);
    } else {
      return this.mockBalance;
    }
  }

  // 백테스트용 주문 체결 시뮬레이션
  simulateOrderExecution(market, currentPrice) {
    if (this.isLive) return;

    // 대기 중인 매도 주문들을 현재가와 비교하여 체결 처리
    Object.values(this.mockOrders).forEach((order) => {
      if (
        order.state === "wait" &&
        order.market === market &&
        order.side === "ask"
      ) {
        const orderPrice = parseFloat(order.price);
        if (currentPrice >= orderPrice) {
          // 주문 체결
          const volume = parseFloat(order.volume);
          const totalReceived = orderPrice * volume * 0.9996; // 수수료 차감

          this.mockBalance += totalReceived;
          order.state = "done";
          order.executed_volume = order.volume;

          // locked 수량 차감
          const holding = this.mockHoldings[market];
          if (holding) {
            holding.locked -= volume;
            holding.totalQty -= volume;

            if (holding.totalQty <= 0) {
              delete this.mockHoldings[market];
            }
          }
        }
      }
    });
  }

  // 백테스트 상태 초기화
  resetBacktestState(initialBalance = 1000000) {
    this.mockBalance = initialBalance;
    this.mockHoldings = {};
    this.mockOrders = {};
    this.orderCounter = 0;
  }

  // 백테스트 결과 조회
  getBacktestResult() {
    const totalAssetValue =
      this.mockBalance +
      Object.values(this.mockHoldings).reduce((sum, holding) => {
        // 현재가로 평가 (실제로는 마지막 가격 필요)
        return sum + holding.totalQty * holding.avgBuyPrice;
      }, 0);

    return {
      finalBalance: this.mockBalance,
      holdings: this.mockHoldings,
      totalAssetValue: totalAssetValue,
      orders: this.mockOrders,
    };
  }
}

module.exports = TradingEngine;
