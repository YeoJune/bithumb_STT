## 빗썸 Public API (rate limit: 150 times/s)

### **1. 마켓 코드 조회 (All)**

- **기능:** 거래 가능한 마켓과 가상자산 정보를 제공합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/market/all`

**Request - Query Params**
| 필드 | 타입 | 설명 |
|---|---|---|
| `isDetails` | boolean | 상세 정보 노출 여부 (기본값: false) |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `market` | 빗썸에서 제공중인 시장 정보 | String |
| `korean_name` | 거래 대상 디지털 자산 한글명 | String |
| `english_name` | 거래 대상 디지털 자산 영문명 | String |
| `market_warning` | 유의 종목 여부 (NONE, CAUTION) | String |

---

### **2. 캔들 조회**

#### **분(Minute) 캔들**

- **기능:** 분 단위 캔들 정보를 제공합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/candles/minutes/{unit}`

**Request - Path Params**
| 필드 | 타입 | 설명 |
|---|---|---|
| `unit` | int32 | **(필수)** 분 단위 (1, 3, 5, 10, 15, 30, 60, 240) |

**Request - Query Params**
| 필드 | 타입 | 설명 |
|---|---|---|
| `market` | string | **(필수)** 마켓 코드 (예: KRW-BTC) |
| `to` | string | 마지막 캔들 시각 (ISO 8601), 미입력 시 최근 캔들 |
| `count` | int32 | 캔들 개수 (최대 200개, 기본값: 1) |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `market` | 마켓명 | String |
| `candle_date_time_utc` | 캔들 기준 시각 (UTC) | String |
| `candle_date_time_kst` | 캔들 기준 시각 (KST) | String |
| `opening_price` | 시가 | Double |
| `high_price` | 고가 | Double |
| `low_price` | 저가 | Double |
| `trade_price` | 종가 | Double |
| `timestamp` | 캔들 종료 시각 (KST) | Long |
| `candle_acc_trade_price` | 누적 거래 금액 | Double |
| `candle_acc_trade_volume` | 누적 거래량 | Double |
| `unit` | 분 단위 (유닛) | Integer |

#### **일(Day) 캔들**

- **기능:** 일 단위 캔들 정보를 제공합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/candles/days`

**Request - Query Params**
| 필드 | 타입 | 설명 |
|---|---|---|
| `market` | string | **(필수)** 마켓 코드 (예: KRW-BTC) |
| `to` | string | 마지막 캔들 시각 (ISO 8601), 미입력 시 최근 캔들 |
| `count` | int32 | 캔들 개수 (최대 200개, 기본값: 1) |
| `convertingPriceUnit` | string | 종가 환산 화폐 단위 (예: KRW) |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `market` | 마켓명 | String |
| `candle_date_time_utc`| 캔들 기준 시각 (UTC) | String |
| `candle_date_time_kst`| 캔들 기준 시각 (KST) | String |
| `opening_price` | 시가 | Double |
| `high_price` | 고가 | Double |
| `low_price` | 저가 | Double |
| `trade_price` | 종가 | Double |
| `timestamp` | 캔들 종료 시각 (KST) | Long |
| `candle_acc_trade_price`| 누적 거래 금액 | Double |
| `candle_acc_trade_volume`| 누적 거래량 | Double |
| `prev_closing_price`| 전일 종가 (UTC 0시 기준) | Double |
| `change_price` | 전일 종가 대비 변화 금액 | Double |
| `change_rate` | 전일 종가 대비 변화량 | Double |
| `converted_trade_price`| 종가 환산 화폐 단위로 환산된 가격 | Double |

#### **주(Week) / 월(Month) 캔들**

- **기능:** 주/월 단위 캔들 정보를 제공합니다.
- **Endpoint:**
  - `GET https://api.bithumb.com/v1/candles/weeks`
  - `GET https://api.bithumb.com/v1/candles/months`

