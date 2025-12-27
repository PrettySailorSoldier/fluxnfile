import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useOffers,
  useCreateOffer,
  useUpdateOffer,
  useDeleteOffer,
  offerStatusLabels,
  offerStatusColors,
  getOfferPercentage,
  Offer,
  OfferStatus,
} from '@/hooks/useOffers';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  DollarSign,
  Plus,
  AlertTriangle,
  Check,
  X,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Trash2,
  User,
  TrendingDown,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface OfferTrackerProps {
  itemId: string;
  askingPrice: number;
  onScheduleMeetup?: (offer: Offer) => void;
}

export function OfferTracker({ itemId, askingPrice, onScheduleMeetup }: OfferTrackerProps) {
  const { data: offers = [], isLoading } = useOffers(itemId);
  const createOffer = useCreateOffer();
  const updateOffer = useUpdateOffer();
  const deleteOffer = useDeleteOffer();

  const [isExpanded, setIsExpanded] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);

  // Form state
  const [buyerName, setBuyerName] = useState('');
  const [buyerContact, setBuyerContact] = useState('');
  const [offerAmount, setOfferAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [conversationThread, setConversationThread] = useState('');

  const resetForm = () => {
    setBuyerName('');
    setBuyerContact('');
    setOfferAmount('');
    setNotes('');
    setConversationThread('');
    setSelectedOffer(null);
  };

  const handleAddOffer = async () => {
    const amount = parseFloat(offerAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid offer amount');
      return;
    }

    try {
      await createOffer.mutateAsync({
        item_id: itemId,
        buyer_name: buyerName.trim() || undefined,
        buyer_contact: buyerContact.trim() || undefined,
        offer_amount: amount,
        notes: notes.trim() || undefined,
        conversation_thread: conversationThread.trim() || undefined,
      });
      toast.success('Offer logged');
      resetForm();
      setShowAddDialog(false);
    } catch {
      toast.error('Failed to log offer');
    }
  };

  const handleStatusChange = async (offerId: string, status: OfferStatus) => {
    try {
      await updateOffer.mutateAsync({ id: offerId, status });
      toast.success(`Offer marked as ${offerStatusLabels[status].toLowerCase()}`);
    } catch {
      toast.error('Failed to update offer');
    }
  };

  const handleCounter = async (offerId: string, counterAmount: number) => {
    try {
      await updateOffer.mutateAsync({
        id: offerId,
        counter_amount: counterAmount,
        status: 'countered',
      });
      toast.success('Counter offer sent');
    } catch {
      toast.error('Failed to send counter offer');
    }
  };

  const handleDelete = async (offerId: string) => {
    try {
      await deleteOffer.mutateAsync(offerId);
      toast.success('Offer deleted');
    } catch {
      toast.error('Failed to delete offer');
    }
  };

  const pendingOffers = offers.filter((o) => o.status === 'pending' || o.status === 'countered');
  const otherOffers = offers.filter((o) => o.status !== 'pending' && o.status !== 'countered');

  if (isLoading) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between w-full"
          >
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Offers
              {pendingOffers.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {pendingOffers.length} active
                </Badge>
              )}
            </CardTitle>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </CardHeader>

        {isExpanded && (
          <CardContent className="space-y-3">
            {/* Quick add offer button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Log New Offer
            </Button>

            {/* Active offers */}
            {pendingOffers.length > 0 && (
              <div className="space-y-2">
                {pendingOffers.map((offer) => (
                  <OfferCard
                    key={offer.id}
                    offer={offer}
                    askingPrice={askingPrice}
                    onStatusChange={handleStatusChange}
                    onCounter={handleCounter}
                    onDelete={handleDelete}
                    onViewDetails={() => setSelectedOffer(offer)}
                    onScheduleMeetup={onScheduleMeetup}
                  />
                ))}
              </div>
            )}

            {/* Past offers */}
            {otherOffers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Past Offers</p>
                {otherOffers.slice(0, 3).map((offer) => (
                  <OfferCard
                    key={offer.id}
                    offer={offer}
                    askingPrice={askingPrice}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                    onViewDetails={() => setSelectedOffer(offer)}
                    compact
                  />
                ))}
              </div>
            )}

            {offers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                No offers yet
              </p>
            )}
          </CardContent>
        )}
      </Card>

      {/* Add Offer Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open);
        if (!open) resetForm();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log New Offer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Buyer Name</Label>
                <Input
                  placeholder="Optional"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Info</Label>
                <Input
                  placeholder="Phone or FB name"
                  value={buyerContact}
                  onChange={(e) => setBuyerContact(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Offer Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={offerAmount}
                  onChange={(e) => setOfferAmount(e.target.value)}
                  className="pl-7"
                />
              </div>
              {offerAmount && askingPrice > 0 && (
                <p className="text-xs text-muted-foreground">
                  {getOfferPercentage(parseFloat(offerAmount), askingPrice)}% of asking price (${askingPrice})
                  {parseFloat(offerAmount) < askingPrice * 0.5 && (
                    <span className="text-destructive ml-2">
                      <AlertTriangle className="w-3 h-3 inline mr-1" />
                      Lowball
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Conversation Thread</Label>
              <Textarea
                placeholder="Paste FB message thread here..."
                value={conversationThread}
                onChange={(e) => setConversationThread(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any notes about this buyer..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <Button
              onClick={handleAddOffer}
              className="w-full"
              disabled={createOffer.isPending}
            >
              <Plus className="w-4 h-4 mr-2" />
              Log Offer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Offer Details Dialog */}
      <OfferDetailsDialog
        offer={selectedOffer}
        askingPrice={askingPrice}
        onClose={() => setSelectedOffer(null)}
        onUpdate={updateOffer.mutateAsync}
      />
    </>
  );
}

