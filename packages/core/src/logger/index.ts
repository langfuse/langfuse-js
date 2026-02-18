import { getEnv } from "../utils.js";
/**
 * Enumeration of log levels in order of severity (lowest to highest).
 */
export enum LogLevel {
  /** Critical errors that may cause application failure */
  ERROR = 3,
  /** Warning messages for potentially harmful situations */
  WARN = 2,
  /** General informational messages */
  INFO = 1,
  /** Detailed debug information for troubleshooting */
  DEBUG = 0,
}

function parseLogLevelFromEnv(): LogLevel | undefined {
  if (typeof process === "object" && "env" in process) {
    if (getEnv("LANGFUSE_DEBUG")?.toLowerCase() === "true")
      return LogLevel.DEBUG;

    const envValue = getEnv("LANGFUSE_LOG_LEVEL");
    const value = (envValue ?? "").toUpperCase();

    switch (value) {
      case "ERROR":
        return LogLevel.ERROR;
      case "WARN":
        return LogLevel.WARN;
      case "INFO":
        return LogLevel.INFO;
      case "DEBUG":
        return LogLevel.DEBUG;
      default:
        return undefined;
    }
  }
  return undefined;
}

/**
 * Configuration options for the Logger.
 */
export interface LoggerConfig {
  /** The minimum log level to output */
  level: LogLevel;
  /** Optional prefix to prepend to all log messages */
  prefix?: string;
  /** Whether to include timestamps in log messages (default: true) */
  enableTimestamp?: boolean;
}

/**
 * A configurable logger class that supports different log levels and formatting.
 *
 * @example
 * ```typescript
 * const logger = new Logger({ level: LogLevel.DEBUG, prefix: 'Langfuse SDK' });
 * logger.info('Application started');
 * logger.error('An error occurred', error);
 * ```
 */
export class Logger {
  private config: LoggerConfig;

  /**
   * Creates a new Logger instance.
   *
   * @param config - Configuration options for the logger
   */
  constructor(config: LoggerConfig = { level: LogLevel.INFO }) {
    this.config = {
      enableTimestamp: true,
      ...config,
    };
  }

  /**
   * Determines if a message should be logged based on the current log level.
   *
   * @param level - The log level to check
   * @returns True if the message should be logged, false otherwise
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  /**
   * Formats a log message with timestamp, prefix, and log level.
   *
   * @param level - The log level string
   * @param message - The message to format
   * @returns The formatted message string
   */
  private formatMessage(level: string, message: string): string {
    const timestamp = this.config.enableTimestamp
      ? new Date().toISOString()
      : "";
    const prefix = this.config.prefix || "[Langfuse SDK]";
    const parts = [timestamp, prefix, `[${level}]`, message].filter(Boolean);

    return parts.join(" ");
  }

  /**
   * Logs an error message.
   *
   * @param message - The error message to log
   * @param args - Additional arguments to pass to console.error
   */
  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage("ERROR", message), ...args);
    }
  }

  /**
   * Logs a warning message.
   *
   * @param message - The warning message to log
   * @param args - Additional arguments to pass to console.warn
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage("WARN", message), ...args);
    }
  }

  /**
   * Logs an informational message.
   *
   * @param message - The info message to log
   * @param args - Additional arguments to pass to console.info
   */
  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage("INFO", message), ...args);
    }
  }

  /**
   * Logs a debug message.
   *
   * @param message - The debug message to log
   * @param args - Additional arguments to pass to console.debug
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage("DEBUG", message), ...args);
    }
  }

  /**
   * Sets the minimum log level.
   *
   * @param level - The new log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Gets the current log level.
   *
   * @returns The current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Checks if a given log level is enabled.
   * Use this to guard expensive operations (like JSON.stringify) before debug logging.
   *
   * @param level - The log level to check
   * @returns True if the level is enabled, false otherwise
   *
   * @example
   * ```typescript
   * if (logger.isLevelEnabled(LogLevel.DEBUG)) {
   *   logger.debug('Expensive data:', JSON.stringify(largeObject));
   * }
   * ```
   */
  isLevelEnabled(level: LogLevel): boolean {
    return this.shouldLog(level);
  }
}

/**
 * Singleton class that manages a global logger instance.
 */
class LoggerSingleton {
  private static instance: Logger | null = null;
  private static defaultConfig: LoggerConfig = {
    level: parseLogLevelFromEnv() ?? LogLevel.INFO,
  };

  /**
   * Gets the singleton logger instance, creating it if it doesn't exist.
   *
   * @returns The singleton logger instance
   */
  static getInstance(): Logger {
    if (!LoggerSingleton.instance) {
      LoggerSingleton.instance = new Logger(LoggerSingleton.defaultConfig);
    }
    return LoggerSingleton.instance;
  }

  /**
   * Configures the global logger with new settings.
   * This will replace the existing logger instance.
   *
   * @param config - The new logger configuration
   */
  static configure(config: LoggerConfig): void {
    LoggerSingleton.defaultConfig = config;
    LoggerSingleton.instance = new Logger(config);
  }

  /**
   * Resets the singleton logger instance and configuration.
   * Useful for testing or reinitializing the logger.
   */
  static reset(): void {
    LoggerSingleton.instance = null;
    LoggerSingleton.defaultConfig = { level: LogLevel.INFO };
  }
}

/**
 * Creates a new Logger instance with the specified configuration.
 * This is independent of the global singleton logger.
 *
 * @param config - Optional configuration for the logger
 * @returns A new Logger instance
 *
 * @example
 * ```typescript
 * const customLogger = createLogger({ level: LogLevel.DEBUG, prefix: 'Custom' });
 * customLogger.debug('This is a debug message');
 * ```
 */
export const createLogger = (config?: LoggerConfig): Logger => {
  return new Logger(config);
};

/**
 * Gets the global singleton logger instance.
 * If no logger exists, creates one with default configuration.
 *
 * @returns The global logger instance
 *
 * @example
 * ```typescript
 * const logger = getGlobalLogger();
 * logger.info('Application started');
 * ```
 */
export const getGlobalLogger = (): Logger => {
  return LoggerSingleton.getInstance();
};

/**
 * Configures the global logger with new settings.
 * This should be called early in your application initialization.
 *
 * @param config - The logger configuration
 *
 * @example
 * ```typescript
 * configureGlobalLogger({
 *   level: LogLevel.DEBUG,
 *   prefix: 'Langfuse SDK',
 *   enableTimestamp: true
 * });
 * ```
 */
export const configureGlobalLogger = (config: LoggerConfig): void => {
  LoggerSingleton.configure(config);
};

/**
 * Resets the global logger instance and configuration.
 * Primarily used for testing to ensure clean state between tests.
 *
 * @example
 * ```typescript
 * // In test teardown
 * resetGlobalLogger();
 * ```
 */
export const resetGlobalLogger = (): void => {
  LoggerSingleton.reset();
};

/**
 * The singleton logger instance for convenient access.
 * Use this for quick access to the global logger.
 *
 * @example
 * ```typescript
 * import { logger } from '@langfuse/core';
 *
 * logger.getInstance().info('Quick logging');
 * ```
 */
export { LoggerSingleton as logger };
