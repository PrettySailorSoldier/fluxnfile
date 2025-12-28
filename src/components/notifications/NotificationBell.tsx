import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Check, Volume2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Notification tone options
const NOTIFICATION_TONES = [
  { id: 'default', name: 'Default', url: '/sounds/notification.mp3' },
  { id: 'chime', name: 'Chime', url: '/sounds/chime.mp3' },
  { id: 'pop', name: 'Pop', url: '/sounds/pop.mp3' },
  { id: 'bell', name: 'Bell', url: '/sounds/bell.mp3' },
  { id: 'none', name: 'Silent', url: null },
];

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationBellProps {
  notificationTone?: string;
  onToneChange?: (toneId: string) => void;
}

export function NotificationBell({ notificationTone = 'default', onToneChange }: NotificationBellProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevCountRef = useRef<number>(0);
  const [showToneSettings, setShowToneSettings] = useState(false);

  const { data: notifications } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('notifications')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!user?.id,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const unreadCount = notifications?.filter((n) => !n.is_read).length || 0;

  // Play sound when new notification arrives
  useEffect(() => {
    if (unreadCount > prevCountRef.current && notificationTone !== 'none') {
      const tone = NOTIFICATION_TONES.find(t => t.id === notificationTone);
      if (tone?.url) {
        // Try to play the notification sound
        const audio = new Audio(tone.url);
        audio.volume = 0.5;
        audio.play().catch(() => {
          // Audio autoplay blocked, use fallback
          console.log('Notification sound blocked by browser');
        });
      }
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount, notificationTone]);

  // Real-time subscription for instant notifications
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user?.id)
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    markAsRead.mutate(notification.id);
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const handleToneSelect = (toneId: string) => {
    onToneChange?.(toneId);
    setShowToneSettings(false);
    
    // Play sample of selected tone
    const tone = NOTIFICATION_TONES.find(t => t.id === toneId);
    if (tone?.url) {
      const audio = new Audio(tone.url);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                setShowToneSettings(!showToneSettings);
              }}
              title="Notification sound"
            >
              <Volume2 className="w-4 h-4" />
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllAsRead.mutate()}
              >
                <Check className="w-4 h-4 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </DropdownMenuLabel>
        
        {/* Tone selector */}
        {showToneSettings && (
          <>
            <DropdownMenuSeparator />
            <div className="p-2 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Notification Sound</span>
              <div className="grid grid-cols-2 gap-1">
                {NOTIFICATION_TONES.map((tone) => (
                  <Button
                    key={tone.id}
                    variant={notificationTone === tone.id ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleToneSelect(tone.id)}
                  >
                    {tone.name}
                  </Button>
                ))}
              </div>
            </div>
          </>
        )}
        
        <DropdownMenuSeparator />

        <div className="max-h-96 overflow-y-auto">
          {notifications && notifications.length > 0 ? (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`flex flex-col items-start gap-1 cursor-pointer ${
                  !notification.is_read ? 'bg-muted/50' : ''
                }`}
              >
                <div className="flex items-start justify-between w-full">
                  <span className="font-medium text-sm">{notification.title}</span>
                  {!notification.is_read && (
                    <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {notification.message}
                </p>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(notification.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </DropdownMenuItem>
            ))
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
