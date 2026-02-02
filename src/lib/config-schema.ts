// Configuration Schema Validation
// Addresses: Schema Consistency issues ("Unrecognized key" errors)
// Issue: https://github.com/moltbook/moltbook-web-client-application/issues/19

import { z } from 'zod';

/**
 * Session configuration schema
 * Validates session config to prevent "Unrecognized key" issues
 */
export const sessionConfigSchema = z.object({
  model: z.string().min(1, 'Model is required'),
  system: z.string().optional(),
  tools: z.array(z.string()).optional(),
  timeout: z.number().positive().optional(),
}).strict(); // Strict mode rejects unknown keys

/**
 * Agent configuration schema
 * Used for agents/defaults configuration
 */
export const agentConfigSchema = z.object({
  model: z.string().optional(),
  system: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  // Note: 'tools' key was causing "Unrecognized key" errors
  // It has been intentionally removed from agent defaults
  // Tools should be configured at the session level instead
}).strict();

/**
 * Skill configuration schema
 */
export const skillConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  displayName: z.string().min(1),
  verificationUrl: z.string().url().optional(),
  enabled: z.boolean().optional().default(true),
  timeout: z.number().positive().optional(),
}).strict();

/**
 * Full application configuration schema
 */
export const appConfigSchema = z.object({
  version: z.string().optional(),
  agents: z.object({
    defaults: agentConfigSchema.optional(),
  }).optional(),
  sessions: z.object({
    defaultTimeout: z.number().positive().optional(),
    maxConcurrent: z.number().positive().optional(),
    cleanupInterval: z.number().positive().optional(),
  }).optional(),
  skills: z.array(skillConfigSchema).optional(),
  network: z.object({
    timeout: z.number().positive().optional(),
    maxRetries: z.number().nonnegative().optional(),
    retryDelayBase: z.number().positive().optional(),
  }).optional(),
}).strict();

// Export inferred types
export type SessionConfig = z.infer<typeof sessionConfigSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type SkillConfig = z.infer<typeof skillConfigSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: z.ZodError;
  warnings?: string[];
}

/**
 * Validate session configuration
 */
export function validateSessionConfig(config: unknown): ValidationResult<SessionConfig> {
  const result = sessionConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error,
  };
}

/**
 * Validate agent configuration
 */
export function validateAgentConfig(config: unknown): ValidationResult<AgentConfig> {
  const result = agentConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Check for specific "Unrecognized key" issues mentioned in bug report
  const warnings: string[] = [];
  if (config && typeof config === 'object' && 'tools' in config) {
    warnings.push(
      'Config validation warning: "tools" key found in agents.defaults. ' +
      'This key should be at the session level, not agent defaults. ' +
      'See: https://github.com/moltbook/moltbook-web-client-application/issues/19'
    );
  }

  return {
    success: false,
    errors: result.error,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validate skill configuration
 */
export function validateSkillConfig(config: unknown): ValidationResult<SkillConfig> {
  const result = skillConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error,
  };
}

/**
 * Validate full application configuration
 */
export function validateAppConfig(config: unknown): ValidationResult<AppConfig> {
  const result = appConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Provide helpful error messages for common issues
  const warnings: string[] = [];

  // Check for the specific "tools" key issue from the bug report
  if (config && typeof config === 'object') {
    const cfg = config as Record<string, unknown>;
    if (cfg.agents && typeof cfg.agents === 'object') {
      const agents = cfg.agents as Record<string, unknown>;
      if (agents.defaults && typeof agents.defaults === 'object') {
        const defaults = agents.defaults as Record<string, unknown>;
        if ('tools' in defaults) {
          warnings.push(
            'Config validation failed: agents.defaults contains unrecognized key "tools". ' +
            'Tools should be configured at the session level. ' +
            'This issue can cause schema desync between CLI and Gateway runtime.'
          );
        }
      }
    }
  }

  return {
    success: false,
    errors: result.error,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Migrate legacy configuration to current schema
 * Handles backward compatibility for configuration changes
 */
export function migrateConfig(config: unknown): AppConfig {
  if (!config || typeof config !== 'object') {
    return {};
  }

  const legacy = config as Record<string, unknown>;
  const migrated: AppConfig = {};

  // Migrate version
  if (typeof legacy.version === 'string') {
    migrated.version = legacy.version;
  }

  // Migrate agents config, removing unsupported keys
  if (legacy.agents && typeof legacy.agents === 'object') {
    const agents = legacy.agents as Record<string, unknown>;
    migrated.agents = {};

    if (agents.defaults && typeof agents.defaults === 'object') {
      const defaults = agents.defaults as Record<string, unknown>;
      const migratedDefaults: AgentConfig = {};

      // Only copy supported keys
      if (typeof defaults.model === 'string') {
        migratedDefaults.model = defaults.model;
      }
      if (typeof defaults.system === 'string') {
        migratedDefaults.system = defaults.system;
      }
      if (typeof defaults.temperature === 'number') {
        migratedDefaults.temperature = defaults.temperature;
      }
      if (typeof defaults.maxTokens === 'number') {
        migratedDefaults.maxTokens = defaults.maxTokens;
      }

      // Log warning if 'tools' key was present (will be stripped)
      if ('tools' in defaults) {
        console.warn(
          '[ConfigMigration] Removing unsupported "tools" key from agents.defaults. ' +
          'Tools should be configured at the session level.'
        );
      }

      migrated.agents.defaults = migratedDefaults;
    }
  }

  // Migrate sessions config
  if (legacy.sessions && typeof legacy.sessions === 'object') {
    const sessions = legacy.sessions as Record<string, unknown>;
    migrated.sessions = {};

    if (typeof sessions.defaultTimeout === 'number') {
      migrated.sessions.defaultTimeout = sessions.defaultTimeout;
    }
    if (typeof sessions.maxConcurrent === 'number') {
      migrated.sessions.maxConcurrent = sessions.maxConcurrent;
    }
    if (typeof sessions.cleanupInterval === 'number') {
      migrated.sessions.cleanupInterval = sessions.cleanupInterval;
    }
  }

  // Migrate network config
  if (legacy.network && typeof legacy.network === 'object') {
    const network = legacy.network as Record<string, unknown>;
    migrated.network = {};

    if (typeof network.timeout === 'number') {
      migrated.network.timeout = network.timeout;
    }
    if (typeof network.maxRetries === 'number') {
      migrated.network.maxRetries = network.maxRetries;
    }
    if (typeof network.retryDelayBase === 'number') {
      migrated.network.retryDelayBase = network.retryDelayBase;
    }
  }

  return migrated;
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: z.ZodError): string[] {
  return errors.errors.map(err => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });
}