**Request - Query Params**
| 필드 | 타입 | 설명 |
|---|---|---|
| `market` | string | **(필수)** 마켓 코드 (예: KRW-BTC) |
| `to` | string | 마지막 캔들 시각 (ISO 8601), 미입력 시 최근 캔들 |
| `count` | int32 | 캔들 개수 (최대 200개, 기본값: 1) |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `market` | 마켓명 | String |
| `candle_date_time_utc` | 캔들 기준 시각 (UTC) | String |
| `candle_date_time_kst` | 캔들 기준 시각 (KST) | String |
| `opening_price` | 시가 | Double |
| `high_price` | 고가 | Double |
| `low_price` | 저가 | Double |
| `trade_price` | 종가 | Double |
| `timestamp` | 캔들 종료 시각 (KST) | Long |
| `candle_acc_trade_price` | 누적 거래 금액 | Double |
| `candle_acc_trade_volume` | 누적 거래량 | Double |
| `first_day_of_period` | 캔들 기간의 가장 첫 날 | String |

---

### **3. 최근 체결 내역 (Ticks)**

- **기능:** 해당 종목의 최근 체결 내역을 제공합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/trades/ticks`

**Request - Query Params**
| 필드 | 타입 | 설명 |
|---|---|---|
| `market` | string | **(필수)** 마켓 코드 (예: KRW-BTC) |
| `to` | string | 마지막 체결 시각 (HHmmss 또는 HH:mm:ss) |
| `count` | int32 | 체결 개수 (기본값: 1) |
| `cursor` | string | 페이지네이션 커서 (sequentialId) |
| `daysAgo` | int32 | 최근 7일 이내 데이터 조회 (범위: 1 ~ 7) |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `market` | 마켓 구분 코드 | String |
| `trade_date_utc` | 체결 일자 (UTC) | String |
| `trade_time_utc` | 체결 시각 (UTC) | String |
| `timestamp` | 체결 타임스탬프 | Long |
| `trade_price` | 체결 가격 | Double |
| `trade_volume` | 체결량 | Double |
| `prev_closing_price` | 전일 종가 (UTC 0시 기준) | Double |
| `change_price` | 변화량 | Double |
| `ask_bid` | 매도/매수 | String |
| `sequential_id` | 체결 번호 (Unique) | Long |

---

### **4. 현재가 정보 (Ticker)**

- **기능:** 요청 시점 종목의 스냅샷(현재가, 등락률 등)을 제공합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/ticker`

**Request - Query Params**
| 필드 | 타입 | 설명 |
|---|---|---|
| `markets` | string | **(필수)** 쉼표로 구분된 마켓 코드 (예: KRW-BTC,BTC-ETH) |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `market` | 종목 구분 코드 | String |
| `trade_date/time` | 최근 거래 일자/시각 (UTC/KST) | String |
| `trade_timestamp` | 최근 거래 일시 (UTC) | Long |
| `opening_price` | 시가 | Double |
| `high_price` | 고가 | Double |
| `low_price` | 저가 | Double |
| `trade_price` | 종가 (현재가) | Double |
| `prev_closing_price` | 전일 종가 (KST 0시 기준) | Double |
| `change` | 등락 상태 (EVEN, RISE, FALL) | String |
| `change_price` | 변화액의 절대값 | Double |
| `change_rate` | 변화율의 절대값 | Double |
| `signed_change_price` | 부호가 있는 변화액 | Double |
| `signed_change_rate` | 부호가 있는 변화율 | Double |
| `trade_volume` | 가장 최근 거래량 | Double |
| `acc_trade_price` | 누적 거래대금 (KST 0시 기준) | Double |
| `acc_trade_price_24h` | 24시간 누적 거래대금 | Double |
| `acc_trade_volume` | 누적 거래량 (KST 0시 기준) | Double |
| `acc_trade_volume_24h` | 24시간 누적 거래량 | Double |
| `highest_52_week_price`| 52주 신고가 | Double |
| `highest_52_week_date`| 52주 신고가 달성일 | String |
| `lowest_52_week_price` | 52주 신저가 | Double |
| `lowest_52_week_date` | 52주 신저가 달성일 | String |
| `timestamp` | 타임스탬프 | Long |

---

### **5. 호가 정보 조회 (Orderbook)**

