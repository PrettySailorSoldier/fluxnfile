import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useMeetupLocations,
  getSuggestedMeetupSpots,
  locationTypeIcons,
  MeetupLocation,
} from '@/hooks/useMeetupLocations';
import {
  useCreateMeetup,
  useMeetups,
  useUpdateMeetup,
  meetupStatusLabels,
  meetupStatusColors,
  Meetup,
  MeetupStatus,
} from '@/hooks/useMeetups';
import { Offer } from '@/hooks/useOffers';
import { toast } from 'sonner';
import { format, addDays, setHours, setMinutes } from 'date-fns';
import {
  MapPin,
  Calendar,
  Clock,
  DollarSign,
  User,
  Navigation,
  Shield,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MeetupSchedulerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemTitle?: string;
  askingPrice?: number;
  prefillOffer?: Offer | null;
  onScheduled?: (meetup: Meetup) => void;
}

export function MeetupScheduler({
  open,
  onOpenChange,
  itemId,
  itemTitle,
  askingPrice,
  prefillOffer,
  onScheduled,
}: MeetupSchedulerProps) {
  const { data: locations = [] } = useMeetupLocations();
  const createMeetup = useCreateMeetup();

  // Form state
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [customLocation, setCustomLocation] = useState('');
  const [useCustomLocation, setUseCustomLocation] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerContact, setBuyerContact] = useState('');
  const [agreedPrice, setAgreedPrice] = useState('');
  const [notes, setNotes] = useState('');

  // Get suggested locations
  const suggestedLocations = getSuggestedMeetupSpots(locations);
  const defaultLocation = locations.find((l) => l.is_default);

  // Initialize form when dialog opens
  useEffect(() => {
    if (open) {
      // Set default date to tomorrow
      const tomorrow = addDays(new Date(), 1);
      setScheduledDate(format(tomorrow, 'yyyy-MM-dd'));
      setScheduledTime('12:00');

      // Set default location
      if (defaultLocation) {
        setSelectedLocationId(defaultLocation.id);
      } else if (suggestedLocations.length > 0) {
        setSelectedLocationId(suggestedLocations[0].id);
      }

      // Prefill from offer if provided
      if (prefillOffer) {
        setBuyerName(prefillOffer.buyer_name || '');
        setBuyerContact(prefillOffer.buyer_contact || '');
        setAgreedPrice(prefillOffer.offer_amount?.toString() || '');
      } else {
        setBuyerName('');
        setBuyerContact('');
        setAgreedPrice(askingPrice?.toString() || '');
      }
      setNotes('');
      setCustomLocation('');
      setUseCustomLocation(false);
    }
  }, [open, prefillOffer, askingPrice, defaultLocation, suggestedLocations]);

  const handleSchedule = async () => {
    if (!scheduledDate || !scheduledTime) {
      toast.error('Please select a date and time');
      return;
    }

    if (!useCustomLocation && !selectedLocationId) {
      toast.error('Please select a meetup location');
      return;
    }

    if (useCustomLocation && !customLocation.trim()) {
      toast.error('Please enter a custom location');
      return;
    }

    try {
      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);

      const meetup = await createMeetup.mutateAsync({
        item_id: itemId,
        offer_id: prefillOffer?.id,
        meetup_location_id: useCustomLocation ? undefined : selectedLocationId,
        custom_location: useCustomLocation ? customLocation.trim() : undefined,
        scheduled_at: scheduledAt.toISOString(),
        buyer_name: buyerName.trim() || undefined,
        buyer_contact: buyerContact.trim() || undefined,
        agreed_price: agreedPrice ? parseFloat(agreedPrice) : undefined,
        notes: notes.trim() || undefined,
      });

      toast.success('Meetup scheduled!');
      onOpenChange(false);
      onScheduled?.(meetup);
    } catch {
      toast.error('Failed to schedule meetup');
    }
  };

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Schedule Meetup
          </DialogTitle>
          <DialogDescription>
            {itemTitle ? `For: ${itemTitle}` : 'Schedule a buyer meetup'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Location Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Safe Meetup Location
            </Label>

            {!useCustomLocation ? (
              <>
                <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a safe location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        <span className="flex items-center gap-2">
                          <span>{locationTypeIcons[loc.location_type || 'other']}</span>
                          <span>{loc.name}</span>
                          {loc.is_default && (
                            <Badge variant="secondary" className="text-xs ml-1">Default</Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedLocation && (
                  <Card className="mt-2">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm flex items-center gap-1">
                            {locationTypeIcons[selectedLocation.location_type || 'other']}
                            {selectedLocation.name}
                          </p>
                          {selectedLocation.address && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Navigation className="w-3 h-3" />
                              {selectedLocation.address}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-amber-500">
                              {'★'.repeat(selectedLocation.safety_rating || 5)}
                            </span>
                            {selectedLocation.notes && (
                              <span className="text-xs text-muted-foreground">
                                {selectedLocation.notes}
                              </span>
                            )}
                          </div>
                        </div>
                        {selectedLocation.latitude && selectedLocation.longitude && (
                          <Button
                            size="sm"
                            variant="ghost"
                            asChild
                          >
                            <a
                              href={`https://www.google.com/maps?q=${selectedLocation.latitude},${selectedLocation.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={() => setUseCustomLocation(true)}
                >
                  Use custom location instead
                </Button>
              </>
            ) : (
              <>
                <Input
                  placeholder="Enter custom location address"
                  value={customLocation}
                  onChange={(e) => setCustomLocation(e.target.value)}
                />
                <div className="flex items-center gap-2 p-2 bg-amber-500/10 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <p className="text-xs text-amber-600">
                    For safety, consider using a public location
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={() => setUseCustomLocation(false)}
                >
                  Use saved safe location
                </Button>
              </>
            )}
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Date
              </Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Time
              </Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>
          </div>

          {/* Buyer Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Buyer Name
              </Label>
              <Input
                placeholder="Optional"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Contact</Label>
              <Input
                placeholder="Phone/FB"
                value={buyerContact}
                onChange={(e) => setBuyerContact(e.target.value)}
              />
            </div>
          </div>

          {/* Agreed Price */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Agreed Price
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={agreedPrice}
                onChange={(e) => setAgreedPrice(e.target.value)}
                className="pl-7"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              placeholder="Any notes for this meetup..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Schedule Button */}
          <Button
            onClick={handleSchedule}
            className="w-full"
            disabled={createMeetup.isPending}
          >
            <Shield className="w-4 h-4 mr-2" />
            Schedule Meetup
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Your partner will be notified about this meetup
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Meetup Card Component for displaying scheduled meetups
interface MeetupCardProps {
  meetup: Meetup;
  onStatusChange: (status: MeetupStatus) => void;
  onStartMeeting: () => void;
  compact?: boolean;
}

export function MeetupCard({ meetup, onStatusChange, onStartMeeting, compact }: MeetupCardProps) {
  const isUpcoming = new Date(meetup.scheduled_at) > new Date();
  const isActive = meetup.status === 'scheduled' || meetup.status === 'in_progress';

  const locationName = meetup.meetup_location?.name || meetup.custom_location || 'No location set';
  const locationIcon = meetup.meetup_location?.location_type
    ? locationTypeIcons[meetup.meetup_location.location_type]
    : '📍';

  return (
    <Card className={cn(
      meetup.status === 'in_progress' && 'border-orange-500/50 bg-orange-500/5'
    )}>
      <CardContent className={cn('p-3', compact && 'p-2')}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge className={meetupStatusColors[meetup.status]}>
                {meetupStatusLabels[meetup.status]}
              </Badge>
              {meetup.agreed_price && (
                <span className="font-medium">${meetup.agreed_price.toFixed(2)}</span>
              )}
            </div>

            <p className="text-sm flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {format(new Date(meetup.scheduled_at), 'EEE, MMM d')}
              <Clock className="w-3 h-3 ml-2" />
              {format(new Date(meetup.scheduled_at), 'h:mm a')}
            </p>

            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <span>{locationIcon}</span>
              {locationName}
            </p>

            {meetup.buyer_name && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <User className="w-3 h-3" />
                {meetup.buyer_name}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons for active meetups */}
        {isActive && !compact && (
          <div className="flex gap-2 mt-3">
            {meetup.status === 'scheduled' && (
              <Button
                size="sm"
                className="flex-1 bg-orange-500 hover:bg-orange-600"
                onClick={onStartMeeting}
              >
                <Shield className="w-4 h-4 mr-1" />
                Meeting Now
              </Button>
            )}
            {meetup.status === 'in_progress' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-green-600"
                  onClick={() => onStatusChange('completed')}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Sold
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-red-600"
                  onClick={() => onStatusChange('declined')}
                >
                  <X className="w-4 h-4 mr-1" />
                  Declined
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => onStatusChange('no_show')}
            >
              No Show
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Meetups List Component
interface MeetupsListProps {
  itemId: string;
  onScheduleMeetup?: () => void;
}

export function MeetupsList({ itemId, onScheduleMeetup }: MeetupsListProps) {
  const { data: meetups = [] } = useMeetups(itemId);
  const updateMeetup = useUpdateMeetup();
  const [isExpanded, setIsExpanded] = useState(true);

  const activeMeetups = meetups.filter((m) => m.status === 'scheduled' || m.status === 'in_progress');
  const pastMeetups = meetups.filter((m) => m.status !== 'scheduled' && m.status !== 'in_progress');

  const handleStatusChange = async (meetupId: string, status: MeetupStatus) => {
    try {
      await updateMeetup.mutateAsync({
        id: meetupId,
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : undefined,
      });
      toast.success(`Meetup marked as ${meetupStatusLabels[status].toLowerCase()}`);
    } catch {
      toast.error('Failed to update meetup');
    }
  };

  const handleStartMeeting = async (meetupId: string) => {
    try {
      await updateMeetup.mutateAsync({
        id: meetupId,
        status: 'in_progress',
        meeting_started_at: new Date().toISOString(),
      });
      toast.success('Meeting started - Stay safe!');
    } catch {
      toast.error('Failed to start meeting');
    }
  };

  if (meetups.length === 0 && !onScheduleMeetup) {
    return null;
  }

  return (
    <Card>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          <span className="font-medium text-sm">Meetups</span>
          {activeMeetups.length > 0 && (
            <Badge variant="secondary">{activeMeetups.length} scheduled</Badge>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <CardContent className="pt-0 space-y-2">
          {onScheduleMeetup && (
            <Button
              variant="outline"
              className="w-full"
              onClick={onScheduleMeetup}
            >
              <Calendar className="w-4 h-4 mr-2" />
              Schedule Meetup
            </Button>
          )}

          {activeMeetups.map((meetup) => (
            <MeetupCard
              key={meetup.id}
              meetup={meetup}
              onStatusChange={(status) => handleStatusChange(meetup.id, status)}
              onStartMeeting={() => handleStartMeeting(meetup.id)}
            />
          ))}

          {pastMeetups.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-2">Past Meetups</p>
              {pastMeetups.slice(0, 2).map((meetup) => (
                <MeetupCard
                  key={meetup.id}
                  meetup={meetup}
                  onStatusChange={(status) => handleStatusChange(meetup.id, status)}
                  onStartMeeting={() => {}}
                  compact
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
