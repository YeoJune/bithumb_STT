# 🚀 Bithumb Trading Bot (Modular)

모듈화된 빗썸 거래소 자동매매 봇입니다. 실시간 거래와 백테스트를 지원합니다.

## ✨ 주요 기능

- **실시간 자동매매**: 볼륨 급등 시그널 기반 매매
- **백테스트 지원**: 과거 데이터로 전략 검증
- **모듈화 아키텍처**: 깔끔하게 분리된 코드 구조
- **CLI 인터페이스**: 실시간 대시보드와 키보드 단축키
- **웹 인터페이스**: 향후 확장 준비 (기본 구조 제공)

## 📁 프로젝트 구조

```
├── src/                    # 핵심 모듈
│   ├── TradingBot.js      # 메인 트레이딩 로직
│   ├── BithumbAPI.js      # API 통신 모듈
│   ├── TradingEngine.js   # 주문 실행 엔진
│   ├── DataManager.js     # 데이터 관리
│   ├── Logger.js          # 로깅 시스템
│   └── interfaces/
│       └── CLIInterface.js # CLI 인터페이스
├── backtest/              # 백테스트 관련
│   ├── HistoricalDataProvider.js
│   └── BacktestRunner.js
├── web/                   # 웹 인터페이스 (향후)
│   └── server.js
├── logs/                  # 로그 파일
├── backtest_data/         # 백테스트 데이터
└── index.js              # 메인 실행 파일
```

## 🚀 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 설정

`.env` 파일을 생성하고 빗썸 API 키를 설정:

```env
BITHUMB_API_KEY=your_api_key
BITHUMB_SECRET_KEY=your_secret_key
```

### 3. 실행

```bash
# 실시간 거래 시작
npm start
# 또는
node index.js
```

## 🔬 백테스트 사용법

### 1. 과거 데이터 수집

```bash
# 특정 코인의 과거 데이터 수집
npm run collect-data -- --symbols BTC,ETH --days 30

# 또는 직접 실행
node backtest/HistoricalDataProvider.js --symbols BTC,ETH --days 30
```

### 2. 백테스트 실행

```bash
# 백테스트 실행
npm run backtest -- --symbols BTC --start-date 2024-01-01 --end-date 2024-12-31

# 또는 직접 실행
node backtest/BacktestRunner.js --symbols BTC --start-date 2024-01-01 --end-date 2024-12-31
```

### 백테스트 옵션

- `--symbols`: 테스트할 코인 (쉼표로 구분)
- `--start-date`: 시작 날짜 (YYYY-MM-DD)
- `--end-date`: 종료 날짜 (YYYY-MM-DD)
- `--initial-balance`: 초기 잔고 (기본값: 1000000)
- `--help`: 도움말 보기

## 🌐 웹 인터페이스 (향후 확장)

```bash
# 웹 서버 실행
npm run web

# 브라우저에서 http://localhost:3000 접속
```

## ⌨️ CLI 키보드 단축키

- `q`: 봇 종료
- `s`: 수동 매매 시도
- `h`: 보유 종목 상세 보기
- `r`: 통계 초기화

## 📊 거래 전략

- **단기/장기 볼륨 평균** 비교로 급등 감지
- **설정 가능한 임계값**으로 민감도 조정
- **손절/익절** 로직 내장
- **수수료 고려**한 수익성 계산

## 🔧 설정 파라미터

주요 설정값들은 `TradingBot.js`에서 수정 가능:

- `VOLUME_SPIKE_THRESHOLD`: 볼륨 급등 임계값
- `SHORT_TERM_MINUTES`: 단기 평균 시간
- `LONG_TERM_MINUTES`: 장기 평균 시간
- `PROFIT_THRESHOLD`: 익절 임계값
- `LOSS_THRESHOLD`: 손절 임계값

## 📝 로그 및 데이터

- **로그 파일**: `logs/` 폴더에 일자별 저장
- **거래 데이터**: `bot_data.json`에 실시간 저장
- **백테스트 결과**: `backtest_results/` 폴더에 저장

## ⚠️ 주의사항

- 실제 거래 전 반드시 백테스트로 전략 검증
- 소액으로 먼저 테스트 권장
- API 키 보안 유지 필수
- 시장 상황에 따른 전략 조정 필요

## 🤝 기여

이슈나 개선사항이 있으시면 언제든 제보해주세요!
