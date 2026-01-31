'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn, formatScore, formatRelativeTime, getInitials, getAgentUrl } from '@/lib/utils';
import { useCommentVote, useAuth, useToggle } from '@/hooks';
import { Button, Avatar, AvatarImage, AvatarFallback, Textarea, Skeleton } from '@/components/ui';
import { ArrowBigUp, ArrowBigDown, MessageSquare, MoreHorizontal, ChevronDown, ChevronUp, Flag, Trash2, Edit2, Reply } from 'lucide-react';
import { api } from '@/lib/api';
import type { Comment, CreateCommentForm } from '@/types';

interface CommentProps {
  comment: Comment;
  postId: string;
  onReply?: (comment: Comment) => void;
  onDelete?: (commentId: string) => void;
}

export function CommentItem({ comment, postId, onReply, onDelete }: CommentProps) {
  const { agent, isAuthenticated } = useAuth();
  const { vote, isVoting } = useCommentVote(comment.id);
  const [isCollapsed, toggleCollapsed] = useToggle(false);
  const [isReplying, setIsReplying] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);
  const [replyContent, setReplyContent] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  
  const isUpvoted = comment.userVote === 'up';
  const isDownvoted = comment.userVote === 'down';
  const isAuthor = agent?.name === comment.authorName;
  const hasReplies = comment.replies && comment.replies.length > 0;
  
  const handleVote = async (direction: 'up' | 'down') => {
    if (!isAuthenticated) return;
    await vote(direction);
  };
  
  const handleReply = async () => {
    if (!replyContent.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const newComment = await api.createComment(postId, {
        content: replyContent,
        parentId: comment.id,
      });
      onReply?.(newComment);
      setReplyContent('');
      setIsReplying(false);
    } catch (err) {
      console.error('Failed to reply:', err);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className={cn('comment', comment.depth > 0 && 'ml-4')} style={{ marginLeft: `${Math.min(comment.depth, 8) * 16}px` }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <button onClick={() => toggleCollapsed()} className="p-0.5 hover:bg-muted rounded">
          {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
        
        <Link href={getAgentUrl(comment.authorName)} className="flex items-center gap-1.5">
          <Avatar className="h-6 w-6">
            <AvatarImage src={comment.authorAvatarUrl} />
            <AvatarFallback className="text-[10px]">{getInitials(comment.authorName)}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium hover:underline">u/{comment.authorName}</span>
        </Link>
        
        <span className="text-xs text-muted-foreground">•</span>
        <span className="text-xs text-muted-foreground" title={comment.createdAt}>
          {formatRelativeTime(comment.createdAt)}
        </span>
        {comment.editedAt && <span className="text-xs text-muted-foreground">(edited)</span>}
      </div>
      
      {/* Content */}
      {!isCollapsed && (
        <>
          <div className="prose-moltbook text-sm py-1">
            {comment.content}
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-1 mt-1">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => handleVote('up')}
                disabled={isVoting || !isAuthenticated}
                className={cn('vote-btn vote-btn-up p-0.5', isUpvoted && 'active')}
              >
                <ArrowBigUp className={cn('h-5 w-5', isUpvoted && 'fill-current')} />
              </button>
              <span className={cn('text-xs font-medium px-1', comment.score > 0 && 'text-upvote', comment.score < 0 && 'text-downvote')}>
                {formatScore(comment.score)}
              </span>
              <button
                onClick={() => handleVote('down')}
                disabled={isVoting || !isAuthenticated}
                className={cn('vote-btn vote-btn-down p-0.5', isDownvoted && 'active')}
              >
                <ArrowBigDown className={cn('h-5 w-5', isDownvoted && 'fill-current')} />
              </button>
            </div>
            
            {isAuthenticated && (
              <button onClick={() => setIsReplying(!isReplying)} className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:bg-muted rounded">
                <Reply className="h-3.5 w-3.5" />
                Reply
              </button>
            )}
            
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)} className="p-1 text-muted-foreground hover:bg-muted rounded">
                <MoreHorizontal className="h-4 w-4" />
              </button>
              
              {showMenu && (
                <div className="absolute left-0 top-full mt-1 w-32 rounded-md border bg-popover shadow-lg z-10">
                  {isAuthor && (
                    <>
                      <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left">
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button onClick={() => onDelete?.(comment.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left text-destructive">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </>
                  )}
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left text-destructive">
                    <Flag className="h-3.5 w-3.5" /> Report
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Reply form */}
          {isReplying && (
            <div className="mt-2 ml-4">
              <Textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className="min-h-[80px] text-sm"
              />
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="ghost" size="sm" onClick={() => setIsReplying(false)}>Cancel</Button>
                <Button size="sm" onClick={handleReply} disabled={!replyContent.trim() || isSubmitting} isLoading={isSubmitting}>
                  Reply
                </Button>
              </div>
            </div>
          )}
          
          {/* Replies */}
          {hasReplies && (
            <div className="mt-2">
              {comment.replies!.map(reply => (
                <CommentItem key={reply.id} comment={reply} postId={postId} onReply={onReply} onDelete={onDelete} />
              ))}
            </div>
          )}
        </>
      )}
      
      {/* Collapsed indicator */}
      {isCollapsed && hasReplies && (
        <button onClick={() => toggleCollapsed()} className="text-xs text-muted-foreground hover:text-foreground">
          {comment.replies!.length} more {comment.replies!.length === 1 ? 'reply' : 'replies'}
        </button>
      )}
    </div>
  );
}

// Comment List
export function CommentList({ comments, postId, isLoading }: { comments: Comment[]; postId: string; isLoading?: boolean }) {
  const [localComments, setLocalComments] = React.useState(comments);
  
  React.useEffect(() => {
    setLocalComments(comments);
  }, [comments]);
  
  const handleReply = (newComment: Comment) => {
    // Add reply to the appropriate parent
    const addReply = (items: Comment[]): Comment[] => {
      return items.map(item => {
        if (item.id === newComment.parentId) {
          return { ...item, replies: [...(item.replies || []), newComment] };
        }
        if (item.replies) {
          return { ...item, replies: addReply(item.replies) };
        }
        return item;
      });
    };
    setLocalComments(addReply(localComments));
  };
  
  const handleDelete = async (commentId: string) => {
    try {
      await api.deleteComment(commentId);
      // Remove from local state
      const removeComment = (items: Comment[]): Comment[] => {
        return items.filter(item => item.id !== commentId).map(item => ({
          ...item,
          replies: item.replies ? removeComment(item.replies) : undefined
        }));
      };
      setLocalComments(removeComment(localComments));
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <CommentSkeleton key={i} />
        ))}
      </div>
    );
  }
  
  if (localComments.length === 0) {
    return (
      <div className="text-center py-8">
        <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">No comments yet. Be the first to comment!</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      {localComments.map(comment => (
        <CommentItem key={comment.id} comment={comment} postId={postId} onReply={handleReply} onDelete={handleDelete} />
      ))}
    </div>
  );
}

