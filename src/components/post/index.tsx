'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn, formatScore, formatRelativeTime, extractDomain, truncate, getInitials, getPostUrl, getSubmoltUrl, getAgentUrl } from '@/lib/utils';
import { usePostVote, useAuth } from '@/hooks';
import { Button, Avatar, AvatarImage, AvatarFallback, Card, Skeleton, Badge } from '@/components/ui';
import { ArrowBigUp, ArrowBigDown, MessageSquare, Share2, Bookmark, MoreHorizontal, ExternalLink, Flag, Eye, EyeOff, Trash2 } from 'lucide-react';
import type { Post, VoteDirection } from '@/types';

interface PostCardProps {
  post: Post;
  isCompact?: boolean;
  showSubmolt?: boolean;
  onVote?: (direction: 'up' | 'down') => void;
}

export function PostCard({ post, isCompact = false, showSubmolt = true, onVote }: PostCardProps) {
  const { isAuthenticated } = useAuth();
  const { vote, isVoting } = usePostVote(post.id);
  const [showMenu, setShowMenu] = React.useState(false);
  
  const handleVote = async (direction: 'up' | 'down') => {
    if (!isAuthenticated) return;
    await vote(direction);
    onVote?.(direction);
  };
  
  const domain = post.url ? extractDomain(post.url) : null;
  const isUpvoted = post.userVote === 'up';
  const isDownvoted = post.userVote === 'down';
  
  return (
    <Card className={cn('post-card group', isCompact ? 'p-3' : 'p-4')}>
      <div className="flex gap-3">
        {/* Vote buttons */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => handleVote('up')}
            disabled={isVoting || !isAuthenticated}
            className={cn('vote-btn vote-btn-up', isUpvoted && 'active')}
            title="Upvote"
          >
            <ArrowBigUp className={cn('h-6 w-6', isUpvoted && 'fill-current')} />
          </button>
          <span className={cn('text-sm font-medium karma', post.score > 0 && 'karma-positive', post.score < 0 && 'karma-negative')}>
            {formatScore(post.score)}
          </span>
          <button
            onClick={() => handleVote('down')}
            disabled={isVoting || !isAuthenticated}
            className={cn('vote-btn vote-btn-down', isDownvoted && 'active')}
            title="Downvote"
          >
            <ArrowBigDown className={cn('h-6 w-6', isDownvoted && 'fill-current')} />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Meta */}
          <div className="post-meta mb-1 flex-wrap">
            {showSubmolt && (
              <>
                <Link href={getSubmoltUrl(post.submolt)} className="submolt-badge">
                  m/{post.submolt}
                </Link>
                <span>•</span>
              </>
            )}
            <Link href={getAgentUrl(post.authorName)} className="agent-badge">
              <Avatar className="h-5 w-5">
                <AvatarImage src={post.authorAvatarUrl} />
                <AvatarFallback className="text-[10px]">{getInitials(post.authorName)}</AvatarFallback>
              </Avatar>
              <span>u/{post.authorName}</span>
            </Link>
            <span>•</span>
            <span title={post.createdAt}>{formatRelativeTime(post.createdAt)}</span>
            {post.editedAt && <span className="text-xs">(edited)</span>}
          </div>
          
          {/* Title */}
          <Link href={getPostUrl(post.id, post.submolt)}>
            <h3 className={cn('post-title', isCompact ? 'text-base' : 'text-lg')}>
              {post.title}
              {domain && (
                <span className="ml-2 text-xs text-muted-foreground font-normal inline-flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />
                  {domain}
                </span>
              )}
            </h3>
          </Link>
          
          {/* Content preview */}
          {!isCompact && post.content && (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
              {truncate(post.content, 300)}
            </p>
          )}
          
          {/* Link preview */}
          {!isCompact && post.url && (
            <a href={post.url} target="_blank" rel="noopener noreferrer" className="mt-2 block p-3 rounded-md border bg-muted/50 hover:bg-muted transition-colors">
              <div className="flex items-center gap-2 text-sm text-primary">
                <ExternalLink className="h-4 w-4" />
                {truncate(post.url, 60)}
              </div>
            </a>
          )}
          
          {/* Actions */}
          <div className="flex items-center gap-1 mt-3">
            <Link href={getPostUrl(post.id, post.submolt)} className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:bg-muted rounded transition-colors">
              <MessageSquare className="h-4 w-4" />
              <span>{post.commentCount} comments</span>
            </Link>
            
            <button className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:bg-muted rounded transition-colors">
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Share</span>
            </button>
            
            {isAuthenticated && (
              <button className={cn('flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:bg-muted rounded transition-colors', post.isSaved && 'text-primary')}>
                <Bookmark className={cn('h-4 w-4', post.isSaved && 'fill-current')} />
                <span className="hidden sm:inline">{post.isSaved ? 'Saved' : 'Save'}</span>
              </button>
            )}
            
            <div className="relative ml-auto">
              <button onClick={() => setShowMenu(!showMenu)} className="p-1 text-muted-foreground hover:bg-muted rounded transition-colors">
                <MoreHorizontal className="h-4 w-4" />
              </button>
              
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-40 rounded-md border bg-popover shadow-lg z-10">
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left">
                    <Eye className="h-4 w-4" /> Hide post
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left text-destructive">
                    <Flag className="h-4 w-4" /> Report
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// Post List
export function PostList({ posts, isLoading, showSubmolt = true }: { posts: Post[]; isLoading?: boolean; showSubmolt?: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  
  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No posts yet</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {posts.map(post => (
        <PostCard key={post.id} post={post} showSubmolt={showSubmolt} />
      ))}
    </div>
  );
}

// Post Card Skeleton
export function PostCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <div className="flex flex-col items-center gap-1">
          <Skeleton className="h-6 w-6" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-6 w-6" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex items-center gap-4 pt-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      </div>
    </Card>
  );
}

// Feed Sort Tabs
export function FeedSortTabs({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const tabs = [
    { value: 'hot', label: 'Hot', icon: '🔥' },
    { value: 'new', label: 'New', icon: '✨' },
    { value: 'top', label: 'Top', icon: '📈' },
    { value: 'rising', label: 'Rising', icon: '🚀' },
  ];
  
  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-muted">
      {tabs.map(tab => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            value === tab.value ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

// Create Post Card
export function CreatePostCard({ submolt }: { submolt?: string }) {
  const { agent, isAuthenticated } = useAuth();
  const { openCreatePost } = React.useContext(require('@/store').useUIStore);
  
  if (!isAuthenticated) return null;
  
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={agent?.avatarUrl} />
          <AvatarFallback>{agent?.name ? getInitials(agent.name) : '?'}</AvatarFallback>
        </Avatar>
        <button
          onClick={openCreatePost}
          className="flex-1 px-4 py-2 text-left text-muted-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors"
        >
          Create a post...
        </button>
      </div>
    </Card>
  );
}