- **기능:** 해당 종목의 호가 정보를 제공합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/orderbook`

**Request - Query Params**
| 필드 | 타입 | 설명 |
|---|---|---|
| `markets` | array of strings | **(필수)** 마켓 코드 목록 (예: KRW-BTC,BTC-ETH) |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `market` | 마켓 코드 | String |
| `timestamp` | 호가 생성 시각 | Long |
| `total_ask_size` | 호가 매도 총 잔량 | Double |
| `total_bid_size` | 호가 매수 총 잔량 | Double |
| `orderbook_units` | 호가 리스트 (아래 객체 포함) | List |
| `ask_price` | 매도호가 | Double |
| `bid_price` | 매수호가 | Double |
| `ask_size` | 매도 잔량 | Double |
| `bid_size` | 매수 잔량 | Double |

---

### **6. 경보제 (Warning)**

- **기능:** 경보(투자유의/주의) 중인 마켓-코인 목록을 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/market/virtual_asset_warning`

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `market` | 시장 정보 | String |
| `warning_type` | 경보 유형 (가격 급등락, 거래량 급등 등) | String |
| `end_date` | 경보 종료일시 (KST) | String |

## 빗썸 Private API (rate limit: 140 times/s)

**※ 모든 Private API는 Header에 `Authorization: Bearer {JWT}` 토큰을 필수로 요구합니다.**

---

### **1. 계좌 (Account)**

#### **1.1. 전체 계좌 조회**

- **기능:** 보유 중인 자산 정보를 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/accounts`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `currency` | 화폐를 의미하는 영문 대문자 코드 | String |
| `balance` | 주문가능 금액/수량 | NumberString |
| `locked` | 주문 중 묶여있는 금액/수량 | NumberString |
| `avg_buy_price` | 매수평균가 | NumberString |
| `avg_buy_price_modified` | 매수평균가 수정 여부 | Boolean |
| `unit_currency` | 평단가 기준 화폐 | String |

---

### **2. 주문 (Order)**

#### **2.1. 주문 가능 정보**

- **기능:** 마켓별 주문 가능 정보를 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/orders/chance`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Query Params**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `market` | string | O | Market ID |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `bid_fee` | 매수 수수료 비율 | NumberString |
| `ask_fee` | 매도 수수료 비율 | NumberString |
| `maker_bid_fee`| 마켓 매수 수수료 비율 | NumberString |
| `maker_ask_fee`| 마켓 매도 수수료 비율 | NumberString |
| `market` | 마켓에 대한 정보 | Object |
| `market.id` | 마켓의 유일 키 | String |
| `market.name` | 마켓 이름 | String |
| `market.order_types`| 지원 주문 방식 | Array[String] |
| `market.ask_types`| 매도 주문 지원 방식 | Array[String] |
| `market.bid_types`| 매수 주문 지원 방식 | Array[String] |
| `market.order_sides`| 지원 주문 종류 | Array[String] |
| `market.bid` | 매수 시 제약사항 | Object |
| `market.bid.currency`| 화폐를 의미하는 영문 대문자 코드 | String |
| `market.bid.price_unit`| 주문금액 단위 | NumberString |
| `market.bid.min_total`| 최소 매도/매수 금액 | NumberString |
| `market.ask` | 매도 시 제약사항 | Object |
| `market.ask.currency`| 화폐를 의미하는 영문 대문자 코드 | String |
| `market.ask.price_unit`| 주문금액 단위 | NumberString |
| `market.ask.min_total`| 최소 매도/매수 금액 | NumberString |
| `market.max_total`| 최대 매도/매수 금액 | NumberString |
| `market.state` | 마켓 운영 상태 | String |
| `bid_account` | 매수 시 사용하는 화폐의 계좌 상태 | Object |
| `bid_account.currency`| 화폐를 의미하는 영문 대문자 코드 | String |
| `bid_account.balance`| 주문가능 금액/수량 | NumberString |
| `bid_account.locked`| 주문 중 묶여있는 금액/수량 | NumberString |
| `bid_account.avg_buy_price`| 매수평균가 | NumberString |
| `bid_account.avg_buy_price_modified`| 매수평균가 수정 여부 | Boolean |
| `bid_account.unit_currency`| 평단가 기준 화폐 | String |
| `ask_account` | 매도 시 사용하는 화폐의 계좌 상태 | Object |
| `ask_account.currency`| 화폐를 의미하는 영문 대문자 코드 | String |
| `ask_account.balance`| 주문가능 금액/수량 | NumberString |
| `ask_account.locked`| 주문 중 묶여있는 금액/수량 | NumberString |
| `ask_account.avg_buy_price`| 매수평균가 | NumberString |
| `ask_account.avg_buy_price_modified`| 매수평균가 수정 여부 | Boolean |
| `ask_account.unit_currency`| 평단가 기준 화폐 | String |