interface OfferCardProps {
  offer: Offer;
  askingPrice: number;
  onStatusChange: (id: string, status: OfferStatus) => void;
  onCounter?: (id: string, amount: number) => void;
  onDelete: (id: string) => void;
  onViewDetails: () => void;
  onScheduleMeetup?: (offer: Offer) => void;
  compact?: boolean;
}

function OfferCard({
  offer,
  askingPrice,
  onStatusChange,
  onCounter,
  onDelete,
  onViewDetails,
  onScheduleMeetup,
  compact,
}: OfferCardProps) {
  const [showCounterInput, setShowCounterInput] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');

  const percentage = getOfferPercentage(offer.offer_amount, askingPrice);

  return (
    <div
      className={cn(
        'p-3 rounded-lg border',
        offer.is_lowball && 'border-destructive/30 bg-destructive/5',
        !offer.is_lowball && 'bg-muted/50'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-lg">${offer.offer_amount.toFixed(2)}</span>
            <Badge variant="outline" className={offerStatusColors[offer.status]}>
              {offerStatusLabels[offer.status]}
            </Badge>
            {offer.is_lowball && (
              <Badge variant="destructive" className="text-xs">
                <TrendingDown className="w-3 h-3 mr-1" />
                Lowball
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {offer.buyer_name && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {offer.buyer_name}
              </span>
            )}
            <span>{percentage}% of asking</span>
            <span>{format(new Date(offer.created_at), 'MMM d')}</span>
          </div>

          {offer.counter_amount && (
            <p className="text-xs mt-1">
              Counter: <span className="font-medium">${offer.counter_amount.toFixed(2)}</span>
            </p>
          )}

          {!compact && offer.notes && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{offer.notes}</p>
          )}
        </div>

        {!compact && (
          <Button size="icon" variant="ghost" onClick={() => onDelete(offer.id)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Actions for active offers */}
      {!compact && (offer.status === 'pending' || offer.status === 'countered') && (
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-green-600"
            onClick={() => onStatusChange(offer.id, 'accepted')}
          >
            <Check className="w-4 h-4 mr-1" />
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-red-600"
            onClick={() => onStatusChange(offer.id, 'declined')}
          >
            <X className="w-4 h-4 mr-1" />
            Decline
          </Button>
          {onCounter && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setShowCounterInput(!showCounterInput)}
            >
              <Send className="w-4 h-4 mr-1" />
              Counter
            </Button>
          )}
        </div>
      )}

      {/* Counter input */}
      {showCounterInput && onCounter && (
        <div className="flex gap-2 mt-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              type="number"
              step="0.01"
              placeholder="Your counter"
              value={counterAmount}
              onChange={(e) => setCounterAmount(e.target.value)}
              className="pl-7 h-8"
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              const amount = parseFloat(counterAmount);
              if (!isNaN(amount) && amount > 0) {
                onCounter(offer.id, amount);
                setShowCounterInput(false);
                setCounterAmount('');
              }
            }}
          >
            Send
          </Button>
        </div>
      )}

      {/* Schedule meetup for accepted offers */}
      {offer.status === 'accepted' && onScheduleMeetup && (
        <Button
          size="sm"
          className="w-full mt-2"
          onClick={() => onScheduleMeetup(offer)}
        >
          Schedule Meetup
        </Button>
      )}

      {/* View details button */}
      {compact && (
        <Button
          size="sm"
          variant="ghost"
          className="w-full mt-2"
          onClick={onViewDetails}
        >
          <MessageSquare className="w-4 h-4 mr-1" />
          View Details
        </Button>
      )}
    </div>
  );
}

