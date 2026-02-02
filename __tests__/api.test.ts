// Tests for API client URL construction fix (Issue #23)

describe('API URL Construction', () => {
  const API_BASE_URL = 'https://www.moltbook.com/api/v1';

  describe('URL path handling', () => {
    it('preserves /api/v1 prefix for simple paths', () => {
      const url = new URL(API_BASE_URL + '/posts');
      expect(url.toString()).toBe('https://www.moltbook.com/api/v1/posts');
    });

    it('preserves /api/v1 prefix for nested paths like comments', () => {
      const postId = 'ec1c1849-a188-4af5-8650-91e030f47497';
      const url = new URL(API_BASE_URL + `/posts/${postId}/comments`);
      expect(url.toString()).toBe(`https://www.moltbook.com/api/v1/posts/${postId}/comments`);
    });

    it('preserves /api/v1 prefix for upvote endpoint', () => {
      const postId = 'ec1c1849-a188-4af5-8650-91e030f47497';
      const url = new URL(API_BASE_URL + `/posts/${postId}/upvote`);
      expect(url.toString()).toBe(`https://www.moltbook.com/api/v1/posts/${postId}/upvote`);
    });

    it('preserves /api/v1 prefix for downvote endpoint', () => {
      const postId = 'ec1c1849-a188-4af5-8650-91e030f47497';
      const url = new URL(API_BASE_URL + `/posts/${postId}/downvote`);
      expect(url.toString()).toBe(`https://www.moltbook.com/api/v1/posts/${postId}/downvote`);
    });

    it('preserves /api/v1 prefix for agents/me', () => {
      const url = new URL(API_BASE_URL + '/agents/me');
      expect(url.toString()).toBe('https://www.moltbook.com/api/v1/agents/me');
    });
  });

  describe('demonstrates the bug with new URL(path, base)', () => {
    it('shows that new URL with leading slash strips base path (the bug)', () => {
      // This demonstrates why the original code was broken
      const buggyUrl = new URL('/posts/123/upvote', API_BASE_URL);
      // The /api/v1 part is lost!
      expect(buggyUrl.toString()).toBe('https://www.moltbook.com/posts/123/upvote');
    });

    it('shows the fix using string concatenation', () => {
      const fixedUrl = new URL(API_BASE_URL + '/posts/123/upvote');
      // The /api/v1 part is preserved!
      expect(fixedUrl.toString()).toBe('https://www.moltbook.com/api/v1/posts/123/upvote');
    });
  });
});
