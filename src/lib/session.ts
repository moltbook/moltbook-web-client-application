// Session Management Module
// Addresses: Livelock in Session State due to Synchronous Skill Verification Failure
// Issue: https://github.com/moltbook/moltbook-web-client-application/issues/19

import { getFromStorage, setToStorage, removeFromStorage } from './utils';

// Session state types
export type SessionStatus = 'idle' | 'initializing' | 'running' | 'error' | 'terminated';

export interface SessionStats {
  totalTokens: number;
  turnCount: number;
  startTime: number;
  lastActivityTime: number;
}

export interface SessionConfig {
  model: string;
  system?: string;
  tools?: string[];
  timeout?: number;
}

export interface Session {
  id: string;
  name: string;
  status: SessionStatus;
  // CRITICAL: systemSent is only set to true AFTER successful handoff to LLM provider
  // This prevents the livelock described in issue #19
  systemSent: boolean;
  interrupted: boolean;
  config: SessionConfig;
  stats: SessionStats;
  error?: SessionError;
  createdAt: number;
  updatedAt: number;
}

export interface SessionError {
  code: string;
  message: string;
  recoverable: boolean;
  timestamp: number;
}

// Storage key for sessions
const SESSIONS_STORAGE_KEY = 'moltbook_sessions';

// Default session timeout (30 seconds)
const DEFAULT_SESSION_TIMEOUT = 30000;

// Maximum retries for recoverable errors
const MAX_RETRIES = 3;

// Retry delay base (exponential backoff)
const RETRY_DELAY_BASE = 1000;

