/**
 * Configuration Schema Validation Tests
 * Tests for: Schema validation, unrecognized key detection, config migration
 * Issue: https://github.com/moltbook/moltbook-web-client-application/issues/19
 */

import {
  validateSessionConfig,
  validateAgentConfig,
  validateSkillConfig,
  validateAppConfig,
  migrateConfig,
  formatValidationErrors,
  sessionConfigSchema,
  agentConfigSchema,
} from '@/lib/config-schema';

describe('Session Config Schema', () => {
  describe('validateSessionConfig', () => {
    it('validates correct session config', () => {
      const config = {
        model: 'anthropic/claude-opus-4-5',
        system: 'You are a helpful assistant',
        tools: ['search', 'calculator'],
        timeout: 30000,
      };

      const result = validateSessionConfig(config);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(config);
    });

    it('validates minimal session config', () => {
      const config = {
        model: 'anthropic/claude-opus-4-5',
      };

      const result = validateSessionConfig(config);

      expect(result.success).toBe(true);
    });

    it('rejects config without model', () => {
      const config = {
        system: 'Test',
      };

      const result = validateSessionConfig(config);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('rejects config with unknown keys (strict mode)', () => {
      const config = {
        model: 'test-model',
        unknownKey: 'value', // This should cause rejection
      };

      const result = validateSessionConfig(config);

      expect(result.success).toBe(false);
    });

    it('rejects invalid timeout', () => {
      const config = {
        model: 'test-model',
        timeout: -1000,
      };

      const result = validateSessionConfig(config);

      expect(result.success).toBe(false);
    });
  });
});

describe('Agent Config Schema', () => {
  describe('validateAgentConfig', () => {
    it('validates correct agent config', () => {
      const config = {
        model: 'anthropic/claude-opus-4-5',
        system: 'You are a helpful assistant',
        temperature: 0.7,
        maxTokens: 4096,
      };

      const result = validateAgentConfig(config);

      expect(result.success).toBe(true);
    });

    it('validates empty agent config', () => {
      const result = validateAgentConfig({});

      expect(result.success).toBe(true);
    });

    it('rejects config with "tools" key (bug fix verification)', () => {
      // This is the specific issue from the bug report:
      // Error: Config validation failed: agents.defaults: Unrecognized key: "tools"
      const config = {
        model: 'test-model',
        tools: ['search'], // This key is NOT allowed in agent defaults
      };

      const result = validateAgentConfig(config);

      expect(result.success).toBe(false);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.[0]).toContain('tools');
    });

    it('rejects invalid temperature', () => {
      const config = {
        temperature: 3.0, // Max is 2.0
      };

      const result = validateAgentConfig(config);

      expect(result.success).toBe(false);
    });
  });
});

describe('Skill Config Schema', () => {
  describe('validateSkillConfig', () => {
    it('validates correct skill config', () => {
      const config = {
        id: 'moltbook',
        name: 'moltbook',
        displayName: 'Moltbook',
        verificationUrl: 'https://example.com/verify',
        enabled: true,
        timeout: 5000,
      };

      const result = validateSkillConfig(config);

      expect(result.success).toBe(true);
    });

    it('validates minimal skill config', () => {
      const config = {
        id: 'skill-1',
        name: 'skill',
        displayName: 'Skill',
      };

      const result = validateSkillConfig(config);

      expect(result.success).toBe(true);
    });

    it('rejects invalid verification URL', () => {
      const config = {
        id: 'skill-1',
        name: 'skill',
        displayName: 'Skill',
        verificationUrl: 'not-a-url',
      };

      const result = validateSkillConfig(config);

      expect(result.success).toBe(false);
    });

    it('defaults enabled to true', () => {
      const config = {
        id: 'skill-1',
        name: 'skill',
        displayName: 'Skill',
      };

      const result = validateSkillConfig(config);

      expect(result.success).toBe(true);
      expect(result.data?.enabled).toBe(true);
    });
  });
});

describe('App Config Schema', () => {
  describe('validateAppConfig', () => {
    it('validates complete app config', () => {
      const config = {
        version: '1.0.0',
        agents: {
          defaults: {
            model: 'anthropic/claude-opus-4-5',
          },
        },
        sessions: {
          defaultTimeout: 30000,
          maxConcurrent: 5,
        },
        network: {
          timeout: 10000,
          maxRetries: 3,
        },
      };

      const result = validateAppConfig(config);

      expect(result.success).toBe(true);
    });

    it('validates empty app config', () => {
      const result = validateAppConfig({});

      expect(result.success).toBe(true);
    });

    it('detects "tools" key in agents.defaults (bug verification)', () => {
      // Reproducing the exact scenario from the bug report
      const config = {
        agents: {
          defaults: {
            model: 'anthropic/claude-opus-4-5',
            tools: ['moltbook'], // This causes the schema desync
          },
        },
      };

      const result = validateAppConfig(config);

      expect(result.success).toBe(false);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('tools'))).toBe(true);
    });
  });
});

describe('Config Migration', () => {
  describe('migrateConfig', () => {
    it('migrates valid config unchanged', () => {
      const config = {
        version: '1.0.0',
        agents: {
          defaults: {
            model: 'test-model',
          },
        },
      };

      const migrated = migrateConfig(config);

      expect(migrated.version).toBe('1.0.0');
      expect(migrated.agents?.defaults?.model).toBe('test-model');
    });

    it('removes "tools" key from agents.defaults', () => {
      const config = {
        agents: {
          defaults: {
            model: 'test-model',
            tools: ['search', 'calculator'], // Should be stripped
          },
        },
      };

      const migrated = migrateConfig(config);

      expect(migrated.agents?.defaults?.model).toBe('test-model');
      expect('tools' in (migrated.agents?.defaults || {})).toBe(false);
    });

    it('handles null/undefined input', () => {
      expect(migrateConfig(null)).toEqual({});
      expect(migrateConfig(undefined)).toEqual({});
    });

    it('handles non-object input', () => {
      expect(migrateConfig('string')).toEqual({});
      expect(migrateConfig(123)).toEqual({});
    });

    it('preserves valid nested config', () => {
      const config = {
        sessions: {
          defaultTimeout: 30000,
          maxConcurrent: 5,
          cleanupInterval: 60000,
        },
        network: {
          timeout: 10000,
          maxRetries: 3,
          retryDelayBase: 1000,
        },
      };

      const migrated = migrateConfig(config);

      expect(migrated.sessions?.defaultTimeout).toBe(30000);
      expect(migrated.sessions?.maxConcurrent).toBe(5);
      expect(migrated.network?.timeout).toBe(10000);
      expect(migrated.network?.maxRetries).toBe(3);
    });
  });
});

describe('Error Formatting', () => {
  describe('formatValidationErrors', () => {
    it('formats errors with paths', () => {
      const result = sessionConfigSchema.safeParse({
        model: '', // Empty string, should fail
        timeout: -1, // Negative, should fail
      });

      if (!result.success) {
        const formatted = formatValidationErrors(result.error);

        expect(formatted.length).toBeGreaterThan(0);
        expect(formatted.some(e => e.includes('model'))).toBe(true);
      }
    });

    it('formats nested errors', () => {
      const result = agentConfigSchema.safeParse({
        temperature: 5, // Out of range
      });

      if (!result.success) {
        const formatted = formatValidationErrors(result.error);

        expect(formatted.length).toBeGreaterThan(0);
        expect(formatted.some(e => e.includes('temperature'))).toBe(true);
      }
    });
  });
});
