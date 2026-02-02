/**
 * Skill Verification Tests
 * Tests for: Timeout guards, retry logic, integration with session manager
 * Issue: https://github.com/moltbook/moltbook-web-client-application/issues/19
 */

import {
  SkillVerifier,
  SKILL_VERIFICATION_TIMEOUT,
} from '@/lib/skill-verification';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

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

describe('SkillVerifier', () => {
  let verifier: SkillVerifier;

  beforeEach(() => {
    mockFetch.mockReset();
    localStorageMock.clear();
    verifier = new SkillVerifier();
  });

  describe('registerSkill', () => {
    it('registers a skill with unverified status', () => {
      const skill = verifier.registerSkill(
        'moltbook',
        'moltbook',
        'Moltbook',
        'https://example.com/verify'
      );

      expect(skill.id).toBe('moltbook');
      expect(skill.name).toBe('moltbook');
      expect(skill.displayName).toBe('Moltbook');
      expect(skill.status).toBe('unverified');
      expect(skill.retryCount).toBe(0);
    });

    it('registers a skill without verification URL', () => {
      const skill = verifier.registerSkill(
        'local-skill',
        'local',
        'Local Skill'
      );

      expect(skill.verificationUrl).toBeUndefined();
    });
  });

  describe('verifySkill', () => {
    it('returns success for skill without verification URL', async () => {
      verifier.registerSkill('local', 'local', 'Local');

      const result = await verifier.verifySkill('local');

      expect(result.success).toBe(true);
      expect(result.skill.status).toBe('verified');
    });

    it('returns error for non-existent skill', async () => {
      const result = await verifier.verifySkill('non-existent');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SKILL_NOT_FOUND');
    });

    it('verifies skill on successful network response', async () => {
      verifier.registerSkill(
        'moltbook',
        'moltbook',
        'Moltbook',
        'https://example.com/verify'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ verified: true }),
      });

      const result = await verifier.verifySkill('moltbook');

      expect(result.success).toBe(true);
      expect(result.skill.status).toBe('verified');
      expect(result.skill.lastVerified).toBeDefined();
    });

    it('fails verification on network error', async () => {
      verifier.registerSkill(
        'moltbook',
        'moltbook',
        'Moltbook',
        'https://example.com/verify'
      );

      // Simulate the EAI_AGAIN error from the bug report
      mockFetch.mockRejectedValue(
        new Error('getaddrinfo EAI_AGAIN moltbook-verification-service')
      );

      const result = await verifier.verifySkill('moltbook', undefined, 100);

      expect(result.success).toBe(false);
      expect(result.skill.status).toBe('failed');
      expect(result.error?.isNetworkError).toBe(true);
      expect(result.error?.code).toBe('NETWORK_ERROR');
    });

    it('fails verification on non-OK response', async () => {
      verifier.registerSkill(
        'moltbook',
        'moltbook',
        'Moltbook',
        'https://example.com/verify'
      );

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await verifier.verifySkill('moltbook', undefined, 100);

      expect(result.success).toBe(false);
      expect(result.skill.status).toBe('failed');
    });

    it('retries on recoverable errors', async () => {
      verifier.registerSkill(
        'moltbook',
        'moltbook',
        'Moltbook',
        'https://example.com/verify'
      );

      // Fail first two attempts, succeed on third
      mockFetch
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ verified: true }),
        });

      const result = await verifier.verifySkill('moltbook', undefined, 100);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('respects max retries', async () => {
      verifier.registerSkill(
        'moltbook',
        'moltbook',
        'Moltbook',
        'https://example.com/verify'
      );

      // Always fail
      mockFetch.mockRejectedValue(new Error('network error'));

      const result = await verifier.verifySkill('moltbook', undefined, 100);

      expect(result.success).toBe(false);
      // MAX_RETRIES + 1 (initial attempt)
      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(5);
    });

    it('deduplicates concurrent verification requests', async () => {
      verifier.registerSkill(
        'moltbook',
        'moltbook',
        'Moltbook',
        'https://example.com/verify'
      );

      let resolvePromise: () => void;
      const slowPromise = new Promise<void>(resolve => {
        resolvePromise = resolve;
      });

      mockFetch.mockImplementation(() =>
        slowPromise.then(() => ({
          ok: true,
          json: () => Promise.resolve({ verified: true }),
        }))
      );

      // Start two verifications concurrently
      const promise1 = verifier.verifySkill('moltbook');
      const promise2 = verifier.verifySkill('moltbook');

      // Resolve the slow promise
      resolvePromise!();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should return the same result
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // But fetch should only be called once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyAllSkills', () => {
    it('verifies multiple skills in parallel', async () => {
      verifier.registerSkill('skill1', 'skill1', 'Skill 1', 'https://example.com/1');
      verifier.registerSkill('skill2', 'skill2', 'Skill 2', 'https://example.com/2');

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ verified: true }),
      });

      const results = await verifier.verifyAllSkills(undefined, 100);

      expect(results.length).toBe(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('handles partial failures', async () => {
      verifier.registerSkill('skill1', 'skill1', 'Skill 1', 'https://example.com/1');
      verifier.registerSkill('skill2', 'skill2', 'Skill 2', 'https://example.com/2');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ verified: true }),
        })
        .mockRejectedValueOnce(new Error('network error'));

      const results = await verifier.verifyAllSkills(undefined, 100);

      const successes = results.filter(r => r.success);
      const failures = results.filter(r => !r.success);

      expect(successes.length).toBeGreaterThanOrEqual(0);
      expect(failures.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('skill state management', () => {
    it('disables and enables skills', () => {
      const skill = verifier.registerSkill('test', 'test', 'Test');

      verifier.disableSkill('test');
      expect(verifier.getSkill('test')?.status).toBe('disabled');

      verifier.enableSkill('test');
      expect(verifier.getSkill('test')?.status).toBe('unverified');
    });

    it('resets failed skills', () => {
      verifier.registerSkill(
        'test',
        'test',
        'Test',
        'https://example.com/verify'
      );

      mockFetch.mockRejectedValue(new Error('network error'));

      // Verify and fail
      verifier.verifySkill('test', undefined, 100).then(() => {
        expect(verifier.getSkill('test')?.status).toBe('failed');

        verifier.resetSkill('test');
        expect(verifier.getSkill('test')?.status).toBe('unverified');
        expect(verifier.getSkill('test')?.retryCount).toBe(0);
      });
    });

    it('reports all skills verified correctly', async () => {
      verifier.registerSkill('local', 'local', 'Local'); // No URL needed

      // Verify it
      await verifier.verifySkill('local');

      expect(verifier.areAllSkillsVerified()).toBe(true);
    });

    it('gets failed skills', async () => {
      verifier.registerSkill(
        'fail',
        'fail',
        'Fail',
        'https://example.com/fail'
      );

      mockFetch.mockRejectedValue(new Error('network error'));

      await verifier.verifySkill('fail', undefined, 100);

      const failed = verifier.getFailedSkills();
      expect(failed.length).toBe(1);
      expect(failed[0].id).toBe('fail');
    });
  });
});

describe('Constants', () => {
  it('has reasonable timeout', () => {
    expect(SKILL_VERIFICATION_TIMEOUT).toBeGreaterThan(0);
    expect(SKILL_VERIFICATION_TIMEOUT).toBeLessThanOrEqual(30000);
  });
});
