import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Facebook, ExternalLink, Eye, MessageSquare, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';

interface FBTrackingSectionProps {
  fbListingUrl?: string | null;
  fbViews?: number | null;
  fbListedDate?: string | null;
  fbConversationNotes?: string | null;
  onUpdate: (updates: {
    fb_listing_url?: string;
    fb_views?: number;
    fb_conversation_notes?: string;
  }) => void;
  isUpdating?: boolean;
}

export function FBTrackingSection({
  fbListingUrl,
  fbViews,
  fbListedDate,
  fbConversationNotes,
  onUpdate,
  isUpdating,
}: FBTrackingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(!!fbListingUrl);
  const [views, setViews] = useState(fbViews?.toString() || '0');
  const [notes, setNotes] = useState(fbConversationNotes || '');
  const [hasChanges, setHasChanges] = useState(false);

  const handleViewsChange = (value: string) => {
    setViews(value);
    setHasChanges(true);
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setHasChanges(true);
  };

  const handleSave = () => {
    onUpdate({
      fb_views: parseInt(views) || 0,
      fb_conversation_notes: notes.trim() || undefined,
    });
    setHasChanges(false);
  };

  if (!fbListingUrl) {
    return null;
  }

  return (
    <Card className="border-[#1877F2]/30 bg-[#1877F2]/5">
      <CardHeader className="pb-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between w-full"
        >
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Facebook className="w-4 h-4 text-[#1877F2]" />
            Facebook Marketplace
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Eye className="w-3 h-3 mr-1" />
              {fbViews || 0} views
            </Badge>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </button>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Listing Link */}
          <div className="flex items-center gap-2">
            <a
              href={fbListingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#1877F2] hover:underline flex items-center gap-1 flex-1 truncate"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              View Listing
            </a>
            {fbListedDate && (
              <span className="text-xs text-muted-foreground">
                Listed {format(new Date(fbListedDate), 'MMM d')}
              </span>
            )}
          </div>

          {/* View Count */}
          <div className="space-y-2">
            <Label htmlFor="fb-views" className="text-xs">
              View Count (update from FB)
            </Label>
            <div className="flex gap-2">
              <Input
                id="fb-views"
                type="number"
                value={views}
                onChange={(e) => handleViewsChange(e.target.value)}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground self-center">views</span>
            </div>
          </div>

          {/* Conversation Notes */}
          <div className="space-y-2">
            <Label htmlFor="fb-notes" className="text-xs flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              Buyer Conversations
            </Label>
            <Textarea
              id="fb-notes"
              placeholder="Paste FB message threads or notes about buyer conversations..."
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              rows={4}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Copy/paste conversations from FB Messenger to keep track of offers and buyer interest
            </p>
          </div>

          {/* Save Button */}
          {hasChanges && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isUpdating}
              className="w-full"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
