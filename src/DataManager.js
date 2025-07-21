const fs = require("fs");
const path = require("path");

/**
 * 데이터 저장/로드 및 상태 관리
 */
class DataManager {
  constructor(config = {}) {
    this.dataFile =
      config.dataFile || path.join(process.cwd(), "bot_data.json");
    this.backupEnabled = config.backupEnabled !== false;
    this.maxBackups = config.maxBackups || 5;
  }

  // 데이터 로드
  async loadData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, "utf8"));
        return data;
      }
      return null;
    } catch (error) {
      throw new Error(`데이터 로드 실패: ${error.message}`);
    }
  }

  // 데이터 저장
  async saveData(data) {
    try {
      // 백업 생성
      if (this.backupEnabled && fs.existsSync(this.dataFile)) {
        await this.createBackup();
      }

      // 새로운 데이터 저장
      const saveData = {
        ...data,
        lastUpdate: new Date().toISOString(),
      };

      fs.writeFileSync(this.dataFile, JSON.stringify(saveData, null, 2));
    } catch (error) {
      throw new Error(`데이터 저장 실패: ${error.message}`);
    }
  }

  // 백업 생성
  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFile = this.dataFile.replace(
        ".json",
        `_backup_${timestamp}.json`
      );

      fs.copyFileSync(this.dataFile, backupFile);

      // 오래된 백업 정리
      await this.cleanupOldBackups();
    } catch (error) {
      // 백업 실패는 치명적이지 않으므로 로그만 남김
      console.warn(`백업 생성 실패: ${error.message}`);
    }
  }

  // 오래된 백업 정리
  async cleanupOldBackups() {
    try {
      const dir = path.dirname(this.dataFile);
      const baseName = path.basename(this.dataFile, ".json");
      const files = fs.readdirSync(dir);

      const backupFiles = files
        .filter((file) => file.startsWith(`${baseName}_backup_`))
        .map((file) => ({
          name: file,
          path: path.join(dir, file),
          stat: fs.statSync(path.join(dir, file)),
        }))
        .sort((a, b) => b.stat.mtime - a.stat.mtime);

      // 최대 백업 수를 초과하는 파일들 삭제
      if (backupFiles.length > this.maxBackups) {
        const filesToDelete = backupFiles.slice(this.maxBackups);
        filesToDelete.forEach((file) => {
          fs.unlinkSync(file.path);
        });
      }
    } catch (error) {
      console.warn(`백업 정리 실패: ${error.message}`);
    }
  }

  // 설정 로드
  async loadConfig(configFile) {
    try {
      if (fs.existsSync(configFile)) {
        const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
        return config;
      }
      return null;
    } catch (error) {
      throw new Error(`설정 로드 실패: ${error.message}`);
    }
  }

  // 설정 저장
  async saveConfig(config, configFile) {
    try {
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      throw new Error(`설정 저장 실패: ${error.message}`);
    }
  }

  // 백테스트 결과 저장
  async saveBacktestResult(result, filename = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const resultFile = filename || `backtest_result_${timestamp}.json`;
      const resultPath = path.join(
        path.dirname(this.dataFile),
        "backtest_results",
        resultFile
      );

      // 디렉토리 생성
      const dir = path.dirname(resultPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
      return resultPath;
    } catch (error) {
      throw new Error(`백테스트 결과 저장 실패: ${error.message}`);
    }
  }

  // 백테스트 결과 목록 조회
  async getBacktestResults() {
    try {
      const resultsDir = path.join(
        path.dirname(this.dataFile),
        "backtest_results"
      );

      if (!fs.existsSync(resultsDir)) {
        return [];
      }

      const files = fs.readdirSync(resultsDir);
      const results = files
        .filter((file) => file.endsWith(".json"))
        .map((file) => {
          const filePath = path.join(resultsDir, file);
          const stat = fs.statSync(filePath);
          return {
            filename: file,
            path: filePath,
            createdAt: stat.mtime,
            size: stat.size,
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);

      return results;
    } catch (error) {
      throw new Error(`백테스트 결과 조회 실패: ${error.message}`);
    }
  }

  // 백테스트 결과 로드
  async loadBacktestResult(filename) {
    try {
      const resultPath = path.join(
        path.dirname(this.dataFile),
        "backtest_results",
        filename
      );

      if (!fs.existsSync(resultPath)) {
        throw new Error("백테스트 결과 파일을 찾을 수 없습니다");
      }

      const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
      return result;
    } catch (error) {
      throw new Error(`백테스트 결과 로드 실패: ${error.message}`);
    }
  }

  // 데이터 무결성 검증
  async validateData(data) {
    const errors = [];

    // 필수 필드 검증
    if (!data.holdings || typeof data.holdings !== "object") {
      errors.push("holdings 필드가 누락되었거나 올바르지 않습니다");
    }

    if (!data.stats || typeof data.stats !== "object") {
      errors.push("stats 필드가 누락되었거나 올바르지 않습니다");
    }

    // holdings 데이터 검증
    if (data.holdings) {
      Object.entries(data.holdings).forEach(([market, holding]) => {
        if (!market.match(/^KRW-[A-Z]+$/)) {
          errors.push(`잘못된 마켓 형식: ${market}`);
        }

        if (
          !holding.state ||
          !["buying", "bought", "profit_waiting"].includes(holding.state)
        ) {
          errors.push(`잘못된 거래 상태: ${market} - ${holding.state}`);
        }

        if (typeof holding.price !== "number" || holding.price <= 0) {
          errors.push(`잘못된 가격 정보: ${market} - ${holding.price}`);
        }
      });
    }

    // stats 데이터 검증
    if (data.stats) {
      const requiredStats = ["trades", "wins", "losses", "totalProfit"];
      requiredStats.forEach((field) => {
        if (typeof data.stats[field] !== "number") {
          errors.push(`잘못된 통계 정보: ${field}`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors: errors,
    };
  }

  // 데이터 복구
  async recoverFromBackup() {
    try {
      const dir = path.dirname(this.dataFile);
      const baseName = path.basename(this.dataFile, ".json");
      const files = fs.readdirSync(dir);

      const backupFiles = files
        .filter((file) => file.startsWith(`${baseName}_backup_`))
        .map((file) => ({
          name: file,
          path: path.join(dir, file),
          stat: fs.statSync(path.join(dir, file)),
        }))
        .sort((a, b) => b.stat.mtime - a.stat.mtime);

      if (backupFiles.length === 0) {
        throw new Error("복구할 백업 파일이 없습니다");
      }

      // 가장 최근 백업으로 복구
      const latestBackup = backupFiles[0];
      fs.copyFileSync(latestBackup.path, this.dataFile);

      return latestBackup.name;
    } catch (error) {
      throw new Error(`데이터 복구 실패: ${error.message}`);
    }
  }

  // 파일 존재 확인
  exists() {
    return fs.existsSync(this.dataFile);
  }

  // 파일 크기 조회
  getFileSize() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const stat = fs.statSync(this.dataFile);
        return stat.size;
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  // 파일 수정 시간 조회
  getLastModified() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const stat = fs.statSync(this.dataFile);
        return stat.mtime;
      }
      return null;
    } catch (error) {
      return null;
    }
  }
}

module.exports = DataManager;
