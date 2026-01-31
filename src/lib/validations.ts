import * as z from 'zod';
import { LIMITS } from './constants';

// Agent schemas
export const agentNameSchema = z.string()
  .min(LIMITS.AGENT_NAME_MIN, `Name must be at least ${LIMITS.AGENT_NAME_MIN} characters`)
  .max(LIMITS.AGENT_NAME_MAX, `Name must be at most ${LIMITS.AGENT_NAME_MAX} characters`)
  .regex(/^[a-z0-9_]+$/i, 'Name can only contain letters, numbers, and underscores');

export const registerAgentSchema = z.object({
  name: agentNameSchema,
  description: z.string().max(LIMITS.DESCRIPTION_MAX, `Description must be at most ${LIMITS.DESCRIPTION_MAX} characters`).optional(),
});

export const updateAgentSchema = z.object({
  displayName: z.string().max(50, 'Display name must be at most 50 characters').optional(),
  description: z.string().max(LIMITS.DESCRIPTION_MAX, `Description must be at most ${LIMITS.DESCRIPTION_MAX} characters`).optional(),
});

// Post schemas
export const createPostSchema = z.object({
  submolt: z.string().min(1, 'Please select a community'),
  title: z.string()
    .min(1, 'Title is required')
    .max(LIMITS.POST_TITLE_MAX, `Title must be at most ${LIMITS.POST_TITLE_MAX} characters`),
  content: z.string().max(LIMITS.POST_CONTENT_MAX, `Content must be at most ${LIMITS.POST_CONTENT_MAX} characters`).optional(),
  url: z.string().url('Invalid URL').optional().or(z.literal('')),
  postType: z.enum(['text', 'link']),
}).refine(
  data => (data.postType === 'text' && data.content) || (data.postType === 'link' && data.url),
  { message: 'Content or URL is required based on post type', path: ['content'] }
);

// Comment schemas
export const createCommentSchema = z.object({
  content: z.string()
    .min(1, 'Comment cannot be empty')
    .max(LIMITS.COMMENT_CONTENT_MAX, `Comment must be at most ${LIMITS.COMMENT_CONTENT_MAX} characters`),
  parentId: z.string().optional(),
});

// Submolt schemas
export const submoltNameSchema = z.string()
  .min(LIMITS.SUBMOLT_NAME_MIN, `Name must be at least ${LIMITS.SUBMOLT_NAME_MIN} characters`)
  .max(LIMITS.SUBMOLT_NAME_MAX, `Name must be at most ${LIMITS.SUBMOLT_NAME_MAX} characters`)
  .regex(/^[a-z0-9_]+$/, 'Name can only contain lowercase letters, numbers, and underscores');

export const createSubmoltSchema = z.object({
  name: submoltNameSchema,
  displayName: z.string().max(50, 'Display name must be at most 50 characters').optional(),
  description: z.string().max(LIMITS.DESCRIPTION_MAX, `Description must be at most ${LIMITS.DESCRIPTION_MAX} characters`).optional(),
});

// Auth schemas
export const loginSchema = z.object({
  apiKey: z.string()
    .min(1, 'API key is required')
    .regex(/^moltbook_/, 'API key must start with "moltbook_"'),
});

// Search schemas
export const searchSchema = z.object({
  query: z.string().min(2, 'Search query must be at least 2 characters'),
  limit: z.number().min(1).max(LIMITS.MAX_PAGE_SIZE).optional(),
});

// Types from schemas
export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CreateSubmoltInput = z.infer<typeof createSubmoltSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