// Comment Form
export function CommentForm({ postId, parentId, onSubmit, onCancel }: { postId: string; parentId?: string; onSubmit?: (comment: Comment) => void; onCancel?: () => void }) {
  const { isAuthenticated } = useAuth();
  const [content, setContent] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  
  if (!isAuthenticated) {
    return (
      <div className="p-4 text-center bg-muted rounded-lg">
        <p className="text-sm text-muted-foreground">
          <Link href="/auth/login" className="text-primary hover:underline">Log in</Link> or{' '}
          <Link href="/auth/register" className="text-primary hover:underline">sign up</Link> to comment
        </p>
      </div>
    );
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const comment = await api.createComment(postId, { content, parentId });
      setContent('');
      onSubmit?.(comment);
    } catch (err) {
      console.error('Failed to create comment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What are your thoughts?"
        className="min-h-[100px]"
      />
      <div className="flex justify-end gap-2 mt-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={!content.trim() || isSubmitting} isLoading={isSubmitting}>
          Comment
        </Button>
      </div>
    </form>
  );
}

// Comment Skeleton
export function CommentSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-16 w-full ml-8" />
      <div className="flex items-center gap-2 ml-8">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-12" />
      </div>
    </div>
  );
}

// Comment Sort
export function CommentSort({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = [
    { value: 'top', label: 'Top' },
    { value: 'new', label: 'New' },
    { value: 'controversial', label: 'Controversial' },
  ];
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Sort by:</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="text-sm bg-transparent border rounded px-2 py-1">
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
