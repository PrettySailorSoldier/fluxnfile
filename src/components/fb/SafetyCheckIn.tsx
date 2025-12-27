import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  useCreateSafetyCheckin,
  useSafetyCheckins,
  getCurrentLocation,
  getGoogleMapsLink,
  getShareLocationLink,
  Meetup,
  CheckinType,
} from '@/hooks/useMeetups';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Shield,
  MapPin,
  Clock,
  Check,
  AlertTriangle,
  Share2,
  Navigation,
  Loader2,
  Phone,
  MessageSquare,
  User,
  DollarSign,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SafetyCheckInProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetup: Meetup;
  onComplete?: () => void;
}

export function SafetyCheckIn({
  open,
  onOpenChange,
  meetup,
  onComplete,
}: SafetyCheckInProps) {
  const createCheckin = useCreateSafetyCheckin();
  const { data: checkins = [] } = useSafetyCheckins(meetup.id);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [message, setMessage] = useState('');
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const locationName = meetup.meetup_location?.name || meetup.custom_location || 'Meeting location';
  const meetupLat = meetup.meetup_location?.latitude || meetup.custom_latitude;
  const meetupLon = meetup.meetup_location?.longitude || meetup.custom_longitude;

  const handleGetLocation = async () => {
    setIsGettingLocation(true);
    const location = await getCurrentLocation();
    setIsGettingLocation(false);

    if (location) {
      setCurrentLocation(location);
      toast.success('Location captured');
    } else {
      toast.error('Could not get location. Please enable location services.');
    }
  };

  const handleCheckin = async (type: CheckinType) => {
    try {
      await createCheckin.mutateAsync({
        meetup_id: meetup.id,
        checkin_type: type,
        latitude: currentLocation?.latitude,
        longitude: currentLocation?.longitude,
        message: message.trim() || undefined,
      });

      const messages: Record<CheckinType, string> = {
        meeting_now: 'Meeting started! Your partner has been notified.',
        safe: 'Safety check-in recorded. Stay safe!',
        help_needed: 'Alert sent to your partner!',
      };

      toast.success(messages[type]);
      setMessage('');

      if (type === 'safe') {
        onComplete?.();
        onOpenChange(false);
      }
    } catch {
      toast.error('Failed to check in');
    }
  };

  const handleShareLocation = async () => {
    if (!currentLocation) {
      toast.error('Please capture your location first');
      return;
    }

    const shareUrl = getShareLocationLink(currentLocation.latitude, currentLocation.longitude);

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Current Location',
          text: `Meeting for ${meetup.item?.title || 'item sale'} at ${locationName}`,
          url: shareUrl,
        });
      } catch {
        // User cancelled or share failed, copy to clipboard instead
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Location link copied to clipboard');
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Location link copied to clipboard');
    }
  };

  const hasMeetingStarted = meetup.status === 'in_progress';
  const hasCheckedInSafe = checkins.some((c) => c.checkin_type === 'safe');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-500" />
            Safety Check-In
          </DialogTitle>
          <DialogDescription>
            Keep your partner informed during meetups
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Meetup Info */}
          <Card className="bg-muted/50">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{meetup.item?.title || 'Item'}</span>
                {meetup.agreed_price && (
                  <Badge variant="secondary">
                    <DollarSign className="w-3 h-3 mr-1" />
                    ${meetup.agreed_price.toFixed(2)}
                  </Badge>
                )}
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  {format(new Date(meetup.scheduled_at), 'EEE, MMM d @ h:mm a')}
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="w-3 h-3" />
                  {locationName}
                </p>
                {meetup.buyer_name && (
                  <p className="flex items-center gap-2">
                    <User className="w-3 h-3" />
                    {meetup.buyer_name}
                  </p>
                )}
              </div>
              {meetupLat && meetupLon && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-2"
                  asChild
                >
                  <a
                    href={getGoogleMapsLink(meetupLat, meetupLon, locationName)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Navigation className="w-4 h-4 mr-2" />
                    Get Directions
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Current Location */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Your Location</span>
              {currentLocation && (
                <Badge variant="outline" className="text-xs text-green-600">
                  <Check className="w-3 h-3 mr-1" />
                  Captured
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleGetLocation}
                disabled={isGettingLocation}
              >
                {isGettingLocation ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <MapPin className="w-4 h-4 mr-2" />
                )}
                {currentLocation ? 'Update Location' : 'Get Location'}
              </Button>
              {currentLocation && (
                <Button
                  variant="outline"
                  onClick={handleShareLocation}
                >
                  <Share2 className="w-4 h-4" />
                </Button>
              )}
            </div>
            {currentLocation && (
              <a
                href={getGoogleMapsLink(currentLocation.latitude, currentLocation.longitude)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                View on map
              </a>
            )}
          </div>

          {/* Optional Message */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Message (optional)</span>
            <Textarea
              placeholder="Any notes for your partner..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
            />
          </div>

          {/* Check-in Buttons */}
          <div className="space-y-2">
            {!hasMeetingStarted && (
              <Button
                className="w-full bg-orange-500 hover:bg-orange-600"
                onClick={() => handleCheckin('meeting_now')}
                disabled={createCheckin.isPending}
              >
                <MapPin className="w-4 h-4 mr-2" />
                Meeting Buyer Now
              </Button>
            )}

            <Button
              className="w-full bg-green-500 hover:bg-green-600"
              onClick={() => handleCheckin('safe')}
              disabled={createCheckin.isPending}
            >
              <Check className="w-4 h-4 mr-2" />
              I'm Safe
            </Button>

            <Button
              variant="destructive"
              className="w-full"
              onClick={() => handleCheckin('help_needed')}
              disabled={createCheckin.isPending}
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Need Help
            </Button>
          </div>

          {/* Emergency Info */}
          <Alert>
            <Phone className="w-4 h-4" />
            <AlertDescription className="text-xs">
              In case of emergency, call 911. Share your location with someone you trust before meeting.
            </AlertDescription>
          </Alert>

          {/* Check-in History */}
          {checkins.length > 0 && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-muted-foreground">Check-in History</span>
              <div className="space-y-1">
                {checkins.map((checkin) => (
                  <div
                    key={checkin.id}
                    className={cn(
                      'p-2 rounded-lg text-xs flex items-center gap-2',
                      checkin.checkin_type === 'meeting_now' && 'bg-orange-500/10 text-orange-600',
                      checkin.checkin_type === 'safe' && 'bg-green-500/10 text-green-600',
                      checkin.checkin_type === 'help_needed' && 'bg-red-500/10 text-red-600'
                    )}
                  >
                    {checkin.checkin_type === 'meeting_now' && <MapPin className="w-3 h-3" />}
                    {checkin.checkin_type === 'safe' && <Check className="w-3 h-3" />}
                    {checkin.checkin_type === 'help_needed' && <AlertTriangle className="w-3 h-3" />}
                    <span className="flex-1">
                      {checkin.checkin_type === 'meeting_now' && 'Started meeting'}
                      {checkin.checkin_type === 'safe' && 'Checked in safe'}
                      {checkin.checkin_type === 'help_needed' && 'Requested help'}
                      {checkin.message && ` - ${checkin.message}`}
                    </span>
                    <span className="text-muted-foreground">
                      {format(new Date(checkin.created_at), 'h:mm a')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Quick Safety Button for active meetups
interface QuickSafetyButtonProps {
  meetup: Meetup;
  onOpenSafetyCheckIn: () => void;
}

export function QuickSafetyButton({ meetup, onOpenSafetyCheckIn }: QuickSafetyButtonProps) {
  const isActive = meetup.status === 'in_progress';
  const locationName = meetup.meetup_location?.name || meetup.custom_location || 'Meeting';

  if (meetup.status !== 'scheduled' && meetup.status !== 'in_progress') {
    return null;
  }

  return (
    <Card className={cn(
      'border-2',
      isActive ? 'border-orange-500 bg-orange-500/5' : 'border-blue-500/50 bg-blue-500/5'
    )}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              {isActive ? (
                <Badge className="bg-orange-500">Meeting Now</Badge>
              ) : (
                <Badge variant="secondary">Upcoming</Badge>
              )}
            </div>
            <p className="text-sm font-medium mt-1">{locationName}</p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(meetup.scheduled_at), 'h:mm a')}
              {meetup.buyer_name && ` • ${meetup.buyer_name}`}
            </p>
          </div>
          <Button
            size="sm"
            className={cn(
              isActive ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600'
            )}
            onClick={onOpenSafetyCheckIn}
          >
            <Shield className="w-4 h-4 mr-1" />
            {isActive ? "I'm Safe" : 'Start'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
