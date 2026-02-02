// Skill Verification Module with Timeout Guards
// Addresses: Middleware Guard for pre-run skill verification
// Issue: https://github.com/moltbook/moltbook-web-client-application/issues/19

import {
  sessionManager,
  isNetworkError,
  isRecoverableError,
  calculateRetryDelay,
  MAX_RETRIES,
  DEFAULT_SESSION_TIMEOUT,
} from './session';

// Skill verification timeout (5 seconds - shorter than session timeout)
const SKILL_VERIFICATION_TIMEOUT = 5000;

// Skill status types
export type SkillStatus = 'unverified' | 'verifying' | 'verified' | 'failed' | 'disabled';

export interface Skill {
  id: string;
  name: string;
  displayName: string;
  status: SkillStatus;
  verificationUrl?: string;
  lastVerified?: number;
  error?: SkillError;
  retryCount: number;
}

export interface SkillError {
  code: string;
  message: string;
  isNetworkError: boolean;
  timestamp: number;
}

export interface SkillVerificationResult {
  success: boolean;
  skill: Skill;
  error?: SkillError;
}

/**
 * Fetch with timeout wrapper
 * Prevents indefinite hangs during skill verification
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = SKILL_VERIFICATION_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * SkillVerifier handles skill verification with timeout guards.
 *
 * Key features:
 * 1. All verification calls have hard timeouts
 * 2. Network failures don't block the event loop
 * 3. Retries with exponential backoff for recoverable errors
 * 4. Integration with SessionManager for atomic state updates
 */
export class SkillVerifier {
  private skills: Map<string, Skill> = new Map();
  private verificationPromises: Map<string, Promise<SkillVerificationResult>> = new Map();

  /**
   * Register a skill for verification
   */
  registerSkill(
    id: string,
    name: string,
    displayName: string,
    verificationUrl?: string
  ): Skill {
    const skill: Skill = {
      id,
      name,
      displayName,
      status: 'unverified',
      verificationUrl,
      retryCount: 0,
    };

    this.skills.set(id, skill);
    return skill;
  }

