import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Agent, Post, PostSort, TimeRange, Notification } from '@/types';
import { api } from '@/lib/api';
import {
  sessionManager,
  type Session,
  type SessionConfig,
} from '@/lib/session';
import {
  skillVerifier,
  type Skill,
  type SkillVerificationResult,
} from '@/lib/skill-verification';

// Auth Store
interface AuthStore {
  agent: Agent | null;
  apiKey: string | null;
  isLoading: boolean;
  error: string | null;
  
  setAgent: (agent: Agent | null) => void;
  setApiKey: (key: string | null) => void;
  login: (apiKey: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      agent: null,
      apiKey: null,
      isLoading: false,
      error: null,
      
      setAgent: (agent) => set({ agent }),
      setApiKey: (apiKey) => {
        api.setApiKey(apiKey);
        set({ apiKey });
      },
      
      login: async (apiKey: string) => {
        set({ isLoading: true, error: null });
        try {
          api.setApiKey(apiKey);
          const agent = await api.getMe();
          set({ agent, apiKey, isLoading: false });
        } catch (err) {
          api.clearApiKey();
          set({ error: (err as Error).message, isLoading: false, agent: null, apiKey: null });
          throw err;
        }
      },
      
      logout: () => {
        api.clearApiKey();
        set({ agent: null, apiKey: null, error: null });
      },
      
      refresh: async () => {
        const { apiKey } = get();
        if (!apiKey) return;
        try {
          api.setApiKey(apiKey);
          const agent = await api.getMe();
          set({ agent });
        } catch { /* ignore */ }
      },
    }),
    { name: 'moltbook-auth', partialize: (state) => ({ apiKey: state.apiKey }) }
  )
);

// Feed Store
interface FeedStore {
  posts: Post[];
  sort: PostSort;
  timeRange: TimeRange;
  submolt: string | null;
  isLoading: boolean;
  hasMore: boolean;
  offset: number;
  
  setSort: (sort: PostSort) => void;
  setTimeRange: (timeRange: TimeRange) => void;
  setSubmolt: (submolt: string | null) => void;
  loadPosts: (reset?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  updatePostVote: (postId: string, vote: 'up' | 'down' | null, scoreDiff: number) => void;
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  posts: [],
  sort: 'hot',
  timeRange: 'day',
  submolt: null,
  isLoading: false,
  hasMore: true,
  offset: 0,
  
  setSort: (sort) => {
    set({ sort, posts: [], offset: 0, hasMore: true });
    get().loadPosts(true);
  },
  
  setTimeRange: (timeRange) => {
    set({ timeRange, posts: [], offset: 0, hasMore: true });
    get().loadPosts(true);
  },
  
  setSubmolt: (submolt) => {
    set({ submolt, posts: [], offset: 0, hasMore: true });
    get().loadPosts(true);
  },
  
  loadPosts: async (reset = false) => {
    const { sort, timeRange, submolt, isLoading } = get();
    if (isLoading) return;
    
    set({ isLoading: true });
    try {
      const offset = reset ? 0 : get().offset;
      const response = submolt 
        ? await api.getSubmoltFeed(submolt, { sort, limit: 25, offset })
        : await api.getPosts({ sort, timeRange, limit: 25, offset });
      
      set({
        posts: reset ? response.data : [...get().posts, ...response.data],
        hasMore: response.pagination.hasMore,
        offset: offset + response.data.length,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false });
      console.error('Failed to load posts:', err);
    }
  },
  
  loadMore: async () => {
    const { hasMore, isLoading } = get();
    if (!hasMore || isLoading) return;
    await get().loadPosts();
  },
  
  updatePostVote: (postId, vote, scoreDiff) => {
    set({
      posts: get().posts.map(p => 
        p.id === postId ? { ...p, userVote: vote, score: p.score + scoreDiff } : p
      ),
    });
  },
}));

// UI Store
interface UIStore {
  sidebarOpen: boolean;
  mobileMenuOpen: boolean;
  createPostOpen: boolean;
  searchOpen: boolean;
  
  toggleSidebar: () => void;
  toggleMobileMenu: () => void;
  openCreatePost: () => void;
  closeCreatePost: () => void;
  openSearch: () => void;
  closeSearch: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  mobileMenuOpen: false,
  createPostOpen: false,
  searchOpen: false,
  
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  toggleMobileMenu: () => set(s => ({ mobileMenuOpen: !s.mobileMenuOpen })),
  openCreatePost: () => set({ createPostOpen: true }),
  closeCreatePost: () => set({ createPostOpen: false }),
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
}));

// Notifications Store
interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  
  loadNotifications: () => Promise<void>;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  
  loadNotifications: async () => {
    set({ isLoading: true });
    // TODO: Implement API call
    set({ isLoading: false });
  },
  
  markAsRead: (id) => {
    set({
      notifications: get().notifications.map(n => n.id === id ? { ...n, read: true } : n),
      unreadCount: Math.max(0, get().unreadCount - 1),
    });
  },
  
  markAllAsRead: () => {
    set({
      notifications: get().notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0,
    });
  },
  
  clear: () => set({ notifications: [], unreadCount: 0 }),
}));

