/**
 * Session Management Tests
 * Tests for: Livelock prevention, atomic state updates, zombie session cleanup
 * Issue: https://github.com/moltbook/moltbook-web-client-application/issues/19
 */

import {
  SessionManager,
  isNetworkError,
  isRecoverableError,
  calculateRetryDelay,
  MAX_RETRIES,
  RETRY_DELAY_BASE,
  DEFAULT_SESSION_TIMEOUT,
} from '@/lib/session';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    localStorageMock.clear();
    manager = new SessionManager();
  });

  describe('createSession', () => {
    it('creates a session with systemSent=false', () => {
      const session = manager.createSession('test-1', 'Test Session', {
        model: 'anthropic/claude-opus-4-5',
      });

      expect(session.id).toBe('test-1');
      expect(session.name).toBe('Test Session');
      expect(session.systemSent).toBe(false); // Critical: must start false
      expect(session.status).toBe('idle');
      expect(session.interrupted).toBe(false);
    });

    it('sets default timeout if not provided', () => {
      const session = manager.createSession('test-2', 'Test', {
        model: 'test-model',
      });

      expect(session.config.timeout).toBe(DEFAULT_SESSION_TIMEOUT);
    });

    it('uses provided timeout', () => {
      const session = manager.createSession('test-3', 'Test', {
        model: 'test-model',
        timeout: 5000,
      });

      expect(session.config.timeout).toBe(5000);
    });
  });

  describe('startSession', () => {
    it('transitions to running but keeps systemSent=false', () => {
      manager.createSession('test-1', 'Test', { model: 'test-model' });
      const session = manager.startSession('test-1');

      expect(session?.status).toBe('running');
      expect(session?.systemSent).toBe(false); // Critical: still false
    });

    it('returns undefined for non-existent session', () => {
      const session = manager.startSession('non-existent');
      expect(session).toBeUndefined();
    });
  });

  describe('markSystemSent', () => {
    it('sets systemSent=true only when session is running', () => {
      manager.createSession('test-1', 'Test', { model: 'test-model' });
      manager.startSession('test-1');
      const session = manager.markSystemSent('test-1');

      expect(session?.systemSent).toBe(true);
    });

    it('does not set systemSent when session is idle', () => {
      manager.createSession('test-1', 'Test', { model: 'test-model' });
      // Don't call startSession
      const session = manager.markSystemSent('test-1');

      expect(session).toBeUndefined();
    });

    it('does not set systemSent when session is in error state', () => {
      manager.createSession('test-1', 'Test', { model: 'test-model' });
      manager.startSession('test-1');
      manager.errorSession('test-1', {
        code: 'TEST_ERROR',
        message: 'Test error',
        recoverable: false,
      });
      const session = manager.markSystemSent('test-1');

      expect(session).toBeUndefined();
    });
  });

  describe('errorSession', () => {
    it('resets systemSent to false on error', () => {
      manager.createSession('test-1', 'Test', { model: 'test-model' });
      manager.startSession('test-1');
      manager.markSystemSent('test-1');

      const session = manager.errorSession('test-1', {
        code: 'NETWORK_ERROR',
        message: 'DNS lookup failed',
        recoverable: true,
      });

      expect(session?.status).toBe('error');
      expect(session?.systemSent).toBe(false); // Reset on error
      expect(session?.error?.code).toBe('NETWORK_ERROR');
    });
  });

  describe('terminateSession', () => {
    it('sets status to terminated and systemSent to false', () => {
      manager.createSession('test-1', 'Test', { model: 'test-model' });
      manager.startSession('test-1');
      manager.markSystemSent('test-1');

      const session = manager.terminateSession('test-1');

      expect(session?.status).toBe('terminated');
      expect(session?.systemSent).toBe(false);
      expect(session?.interrupted).toBe(true);
    });
  });

  describe('updateStats', () => {
    it('updates token count and turn count', () => {
      manager.createSession('test-1', 'Test', { model: 'test-model' });

      manager.updateStats('test-1', 100, true);
      let session = manager.getSession('test-1');
      expect(session?.stats.totalTokens).toBe(100);
      expect(session?.stats.turnCount).toBe(1);

      manager.updateStats('test-1', 50, false);
      session = manager.getSession('test-1');
      expect(session?.stats.totalTokens).toBe(150);
      expect(session?.stats.turnCount).toBe(1);
    });
  });

  describe('cleanupZombieSessions', () => {
    it('terminates zombie sessions', () => {
      // Create a session that looks like a zombie
      const session = manager.createSession('zombie-1', 'Zombie', {
        model: 'test-model',
        timeout: 100, // Very short timeout
      });

      // Manually set it to a zombie state
      manager.startSession('zombie-1');
      manager.markSystemSent('zombie-1');

      // Simulate time passing by manipulating lastActivityTime
      const zombieSession = manager.getSession('zombie-1');
      if (zombieSession) {
        zombieSession.stats.lastActivityTime = Date.now() - 200; // Older than timeout
      }

      const cleaned = manager.cleanupZombieSessions();
      expect(cleaned).toBe(1);

      const updatedSession = manager.getSession('zombie-1');
      expect(updatedSession?.status).toBe('terminated');
    });
  });

  describe('registerOperation', () => {
    it('returns an AbortController', () => {
      manager.createSession('test-1', 'Test', { model: 'test-model' });
      const controller = manager.registerOperation('test-1');

      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.signal.aborted).toBe(false);
    });

    it('cancels previous operation when registering new one', () => {
      manager.createSession('test-1', 'Test', { model: 'test-model' });

      const controller1 = manager.registerOperation('test-1');
      const controller2 = manager.registerOperation('test-1');

      expect(controller1.signal.aborted).toBe(true);
      expect(controller2.signal.aborted).toBe(false);
    });
  });
});