#### **2.2. 개별 주문 조회**

- **기능:** 주문 UUID로 해당 주문의 내역을 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/order`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Query Params**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `uuid` | string | O | 주문 UUID |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `uuid` | 주문의 고유 아이디 | String |
| `side` | 주문 종류 | String |
| `ord_type` | 주문 방식 | String |
| `price` | 주문 당시 화폐 가격 | NumberString |
| `state` | 주문 상태 | String |
| `market` | 마켓의 유일키 | String |
| `created_at` | 주문 생성 시간 | DateString |
| `volume` | 사용자가 입력한 주문 양 | NumberString |
| `remaining_volume` | 체결 후 남은 주문 양 | NumberString |
| `reserved_fee` | 수수료로 예약된 비용 | NumberString |
| `remaining_fee`| 남은 수수료 | NumberString |
| `paid_fee` | 사용된 수수료 | NumberString |
| `locked` | 거래에 사용중인 비용 | NumberString |
| `executed_volume`| 체결된 양 | NumberString |
| `trades_count` | 해당 주문에 걸린 체결 수 | Integer |
| `trades` | 체결 목록 | Array[Object] |
| `trades.market` | 마켓의 유일 키 | String |
| `trades.uuid` | 체결의 고유 아이디 | String |
| `trades.price` | 체결 가격 | NumberString |
| `trades.volume` | 체결 양 | NumberString |
| `trades.funds` | 체결된 총 가격 | NumberString |
| `trades.side` | 체결 종류 | String |
| `trades.created_at`| 체결 시각 | DateString |

#### **2.3. 주문 리스트 조회**

- **기능:** 주문 목록을 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/orders`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Query Params**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `market` | string | X | 마켓 ID |
| `uuids` | array of strings | X | 주문 UUID 목록 |
| `state` | string | X | 주문 상태 (`wait`, `watch`, `done`, `cancel`) |
| `states` | array of strings | X | 주문 상태 목록 |
| `page` | int32 | X | 페이지 수 (기본값: 1) |
| `limit` | int32 | X | 개수 제한 (기본값: 100, 최대 100) |
| `order_by`| string | X | 정렬방식 (`asc`, `desc`) (기본값: `desc`) |

**Response**

- `개별 주문 조회` 응답과 동일한 구조의 객체 배열. 단, `trades` 필드는 포함되지 않음.

#### **2.4. 주문 취소 접수**

- **기능:** 주문 UUID로 해당 주문을 취소 접수합니다.
- **Endpoint:** `DELETE https://api.bithumb.com/v1/order`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Query Params**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `uuid` | string | O | 취소할 주문의 UUID |

**Response**

- `개별 주문 조회` 응답과 동일한 구조.

#### **2.5. 주문하기**

- **기능:** 주문을 요청합니다.
- **Endpoint:** `POST https://api.bithumb.com/v1/orders`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Body Params**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `market` | string | O | 마켓 ID |
| `side` | string | O | 주문 종류 (`bid`: 매수, `ask`: 매도) |
| `volume` | NumberString | O | 주문량 (지정가, 시장가 매도 시 필수) |
| `price` | NumberString | O | 주문 가격 (지정가, 시장가 매수 시 필수) |
| `ord_type`| string | O | 주문 타입 (`limit`: 지정가, `price`: 시장가 매수, `market`: 시장가 매도) |

**Response**

- `개별 주문 조회` 응답과 동일한 구조.

---

### **3. 출금 (Withdrawal)**