/**
 * SessionManager handles atomic state updates to prevent livelocks.
 *
 * Key invariants:
 * 1. systemSent is ONLY set to true after successful LLM handoff
 * 2. State transitions are atomic - no partial updates
 * 3. All operations have timeouts to prevent indefinite hangs
 * 4. Failed operations result in recoverable error states, not deadlocks
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private pendingOperations: Map<string, AbortController> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Load sessions from storage, cleaning up any corrupted/zombie sessions
   */
  private loadFromStorage(): void {
    try {
      const stored = getFromStorage<Record<string, Session>>(SESSIONS_STORAGE_KEY, {});

      for (const [id, session] of Object.entries(stored)) {
        // Clean up zombie sessions (systemSent=true but no activity)
        if (this.isZombieSession(session)) {
          console.warn(`[SessionManager] Cleaning up zombie session: ${id}`);
          continue;
        }

        // Validate session schema before loading
        if (this.validateSession(session)) {
          this.sessions.set(id, session);
        } else {
          console.warn(`[SessionManager] Invalid session schema, skipping: ${id}`);
        }
      }
    } catch (error) {
      console.error('[SessionManager] Failed to load sessions from storage:', error);
      // Start with clean state on corruption
      this.sessions.clear();
    }
  }

  /**
   * Detect zombie sessions that are stuck in livelock state
   * A zombie session has systemSent=true but hasn't had activity in timeout period
   */
  private isZombieSession(session: Session): boolean {
    const timeout = session.config.timeout || DEFAULT_SESSION_TIMEOUT;
    const timeSinceActivity = Date.now() - session.stats.lastActivityTime;

    return (
      session.systemSent === true &&
      session.status !== 'terminated' &&
      session.status !== 'error' &&
      timeSinceActivity > timeout
    );
  }

  /**
   * Validate session schema to catch configuration mismatches
   */
  private validateSession(session: unknown): session is Session {
    if (!session || typeof session !== 'object') return false;

    const s = session as Record<string, unknown>;

    // Required fields
    if (typeof s.id !== 'string') return false;
    if (typeof s.name !== 'string') return false;
    if (typeof s.systemSent !== 'boolean') return false;
    if (typeof s.interrupted !== 'boolean') return false;

    // Validate config - catch "Unrecognized key" issues mentioned in bug report
    if (!s.config || typeof s.config !== 'object') return false;
    const config = s.config as Record<string, unknown>;
    if (typeof config.model !== 'string') return false;

    // Reject sessions with unrecognized keys in config (schema mismatch)
    const allowedConfigKeys = ['model', 'system', 'tools', 'timeout'];
    for (const key of Object.keys(config)) {
      if (!allowedConfigKeys.includes(key)) {
        console.warn(`[SessionManager] Unrecognized config key: ${key}`);
        return false;
      }
    }

    // Validate stats
    if (!s.stats || typeof s.stats !== 'object') return false;

    return true;
  }

  /**
   * Persist sessions to storage atomically
   */
  private saveToStorage(): void {
    try {
      const data: Record<string, Session> = {};
      for (const [id, session] of this.sessions) {
        data[id] = session;
      }
      setToStorage(SESSIONS_STORAGE_KEY, data);
    } catch (error) {
      console.error('[SessionManager] Failed to save sessions to storage:', error);
    }
  }

  /**
   * Create a new session with safe initial state
   * systemSent is explicitly false until LLM handoff succeeds
   */
  createSession(id: string, name: string, config: SessionConfig): Session {
    const now = Date.now();

    const session: Session = {
      id,
      name,
      status: 'idle',
      // CRITICAL: Start with systemSent=false to prevent livelock
      systemSent: false,
      interrupted: false,
      config: {
        ...config,
        timeout: config.timeout || DEFAULT_SESSION_TIMEOUT,
      },
      stats: {
        totalTokens: 0,
        turnCount: 0,
        startTime: now,
        lastActivityTime: now,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(id, session);
    this.saveToStorage();

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Atomically update session state
   * This ensures partial updates don't cause inconsistent state
   */
  updateSession(id: string, updates: Partial<Omit<Session, 'id' | 'createdAt'>>): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    const updatedSession: Session = {
      ...session,
      ...updates,
      updatedAt: Date.now(),
      stats: {
        ...session.stats,
        ...updates.stats,
        lastActivityTime: Date.now(),
      },
    };

    this.sessions.set(id, updatedSession);
    this.saveToStorage();

    return updatedSession;
  }

  /**
   * Mark system as sent ONLY after successful LLM handoff
   * This is the key fix for the livelock issue
   */
  markSystemSent(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    // Only mark systemSent if we're in the right state
    if (session.status !== 'running') {
      console.warn(`[SessionManager] Cannot mark systemSent for session ${id} in status ${session.status}`);
      return undefined;
    }

    return this.updateSession(id, { systemSent: true });
  }

  /**
   * Transition session to running state
   * Does NOT set systemSent - that only happens after LLM handoff
   */
  startSession(id: string): Session | undefined {
    return this.updateSession(id, {
      status: 'running',
      // Explicitly keep systemSent as false until LLM handoff succeeds
      systemSent: false,
    });
  }

  /**
   * Mark session as errored with recovery information
   */
  errorSession(id: string, error: Omit<SessionError, 'timestamp'>): Session | undefined {
    // Cancel any pending operations for this session
    this.cancelPendingOperations(id);

    return this.updateSession(id, {
      status: 'error',
      // Reset systemSent on error to allow recovery
      systemSent: false,
      error: {
        ...error,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Terminate a session cleanly
   */
  terminateSession(id: string): Session | undefined {
    // Cancel any pending operations
    this.cancelPendingOperations(id);

    return this.updateSession(id, {
      status: 'terminated',
      systemSent: false,
      interrupted: true,
    });
  }

  /**
   * Delete a session entirely
   */
  deleteSession(id: string): boolean {
    this.cancelPendingOperations(id);
    const deleted = this.sessions.delete(id);
    if (deleted) {
      this.saveToStorage();
    }
    return deleted;
  }

  /**
   * Register a pending operation with cancellation support
   */
  registerOperation(sessionId: string): AbortController {
    // Cancel any existing operation first
    this.cancelPendingOperations(sessionId);

    const controller = new AbortController();
    this.pendingOperations.set(sessionId, controller);
    return controller;
  }

  /**
   * Cancel pending operations for a session
   */
  cancelPendingOperations(sessionId: string): void {
    const controller = this.pendingOperations.get(sessionId);
    if (controller) {
      controller.abort();
      this.pendingOperations.delete(sessionId);
    }
  }

  /**
   * Clean up zombie sessions across all stored sessions
   */
  cleanupZombieSessions(): number {
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (this.isZombieSession(session)) {
        console.warn(`[SessionManager] Terminating zombie session: ${id}`);
        this.terminateSession(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Update session stats (tokens, turns)
   */
  updateStats(id: string, tokensDelta: number, incrementTurn: boolean = false): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    return this.updateSession(id, {
      stats: {
        ...session.stats,
        totalTokens: session.stats.totalTokens + tokensDelta,
        turnCount: incrementTurn ? session.stats.turnCount + 1 : session.stats.turnCount,
      },
    });
  }
}

/**
 * Create and export singleton session manager
 */
export const sessionManager = new SessionManager();

/**
 * Helper to calculate exponential backoff delay
 */
export function calculateRetryDelay(attempt: number): number {
  return Math.min(RETRY_DELAY_BASE * Math.pow(2, attempt), 30000);
}

/**
 * Check if an error is a network/DNS error that should trigger retry
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('eai_again') ||
      message.includes('enotfound') ||
      message.includes('network') ||
      message.includes('dns') ||
      message.includes('getaddrinfo') ||
      message.includes('fetch failed') ||
      message.includes('connection refused')
    );
  }
  return false;
}

/**
 * Check if an error is recoverable
 */
export function isRecoverableError(error: unknown): boolean {
  // Network errors are recoverable
  if (isNetworkError(error)) return true;

  // HTTP 5xx errors are potentially recoverable
  if (error instanceof Error && 'statusCode' in error) {
    const statusCode = (error as { statusCode: number }).statusCode;
    return statusCode >= 500 && statusCode < 600;
  }

  // Rate limiting is recoverable
  if (error instanceof Error && error.message.includes('rate limit')) {
    return true;
  }

  return false;
}

export { MAX_RETRIES, RETRY_DELAY_BASE, DEFAULT_SESSION_TIMEOUT };
