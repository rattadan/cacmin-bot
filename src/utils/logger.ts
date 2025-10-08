import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

class Logger {
  private logLevel: LogLevel;
  private logFile: string;

  constructor(level: string = 'info') {
    this.logLevel = this.parseLevel(level);
    this.logFile = path.join(__dirname, '../../logs', `bot-${new Date().toISOString().split('T')[0]}.log`);
    this.ensureLogDirectory();
  }

  private parseLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'error': return LogLevel.ERROR;
      case 'warn': return LogLevel.WARN;
      case 'debug': return LogLevel.DEBUG;
      default: return LogLevel.INFO;
    }
  }

  private ensureLogDirectory(): void {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (level > this.logLevel) return;

    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level];
    const logEntry = `[${timestamp}] [${levelStr}] ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`;

    // Console output
    console.log(logEntry.trim());

    // File output
    fs.appendFileSync(this.logFile, logEntry);
  }

  error(message: string, error?: any): void {
    this.log(LogLevel.ERROR, message, error);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }
}

export const logger = new Logger(config.logLevel);
