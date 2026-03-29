import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger } from '../src/logger.js';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = Logger.getInstance();
    logger.clearLogs();
    // Clear console mocks
    vi.clearAllMocks();
  });

  it('should be a singleton', () => {
    const logger1 = Logger.getInstance();
    const logger2 = Logger.getInstance();
    expect(logger1).toBe(logger2);
  });

  it('should log debug messages', () => {
    const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger.debug('Test debug message', { key: 'value' });

    expect(consoleDebugSpy).toHaveBeenCalledWith('[BizCloser:DEBUG]', 'Test debug message', { key: 'value' });
  });

  it('should log info messages', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('Test info message');

    expect(consoleInfoSpy).toHaveBeenCalledWith('[BizCloser:INFO]', 'Test info message', undefined);
  });

  it('should log warning messages', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('Test warning message');

    expect(consoleWarnSpy).toHaveBeenCalledWith('[BizCloser:WARN]', 'Test warning message', undefined);
  });

  it('should log error messages', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('Test error message', { error: 'details' });

    expect(consoleErrorSpy).toHaveBeenCalledWith('[BizCloser:ERROR]', 'Test error message', { error: 'details' });
  });

  it('should store logs internally', () => {
    logger.info('Test message');
    const logs = logger.getLogs();

    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('Test message');
    expect(logs[0].level).toBe('info');
    expect(logs[0].timestamp).toBeInstanceOf(Date);
  });

  it('should filter logs by level', () => {
    logger.debug('Debug message');
    logger.info('Info message');
    logger.error('Error message');

    const errorLogs = logger.getLogs('error');
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0].message).toBe('Error message');
  });

  it('should limit log storage', () => {
    // Fill up the log storage
    for (let i = 0; i < 1005; i++) {
      logger.info(`Message ${i}`);
    }

    const logs = logger.getLogs();
    expect(logs.length).toBeLessThanOrEqual(1000);
  });

  it('should clear logs', () => {
    logger.info('Test message');
    expect(logger.getLogs()).toHaveLength(1);

    logger.clearLogs();
    expect(logger.getLogs()).toHaveLength(0);
  });
});