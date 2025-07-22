# 🚀 Bithumb Trading Bot (Enhanced)

모듈화된 빗썸 거래소 자동매매 봇입니다. 실시간 거래, 백테스트, CLI/웹 인터페이스를 지원합니다.

## ✨ 주요 기능

- **실시간 자동매매**: 볼륨 급등 시그널 기반 매매
- **백테스트 지원**: 과거 데이터로 전략 검증
- **CLI 인터페이스**: 색상화된 실시간 대시보드와 키보드 단축키
- **웹 대시보드**: 실시간 통계, 보유 종목, 로그 조회
- **개선된 로깅**: 구조화된 로그 레벨과 색상 출력
- **PM2 지원**: 프로덕션 환경 배포 및 관리
- **모듈화 아키텍처**: 깔끔하게 분리된 코드 구조

## 📁 프로젝트 구조

```
├── src/                    # 핵심 모듈
│   ├── TradingBot.js      # 메인 트레이딩 로직
│   ├── BithumbAPI.js      # API 통신 모듈
│   ├── TradingEngine.js   # 주문 실행 엔진
│   ├── DataManager.js     # 데이터 관리
│   ├── Logger.js          # 개선된 로깅 시스템
│   └── interfaces/
│       └── CLIInterface.js # 색상화된 CLI 인터페이스
├── backtest/              # 백테스트 관련
│   ├── HistoricalDataProvider.js
│   └── BacktestRunner.js
├── web/                   # 웹 인터페이스
│   ├── server.js          # Express 서버
│   └── public/            # 웹 대시보드 파일들
│       ├── index.html     # 대시보드 메인 페이지
│       ├── style.css      # 스타일시트
│       └── app.js         # 클라이언트 JavaScript
├── logs/                  # 로그 파일
├── backtest_data/         # 백테스트 데이터
├── ecosystem.config.js    # PM2 설정
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
BITHUMB_ACCESS_KEY=your_access_key
BITHUMB_SECRET_KEY=your_secret_key
```

### 3. 실행 방법

#### 개발 모드 (CLI + 웹 동시 실행)

```bash
npm start
# 또는
node index.js
```

#### 웹 인터페이스만 실행

```bash
npm run web
```

#### PM2로 프로덕션 실행

```bash
# PM2 설치 (전역)
npm install -g pm2

# 봇 시작
npm run pm2:start

# 상태 확인
npm run pm2:status

# 로그 조회
npm run pm2:logs

# 재시작
npm run pm2:restart

# 중지
npm run pm2:stop
```

## 🎮 CLI 인터페이스 사용법

봇 실행 시 다음 키보드 단축키를 사용할 수 있습니다:

- **[q]** - 봇 종료
- **[s]** - 상세 통계 조회
- **[h]** - 도움말 보기
- **[r]** - 완전 동기화 (지갑과 bot_data 동기화)
- **[l]** - 최근 로그 조회
- **[c]** - 로그 클리어
- **[b]** - 백테스트 메뉴

## 🌐 웹 대시보드

봇 실행 시 자동으로 웹 대시보드가 함께 시작됩니다.

- **URL**: http://localhost:3000
- **기능**:
  - 실시간 통계 (수익/손실, 보유 종목, 승률 등)
  - 현재 상태 모니터링
  - 최근 로그 조회
  - 설정 정보 확인
  - 반응형 디자인 (모바일 지원)

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

## 🛠️ 개선사항 요약

### 로깅 시스템

- **구조화된 로그 레벨**: DEBUG, INFO, WARN, ERROR
- **색상화된 출력**: 콘솔에서 레벨별 색상 구분
- **KST 시간 지원**: 한국 표준시 기준 로그 타임스탬프
- **로그 로테이션**: 자동 파일 크기 관리 및 정리

### CLI 인터페이스

- **실시간 대시보드**: 수익률, 보유 종목, 최근 로그 통합 표시
- **색상화된 UI**: ANSI 색상으로 가독성 향상
- **확장된 단축키**: 로그 조회, 클리어 등 추가 기능
- **사용자 친화적**: 직관적인 인터페이스와 도움말

### 웹 인터페이스

- **실시간 대시보드**: 2초마다 자동 업데이트
- **반응형 디자인**: 모바일 친화적 레이아웃
- **REST API**: 상태, 통계, 로그 등 데이터 제공
- **시각적 차트**: 수익률, 승률 등 그래픽 표시

### PM2 통합

- **프로덕션 배포**: 안정적인 서비스 운영
- **자동 재시작**: 오류 시 자동 복구
- **로그 관리**: 통합된 로그 파일 관리
- **모니터링**: 실시간 상태 확인

## 📊 거래 전략

- **단기/장기 볼륨 평균** 비교로 급등 감지
- **설정 가능한 임계값**으로 민감도 조정
- **손절/익절** 로직 내장
- **수수료 고려**한 수익성 계산

## 🔧 설정 파라미터

주요 설정값들은 `index.js`의 config 객체에서 수정 가능:

- `buyAmount`: 매수 금액 (기본: 10,000원)
- `lossRatio`: 손절 비율 (기본: 1.5%)
- `movingAverages`: 이동평균 설정 (단기: 5분, 장기: 15분)
- `webPort`: 웹 인터페이스 포트 (기본: 3000)
- `timeframes`: 볼륨 필터 임계값 설정

## 📝 로그 및 데이터

- **로그 파일**: `logs/` 폴더에 일자별 저장 (색상, 레벨별 분류)
- **거래 데이터**: `bot_data.json`에 실시간 저장
- **백테스트 결과**: `backtest_results/` 폴더에 저장
- **웹 로그**: 브라우저에서 실시간 조회 가능

## ⚠️ 주의사항

- 실제 거래 전 반드시 백테스트로 전략 검증
- 소액으로 먼저 테스트 권장
- API 키 보안 유지 필수
- 웹 인터페이스는 localhost에서만 접근 (보안상 외부 접근 차단)

## 🔗 유용한 명령어

```bash
# 개발 모드 실행
npm run dev

# PM2로 백그라운드 실행
npm run pm2:start

# 실시간 로그 조회
npm run pm2:logs

# 봇 상태 확인
npm run pm2:status

# 웹 인터페이스만 실행
npm run web
```

- 시장 상황에 따른 전략 조정 필요

## 🤝 기여

이슈나 개선사항이 있으시면 언제든 제보해주세요!
