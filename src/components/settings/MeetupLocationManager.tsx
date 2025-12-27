import { useState } from 'react';
import {
  useMeetupLocations,
  useCreateMeetupLocation,
  useUpdateMeetupLocation,
  useDeleteMeetupLocation,
  locationTypeLabels,
  locationTypeIcons,
} from '@/hooks/useMeetupLocations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { MapPin, Plus, Pencil, Trash2, X, Check, Shield, Star, Navigation } from 'lucide-react';
import { toast } from 'sonner';

export function MeetupLocationManager() {
  const { data: locations = [] } = useMeetupLocations();
  const createLocation = useCreateMeetupLocation();
  const updateLocation = useUpdateMeetupLocation();
  const deleteLocation = useDeleteMeetupLocation();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [locationType, setLocationType] = useState('other');
  const [notes, setNotes] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [safetyRating, setSafetyRating] = useState(5);

  const resetForm = () => {
    setName('');
    setAddress('');
    setLocationType('other');
    setNotes('');
    setIsDefault(false);
    setSafetyRating(5);
    setEditingId(null);
  };

  const handleAdd = async () => {
    if (!name.trim()) {
      toast.error('Please enter a location name');
      return;
    }

    try {
      await createLocation.mutateAsync({
        name: name.trim(),
        address: address.trim() || undefined,
        location_type: locationType,
        notes: notes.trim() || undefined,
        is_default: isDefault,
        safety_rating: safetyRating,
      });
      toast.success('Location added');
      resetForm();
    } catch {
      toast.error('Failed to add location');
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !name.trim()) return;

    try {
      await updateLocation.mutateAsync({
        id: editingId,
        name: name.trim(),
        address: address.trim() || undefined,
        location_type: locationType,
        notes: notes.trim() || undefined,
        is_default: isDefault,
        safety_rating: safetyRating,
      });
      toast.success('Location updated');
      resetForm();
    } catch {
      toast.error('Failed to update location');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteLocation.mutateAsync(id);
      toast.success('Location deleted');
    } catch {
      toast.error('Failed to delete location');
    }
  };

  const startEdit = (location: typeof locations[0]) => {
    setEditingId(location.id);
    setName(location.name);
    setAddress(location.address || '');
    setLocationType(location.location_type || 'other');
    setNotes(location.notes || '');
    setIsDefault(location.is_default || false);
    setSafetyRating(location.safety_rating || 5);
  };

  const userLocations = locations.filter((l) => !l.is_suggested);
  const suggestedLocations = locations.filter((l) => l.is_suggested);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Safe Meetup Locations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          {userLocations.length} custom locations
        </p>
        <Dialog open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              Manage Safe Locations
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Safe Meetup Locations</DialogTitle>
            </DialogHeader>

            {/* Add/Edit Form */}
            <div className="space-y-3 mb-4 p-3 bg-muted/50 rounded-lg">
              <h4 className="font-medium text-sm">
                {editingId ? 'Edit Location' : 'Add New Location'}
              </h4>

              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="e.g., Target Parking Lot - Main St"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  placeholder="123 Main St, City, State"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={locationType} onValueChange={setLocationType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(locationTypeLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {locationTypeIcons[key]} {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Safety Rating</Label>
                  <Select
                    value={safetyRating.toString()}
                    onValueChange={(v) => setSafetyRating(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[5, 4, 3, 2, 1].map((rating) => (
                        <SelectItem key={rating} value={rating.toString()}>
                          {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Any notes about this location..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={isDefault}
                    onCheckedChange={setIsDefault}
                  />
                  <Label>Set as default</Label>
                </div>
              </div>

              <div className="flex gap-2">
                {editingId && (
                  <Button variant="outline" onClick={resetForm} className="flex-1">
                    <X className="w-4 h-4 mr-1" /> Cancel
                  </Button>
                )}
                <Button
                  onClick={editingId ? handleUpdate : handleAdd}
                  className="flex-1"
                  disabled={createLocation.isPending || updateLocation.isPending}
                >
                  {editingId ? (
                    <><Check className="w-4 h-4 mr-1" /> Update</>
                  ) : (
                    <><Plus className="w-4 h-4 mr-1" /> Add Location</>
                  )}
                </Button>
              </div>
            </div>

            {/* Your Locations */}
            {userLocations.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Your Locations
                </h4>
                {userLocations.map((loc) => (
                  <LocationCard
                    key={loc.id}
                    location={loc}
                    onEdit={() => startEdit(loc)}
                    onDelete={() => handleDelete(loc.id)}
                  />
                ))}
              </div>
            )}

            {/* Suggested Locations */}
            {suggestedLocations.length > 0 && (
              <div className="space-y-2 mt-4">
                <h4 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
                  <Star className="w-4 h-4" />
                  Suggested Safe Spots
                </h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Add your local addresses to these suggested location types
                </p>
                {suggestedLocations.map((loc) => (
                  <LocationCard
                    key={loc.id}
                    location={loc}
                    onEdit={() => startEdit(loc)}
                    onDelete={() => handleDelete(loc.id)}
                    isSuggested
                  />
                ))}
              </div>
            )}

            {userLocations.length === 0 && suggestedLocations.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No meetup locations yet. Add your first safe location above.
              </p>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

interface LocationCardProps {
  location: {
    id: string;
    name: string;
    address: string | null;
    location_type: string | null;
    notes: string | null;
    is_default: boolean;
    safety_rating: number;
  };
  onEdit: () => void;
  onDelete: () => void;
  isSuggested?: boolean;
}

function LocationCard({ location, onEdit, onDelete, isSuggested }: LocationCardProps) {
  const icon = locationTypeIcons[location.location_type || 'other'] || '📍';
  const typeLabel = locationTypeLabels[location.location_type || 'other'] || 'Other';

  return (
    <div className="p-3 bg-muted rounded-lg">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{icon}</span>
            <span className="font-medium text-sm">{location.name}</span>
            {location.is_default && (
              <Badge variant="secondary" className="text-xs">Default</Badge>
            )}
            {isSuggested && (
              <Badge variant="outline" className="text-xs">Template</Badge>
            )}
          </div>
          {location.address && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Navigation className="w-3 h-3" />
              {location.address}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
            <span className="text-xs text-amber-500">
              {'★'.repeat(location.safety_rating || 0)}
              {'☆'.repeat(5 - (location.safety_rating || 0))}
            </span>
          </div>
          {location.notes && (
            <p className="text-xs text-muted-foreground mt-1">{location.notes}</p>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={onEdit}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