describe('Error Detection Utilities', () => {
  describe('isNetworkError', () => {
    it('detects EAI_AGAIN errors', () => {
      const error = new Error('getaddrinfo EAI_AGAIN moltbook-verification-service');
      expect(isNetworkError(error)).toBe(true);
    });

    it('detects ENOTFOUND errors', () => {
      const error = new Error('getaddrinfo ENOTFOUND example.com');
      expect(isNetworkError(error)).toBe(true);
    });

    it('detects fetch failed errors', () => {
      const error = new Error('fetch failed');
      expect(isNetworkError(error)).toBe(true);
    });

    it('detects connection refused errors', () => {
      const error = new Error('connection refused');
      expect(isNetworkError(error)).toBe(true);
    });

    it('returns false for non-network errors', () => {
      const error = new Error('Invalid JSON');
      expect(isNetworkError(error)).toBe(false);
    });

    it('returns false for non-Error objects', () => {
      expect(isNetworkError('string error')).toBe(false);
      expect(isNetworkError(null)).toBe(false);
      expect(isNetworkError(undefined)).toBe(false);
    });
  });

  describe('isRecoverableError', () => {
    it('marks network errors as recoverable', () => {
      const error = new Error('getaddrinfo EAI_AGAIN');
      expect(isRecoverableError(error)).toBe(true);
    });

    it('marks 5xx errors as recoverable', () => {
      const error = Object.assign(new Error('Server error'), { statusCode: 500 });
      expect(isRecoverableError(error)).toBe(true);

      const error503 = Object.assign(new Error('Service unavailable'), { statusCode: 503 });
      expect(isRecoverableError(error503)).toBe(true);
    });

    it('marks rate limit errors as recoverable', () => {
      const error = new Error('rate limit exceeded');
      expect(isRecoverableError(error)).toBe(true);
    });

    it('marks 4xx errors as non-recoverable', () => {
      const error = Object.assign(new Error('Not found'), { statusCode: 404 });
      expect(isRecoverableError(error)).toBe(false);

      const error401 = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
      expect(isRecoverableError(error401)).toBe(false);
    });
  });

  describe('calculateRetryDelay', () => {
    it('calculates exponential backoff', () => {
      expect(calculateRetryDelay(0)).toBe(RETRY_DELAY_BASE);
      expect(calculateRetryDelay(1)).toBe(RETRY_DELAY_BASE * 2);
      expect(calculateRetryDelay(2)).toBe(RETRY_DELAY_BASE * 4);
      expect(calculateRetryDelay(3)).toBe(RETRY_DELAY_BASE * 8);
    });

    it('caps at 30 seconds', () => {
      expect(calculateRetryDelay(10)).toBe(30000);
      expect(calculateRetryDelay(20)).toBe(30000);
    });
  });
});

describe('Constants', () => {
  it('has reasonable default values', () => {
    expect(MAX_RETRIES).toBeGreaterThanOrEqual(1);
    expect(MAX_RETRIES).toBeLessThanOrEqual(10);
    expect(RETRY_DELAY_BASE).toBeGreaterThan(0);
    expect(DEFAULT_SESSION_TIMEOUT).toBeGreaterThan(0);
  });
});
