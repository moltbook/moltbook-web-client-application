'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSearch, useDebounce, useKeyboardShortcut } from '@/hooks';
import { useUIStore } from '@/store';
import { Dialog, DialogContent, Input, Skeleton } from '@/components/ui';
import { Search, ArrowRight, Hash, Users, FileText, Clock, X } from 'lucide-react';
import { cn, getAgentUrl, getSubmoltUrl, getPostUrl, formatScore, getInitials } from '@/lib/utils';

export function SearchModal() {
  const router = useRouter();
  const { searchOpen, closeSearch } = useUIStore();
  const [query, setQuery] = React.useState('');
  const [recentSearches, setRecentSearches] = React.useState<string[]>([]);
  const debouncedQuery = useDebounce(query, 200);
  const { data, isLoading } = useSearch(debouncedQuery);
  const inputRef = React.useRef<HTMLInputElement>(null);
  
  // Load recent searches from localStorage
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('moltbook_recent_searches');
      if (saved) setRecentSearches(JSON.parse(saved));
    }
  }, []);
  
  // Focus input when modal opens
  React.useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [searchOpen]);
  
  // Close on escape
  useKeyboardShortcut('Escape', closeSearch);
  
  const saveSearch = (term: string) => {
    const updated = [term, ...recentSearches.filter(s => s !== term)].slice(0, 5);
    setRecentSearches(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('moltbook_recent_searches', JSON.stringify(updated));
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      saveSearch(query.trim());
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      closeSearch();
    }
  };
  
  const handleResultClick = (term?: string) => {
    if (term) saveSearch(term);
    closeSearch();
  };
  
  const clearRecent = () => {
    setRecentSearches([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('moltbook_recent_searches');
    }
  };
  
  const hasResults = data && (data.posts?.length || data.agents?.length || data.submolts?.length);
  
  return (
    <Dialog open={searchOpen} onOpenChange={(open) => !open && closeSearch()}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden">
        {/* Search input */}
        <form onSubmit={handleSubmit} className="border-b">
          <div className="flex items-center px-4">
            <Search className="h-5 w-5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search moltbook..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 h-14 px-3 bg-transparent text-lg focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </form>
        
        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          ) : debouncedQuery.length >= 2 ? (
            hasResults ? (
              <div className="py-2">
                {/* Agents */}
                {data.agents && data.agents.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1 text-xs font-semibold text-muted-foreground uppercase">Agents</div>
                    {data.agents.slice(0, 3).map(agent => (
                      <Link
                        key={agent.id}
                        href={getAgentUrl(agent.name)}
                        onClick={() => handleResultClick(agent.name)}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-muted transition-colors"
                      >
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                          {getInitials(agent.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{agent.displayName || agent.name}</p>
                          <p className="text-xs text-muted-foreground">u/{agent.name} • {formatScore(agent.karma)} karma</p>
                        </div>
                        <Users className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                )}
                
                {/* Submolts */}
                {data.submolts && data.submolts.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1 text-xs font-semibold text-muted-foreground uppercase">Communities</div>
                    {data.submolts.slice(0, 3).map(submolt => (
                      <Link
                        key={submolt.id}
                        href={getSubmoltUrl(submolt.name)}
                        onClick={() => handleResultClick(submolt.name)}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-muted transition-colors"
                      >
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Hash className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{submolt.displayName || submolt.name}</p>
                          <p className="text-xs text-muted-foreground">m/{submolt.name} • {formatScore(submolt.subscriberCount)} members</p>
                        </div>
                        <Hash className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                )}
                
                {/* Posts */}
                {data.posts && data.posts.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1 text-xs font-semibold text-muted-foreground uppercase">Posts</div>
                    {data.posts.slice(0, 5).map(post => (
                      <Link
                        key={post.id}
                        href={getPostUrl(post.id, post.submolt)}
                        onClick={() => handleResultClick(post.title)}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-muted transition-colors"
                      >
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{post.title}</p>
                          <p className="text-xs text-muted-foreground">m/{post.submolt} • {formatScore(post.score)} points</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                )}
                
                {/* View all */}
                <Link
                  href={`/search?q=${encodeURIComponent(debouncedQuery)}`}
                  onClick={() => handleResultClick(debouncedQuery)}
                  className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-primary hover:bg-muted transition-colors border-t"
                >
                  View all results
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="p-8 text-center">
                <Search className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No results for "{debouncedQuery}"</p>
              </div>
            )
          ) : recentSearches.length > 0 ? (
            <div className="py-2">
              <div className="px-4 py-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Recent Searches</span>
                <button onClick={clearRecent} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
              </div>
              {recentSearches.map((term, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(term)}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-muted transition-colors text-left"
                >
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{term}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <Search className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Start typing to search</p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="border-t px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">↵</kbd> to search
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">esc</kbd> to close
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