#### **3.1. 코인 출금 리스트 조회**

- **기능:** 가상자산 출금 목록을 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/withdraws`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Query Params**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `currency` | string | X | 화폐를 의미하는 영문 대문자 코드 |
| `state` | string | X | 출금 상태 (`PROCESSING`, `DONE`, `CANCELED`) |
| `uuids` | array of strings| X | 출금 UUID 목록 |
| `txids` | array of strings| X | 출금 TXID 목록 |
| `page` | int32 | X | 페이지 수 (기본값: 1) |
| `limit` | int32 | X | 개수 제한 (기본값: 100, 최대 100) |
| `order_by`| string | X | 정렬방식 (`asc`, `desc`) (기본값: `desc`) |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `type` | 입출금 종류 | String |
| `uuid` | 출금의 고유 아이디 | String |
| `currency` | 화폐를 의미하는 영문 대문자 코드 | String |
| `net_type` | 출금 네트워크 | String |
| `txid` | 출금의 트랜잭션 아이디 | String |
| `state` | 출금 상태 (`PROCESSING`, `DONE`, `CANCELLED`) | String |
| `created_at`| 출금 생성 시간 | DateString |
| `done_at` | 출금 완료 시간 | DateString |
| `amount` | 출금 금액/수량 | NumberString |
| `fee` | 출금 수수료 | NumberString |
| `transaction_type`| 출금 유형 (`default`: 일반출금) | String |

#### **3.2. 원화 출금 리스트 조회**

- **기능:** 원화 출금 목록을 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/withdraws/krw`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Query Params**

- `코인 출금 리스트 조회`와 동일하나 `currency` 파라미터는 없음.

**Response**

- `코인 출금 리스트 조회`와 동일하나 `net_type` 필드는 없음.

#### **3.3. 개별 출금 조회**

- **기능:** 출금 UUID로 해당 출금 건의 내역을 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/withdraw`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Query Params**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `currency`| string | O | 화폐를 의미하는 영문 대문자 코드 |
| `uuid` | string | X | 출금 UUID |
| `txid` | string | X | 출금 TXID |

**Response**

- `코인 출금 리스트 조회` 응답과 동일한 구조.

#### **3.4. 출금 가능 정보**

- **기능:** 해당 통화의 출금 가능 정보를 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/withdraws/chance`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Query Params**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `currency`| string | O | 화폐를 의미하는 영문 대문자 코드 |
| `net_type`| string | O | 출금 네트워크 |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `member_level` | 사용자의 보안등급 정보 | Object |
| `member_level.security_level` | 사용자의 보안등급 | Integer |
| `member_level.fee_level` | 사용자의 수수료등급 | Integer |
| `member_level.email_verified`| 이메일 인증 여부 | Boolean |
| `member_level.identity_auth_verified`| 실명 인증 여부 | Boolean |
| `member_level.bank_account_verified`| 계좌 인증 여부 | Boolean |
| `member_level.two_factor_auth_verified`| 2FA 인증 활성화 여부 | Boolean |
| `member_level.locked` | 계정 보호 상태 | Boolean |
| `member_level.wallet_locked` | 출금 보호 상태 | Boolean |
| `currency` | 화폐 정보 | Object |
| `currency.code` | 화폐를 의미하는 영문 대문자 코드 | String |
| `currency.withdraw_fee`| 해당 화폐의 출금 수수료 | NumberString |
| `currency.is_coin` | 디지털 자산 여부 | Boolean |
| `currency.wallet_state`| 해당 화폐의 지갑 상태 | String |
| `currency.wallet_support`| 지원하는 입출금 정보 | Array[String]|
| `account` | 사용자의 계좌 정보 | Object |
| `account.currency` | 화폐를 의미하는 영문 대문자 코드 | String |
| `account.balance` | 주문가능 금액/수량 | NumberString |
| `account.locked` | 주문 중 묶여있는 금액/수량 | NumberString |
| `account.avg_buy_price` | 평균매수가 | NumberString |
| `account.avg_buy_price_modified`| 평균매수가 수정 여부 | Boolean |
| `account.unit_currency` | 평단가 기준 화폐 | String |
| `withdraw_limit` | 출금 제약 정보 | Object |
| `withdraw_limit.currency` | 화폐를 의미하는 영문 대문자 코드| String |
| `withdraw_limit.minimum` | 출금 최소 금액/수량 | NumberString |
| `withdraw_limit.onetime` | 1회 출금 한도 | NumberString |
| `withdraw_limit.daily` | 1일 출금 한도 | NumberString |
| `withdraw_limit.remaining_daily`| 1일 잔여 출금 한도 | NumberString |
| `withdraw_limit.fixed` | 출금 금액/수량 소수점 자리 수 | Integer |
| `withdraw_limit.can_withdraw`| 출금 지원 여부 | Boolean |
| `withdraw_limit.remaining_daily_krw`| 통합 1일 잔여 출금 한도 | NumberString |

