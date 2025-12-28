import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { CheckCircle, Users, Loader2 } from 'lucide-react';

type ReviewStatus = 'pending' | 'reviewed_grant' | 'reviewed_crybaby' | 'reviewed_both';

interface ReviewActionsProps {
  itemId: string;
  currentStatus: ReviewStatus | null;
  reviewedBy: string[];
  reviewNotes?: string | null;
}

export function ReviewActions({
  itemId,
  currentStatus,
  reviewedBy,
  reviewNotes: initialNotes,
}: ReviewActionsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(initialNotes || '');

  // Fetch user's full name
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  const isReviewedByMe = reviewedBy?.includes(user?.id || '');

  const markReviewed = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');

      const newReviewedBy = [...(reviewedBy || []), user.id];
      
      // Determine new status based on user's name
      let newStatus: ReviewStatus = currentStatus || 'pending';
      const userName = profile?.full_name?.toLowerCase() || '';
      const isGrant = userName.includes('grant');
      
      if (newReviewedBy.length === 1) {
        newStatus = isGrant ? 'reviewed_grant' : 'reviewed_crybaby';
      } else if (newReviewedBy.length >= 2) {
        newStatus = 'reviewed_both';
      }

      const { error } = await supabase
        .from('items')
        .update({
          amazon_review_status: newStatus,
          reviewed_by: newReviewedBy,
          review_notes: notes.trim() || null,
        })
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item', itemId] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success('Item marked as reviewed!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (isReviewedByMe && currentStatus !== 'reviewed_both') {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">You've reviewed this item. Waiting for partner.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentStatus === 'reviewed_both') {
    return (
      <Card className="border-success/20 bg-success/5">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-success">
            <Users className="w-5 h-5" />
            <span className="font-medium">Both partners have reviewed this item</span>
          </div>
          {initialNotes && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Notes:</span> {initialNotes}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Amazon Item Review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="review-notes" className="text-sm text-muted-foreground">
            Review Notes (optional)
          </label>
          <Textarea
            id="review-notes"
            placeholder="Add any notes about this item..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
        <Button
          onClick={() => markReviewed.mutate()}
          disabled={markReviewed.isPending}
          className="w-full"
        >
          {markReviewed.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Mark as Reviewed
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
