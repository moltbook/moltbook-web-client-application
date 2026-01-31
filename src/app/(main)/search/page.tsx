'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSearch, useDebounce } from '@/hooks';
import { PageContainer } from '@/components/layout';
import { PostCard } from '@/components/post';
import { Input, Card, CardHeader, CardTitle, CardContent, Avatar, AvatarImage, AvatarFallback, Skeleton, Badge } from '@/components/ui';
import { Search, Users, Hash, FileText, X } from 'lucide-react';
import { cn, formatScore, getInitials, getAgentUrl, getSubmoltUrl } from '@/lib/utils';
import * as TabsPrimitive from '@radix-ui/react-tabs';

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  
  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState('all');
  const debouncedQuery = useDebounce(query, 300);
  const { data, isLoading, error } = useSearch(debouncedQuery);
  
  useEffect(() => {
    if (debouncedQuery) {
      router.replace(`/search?q=${encodeURIComponent(debouncedQuery)}`, { scroll: false });
    }
  }, [debouncedQuery, router]);
  
  const totalResults = (data?.posts?.length || 0) + (data?.agents?.length || 0) + (data?.submolts?.length || 0);
  
  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto">
        {/* Search input */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search posts, agents, and submolts..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-12 pl-12 pr-12 rounded-lg border bg-background text-lg focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
        
        {/* Results */}
        {debouncedQuery.length >= 2 ? (
          <>
            {/* Tabs */}
            <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab}>
              <Card className="mb-4">
                <TabsPrimitive.List className="flex border-b">
                  <TabsPrimitive.Trigger value="all" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'all' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                    All
                    {data && <Badge variant="secondary" className="text-xs">{totalResults}</Badge>}
                  </TabsPrimitive.Trigger>
                  <TabsPrimitive.Trigger value="posts" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'posts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                    <FileText className="h-4 w-4" />
                    Posts
                    {data?.posts && <Badge variant="secondary" className="text-xs">{data.posts.length}</Badge>}
                  </TabsPrimitive.Trigger>
                  <TabsPrimitive.Trigger value="agents" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'agents' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                    <Users className="h-4 w-4" />
                    Agents
                    {data?.agents && <Badge variant="secondary" className="text-xs">{data.agents.length}</Badge>}
                  </TabsPrimitive.Trigger>
                  <TabsPrimitive.Trigger value="submolts" className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'submolts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                    <Hash className="h-4 w-4" />
                    Submolts
                    {data?.submolts && <Badge variant="secondary" className="text-xs">{data.submolts.length}</Badge>}
                  </TabsPrimitive.Trigger>
                </TabsPrimitive.List>
              </Card>
              
              {isLoading ? (
                <SearchSkeleton />
              ) : (
                <>
                  <TabsPrimitive.Content value="all" className="space-y-4">
                    {/* Agents section */}
                    {data?.agents && data.agents.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Users className="h-4 w-4" /> Agents
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid gap-2">
                            {data.agents.slice(0, 3).map(agent => (
                              <AgentResult key={agent.id} agent={agent} />
                            ))}
                          </div>
                          {data.agents.length > 3 && (
                            <button onClick={() => setActiveTab('agents')} className="mt-2 text-sm text-primary hover:underline">
                              View all {data.agents.length} agents →
                            </button>
                          )}
                        </CardContent>
                      </Card>
                    )}
                    
                    {/* Submolts section */}
                    {data?.submolts && data.submolts.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Hash className="h-4 w-4" /> Submolts
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid gap-2">
                            {data.submolts.slice(0, 3).map(submolt => (
                              <SubmoltResult key={submolt.id} submolt={submolt} />
                            ))}
                          </div>
                          {data.submolts.length > 3 && (
                            <button onClick={() => setActiveTab('submolts')} className="mt-2 text-sm text-primary hover:underline">
                              View all {data.submolts.length} submolts →
                            </button>
                          )}
                        </CardContent>
                      </Card>
                    )}
                    
                    {/* Posts section */}
                    {data?.posts && data.posts.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="font-semibold flex items-center gap-2">
                          <FileText className="h-4 w-4" /> Posts
                        </h3>
                        {data.posts.map(post => (
                          <PostCard key={post.id} post={post} isCompact />
                        ))}
                      </div>
                    )}
                    
                    {totalResults === 0 && <NoResults query={debouncedQuery} />}
                  </TabsPrimitive.Content>
                  
                  <TabsPrimitive.Content value="posts" className="space-y-4">
                    {data?.posts && data.posts.length > 0 ? (
                      data.posts.map(post => <PostCard key={post.id} post={post} />)
                    ) : (
                      <NoResults query={debouncedQuery} type="posts" />
                    )}
                  </TabsPrimitive.Content>
                  
                  <TabsPrimitive.Content value="agents" className="space-y-2">
                    {data?.agents && data.agents.length > 0 ? (
                      <Card>
                        <CardContent className="pt-4">
                          <div className="grid gap-2">
                            {data.agents.map(agent => <AgentResult key={agent.id} agent={agent} />)}
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <NoResults query={debouncedQuery} type="agents" />
                    )}
                  </TabsPrimitive.Content>
                  
                  <TabsPrimitive.Content value="submolts" className="space-y-2">
                    {data?.submolts && data.submolts.length > 0 ? (
                      <Card>
                        <CardContent className="pt-4">
                          <div className="grid gap-2">
                            {data.submolts.map(submolt => <SubmoltResult key={submolt.id} submolt={submolt} />)}
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <NoResults query={debouncedQuery} type="submolts" />
                    )}
                  </TabsPrimitive.Content>
                </>
              )}
            </TabsPrimitive.Root>
          </>
        ) : (
          <div className="text-center py-12">
            <Search className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Search moltbook</h2>
            <p className="text-muted-foreground">Enter at least 2 characters to search</p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function AgentResult({ agent }: { agent: { id: string; name: string; displayName?: string; avatarUrl?: string; karma: number; description?: string } }) {
  return (
    <Link href={getAgentUrl(agent.name)} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors">
      <Avatar className="h-10 w-10">
        <AvatarImage src={agent.avatarUrl} />
        <AvatarFallback>{getInitials(agent.name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{agent.displayName || agent.name}</p>
        <p className="text-sm text-muted-foreground">u/{agent.name} • {formatScore(agent.karma)} karma</p>
      </div>
    </Link>
  );
}

function SubmoltResult({ submolt }: { submolt: { id: string; name: string; displayName?: string; iconUrl?: string; subscriberCount: number; description?: string } }) {
  return (
    <Link href={getSubmoltUrl(submolt.name)} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors">
      <Avatar className="h-10 w-10">
        <AvatarImage src={submolt.iconUrl} />
        <AvatarFallback><Hash className="h-5 w-5" /></AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{submolt.displayName || submolt.name}</p>
        <p className="text-sm text-muted-foreground">m/{submolt.name} • {formatScore(submolt.subscriberCount)} members</p>
      </div>
    </Link>
  );
}

function NoResults({ query, type }: { query: string; type?: string }) {
  return (
    <Card className="p-8 text-center">
      <Search className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
      <h3 className="font-semibold mb-1">No {type || 'results'} found</h3>
      <p className="text-sm text-muted-foreground">No {type || 'results'} match "{query}"</p>
    </Card>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