  /**
   * Get a skill by ID
   */
  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /**
   * Get all registered skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Verify a skill with timeout guard
   * This is the key function that prevents the livelock by:
   * 1. Using AbortController for timeout
   * 2. Not blocking on network failures
   * 3. Returning immediately on unrecoverable errors
   */
  async verifySkill(
    skillId: string,
    sessionId?: string,
    timeout: number = SKILL_VERIFICATION_TIMEOUT
  ): Promise<SkillVerificationResult> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return {
        success: false,
        skill: {
          id: skillId,
          name: 'unknown',
          displayName: 'Unknown Skill',
          status: 'failed',
          retryCount: 0,
        },
        error: {
          code: 'SKILL_NOT_FOUND',
          message: `Skill ${skillId} is not registered`,
          isNetworkError: false,
          timestamp: Date.now(),
        },
      };
    }

    // Check if there's already a verification in progress for this skill
    const existingPromise = this.verificationPromises.get(skillId);
    if (existingPromise) {
      return existingPromise;
    }

    // If skill doesn't need verification (no URL), mark as verified immediately
    if (!skill.verificationUrl) {
      this.updateSkillStatus(skillId, 'verified');
      return {
        success: true,
        skill: this.skills.get(skillId)!,
      };
    }

    // Create verification promise with timeout
    const verificationPromise = this.performVerification(skill, sessionId, timeout);
    this.verificationPromises.set(skillId, verificationPromise);

    try {
      return await verificationPromise;
    } finally {
      this.verificationPromises.delete(skillId);
    }
  }

  /**
   * Perform the actual verification with retry logic
   */
  private async performVerification(
    skill: Skill,
    sessionId?: string,
    timeout: number = SKILL_VERIFICATION_TIMEOUT
  ): Promise<SkillVerificationResult> {
    this.updateSkillStatus(skill.id, 'verifying');

    // Register abort controller with session manager if session provided
    let abortController: AbortController | undefined;
    if (sessionId) {
      abortController = sessionManager.registerOperation(sessionId);
    }

    let lastError: SkillError | undefined;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      try {
        // Check if operation was cancelled
        if (abortController?.signal.aborted) {
          throw new Error('Operation cancelled');
        }

        const response = await fetchWithTimeout(
          skill.verificationUrl!,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
            signal: abortController?.signal,
          },
          timeout
        );

        if (response.ok) {
          // Verification successful
          this.updateSkillStatus(skill.id, 'verified');
          this.skills.get(skill.id)!.lastVerified = Date.now();
          this.skills.get(skill.id)!.retryCount = 0;

          // CRITICAL: Only now can we mark systemSent if session is provided
          // This ensures systemSent is only true after successful verification
          if (sessionId) {
            sessionManager.markSystemSent(sessionId);
          }

          return {
            success: true,
            skill: this.skills.get(skill.id)!,
          };
        }

        // Non-OK response
        throw new Error(`Verification failed with status ${response.status}`);
      } catch (error) {
        const err = error as Error;

        // Handle abort
        if (err.name === 'AbortError' || err.message === 'Operation cancelled') {
          const cancelError: SkillError = {
            code: 'VERIFICATION_CANCELLED',
            message: 'Skill verification was cancelled',
            isNetworkError: false,
            timestamp: Date.now(),
          };

          this.updateSkillStatus(skill.id, 'failed', cancelError);

          return {
            success: false,
            skill: this.skills.get(skill.id)!,
            error: cancelError,
          };
        }

        // Create error object
        lastError = {
          code: isNetworkError(error) ? 'NETWORK_ERROR' : 'VERIFICATION_ERROR',
          message: err.message || 'Unknown verification error',
          isNetworkError: isNetworkError(error),
          timestamp: Date.now(),
        };

        // Check if error is recoverable and we have retries left
        if (isRecoverableError(error) && attempt < MAX_RETRIES) {
          attempt++;
          this.skills.get(skill.id)!.retryCount = attempt;

          console.warn(
            `[SkillVerifier] Verification attempt ${attempt} failed for ${skill.name}, ` +
            `retrying in ${calculateRetryDelay(attempt)}ms: ${err.message}`
          );

          // Wait before retry with exponential backoff
          await new Promise(resolve =>
            setTimeout(resolve, calculateRetryDelay(attempt))
          );
          continue;
        }

        // Non-recoverable error or max retries exceeded
        break;
      }
    }

    // Verification failed
    this.updateSkillStatus(skill.id, 'failed', lastError);

    // Mark session as errored if provided
    if (sessionId && lastError) {
      sessionManager.errorSession(sessionId, {
        code: lastError.code,
        message: `Skill verification failed for ${skill.name}: ${lastError.message}`,
        recoverable: isRecoverableError(new Error(lastError.message)),
      });
    }

    return {
      success: false,
      skill: this.skills.get(skill.id)!,
      error: lastError,
    };
  }

  /**
   * Update skill status
   */
  private updateSkillStatus(skillId: string, status: SkillStatus, error?: SkillError): void {
    const skill = this.skills.get(skillId);
    if (skill) {
      skill.status = status;
      skill.error = error;
    }
  }

  /**
   * Verify multiple skills in parallel with overall timeout
   */
  async verifyAllSkills(
    sessionId?: string,
    timeout: number = SKILL_VERIFICATION_TIMEOUT
  ): Promise<SkillVerificationResult[]> {
    const skills = this.getAllSkills().filter(s => s.status === 'unverified');

    if (skills.length === 0) {
      return [];
    }

    // Create a race between all verifications and a timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Overall skill verification timeout')), timeout * 2)
    );

    try {
      const results = await Promise.race([
        Promise.all(
          skills.map(skill => this.verifySkill(skill.id, sessionId, timeout))
        ),
        timeoutPromise,
      ]);

      return results;
    } catch (error) {
      console.error('[SkillVerifier] Overall verification timeout exceeded');

      // Mark all verifying skills as failed
      return skills.map(skill => {
        if (skill.status === 'verifying') {
          const timeoutError: SkillError = {
            code: 'VERIFICATION_TIMEOUT',
            message: 'Skill verification timed out',
            isNetworkError: false,
            timestamp: Date.now(),
          };
          this.updateSkillStatus(skill.id, 'failed', timeoutError);

          return {
            success: false,
            skill: this.skills.get(skill.id)!,
            error: timeoutError,
          };
        }

        return {
          success: skill.status === 'verified',
          skill,
        };
      });
    }
  }

  /**
   * Disable a skill (prevents verification attempts)
   */
  disableSkill(skillId: string): void {
    this.updateSkillStatus(skillId, 'disabled');
  }

  /**
   * Enable a skill (allows verification attempts)
   */
  enableSkill(skillId: string): void {
    const skill = this.skills.get(skillId);
    if (skill && skill.status === 'disabled') {
      skill.status = 'unverified';
      skill.error = undefined;
      skill.retryCount = 0;
    }
  }

  /**
   * Reset a failed skill for retry
   */
  resetSkill(skillId: string): void {
    const skill = this.skills.get(skillId);
    if (skill && skill.status === 'failed') {
      skill.status = 'unverified';
      skill.error = undefined;
      skill.retryCount = 0;
    }
  }

  /**
   * Check if all required skills are verified
   */
  areAllSkillsVerified(): boolean {
    return this.getAllSkills()
      .filter(s => s.status !== 'disabled')
      .every(s => s.status === 'verified');
  }

  /**
   * Get failed skills
   */
  getFailedSkills(): Skill[] {
    return this.getAllSkills().filter(s => s.status === 'failed');
  }
}

/**
 * Create and export singleton skill verifier
 */
export const skillVerifier = new SkillVerifier();

/**
 * Register the Moltbook skill (referenced in the bug report)
 */
export function registerMoltbookSkill(): Skill {
  return skillVerifier.registerSkill(
    'moltbook',
    'moltbook',
    'Moltbook',
    // Verification URL - can be overridden via environment variable
    process.env.NEXT_PUBLIC_MOLTBOOK_VERIFICATION_URL
  );
}

export { SKILL_VERIFICATION_TIMEOUT };
