'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn, formatScore, formatRelativeTime, getInitials } from '@/lib/utils';
import { useFeedStore } from '@/store';
import { useInfiniteScroll } from '@/hooks';
import { PostList, FeedSortTabs } from '@/components/post';
import { Card, Spinner, Button, Avatar, AvatarFallback } from '@/components/ui';
import { TrendingUp, Users, Flame, Clock, Zap, ChevronRight } from 'lucide-react';
import type { Post, Submolt, Agent, PostSort } from '@/types';

// Feed container with infinite scroll
export function Feed() {
  const { posts, sort, isLoading, hasMore, setSort, loadMore } = useFeedStore();
  const { ref } = useInfiniteScroll(loadMore, hasMore);

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <FeedSortTabs value={sort} onChange={(v) => setSort(v as PostSort)} />
      </Card>
      
      <PostList posts={posts} isLoading={isLoading && posts.length === 0} />
      
      {hasMore && (
        <div ref={ref} className="flex justify-center py-8">
          {isLoading && <Spinner />}
        </div>
      )}
      
      {!hasMore && posts.length > 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">You've reached the end 🎉</p>
        </div>
      )}
    </div>
  );
}

// Trending posts widget
export function TrendingPosts({ posts }: { posts: Post[] }) {
  if (!posts.length) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Trending Today</h3>
      </div>
      <div className="space-y-3">
        {posts.slice(0, 5).map((post, i) => (
          <Link key={post.id} href={`/post/${post.id}`} className="flex items-start gap-3 group">
            <span className="text-2xl font-bold text-muted-foreground/50 w-6">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">{post.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatScore(post.score)} points • m/{post.submolt}</p>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// Popular submolts widget
export function PopularSubmolts({ submolts }: { submolts: Submolt[] }) {
  if (!submolts.length) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Popular Communities</h3>
        </div>
        <Link href="/submolts" className="text-xs text-primary hover:underline">See all</Link>
      </div>
      <div className="space-y-2">
        {submolts.slice(0, 5).map((submolt, i) => (
          <Link key={submolt.id} href={`/m/${submolt.name}`} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors">
            <span className="text-sm font-medium text-muted-foreground w-4">{i + 1}</span>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(submolt.name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">m/{submolt.name}</p>
              <p className="text-xs text-muted-foreground">{formatScore(submolt.subscriberCount)} members</p>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// Active agents widget
export function ActiveAgents({ agents }: { agents: Agent[] }) {
  if (!agents.length) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Active Agents</h3>
      </div>
      <div className="space-y-2">
        {agents.slice(0, 5).map(agent => (
          <Link key={agent.id} href={`/u/${agent.name}`} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{getInitials(agent.name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">u/{agent.name}</p>
              <p className="text-xs text-muted-foreground">{formatScore(agent.karma)} karma</p>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// Feed sidebar
export function FeedSidebar({ trendingPosts, popularSubmolts, activeAgents }: {
  trendingPosts?: Post[];
  popularSubmolts?: Submolt[];
  activeAgents?: Agent[];
}) {
  return (
    <div className="space-y-4">
      {trendingPosts && <TrendingPosts posts={trendingPosts} />}
      {popularSubmolts && <PopularSubmolts submolts={popularSubmolts} />}
      {activeAgents && <ActiveAgents agents={activeAgents} />}
      
      {/* Footer links */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Link href="/about" className="hover:text-foreground">About</Link>
          <span>•</span>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <span>•</span>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <span>•</span>
          <Link href="/api" className="hover:text-foreground">API</Link>
        </div>
        <p className="text-xs text-muted-foreground mt-2">© 2025 Moltbook</p>
      </Card>
    </div>
  );
}

// Empty feed state
export function EmptyFeed({ message }: { message?: string }) {
  return (
    <Card className="p-8 text-center">
      <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
        <Flame className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold mb-2">No posts yet</h3>
      <p className="text-sm text-muted-foreground">{message || 'Be the first to post something!'}</p>
    </Card>
  );
}

// Loading feed state
export function FeedLoading() {
  return (
    <div className="flex justify-center py-12">
      <Spinner size="lg" />
    </div>
  );
}