// Subscriptions Store
interface SubscriptionStore {
  subscribedSubmolts: string[];
  addSubscription: (name: string) => void;
  removeSubscription: (name: string) => void;
  isSubscribed: (name: string) => boolean;
}

export const useSubscriptionStore = create<SubscriptionStore>()(
  persist(
    (set, get) => ({
      subscribedSubmolts: [],

      addSubscription: (name) => {
        if (!get().subscribedSubmolts.includes(name)) {
          set({ subscribedSubmolts: [...get().subscribedSubmolts, name] });
        }
      },

      removeSubscription: (name) => {
        set({ subscribedSubmolts: get().subscribedSubmolts.filter(s => s !== name) });
      },

      isSubscribed: (name) => get().subscribedSubmolts.includes(name),
    }),
    { name: 'moltbook-subscriptions' }
  )
);

// Session Store
// Addresses: Livelock in Session State due to Synchronous Skill Verification Failure
// Issue: https://github.com/moltbook/moltbook-web-client-application/issues/19
interface SessionStore {
  currentSession: Session | null;
  sessions: Session[];
  skills: Skill[];
  isVerifying: boolean;
  verificationError: string | null;

  // Session management
  createSession: (id: string, name: string, config: SessionConfig) => Session;
  startSession: (id: string) => void;
  terminateSession: (id: string) => void;
  clearSession: () => void;

  // Skill management
  registerSkill: (id: string, name: string, displayName: string, verificationUrl?: string) => Skill;
  verifySkill: (skillId: string) => Promise<SkillVerificationResult>;
  verifyAllSkills: () => Promise<SkillVerificationResult[]>;

  // State helpers
  refreshSessions: () => void;
  cleanupZombieSessions: () => number;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  currentSession: null,
  sessions: sessionManager.getAllSessions(),
  skills: skillVerifier.getAllSkills(),
  isVerifying: false,
  verificationError: null,

  createSession: (id: string, name: string, config: SessionConfig) => {
    const session = sessionManager.createSession(id, name, config);
    set({
      currentSession: session,
      sessions: sessionManager.getAllSessions(),
    });
    return session;
  },

  startSession: (id: string) => {
    const session = sessionManager.startSession(id);
    if (session) {
      set({
        currentSession: session,
        sessions: sessionManager.getAllSessions(),
      });
    }
  },

  terminateSession: (id: string) => {
    sessionManager.terminateSession(id);
    const { currentSession } = get();
    set({
      currentSession: currentSession?.id === id ? null : currentSession,
      sessions: sessionManager.getAllSessions(),
    });
  },

  clearSession: () => {
    set({ currentSession: null });
  },

  registerSkill: (id: string, name: string, displayName: string, verificationUrl?: string) => {
    const skill = skillVerifier.registerSkill(id, name, displayName, verificationUrl);
    set({ skills: skillVerifier.getAllSkills() });
    return skill;
  },

  verifySkill: async (skillId: string) => {
    const { currentSession } = get();
    set({ isVerifying: true, verificationError: null });

    try {
      const result = await skillVerifier.verifySkill(skillId, currentSession?.id);
      set({
        skills: skillVerifier.getAllSkills(),
        isVerifying: false,
      });

      if (!result.success && result.error) {
        set({ verificationError: result.error.message });
      }

      // Update session state after verification
      if (currentSession) {
        set({
          currentSession: sessionManager.getSession(currentSession.id) || null,
          sessions: sessionManager.getAllSessions(),
        });
      }

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;
      set({
        isVerifying: false,
        verificationError: errorMessage,
      });
      throw error;
    }
  },

  verifyAllSkills: async () => {
    const { currentSession } = get();
    set({ isVerifying: true, verificationError: null });

    try {
      const results = await skillVerifier.verifyAllSkills(currentSession?.id);
      set({
        skills: skillVerifier.getAllSkills(),
        isVerifying: false,
      });

      // Check for any failures
      const failures = results.filter(r => !r.success);
      if (failures.length > 0) {
        const errorMessages = failures
          .map(f => f.error?.message)
          .filter(Boolean)
          .join('; ');
        set({ verificationError: errorMessages || 'One or more skills failed verification' });
      }

      // Update session state after verification
      if (currentSession) {
        set({
          currentSession: sessionManager.getSession(currentSession.id) || null,
          sessions: sessionManager.getAllSessions(),
        });
      }

      return results;
    } catch (error) {
      const errorMessage = (error as Error).message;
      set({
        isVerifying: false,
        verificationError: errorMessage,
      });
      throw error;
    }
  },

  refreshSessions: () => {
    set({ sessions: sessionManager.getAllSessions() });
  },

  cleanupZombieSessions: () => {
    const cleaned = sessionManager.cleanupZombieSessions();
    set({ sessions: sessionManager.getAllSessions() });
    return cleaned;
  },
}));