#### **3.5. 가상 자산 출금하기**

- **기능:** 가상 자산 출금을 요청합니다.
- **Endpoint:** `POST https://api.bithumb.com/v1/withdraws/coin`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Body Params**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `currency` | string | O | 화폐를 의미하는 영문 대문자 코드 |
| `net_type` | string | O | 출금 네트워크 |
| `amount` | Number | O | 출금 수량 |
| `address` | string | O | 출금 가능 주소에 등록된 출금 주소 |
| `secondary_address` | string | X | 2차 출금 주소 (필요한 디지털 자산에 한해서) |
| `exchange_name` | string | X | 출금 거래소명(영문) |
| `receiver_type` | string | X | 수취인 개인/법인 여부 (`personal`, `corporation`) |
| `receiver_ko_name` | string | X | 수취인 국문명(개인: 개인 국문명, 법인: 법인 대표자 국문명) |
| `receiver_en_name` | string | X | 수취인 영문명(개인: 개인 영문명, 법인: 법인 대표자 영문명) |
| `receiver_corp_ko_name` | string | X | 법인 국문명 (수취인 법인인 경우 필수) |
| `receiver_corp_en_name` | string | X | 법인 영문명 (수취인 법인인 경우 필수) |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `type` | 입출금 종류 | String |
| `uuid` | 출금의 고유 아이디 | String |
| `currency` | 화폐를 의미하는 영문 대문자 코드 | String |
| `net_type` | 출금 네트워크 | String |
| `txid` | 출금의 트랜잭션 아이디 | String |
| `state` | 출금 상태 | String |
| `created_at`| 출금 생성 시간 | DateString |
| `done_at` | 출금 완료 시간 | DateString |
| `amount` | 출금 금액/수량 | NumberString |
| `fee` | 출금 수수료 | NumberString |
| `krw_amount` | 원화 환산 가격 | NumberString |
| `transaction_type`| 출금유형 (`default`: 일반출금) | String |

#### **3.6. 원화 출금하기**

- **기능:** 등록된 출금 계좌로 원화 출금을 요청합니다.
- **Endpoint:** `POST https://api.bithumb.com/v1/withdraws/krw`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Body Params**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `amount` | NumberString | O | 출금액 |
| `two_factor_type` | string | O | 2차 인증 수단 (`kakao`) |

**Response**

- `원화 출금 리스트 조회` 응답과 동일한 구조.

#### **3.7. 출금 허용 주소 리스트 조회**

- **기능:** 등록된 출금 허용 주소 리스트를 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/withdraws/coin_addresses`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `currency` | 화폐를 의미하는 영문 대문자 코드 | String |
| `net_type` | 출금 네트워크 타입 | String |
| `network_name` | 출금 네트워크 이름 | String |
| `withdraw_address` | 출금 주소 | String |
| `secondary_address` | 2차 출금 주소 | String |
| `exchange_name` | 출금 거래소명 (영문) | String |
| `owner_type`| 주소 소유주 고객 타입 (`personal`, `corporation`) | String |
| `owner_ko_name` | 주소 소유주 국문명 | String |
| `owner_en_name` | 주소 소유주 영문명 | String |
| `owner_corp_ko_name`| 주소 소유 법인 국문명 | String |
| `owner_corp_en_name`| 주소 소유 법인 영문명 | String |

---

### **4. 입금 (Deposit)**

#### **4.1. 코인 입금 리스트 조회**

- **기능:** 가상자산 입금 목록을 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/deposits`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Query Params**

