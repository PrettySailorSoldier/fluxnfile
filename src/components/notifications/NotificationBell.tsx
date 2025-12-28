import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useUserPreferences, useUpdateUserPreferences, CustomNotificationTone } from '@/hooks/useUserPreferences';
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
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Bell, Check, Volume2, VolumeX, Play, Upload, Trash2, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

// Default notification tone options
const DEFAULT_TONES = [
  { id: 'default', name: 'Default', url: '/sounds/notification.mp3' },
  { id: 'chime', name: 'Chime', url: '/sounds/chime.mp3' },
  { id: 'pop', name: 'Pop', url: '/sounds/pop.mp3' },
  { id: 'bell', name: 'Bell', url: '/sounds/bell.mp3' },
  { id: 'ding', name: 'Ding', url: '/sounds/ding.mp3' },
  { id: 'whoosh', name: 'Whoosh', url: '/sounds/whoosh.mp3' },
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

interface ToneOption {
  id: string;
  name: string;
  url: string | null;
  isCustom?: boolean;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevCountRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const [showToneSettings, setShowToneSettings] = useState(false);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [showCustomUpload, setShowCustomUpload] = useState(false);
  const [customToneName, setCustomToneName] = useState('');
  
  // Load user preferences
  const { data: preferences } = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();
  
  // Get current settings from preferences or use defaults
  const notificationTone = preferences?.notification_tone || 'default';
  const notificationVolume = preferences?.notification_volume ?? 50;
  const customTones: CustomNotificationTone[] = preferences?.custom_notification_tones || [];
  
  // Combine default and custom tones
  const allTones: ToneOption[] = [
    ...DEFAULT_TONES,
    ...customTones.map(t => ({ ...t, isCustom: true })),
  ];

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
    refetchInterval: 30000,
  });

  const unreadCount = notifications?.filter((n) => !n.is_read).length || 0;

  // Play sound preview with fallback to synthesized audio
  const playSound = useCallback(async (toneId: string, volume?: number) => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    const tone = allTones.find(t => t.id === toneId);
    const vol = (volume ?? notificationVolume) / 100;
    
    if (tone?.url) {
      // Check if it's a data URL (custom tone) or file URL
      const isDataUrl = tone.url.startsWith('data:');
      
      if (isDataUrl || tone.isCustom) {
        // Play data URL directly (custom uploaded tones)
        const audio = new Audio(tone.url);
        audio.volume = vol;
        audioRef.current = audio;
        setIsPlaying(toneId);
        
        audio.onended = () => {
          setIsPlaying(null);
          audioRef.current = null;
        };
        
        audio.onerror = () => {
          setIsPlaying(null);
          audioRef.current = null;
          toast.error('Failed to play sound');
        };
        
        audio.play().catch(() => {
          setIsPlaying(null);
          toast.error('Audio playback blocked by browser');
        });
      } else {
        // For default tones, use synthesized audio (more reliable)
        const { playSynthesizedTone, TONE_CONFIGS } = await import('@/utils/audioGenerator');
        
        if (TONE_CONFIGS[toneId]) {
          setIsPlaying(toneId);
          playSynthesizedTone(toneId, vol, () => {
            setIsPlaying(null);
          });
        } else {
          // Try to play the file, but fallback to synthesized default
          const audio = new Audio(tone.url);
          audio.volume = vol;
          audioRef.current = audio;
          setIsPlaying(toneId);
          
          audio.onended = () => {
            setIsPlaying(null);
            audioRef.current = null;
          };
          
          audio.onerror = async () => {
            // Fallback to synthesized audio
            console.log('Audio file not found, using synthesized fallback');
            playSynthesizedTone('default', vol, () => {
              setIsPlaying(null);
            });
            audioRef.current = null;
          };
          
          audio.play().catch(async () => {
            // Fallback to synthesized audio on play error
            playSynthesizedTone('default', vol, () => {
              setIsPlaying(null);
            });
          });
        }
      }
    }
  }, [allTones, notificationVolume]);

  // Play sound when new notification arrives
  useEffect(() => {
    if (unreadCount > prevCountRef.current && notificationTone !== 'none') {
      playSound(notificationTone);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount, notificationTone, playSound]);

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

  // Handle tone selection with preview
  const handleToneSelect = (toneId: string) => {
    updatePreferences.mutate({ notification_tone: toneId });
    // Play preview
    if (toneId !== 'none') {
      playSound(toneId);
    }
  };

  // Handle preview button click (separate from selection)
  const handlePreviewClick = (e: React.MouseEvent, toneId: string) => {
    e.stopPropagation();
    if (toneId !== 'none') {
      playSound(toneId);
    }
  };

  // Handle volume change
  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    updatePreferences.mutate({ notification_volume: newVolume });
  };

  // Handle custom tone file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('audio/')) {
      toast.error('Please select an audio file');
      return;
    }

    // Validate file size (max 1MB)
    if (file.size > 1 * 1024 * 1024) {
      toast.error('File size must be less than 1MB');
      return;
    }

    const name = customToneName.trim() || file.name.replace(/\.[^/.]+$/, '');
    
    try {
      // Convert file to base64 data URL for storage
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const newTone: CustomNotificationTone = {
          id: `custom-${Date.now()}`,
          name: name,
          url: dataUrl,
        };
        
        const updatedTones = [...customTones, newTone];
        updatePreferences.mutate({ 
          custom_notification_tones: updatedTones,
          notification_tone: newTone.id,
        });
        
        toast.success(`Added custom tone: ${name}`);
        setCustomToneName('');
        setShowCustomUpload(false);
        
        // Play preview of new tone
        setTimeout(() => playSound(newTone.id), 100);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error('Failed to upload custom tone');
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle custom tone deletion
  const handleDeleteCustomTone = (e: React.MouseEvent, toneId: string) => {
    e.stopPropagation();
    const updatedTones = customTones.filter(t => t.id !== toneId);
    const updates: { custom_notification_tones: CustomNotificationTone[]; notification_tone?: string } = {
      custom_notification_tones: updatedTones,
    };
    
    // If current tone is being deleted, switch to default
    if (notificationTone === toneId) {
      updates.notification_tone = 'default';
    }
    
    updatePreferences.mutate(updates);
    toast.success('Custom tone deleted');
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
              title="Notification sound settings"
            >
              {notificationTone === 'none' ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
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
        
        {/* Sound settings panel */}
        {showToneSettings && (
          <>
            <DropdownMenuSeparator />
            <div className="p-3 space-y-4" onClick={(e) => e.stopPropagation()}>
              {/* Volume slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Volume</span>
                  <span className="text-xs text-muted-foreground">{notificationVolume}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <VolumeX className="w-4 h-4 text-muted-foreground" />
                  <Slider
                    value={[notificationVolume]}
                    onValueChange={handleVolumeChange}
                    max={100}
                    min={0}
                    step={5}
                    className="flex-1"
                  />
                  <Volume2 className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              {/* Tone selector */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Notification Sound</span>
                <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                  {allTones.map((tone) => (
                    <div key={tone.id} className="relative group">
                      <Button
                        variant={notificationTone === tone.id ? 'default' : 'outline'}
                        size="sm"
                        className="w-full h-8 text-xs px-2 pr-8 justify-start overflow-hidden"
                        onClick={() => handleToneSelect(tone.id)}
                      >
                        <span className="truncate">{tone.name}</span>
                      </Button>
                      {/* Preview/Delete buttons */}
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                        {tone.url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-70 hover:opacity-100"
                            onClick={(e) => handlePreviewClick(e, tone.id)}
                            title="Preview sound"
                          >
                            <Play className={`w-3 h-3 ${isPlaying === tone.id ? 'text-primary animate-pulse' : ''}`} />
                          </Button>
                        )}
                        {tone.isCustom && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-70 hover:opacity-100 hover:text-destructive"
                            onClick={(e) => handleDeleteCustomTone(e, tone.id)}
                            title="Delete custom tone"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom tone upload */}
              <div className="space-y-2">
                {showCustomUpload ? (
                  <div className="space-y-2 p-2 border rounded-md bg-muted/30">
                    <Input
                      type="text"
                      placeholder="Tone name (optional)"
                      value={customToneName}
                      onChange={(e) => setCustomToneName(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <div className="flex gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="custom-tone-upload"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-3 h-3 mr-1" />
                        Choose File
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setShowCustomUpload(false);
                          setCustomToneName('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Max 1MB • MP3, WAV, OGG supported
                    </p>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={() => setShowCustomUpload(true)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Custom Tone
                  </Button>
                )}
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
