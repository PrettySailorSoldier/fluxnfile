import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCategories, useStorageLocations, ItemCondition } from '@/hooks/useInventory';
import { useUpdateRoughItem } from '@/hooks/useRoughItems';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Camera, X, Loader2, Plus, ImagePlus, ArrowRight, StickyNote } from 'lucide-react';
import { z } from 'zod';
import { sanitizeError } from '@/lib/errorHandler';

const itemSchema = z.object({
  title: z.string().max(200, 'Title must be less than 200 characters').optional(),
  original_cost: z.number().min(0, 'Cost must be positive').max(999999, 'Cost too high'),
  target_price: z.number().min(0, 'Price must be positive').max(999999, 'Price too high').optional(),
  acquisition_source: z.string().max(100, 'Source must be less than 100 characters').optional(),
  refurbish_notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional(),
});

export default function AddItem() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { team, user } = useAuth();
  const { data: categories = [] } = useCategories();
  const { data: locations = [] } = useStorageLocations();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateRoughItem = useUpdateRoughItem();

  // Check if converting from a rough item
  const fromRoughId = searchParams.get('from_rough');
  const prefillTitle = searchParams.get('title');
  const prefillNotes = searchParams.get('notes');
  const prefillEstimatedValue = searchParams.get('estimated_value');
  const prefillBoxLabel = searchParams.get('box_label');
  const isConvertingRoughItem = !!fromRoughId;

  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [originalCost, setOriginalCost] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState<ItemCondition>('good');
  const [acquisitionSource, setAcquisitionSource] = useState('');
  const [storageLocationId, setStorageLocationId] = useState('');
  const [refurbishNotes, setRefurbishNotes] = useState('');

  // Pre-fill form fields when converting from rough item
  useEffect(() => {
    if (isConvertingRoughItem) {
      if (prefillTitle) setTitle(prefillTitle);
      if (prefillNotes) setRefurbishNotes(prefillNotes);
      if (prefillEstimatedValue) setTargetPrice(prefillEstimatedValue);
      if (prefillBoxLabel) setAcquisitionSource(`Box: ${prefillBoxLabel}`);
    }
  }, [isConvertingRoughItem, prefillTitle, prefillNotes, prefillEstimatedValue, prefillBoxLabel]);

  const createItem = useMutation({
    mutationFn: async (data: {
      title?: string;
      original_cost: number;
      target_price?: number;
      category_id?: string;
      condition: ItemCondition;
      acquisition_source?: string;
      storage_location_id?: string;
      refurbish_notes?: string;
      photos: string[];
    }) => {
      if (!team?.id || !user?.id) throw new Error('Not authenticated');

      const { error } = await supabase.from('items').insert({
        team_id: team.id,
        created_by: user.id,
        title: data.title || null,
        original_cost: data.original_cost,
        target_price: data.target_price || null,
        category_id: data.category_id || null,
        condition: data.condition,
        acquisition_source: data.acquisition_source || null,
        storage_location_id: data.storage_location_id || null,
        refurbish_notes: data.refurbish_notes || null,
        photos: data.photos,
      });

      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      
      // If converting from a rough item, mark it as processed
      if (fromRoughId) {
        try {
          await updateRoughItem.mutateAsync({
            id: fromRoughId,
            is_processed: true,
          });
          queryClient.invalidateQueries({ queryKey: ['rough_items'] });
          toast.success('Item added and rough note marked as processed!');
        } catch {
          // Still succeeded in creating item, but failed to mark rough item
          toast.success('Item added! (Note: Failed to mark rough note as processed)');
        }
      } else {
        toast.success('Item added successfully!');
      }
      
      navigate('/inventory');
    },
    onError: (error) => {
      toast.error(sanitizeError(error));
    },
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newPhotos: string[] = [];

    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        continue;
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${team?.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('item-photos')
        .upload(fileName, file);

      if (uploadError) {
        toast.error('Failed to upload image');
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('item-photos')
        .getPublicUrl(fileName);

      newPhotos.push(publicUrl);
    }

    setPhotos([...photos, ...newPhotos]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cost = parseFloat(originalCost);
    if (isNaN(cost) || cost < 0) {
      toast.error('Please enter a valid cost');
      return;
    }

    try {
      const validated = itemSchema.parse({
        title: title.trim() || undefined,
        original_cost: cost,
        target_price: targetPrice ? parseFloat(targetPrice) : undefined,
        acquisition_source: acquisitionSource.trim() || undefined,
        refurbish_notes: refurbishNotes.trim() || undefined,
      });

      createItem.mutate({
        ...validated,
        original_cost: cost,
        category_id: categoryId || undefined,
        condition,
        storage_location_id: storageLocationId || undefined,
        photos,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      }
    }
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-2xl font-bold text-foreground pt-2">
        {isConvertingRoughItem ? 'Convert Rough Note' : 'Add Item'}
      </h1>

      {/* Rough Item Conversion Banner */}
      {isConvertingRoughItem && (
        <Alert className="bg-primary/10 border-primary/30">
          <StickyNote className="h-4 w-4" />
          <AlertDescription className="flex items-center gap-2">
            <span>
              Converting rough note: <strong>{prefillTitle}</strong>
              {prefillBoxLabel && (
                <Badge variant="outline" className="ml-2">
                  {prefillBoxLabel}
                </Badge>
              )}
            </span>
            <ArrowRight className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground text-sm">
              Will be marked as processed after adding
            </span>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Photo Upload */}
        <Card>
          <CardContent className="p-4">
            <Label className="mb-2 block">Photos</Label>
            <div className="flex flex-wrap gap-2">
              {photos.map((photo, index) => (
                <div key={index} className="relative w-20 h-20">
                  <img
                    src={photo}
                    alt={`Item photo ${index + 1}`}
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-20 h-20 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                {uploading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <ImagePlus className="w-6 h-6" />
                    <span className="text-xs mt-1">Add</span>
                  </>
                )}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </CardContent>
        </Card>

        {/* Basic Info */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                placeholder="e.g., Vintage Nike Jacket"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cost">Cost *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="cost"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={originalCost}
                    onChange={(e) => setOriginalCost(e.target.value)}
                    className="pl-7"
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="price">Target Price</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="condition">Condition</Label>
              <Select value={condition} onValueChange={(v) => setCondition(v as ItemCondition)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="like_new">Like New</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="for_parts">For Parts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Additional Details */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label htmlFor="source">Acquisition Source</Label>
              <Input
                id="source"
                placeholder="e.g., Goodwill, Estate Sale"
                value={acquisitionSource}
                onChange={(e) => setAcquisitionSource(e.target.value)}
                maxLength={100}
              />
            </div>

            <div>
              <Label htmlFor="location">Storage Location</Label>
              <Select value={storageLocationId} onValueChange={setStorageLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any notes about condition, repairs needed, etc."
                value={refurbishNotes}
                onChange={(e) => setRefurbishNotes(e.target.value)}
                maxLength={1000}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          className="w-full"
          disabled={createItem.isPending}
        >
          {createItem.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {isConvertingRoughItem ? 'Converting...' : 'Adding...'}
            </>
          ) : (
            <>
              {isConvertingRoughItem ? (
                <>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Convert to Item
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </>
              )}
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
