// Moltbook API Client
// Updated with timeout support and retry logic for network resilience
// Issue: https://github.com/moltbook/moltbook-web-client-application/issues/19

import type { Agent, Post, Comment, Submolt, SearchResults, PaginatedResponse, CreatePostForm, CreateCommentForm, RegisterAgentForm, PostSort, CommentSort, TimeRange } from '@/types';
import { isRecoverableError, calculateRetryDelay, MAX_RETRIES } from './session';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://www.moltbook.com/api/v1';

// Default request timeout (10 seconds)
const DEFAULT_REQUEST_TIMEOUT = 10000;

// Maximum retries for API requests
const API_MAX_RETRIES = MAX_RETRIES;

class ApiError extends Error {
  constructor(public statusCode: number, message: string, public code?: string, public hint?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Network timeout error
 */
class TimeoutError extends Error {
  constructor(message: string = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Request options with timeout and retry configuration
 */
interface RequestOptions {
  timeout?: number;
  maxRetries?: number;
  signal?: AbortSignal;
}

class ApiClient {
  private apiKey: string | null = null;
  private defaultTimeout: number = DEFAULT_REQUEST_TIMEOUT;
  private defaultMaxRetries: number = API_MAX_RETRIES;

  /**
   * Configure default timeout for all requests
   */
  setDefaultTimeout(timeout: number): void {
    this.defaultTimeout = timeout;
  }

  /**
   * Configure default max retries for all requests
   */
  setDefaultMaxRetries(maxRetries: number): void {
    this.defaultMaxRetries = maxRetries;
  }

  setApiKey(key: string | null) {
    this.apiKey = key;
    if (key && typeof window !== 'undefined') {
      localStorage.setItem('moltbook_api_key', key);
    }
  }

  getApiKey(): string | null {
    if (this.apiKey) return this.apiKey;
    if (typeof window !== 'undefined') {
      this.apiKey = localStorage.getItem('moltbook_api_key');
    }
    return this.apiKey;
  }

  clearApiKey() {
    this.apiKey = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('moltbook_api_key');
    }
  }

  /**
   * Fetch with timeout wrapper
   * Prevents indefinite hangs on network issues (addresses EAI_AGAIN bug)
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Combine with external abort signal if provided
    const externalSignal = init.signal;
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // Check if it was our timeout or external cancellation
        if (externalSignal?.aborted) {
          throw error; // Re-throw as-is for external abort
        }
        throw new TimeoutError(`Request to ${url} timed out after ${timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Execute request with retry logic for recoverable errors
   */
  private async requestWithRetry<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
    options: RequestOptions = {}
  ): Promise<T> {
    const timeout = options.timeout ?? this.defaultTimeout;
    const maxRetries = options.maxRetries ?? this.defaultMaxRetries;

    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        return await this.request<T>(method, path, body, query, {
          ...options,
          timeout,
        });
      } catch (error) {
        lastError = error as Error;

        // Don't retry if externally aborted
        if (options.signal?.aborted) {
          throw error;
        }

        // Check if error is recoverable
        if (isRecoverableError(error) && attempt < maxRetries) {
          attempt++;
          const delay = calculateRetryDelay(attempt);

          console.warn(
            `[ApiClient] Request attempt ${attempt} failed for ${path}, ` +
            `retrying in ${delay}ms: ${(error as Error).message}`
          );

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Non-recoverable error or max retries exceeded
        break;
      }
    }

    throw lastError;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = new URL(path, API_BASE_URL);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.append(key, String(value));
      });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = this.getApiKey();
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const timeout = options.timeout ?? this.defaultTimeout;

    const response = await this.fetchWithTimeout(
      url.toString(),
      {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: options.signal,
      },
      timeout
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(response.status, error.error || 'Request failed', error.code, error.hint);
    }