interface OfferDetailsDialogProps {
  offer: Offer | null;
  askingPrice: number;
  onClose: () => void;
  onUpdate: (data: { id: string; notes?: string; conversation_thread?: string }) => Promise<void>;
}

function OfferDetailsDialog({ offer, askingPrice, onClose, onUpdate }: OfferDetailsDialogProps) {
  const [notes, setNotes] = useState('');
  const [conversationThread, setConversationThread] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Sync state when offer changes
  useState(() => {
    if (offer) {
      setNotes(offer.notes || '');
      setConversationThread(offer.conversation_thread || '');
    }
  });

  if (!offer) return null;

  const handleSave = async () => {
    try {
      await onUpdate({
        id: offer.id,
        notes: notes.trim() || undefined,
        conversation_thread: conversationThread.trim() || undefined,
      });
      toast.success('Offer updated');
      setHasChanges(false);
    } catch {
      toast.error('Failed to update offer');
    }
  };

  return (
    <Dialog open={!!offer} onOpenChange={() => onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Offer Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <p className="font-bold text-xl">${offer.offer_amount.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">
                {getOfferPercentage(offer.offer_amount, askingPrice)}% of ${askingPrice}
              </p>
            </div>
            <Badge className={offerStatusColors[offer.status]}>
              {offerStatusLabels[offer.status]}
            </Badge>
          </div>

          {(offer.buyer_name || offer.buyer_contact) && (
            <div className="space-y-1">
              <Label className="text-muted-foreground">Buyer</Label>
              <p className="text-sm">
                {offer.buyer_name || 'Unknown'}
                {offer.buyer_contact && (
                  <span className="text-muted-foreground ml-2">({offer.buyer_contact})</span>
                )}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Conversation Thread</Label>
            <Textarea
              placeholder="Paste FB message thread here..."
              value={conversationThread}
              onChange={(e) => {
                setConversationThread(e.target.value);
                setHasChanges(true);
              }}
              rows={6}
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>Buyer Notes</Label>
            <Textarea
              placeholder="Notes about this buyer..."
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setHasChanges(true);
              }}
              rows={3}
            />
          </div>

          {hasChanges && (
            <Button onClick={handleSave} className="w-full">
              Save Changes
            </Button>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Created {format(new Date(offer.created_at), 'MMM d, yyyy h:mm a')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
