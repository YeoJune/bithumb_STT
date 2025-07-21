const fs = require("fs");
const path = require("path");

/**
 * 로깅 시스템
 */
class Logger {
  constructor(config = {}) {
    this.logFile = config.logFile || this.generateLogFileName();
    this.enableConsole = config.enableConsole !== false;
    this.enableFile = config.enableFile !== false;
    this.level = config.level || "info"; // debug, info, warn, error

    // 로그 디렉토리 생성
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
  }

  // 로그 파일명 생성 (KST 기준)
  generateLogFileName() {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = kst.toISOString().slice(0, 10);
    return path.join(process.cwd(), `logs/bot_${dateStr}.log`);
  }

  // KST 시간 문자열 생성
  toKSTISOString(date = new Date()) {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().replace("Z", "+09:00");
  }

  // 로그 레벨 확인
  shouldLog(level) {
    return this.levels[level] >= this.levels[this.level];
  }

  // 기본 로그 메서드
  log(message, level = "info") {
    if (!this.shouldLog(level)) return;

    const now = new Date();
    const kstTime = now.toLocaleTimeString("en-US", {
      hour12: false,
      timeZone: "Asia/Seoul",
    });

    const logMessage = `[${kstTime}] ${message}`;

    // 콘솔 출력
    if (this.enableConsole) {
      if (level === "error") {
        console.error(logMessage);
      } else if (level === "warn") {
        console.warn(logMessage);
      } else {
        console.log(logMessage);
      }
    }

    // 파일 출력
    if (this.enableFile) {
      try {
        const timestamp = this.toKSTISOString(now);
        const fileMessage = `${timestamp} [${level.toUpperCase()}] ${message}\n`;
        fs.appendFileSync(this.logFile, fileMessage);
      } catch (error) {
        console.error(`⚠️ 로그 파일 저장 실패: ${error.message}`);
      }
    }
  }

  // 로그 레벨별 메서드
  debug(message) {
    this.log(message, "debug");
  }

  info(message) {
    this.log(message, "info");
  }

  warn(message) {
    this.log(message, "warn");
  }

  error(message) {
    this.log(message, "error");
  }

  // 거래 로그 (특별한 형식)
  trade(type, market, details) {
    const message = `${type} ${market}: ${details}`;
    this.log(`💰 ${message}`, "info");
  }

  // 시스템 로그
  system(message) {
    this.log(`🔧 ${message}`, "info");
  }

  // 에러 로그 (스택 트레이스 포함)
  errorWithStack(error, context = "") {
    let message = `❌ ${context ? context + ": " : ""}${error.message}`;
    if (error.stack) {
      message += `\n스택 트레이스:\n${error.stack}`;
    }
    this.log(message, "error");
  }

  // 성능 측정 시작
  startTimer(label) {
    this.timers = this.timers || {};
    this.timers[label] = Date.now();
  }

  // 성능 측정 종료
  endTimer(label) {
    if (!this.timers || !this.timers[label]) {
      this.warn(`타이머를 찾을 수 없습니다: ${label}`);
      return;
    }

    const elapsed = Date.now() - this.timers[label];
    this.log(`⏱️ ${label}: ${elapsed}ms`, "debug");
    delete this.timers[label];
    return elapsed;
  }

  // 백테스트 전용 로깅
  backtest(message, silent = false) {
    if (!silent) {
      this.log(`🔬 [BACKTEST] ${message}`, "info");
    }
  }

  // 로그 파일 로테이션
  async rotateLog() {
    try {
      if (!fs.existsSync(this.logFile)) return;

      const stats = fs.statSync(this.logFile);
      const maxSize = 10 * 1024 * 1024; // 10MB

      if (stats.size > maxSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const rotatedFile = this.logFile.replace(".log", `_${timestamp}.log`);

        fs.renameSync(this.logFile, rotatedFile);
        this.log("📁 로그 파일이 로테이션되었습니다");

        // 오래된 로그 파일 정리 (30개 초과 시)
        await this.cleanupOldLogs();
      }
    } catch (error) {
      console.error(`로그 로테이션 실패: ${error.message}`);
    }
  }

  // 오래된 로그 파일 정리
  async cleanupOldLogs() {
    try {
      const logDir = path.dirname(this.logFile);
      const baseName = path.basename(this.logFile, ".log");
      const files = fs.readdirSync(logDir);

      const logFiles = files
        .filter((file) => file.startsWith(baseName) && file.endsWith(".log"))
        .map((file) => ({
          name: file,
          path: path.join(logDir, file),
          stat: fs.statSync(path.join(logDir, file)),
        }))
        .sort((a, b) => b.stat.mtime - a.stat.mtime);

      if (logFiles.length > 30) {
        const filesToDelete = logFiles.slice(30);
        filesToDelete.forEach((file) => {
          fs.unlinkSync(file.path);
        });
        this.log(
          `🗑️ ${filesToDelete.length}개의 오래된 로그 파일을 삭제했습니다`
        );
      }
    } catch (error) {
      console.error(`로그 파일 정리 실패: ${error.message}`);
    }
  }

  // 로그 레벨 변경
  setLevel(level) {
    if (this.levels.hasOwnProperty(level)) {
      this.level = level;
      this.log(`로그 레벨이 ${level}로 변경되었습니다`);
    } else {
      this.warn(`잘못된 로그 레벨: ${level}`);
    }
  }

  // 로그 통계
  getStats() {
    try {
      if (!fs.existsSync(this.logFile)) {
        return { size: 0, lines: 0, lastModified: null };
      }

      const stats = fs.statSync(this.logFile);
      const content = fs.readFileSync(this.logFile, "utf8");
      const lines = content.split("\n").length - 1;

      return {
        size: stats.size,
        lines: lines,
        lastModified: stats.mtime,
        path: this.logFile,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  // 최근 로그 조회
  getRecentLogs(lineCount = 100) {
    try {
      if (!fs.existsSync(this.logFile)) {
        return [];
      }

      const content = fs.readFileSync(this.logFile, "utf8");
      const lines = content.split("\n").filter((line) => line.trim());

      return lines.slice(-lineCount);
    } catch (error) {
      this.error(`로그 조회 실패: ${error.message}`);
      return [];
    }
  }

  // 로그 검색
  searchLogs(keyword, lineCount = 100) {
    try {
      const recentLogs = this.getRecentLogs(lineCount * 2); // 더 많은 로그에서 검색
      const matchedLogs = recentLogs.filter((line) =>
        line.toLowerCase().includes(keyword.toLowerCase())
      );

      return matchedLogs.slice(-lineCount);
    } catch (error) {
      this.error(`로그 검색 실패: ${error.message}`);
      return [];
    }
  }

  // 로거 종료
  close() {
    this.log("📝 로거를 종료합니다");
    // 필요시 추가 정리 작업
  }
}

module.exports = Logger;