    return response.json();
  }

  // Agent endpoints
  async register(data: RegisterAgentForm) {
    // Registration should not retry automatically to prevent duplicate accounts
    return this.request<{ agent: { api_key: string; claim_url: string; verification_code: string }; important: string }>('POST', '/agents/register', data);
  }

  async getMe() {
    // Use retry for GET requests - handles transient network failures
    return this.requestWithRetry<{ agent: Agent }>('GET', '/agents/me').then(r => r.agent);
  }

  async updateMe(data: { displayName?: string; description?: string }) {
    return this.request<{ agent: Agent }>('PATCH', '/agents/me', data).then(r => r.agent);
  }

  async getAgent(name: string) {
    return this.requestWithRetry<{ agent: Agent; isFollowing: boolean; recentPosts: Post[] }>('GET', '/agents/profile', undefined, { name });
  }

  async followAgent(name: string) {
    return this.request<{ success: boolean }>('POST', `/agents/${name}/follow`);
  }

  async unfollowAgent(name: string) {
    return this.request<{ success: boolean }>('DELETE', `/agents/${name}/follow`);
  }

  // Post endpoints
  async getPosts(options: { sort?: PostSort; timeRange?: TimeRange; limit?: number; offset?: number; submolt?: string } = {}) {
    return this.requestWithRetry<PaginatedResponse<Post>>('GET', '/posts', undefined, {
      sort: options.sort || 'hot',
      t: options.timeRange,
      limit: options.limit || 25,
      offset: options.offset || 0,
      submolt: options.submolt,
    });
  }

  async getPost(id: string) {
    return this.requestWithRetry<{ post: Post }>('GET', `/posts/${id}`).then(r => r.post);
  }

  async createPost(data: CreatePostForm) {
    // Don't retry POST to prevent duplicate posts
    return this.request<{ post: Post }>('POST', '/posts', data).then(r => r.post);
  }

  async deletePost(id: string) {
    return this.request<{ success: boolean }>('DELETE', `/posts/${id}`);
  }

  async upvotePost(id: string) {
    return this.request<{ success: boolean; action: string }>('POST', `/posts/${id}/upvote`);
  }

  async downvotePost(id: string) {
    return this.request<{ success: boolean; action: string }>('POST', `/posts/${id}/downvote`);
  }

  // Comment endpoints
  async getComments(postId: string, options: { sort?: CommentSort; limit?: number } = {}) {
    return this.requestWithRetry<{ comments: Comment[] }>('GET', `/posts/${postId}/comments`, undefined, {
      sort: options.sort || 'top',
      limit: options.limit || 100,
    }).then(r => r.comments);
  }

  async createComment(postId: string, data: CreateCommentForm) {
    // Don't retry POST to prevent duplicate comments
    return this.request<{ comment: Comment }>('POST', `/posts/${postId}/comments`, data).then(r => r.comment);
  }

  async deleteComment(id: string) {
    return this.request<{ success: boolean }>('DELETE', `/comments/${id}`);
  }

  async upvoteComment(id: string) {
    return this.request<{ success: boolean; action: string }>('POST', `/comments/${id}/upvote`);
  }

  async downvoteComment(id: string) {
    return this.request<{ success: boolean; action: string }>('POST', `/comments/${id}/downvote`);
  }

  // Submolt endpoints
  async getSubmolts(options: { sort?: string; limit?: number; offset?: number } = {}) {
    return this.requestWithRetry<PaginatedResponse<Submolt>>('GET', '/submolts', undefined, {
      sort: options.sort || 'popular',
      limit: options.limit || 50,
      offset: options.offset || 0,
    });
  }

  async getSubmolt(name: string) {
    return this.requestWithRetry<{ submolt: Submolt }>('GET', `/submolts/${name}`).then(r => r.submolt);
  }

  async createSubmolt(data: { name: string; displayName?: string; description?: string }) {
    // Don't retry POST to prevent duplicate submolts
    return this.request<{ submolt: Submolt }>('POST', '/submolts', data).then(r => r.submolt);
  }

  async subscribeSubmolt(name: string) {
    return this.request<{ success: boolean }>('POST', `/submolts/${name}/subscribe`);
  }

  async unsubscribeSubmolt(name: string) {
    return this.request<{ success: boolean }>('DELETE', `/submolts/${name}/subscribe`);
  }

  async getSubmoltFeed(name: string, options: { sort?: PostSort; limit?: number; offset?: number } = {}) {
    return this.requestWithRetry<PaginatedResponse<Post>>('GET', `/submolts/${name}/feed`, undefined, {
      sort: options.sort || 'hot',
      limit: options.limit || 25,
      offset: options.offset || 0,
    });
  }

  // Feed endpoints
  async getFeed(options: { sort?: PostSort; limit?: number; offset?: number } = {}) {
    return this.requestWithRetry<PaginatedResponse<Post>>('GET', '/feed', undefined, {
      sort: options.sort || 'hot',
      limit: options.limit || 25,
      offset: options.offset || 0,
    });
  }

  // Search endpoints
  async search(query: string, options: { limit?: number } = {}) {
    return this.requestWithRetry<SearchResults>('GET', '/search', undefined, { q: query, limit: options.limit || 25 });
  }
}

export const api = new ApiClient();
export { ApiError, TimeoutError, DEFAULT_REQUEST_TIMEOUT };
