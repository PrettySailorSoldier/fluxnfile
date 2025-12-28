import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Send, MessageCircle, Pin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Comment {
  id: string;
  text: string;
  author_id: string;
  is_pinned: boolean;
  created_at: string;
  mentions: string[];
  author: {
    id: string;
    full_name: string;
  };
}

interface CommentsSectionProps {
  itemId: string;
}

export function CommentsSection({ itemId }: CommentsSectionProps) {
  const { user, team } = useAuth();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch team members for mentions
  const { data: teamMembers } = useQuery({
    queryKey: ['team-members', team?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('team_id', team?.id);
      return data || [];
    },
    enabled: !!team?.id,
  });

  // Fetch comments
  const { data: comments } = useQuery({
    queryKey: ['comments', itemId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('comments')
        .select(`
          *,
          author:profiles(id, full_name)
        `)
        .eq('item_id', itemId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as Comment[];
    },
  });

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`comments:${itemId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `item_id=eq.${itemId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['comments', itemId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [itemId, queryClient]);

  // Add comment mutation
  const addComment = useMutation({
    mutationFn: async () => {
      if (!user?.id || !commentText.trim()) return;

      // Extract mentions
      const mentions = Array.from(commentText.matchAll(/@(\w+)/g))
        .map((match) => {
          const memberName = match[1];
          return teamMembers?.find((m) =>
            m.full_name?.toLowerCase().includes(memberName.toLowerCase())
          )?.id;
        })
        .filter(Boolean) as string[];

      const { error } = await (supabase as any).from('comments').insert({
        item_id: itemId,
        author_id: user.id,
        text: commentText.trim(),
        mentions,
      });

      if (error) throw error;

      // Create notifications for mentioned users
      for (const mentionedUserId of mentions) {
        if (mentionedUserId !== user.id) {
          await (supabase as any).from('notifications').insert({
            user_id: mentionedUserId,
            type: 'comment_mention',
            title: 'You were mentioned',
            message: `${user.user_metadata?.full_name || 'Your partner'} mentioned you in a comment`,
            link: `/item/${itemId}`,
          });
        }
      }
    },
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['comments', itemId] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Handle @ mentions
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setCommentText(text);

    // Check if typing @
    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1 && lastAtIndex === cursorPosition - 1) {
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (memberName: string) => {
    const cursorPosition = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = commentText.slice(0, cursorPosition);
    const textAfterCursor = commentText.slice(cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    const newText =
      textBeforeCursor.slice(0, lastAtIndex) +
      `@${memberName} ` +
      textAfterCursor;

    setCommentText(newText);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          Comments ({comments?.length || 0})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comments list */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {comments?.map((comment) => (
            <div
              key={comment.id}
              className={`flex gap-3 ${comment.is_pinned ? 'bg-muted/50 p-2 rounded-lg' : ''}`}
            >
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback>
                  {comment.author.full_name?.charAt(0) || '?'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">
                    {comment.author.full_name}
                  </span>
                  {comment.is_pinned && <Pin className="w-3 h-3 text-primary" />}
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(comment.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {comment.text}
                </p>
              </div>
            </div>
          ))}

          {(!comments || comments.length === 0) && (
            <p className="text-center text-muted-foreground text-sm py-4">
              No comments yet. Start the conversation!
            </p>
          )}
        </div>

        {/* Add comment */}
        <div className="space-y-2">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              placeholder="Add a comment... (type @ to mention)"
              value={commentText}
              onChange={handleTextChange}
              rows={3}
              className="resize-none"
            />

            {/* Mention suggestions */}
            {showMentions && teamMembers && teamMembers.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border rounded-md shadow-lg max-h-32 overflow-y-auto">
                {teamMembers.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => insertMention(member.full_name || '')}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    @{member.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            onClick={() => addComment.mutate()}
            disabled={!commentText.trim() || addComment.isPending}
            className="w-full"
          >
            <Send className="w-4 h-4 mr-2" />
            Send Comment
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
