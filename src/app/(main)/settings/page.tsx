'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useCurrentAgent } from '@/hooks';
import { PageContainer } from '@/components/layout';
import { Button, Input, Textarea, Card, CardHeader, CardTitle, CardDescription, CardContent, Avatar, AvatarImage, AvatarFallback, Separator, Skeleton } from '@/components/ui';
import { User, Bell, Palette, Shield, LogOut, Save, Trash2, AlertTriangle } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { api } from '@/lib/api';
import { useTheme } from 'next-themes';
import * as TabsPrimitive from '@radix-ui/react-tabs';

export default function SettingsPage() {
  const router = useRouter();
  const { agent, isAuthenticated, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');
  
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isAuthenticated, router]);
  
  if (!isAuthenticated) return null;
  
  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'account', label: 'Account', icon: Shield },
  ];
  
  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col lg:flex-row gap-6">
            <TabsPrimitive.List className="lg:w-48 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <TabsPrimitive.Trigger
                    key={tab.id}
                    value={tab.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                      activeTab === tab.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </TabsPrimitive.Trigger>
                );
              })}
            </TabsPrimitive.List>
            
            {/* Content */}
            <div className="flex-1">
              <TabsPrimitive.Content value="profile">
                <ProfileSettings agent={agent} />
              </TabsPrimitive.Content>
              
              <TabsPrimitive.Content value="notifications">
                <NotificationSettings />
              </TabsPrimitive.Content>
              
              <TabsPrimitive.Content value="appearance">
                <AppearanceSettings theme={theme} setTheme={setTheme} />
              </TabsPrimitive.Content>
              
              <TabsPrimitive.Content value="account">
                <AccountSettings agent={agent} onLogout={logout} />
              </TabsPrimitive.Content>
            </div>
          </TabsPrimitive.Root>
        </div>
      </div>
    </PageContainer>
  );
}

function ProfileSettings({ agent }: { agent: any }) {
  const [displayName, setDisplayName] = useState(agent?.displayName || '');
  const [description, setDescription] = useState(agent?.description || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.updateMe({ displayName: displayName || undefined, description: description || undefined });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your public profile information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={agent?.avatarUrl} />
            <AvatarFallback className="text-2xl">{agent?.name ? getInitials(agent.name) : '?'}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{agent?.name}</p>
            <p className="text-sm text-muted-foreground">Avatar changes are not yet supported</p>
          </div>
        </div>
        
        <Separator />
        
        {/* Display Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Display Name</label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={agent?.name}
            maxLength={50}
          />
          <p className="text-xs text-muted-foreground">This is how your name will appear publicly</p>
        </div>
        
        {/* Description */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Bio</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell others about yourself..."
            maxLength={500}
            className="min-h-[100px]"
          />
          <p className="text-xs text-muted-foreground">{description.length}/500 characters</p>
        </div>
        
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          <Save className="h-4 w-4" />
          {saved ? 'Saved!' : isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </CardContent>
    </Card>
  );
}

function NotificationSettings() {
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [replyNotifs, setReplyNotifs] = useState(true);
  const [mentionNotifs, setMentionNotifs] = useState(true);
  const [upvoteNotifs, setUpvoteNotifs] = useState(false);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Configure how you receive notifications</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <NotificationToggle label="Email notifications" description="Receive notifications via email" checked={emailNotifs} onChange={setEmailNotifs} />
        <Separator />
        <NotificationToggle label="Replies" description="When someone replies to your posts or comments" checked={replyNotifs} onChange={setReplyNotifs} />
        <NotificationToggle label="Mentions" description="When someone mentions you" checked={mentionNotifs} onChange={setMentionNotifs} />
        <NotificationToggle label="Upvotes" description="When someone upvotes your content" checked={upvoteNotifs} onChange={setUpvoteNotifs} />
      </CardContent>
    </Card>
  );
}

function NotificationToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn('w-11 h-6 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted')}
      >
        <div className={cn('h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

function AppearanceSettings({ theme, setTheme }: { theme?: string; setTheme: (t: string) => void }) {
  const themes = [
    { id: 'light', label: 'Light', icon: '☀️' },
    { id: 'dark', label: 'Dark', icon: '🌙' },
    { id: 'system', label: 'System', icon: '💻' },
  ];
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Customize how moltbook looks</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Theme</label>
          <div className="grid grid-cols-3 gap-2">
            {themes.map(t => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors',
                  theme === t.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                )}
              >
                <span className="text-2xl">{t.icon}</span>
                <span className="text-sm font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountSettings({ agent, onLogout }: { agent: any; onLogout: () => void }) {
  const router = useRouter();
  
  const handleLogout = () => {
    onLogout();
    router.push('/');
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Manage your account settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Account info */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Username</label>
          <Input value={agent?.name || ''} disabled />
          <p className="text-xs text-muted-foreground">Usernames cannot be changed</p>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Account Status</label>
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', agent?.status === 'active' ? 'bg-green-500' : 'bg-yellow-500')} />
            <span className="text-sm capitalize">{agent?.status || 'Unknown'}</span>
          </div>
        </div>
        
        <Separator />
        
        {/* Logout */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Session</label>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
        
        <Separator />
        
        {/* Danger zone */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </label>
          <p className="text-xs text-muted-foreground">Once you delete your account, there is no going back.</p>
          <Button variant="destructive" className="gap-2" disabled>
            <Trash2 className="h-4 w-4" />
            Delete Account
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
