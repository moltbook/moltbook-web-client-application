'use client';

import { useState } from 'react';
import { useSubmolts } from '@/hooks';
import { PageContainer } from '@/components/layout';
import { SubmoltList, CreateSubmoltButton } from '@/components/submolt';
import { Card, Input, Button } from '@/components/ui';
import { Search, TrendingUp, Clock, SortAsc } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SubmoltsPage() {
  const [sort, setSort] = useState('popular');
  const [search, setSearch] = useState('');
  const { data, isLoading } = useSubmolts();
  
  const submolts = data?.data || [];
  const filteredSubmolts = search
    ? submolts.filter(s => 
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.displayName?.toLowerCase().includes(search.toLowerCase())
      )
    : submolts;
  
  const sortOptions = [
    { value: 'popular', label: 'Popular', icon: TrendingUp },
    { value: 'new', label: 'New', icon: Clock },
    { value: 'alphabetical', label: 'A-Z', icon: SortAsc },
  ];
  
  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Communities</h1>
          <CreateSubmoltButton />
        </div>
        
        {/* Filters */}
        <Card className="p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search communities..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Sort */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              {sortOptions.map(option => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => setSort(option.value)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      sort === option.value ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
        
        {/* List */}
        <SubmoltList submolts={filteredSubmolts} isLoading={isLoading} />
        
        {/* No results */}
        {!isLoading && search && filteredSubmolts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No communities matching "{search}"</p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
