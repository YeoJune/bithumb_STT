const fs = require("fs");
const path = require("path");
const BithumbAPI = require("../src/BithumbAPI");

function formatDateToISO8601(date) {
  const pad = (n) => n.toString().padStart(2, "0"); // 두 자리 맞춤
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1); // 월은 0부터 시작
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  return `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}`;
}

/**
 * 백테스트용 데이터 수집기
 * BithumbAPI를 사용하여 과거 데이터를 수집하고 저장
 */
class BacktestDataCollector {
  constructor(apiOrConfig = {}) {
    // API 인스턴스가 직접 전달된 경우
    if (apiOrConfig && typeof apiOrConfig.getCandles === "function") {
      this.api = apiOrConfig;
      this.dataDir = path.join(process.cwd(), "backtest_data");
    } else {
      // config 객체가 전달된 경우
      this.dataDir =
        apiOrConfig.dataDir || path.join(process.cwd(), "backtest_data");
      this.api = new BithumbAPI();
    }
    this.ensureDataDirectory();
  }

  // 데이터 디렉토리 생성
  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // 캔들 데이터 수집
  async collectCandles(market, startDate, endDate, unit = 1) {
    const fileName = `${market}_candles_${unit}m_${startDate}_${endDate}.json`;
    const filePath = path.join(this.dataDir, fileName);

    // 이미 파일이 존재하면 로드
    if (fs.existsSync(filePath)) {
      console.log(`📁 기존 데이터 사용: ${fileName}`);
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }

    console.log(`📥 데이터 수집 시작: ${market} (${startDate} ~ ${endDate})`);

    const allCandles = [];
    let currentDate = new Date(endDate);
    const start = new Date(startDate);

    while (currentDate > start) {
      try {
        const candles = await this.api.getCandles(
          market,
          200, // 최대 200개씩
          formatDateToISO8601(currentDate),
          unit
        );

        console.log(candles);

        if (!candles || candles.length === 0) break;

        allCandles.unshift(...candles);
        console.log(
          `📊 수집됨: ${candles.length}개 (총 ${allCandles.length}개)`
        );

        // 가장 오래된 캔들의 시간으로 이동
        const oldestCandle = candles[candles.length - 1];
        currentDate = new Date(oldestCandle.candle_date_time_kst);

        // API 제한 준수
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`데이터 수집 오류: ${error.message}`);
        break;
      }
    }

    // 데이터 저장
    fs.writeFileSync(filePath, JSON.stringify(allCandles, null, 2));
    console.log(`💾 데이터 저장완료: ${fileName} (${allCandles.length}개)`);

    return allCandles;
  }

  // 티커 데이터 수집 (스냅샷)
  async collectTickers(markets) {
    const fileName = `tickers_${Date.now()}.json`;
    const filePath = path.join(this.dataDir, fileName);

    const tickers = await this.api.getTicker(markets);
    fs.writeFileSync(filePath, JSON.stringify(tickers, null, 2));

    console.log(`💾 티커 데이터 저장: ${fileName}`);
    return tickers;
  }

  // 여러 마켓의 데이터 일괄 수집
  async collectMultipleMarkets(markets, startDate, endDate, unit = 1) {
    const results = {};

    for (const market of markets) {
      try {
        results[market] = await this.collectCandles(
          market,
          startDate,
          endDate,
          unit
        );
      } catch (error) {
        console.error(`${market} 데이터 수집 실패: ${error.message}`);
        results[market] = [];
      }
    }

    return results;
  }
}

module.exports = BacktestDataCollector;
