import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCategories, useStorageLocations, usePlatforms, statusConfig, calculateProfit, getProfitLevel, ItemStatus, ItemCondition, conditionLabels } from '@/hooks/useInventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, Save, Trash2, Package, ChevronRight, Loader2, Edit2, Facebook, MessageSquare, Calendar, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeError } from '@/lib/errorHandler';
import { QuickListDialog } from '@/components/fb/QuickListDialog';
import { FBTrackingSection } from '@/components/fb/FBTrackingSection';
import { TemplateLibrary } from '@/components/fb/TemplateLibrary';
import { OfferTracker } from '@/components/fb/OfferTracker';
import { MeetupScheduler, MeetupsList } from '@/components/fb/MeetupScheduler';
import { SafetyCheckIn, QuickSafetyButton } from '@/components/fb/SafetyCheckIn';
import { useMeetups, useUpdateMeetup, Meetup } from '@/hooks/useMeetups';
import { Offer } from '@/hooks/useOffers';
import { CommentsSection } from '@/components/items/CommentsSection';
import { ReviewStatusBadge, ReviewActions } from '@/components/amazon';

const statusOrder: ItemStatus[] = ['acquired', 'refurbishing', 'ready_to_list', 'listed', 'sold', 'shipped'];

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: categories = [] } = useCategories();
  const { data: locations = [] } = useStorageLocations();
  const { data: platforms = [] } = usePlatforms();

  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showQuickList, setShowQuickList] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showMeetupScheduler, setShowMeetupScheduler] = useState(false);
  const [showSafetyCheckIn, setShowSafetyCheckIn] = useState(false);
  const [selectedOfferForMeetup, setSelectedOfferForMeetup] = useState<Offer | null>(null);
  const [selectedMeetupForCheckIn, setSelectedMeetupForCheckIn] = useState<Meetup | null>(null);

  // Fetch meetups for this item
  const { data: meetups = [] } = useMeetups(id);
  const updateMeetup = useUpdateMeetup();

  // Get active meetup if exists
  const activeMeetup = meetups.find(
    (m) => m.status === 'scheduled' || m.status === 'in_progress'
  );

  // Form state
  const [title, setTitle] = useState('');
  const [originalCost, setOriginalCost] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [actualPrice, setActualPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState<ItemCondition>('good');
  const [status, setStatus] = useState<ItemStatus>('acquired');
  const [acquisitionSource, setAcquisitionSource] = useState('');
  const [storageLocationId, setStorageLocationId] = useState('');
  const [refurbishNotes, setRefurbishNotes] = useState('');
  const [refurbishCost, setRefurbishCost] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [platformFees, setPlatformFees] = useState('');

  const { data: item, isLoading } = useQuery({
    queryKey: ['item', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select(`
          *,
          category:categories(*),
          storage_location:storage_locations(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Populate form when item loads
  useEffect(() => {
    if (item) {
      setTitle(item.title || '');
      setOriginalCost(item.original_cost?.toString() || '');
      setTargetPrice(item.target_price?.toString() || '');
      setActualPrice(item.actual_price?.toString() || '');
      setCategoryId(item.category_id || '');
      setCondition(item.condition);
      setStatus(item.status);
      setAcquisitionSource(item.acquisition_source || '');
      setStorageLocationId(item.storage_location_id || '');
      setRefurbishNotes(item.refurbish_notes || '');
      setRefurbishCost(item.refurbish_cost?.toString() || '');
      setShippingCost(item.shipping_cost?.toString() || '');
      setPlatformFees(item.platform_fees?.toString() || '');
    }
  }, [item]);

  const updateItem = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const { error } = await supabase
        .from('items')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['item', id] });
      toast.success('Item updated!');
      setIsEditing(false);
    },
    onError: (error) => {
      toast.error(sanitizeError(error));
    },
  });

  const deleteItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success('Item deleted');
      navigate('/inventory');
    },
    onError: (error) => {
      toast.error(sanitizeError(error));
    },
  });

  const handleSave = () => {
    updateItem.mutate({
      title: title.trim() || null,
      original_cost: parseFloat(originalCost) || 0,
      target_price: targetPrice ? parseFloat(targetPrice) : null,
      actual_price: actualPrice ? parseFloat(actualPrice) : null,
      category_id: categoryId || null,
      condition,
      status,
      acquisition_source: acquisitionSource.trim() || null,
      storage_location_id: storageLocationId || null,
      refurbish_notes: refurbishNotes.trim() || null,
      refurbish_cost: parseFloat(refurbishCost) || 0,
      shipping_cost: parseFloat(shippingCost) || 0,
      platform_fees: parseFloat(platformFees) || 0,
      sale_date: status === 'sold' || status === 'shipped' ? new Date().toISOString().split('T')[0] : null,
    });
  };

  const handleStatusChange = (newStatus: ItemStatus) => {
    setStatus(newStatus);
    if (!isEditing) {
      updateItem.mutate({ 
        status: newStatus,
        sale_date: newStatus === 'sold' || newStatus === 'shipped' ? new Date().toISOString().split('T')[0] : null,
      });
    }
  };

  const handleFBListingComplete = (listingUrl: string) => {
    updateItem.mutate({
      fb_listing_url: listingUrl,
      fb_listed_date: new Date().toISOString(),
      status: 'listed',
    });
    toast.success('Item marked as listed on Facebook!');
  };

  const handleFBUpdate = (updates: { fb_views?: number; fb_conversation_notes?: string }) => {
    updateItem.mutate(updates);
  };

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="p-4 text-center">
        <Package className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Item not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/inventory')}>
          Back to Inventory
        </Button>
      </div>
    );
  }

  const profit = calculateProfit(item);
  const profitLevel = getProfitLevel(profit.margin);
  const displayPrice = item.actual_price || item.target_price;

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/inventory')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold text-foreground flex-1 truncate">
          {item.title || item.category?.name || 'Item Details'}
        </h1>
        {!isEditing ? (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Edit2 className="w-4 h-4 mr-1" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={updateItem.isPending}>
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
          </div>
        )}
      </div>

      {/* Photos */}
      {item.photos && item.photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {item.photos.map((photo, index) => (
            <img
              key={index}
              src={photo}
              alt={`Photo ${index + 1}`}
              className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
            />
          ))}
        </div>
      )}

      {/* Status Workflow */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-1 overflow-x-auto pb-2">
            {statusOrder.map((s, index) => {
              const isActive = s === status;
              const isPast = statusOrder.indexOf(s) < statusOrder.indexOf(status);
              
              return (
                <div key={s} className="flex items-center">
                  <button
                    onClick={() => handleStatusChange(s)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
                      isActive && statusConfig[s].className,
                      !isActive && isPast && 'bg-muted text-muted-foreground',
                      !isActive && !isPast && 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {statusConfig[s].label}
                  </button>
                  {index < statusOrder.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-muted-foreground mx-1" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Amazon Review Section */}
      {!isEditing && item.acquisition_source === 'Amazon' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Amazon Item:</span>
            <ReviewStatusBadge status={(item as any).amazon_review_status} />
          </div>
          <ReviewActions
            itemId={item.id}
            currentStatus={(item as any).amazon_review_status}
            reviewedBy={(item as any).reviewed_by || []}
            reviewNotes={(item as any).review_notes}
          />
        </div>
      )}

      {/* Profit Summary (when not editing) */}
      {!isEditing && displayPrice && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Profit</p>
                <p className={cn(
                  'text-2xl font-bold',
                  profitLevel === 'loss' && 'text-destructive',
                  profitLevel === 'good' && 'text-success',
                  profitLevel === 'high' && 'text-accent'
                )}>
                  {profit.netProfit >= 0 ? '+' : ''}${profit.netProfit.toFixed(2)}
                </p>
              </div>
              <Badge className={cn(
                'text-sm',
                profitLevel === 'loss' && 'profit-loss',
                profitLevel === 'low' && 'profit-low',
                profitLevel === 'good' && 'profit-good',
                profitLevel === 'high' && 'profit-high'
              )}>
                {profit.margin.toFixed(0)}% margin
              </Badge>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Cost: ${item.original_cost.toFixed(2)}</span>
                <span>Price: ${displayPrice.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Facebook Quick Actions (when not editing and not sold) */}
      {!isEditing && item.status !== 'sold' && item.status !== 'shipped' && (
        <div className="flex gap-2">
          {!item.fb_listing_url ? (
            <Button
              onClick={() => setShowQuickList(true)}
              className="flex-1 bg-[#1877F2] hover:bg-[#166FE5]"
            >
              <Facebook className="w-4 h-4 mr-2" />
              Post to Facebook
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => setShowTemplates(true)}
            className="flex-1"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Templates
          </Button>
        </div>
      )}

      {/* Active Meetup Safety Check-in */}
      {!isEditing && activeMeetup && (
        <QuickSafetyButton
          meetup={activeMeetup}
          onOpenSafetyCheckIn={() => {
            setSelectedMeetupForCheckIn(activeMeetup);
            setShowSafetyCheckIn(true);
          }}
        />
      )}

      {/* Facebook Tracking Section */}
      {!isEditing && (
        <FBTrackingSection
          fbListingUrl={item.fb_listing_url}
          fbViews={item.fb_views}
          fbListedDate={item.fb_listed_date}
          fbConversationNotes={item.fb_conversation_notes}
          onUpdate={handleFBUpdate}
          isUpdating={updateItem.isPending}
        />
      )}

      {/* Offer Tracker */}
      {!isEditing && item.status !== 'sold' && item.status !== 'shipped' && item.fb_listing_url && (
        <OfferTracker
          itemId={item.id}
          askingPrice={item.target_price || item.actual_price || 0}
          onScheduleMeetup={(offer) => {
            setSelectedOfferForMeetup(offer);
            setShowMeetupScheduler(true);
          }}
        />
      )}

      {/* Meetups List */}
      {!isEditing && item.status !== 'sold' && item.status !== 'shipped' && (
        <MeetupsList
          itemId={item.id}
          onScheduleMeetup={() => {
            setSelectedOfferForMeetup(null);
            setShowMeetupScheduler(true);
          }}
        />
      )}

      {/* Edit Form */}
      {isEditing ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="cost">Original Cost</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="cost"
                      type="number"
                      step="0.01"
                      value={originalCost}
                      onChange={(e) => setOriginalCost(e.target.value)}
                      className="pl-7"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="target">Target Price</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="target"
                      type="number"
                      step="0.01"
                      value={targetPrice}
                      onChange={(e) => setTargetPrice(e.target.value)}
                      className="pl-7"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="actual">Actual Price</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="actual"
                      type="number"
                      step="0.01"
                      value={actualPrice}
                      onChange={(e) => setActualPrice(e.target.value)}
                      className="pl-7"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="condition">Condition</Label>
                  <Select value={condition} onValueChange={(v) => setCondition(v as ItemCondition)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(conditionLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="location">Storage Location</Label>
                <Select value={storageLocationId} onValueChange={setStorageLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Costs & Fees</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="refurbish">Refurbish</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="refurbish"
                      type="number"
                      step="0.01"
                      value={refurbishCost}
                      onChange={(e) => setRefurbishCost(e.target.value)}
                      className="pl-7"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="shipping">Shipping</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="shipping"
                      type="number"
                      step="0.01"
                      value={shippingCost}
                      onChange={(e) => setShippingCost(e.target.value)}
                      className="pl-7"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="fees">Fees</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="fees"
                      type="number"
                      step="0.01"
                      value={platformFees}
                      onChange={(e) => setPlatformFees(e.target.value)}
                      className="pl-7"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={refurbishNotes}
                  onChange={(e) => setRefurbishNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Delete Button */}
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Item
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Item?</DialogTitle>
              </DialogHeader>
              <p className="text-muted-foreground">
                This action cannot be undone. This will permanently delete this item.
              </p>
              <div className="flex gap-2 justify-end mt-4">
                <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => deleteItem.mutate()}
                  disabled={deleteItem.isPending}
                >
                  {deleteItem.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        /* View Mode Details */
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Category</p>
                <p className="font-medium">{item.category?.name || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Condition</p>
                <p className="font-medium">{conditionLabels[item.condition]}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Location</p>
                <p className="font-medium">{item.storage_location?.name || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Source</p>
                <p className="font-medium">{item.acquisition_source || '—'}</p>
              </div>
            </div>
            {item.refurbish_notes && (
              <div>
                <p className="text-muted-foreground text-sm">Notes</p>
                <p className="text-sm">{item.refurbish_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comments Section */}
      {!isEditing && id && (
        <CommentsSection itemId={id} />
      )}

      {/* Quick List Dialog */}
      <QuickListDialog
        open={showQuickList}
        onOpenChange={setShowQuickList}
        item={{
          id: item.id,
          title: item.title,
          category: item.category,
          condition: item.condition,
          target_price: item.target_price,
          actual_price: item.actual_price,
          description: item.description,
          refurbish_notes: item.refurbish_notes,
          photos: item.photos,
        }}
        onListingComplete={handleFBListingComplete}
      />

      {/* Template Library */}
      <TemplateLibrary
        open={showTemplates}
        onOpenChange={setShowTemplates}
        itemContext={{
          item_name: item.title || item.category?.name,
          price: item.target_price || undefined,
          lowest_price: item.target_price ? Math.round(item.target_price * 0.8) : undefined,
          condition_notes: item.refurbish_notes || undefined,
        }}
      />

      {/* Meetup Scheduler */}
      <MeetupScheduler
        open={showMeetupScheduler}
        onOpenChange={setShowMeetupScheduler}
        itemId={item.id}
        itemTitle={item.title || item.category?.name || undefined}
        askingPrice={item.target_price || item.actual_price || undefined}
        prefillOffer={selectedOfferForMeetup}
        onScheduled={() => {
          setShowMeetupScheduler(false);
          setSelectedOfferForMeetup(null);
        }}
      />

      {/* Safety Check-In */}
      {selectedMeetupForCheckIn && (
        <SafetyCheckIn
          open={showSafetyCheckIn}
          onOpenChange={setShowSafetyCheckIn}
          meetup={selectedMeetupForCheckIn}
          onComplete={() => {
            setShowSafetyCheckIn(false);
            setSelectedMeetupForCheckIn(null);
          }}
        />
      )}
    </div>
  );
}