- `코인 출금 리스트 조회`와 동일한 파라미터.

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `type` | 입출금 종류 | String |
| `uuid` | 입금에 대한 고유 아이디 | String |
| `currency` | 화폐를 의미하는 영문 대문자 코드 | String |
| `net_type` | 입금 네트워크 | String |
| `txid` | 입금의 트랜잭션 아이디 | String |
| `state` | 입금 상태 (다양한 상태값 존재) | String |
| `created_at`| 입금 생성 시간 | DateString |
| `done_at` | 입금 완료 시간 | DateString |
| `amount` | 입금 수량 | NumberString |
| `fee` | 입금 수수료 | NumberString |
| `transaction_type`| 입금 유형 (`default`: 일반입금) | String |

#### **4.2. 원화 입금 리스트 조회**

- **기능:** 원화 입금 목록을 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/deposits/krw`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Query Params**

- `원화 출금 리스트 조회`와 동일한 파라미터.

**Response**

- `원화 출금 리스트 조회`와 동일한 구조.

#### **4.3. 개별 입금 조회**

- **기능:** 입금 UUID로 해당 입금 건의 내역을 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/deposit`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Query Params**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `currency`| string | O | 화폐를 의미하는 영문 대문자 코드 |
| `uuid` | string | X | 입금 UUID |
| `txid` | string | X | 입금 TXID |

**Response**

- `코인 입금 리스트 조회` 응답과 동일한 구조.

#### **4.4. 입금 주소 생성 요청**

- **기능:** 입금 주소 생성을 요청합니다.
- **Endpoint:** `POST https://api.bithumb.com/v1/deposits/generate_coin_address`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Body Params**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `currency`| string | O | 화폐를 의미하는 영문 대문자 코드 |
| `net_type`| string | O | 입금 네트워크 |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `currency` | 화폐를 의미하는 영문 대문자 코드 | String |
| `net_type` | 입금 네트워크 | String |
| `deposit_address`| 입금 주소 | String |
| `secondary_address`| 2차 입금 주소 | String |

#### **4.5. 전체 입금 주소 조회**

- **기능:** 전체 입금 주소를 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/deposits/coin_addresses`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Response**

- `입금 주소 생성 요청` 응답과 동일한 구조의 객체 배열.

#### **4.6. 개별 입금 주소 조회**

- **기능:** 가상자산별 입금 주소를 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/deposits/coin_address`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Request - Query Params**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `currency`| string | O | 화폐를 의미하는 영문 대문자 코드 |
| `net_type`| string | O | 입금 네트워크 |

**Response**

- `입금 주소 생성 요청` 응답과 동일한 구조.

---

### **5. 기타 (ETC)**

#### **5.1. 입출금 현황**

- **기능:** 입출금 현황과 블록 상태를 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/status/wallet`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `currency` | 화폐를 의미하는 영문 대문자 코드 | String |
| `wallet_state`| 입출금 상태 (`working`, `withdraw_only`, `deposit_only`, `paused`) | String |
| `block_state` | 블록 상태 (`normal`, `delayed`, `inactive`) | String |
| `block_height`| 블록 높이 | Integer |
| `block_updated_at`| 블록 갱신 시각 | DateString |
| `block_elapsed_minutes`| 블록 정보 최종 갱신 후 경과 시간 (분) | Integer |
| `net_type` | 입출금 관련 요청 시 지정해야 할 네트워크 타입 | String |
| `network_name` | 입출금 네트워크 이름 | String |

#### **5.2. API 키 리스트 조회**

- **기능:** API 키 리스트와 만료 일자를 조회합니다.
- **Endpoint:** `GET https://api.bithumb.com/v1/api_keys`

**Headers**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `Authorization` | string | O | Authorization token (JWT) |

**Response**
| 필드 | 설명 | 타입 |
|---|---|---|
| `access_key`| API KEY | String |
| `expire_at` | 만료일시 | DateString |
