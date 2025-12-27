import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Copy, ExternalLink, Check, Facebook, Sparkles, RefreshCw, FileText } from 'lucide-react';
import { generateFBListingText, generateTitleVariations, getDescriptionTemplates, fbConditionMap } from '@/hooks/useMessageTemplates';
import { cn } from '@/lib/utils';

interface QuickListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: {
    id: string;
    title?: string | null;
    category?: { name: string } | null;
    condition: string;
    target_price?: number | null;
    actual_price?: number | null;
    description?: string | null;
    refurbish_notes?: string | null;
    photos?: string[];
    default_pickup_location?: string | null;
  };
  onListingComplete: (listingUrl: string) => void;
}

export function QuickListDialog({ open, onOpenChange, item, onListingComplete }: QuickListDialogProps) {
  const generated = generateFBListingText(item);
  const titleVariations = generateTitleVariations(item);
  const descriptionTemplates = getDescriptionTemplates(item);

  const [title, setTitle] = useState(generated.title);
  const [description, setDescription] = useState(generated.description);
  const [price, setPrice] = useState(generated.price.toString());
  const [listingUrl, setListingUrl] = useState('');
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [copied, setCopied] = useState<'title' | 'description' | 'all' | null>(null);
  const [showTitleOptions, setShowTitleOptions] = useState(false);
  const [showDescTemplates, setShowDescTemplates] = useState(false);
  const [selectedTitleIndex, setSelectedTitleIndex] = useState(0);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      const newGenerated = generateFBListingText(item);
      setTitle(newGenerated.title);
      setDescription(newGenerated.description);
      setPrice(newGenerated.price.toString());
      setStep('edit');
      setListingUrl('');
      setShowTitleOptions(false);
      setShowDescTemplates(false);
      setSelectedTitleIndex(0);
    }
  }, [open, item]);

  const fbCondition = fbConditionMap[item.condition] || 'Used - Good';

  const copyToClipboard = async (text: string, type: 'title' | 'description' | 'all') => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAll = async () => {
    const fullText = `${title}\n\n$${price}\n\n${description}`;
    await copyToClipboard(fullText, 'all');
  };

  const openFBMarketplace = () => {
    // Deep link to FB Marketplace - this opens the FB app or website
    window.open('https://www.facebook.com/marketplace/create/item', '_blank');
    setStep('confirm');
  };

  const handleComplete = () => {
    if (listingUrl.trim()) {
      onListingComplete(listingUrl.trim());
      onOpenChange(false);
      setStep('edit');
      setListingUrl('');
    } else {
      toast.error('Please paste your FB listing URL');
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setStep('edit');
    setListingUrl('');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Facebook className="w-5 h-5 text-[#1877F2]" />
            Quick List to Facebook
          </DialogTitle>
          <DialogDescription>
            {step === 'edit' 
              ? 'Review and copy your listing details'
              : 'Paste your FB listing URL to track it'}
          </DialogDescription>
        </DialogHeader>

        {step === 'edit' ? (
          <div className="space-y-4">
            {/* Photos preview */}
            {item.photos && item.photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {item.photos.slice(0, 4).map((photo, i) => (
                  <img
                    key={i}
                    src={photo}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  />
                ))}
                {item.photos.length > 4 && (
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center text-sm text-muted-foreground flex-shrink-0">
                    +{item.photos.length - 4}
                  </div>
                )}
              </div>
            )}

            {/* Title */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="fb-title">Title</Label>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTitleOptions(!showTitleOptions)}
                    title="Title suggestions"
                  >
                    <Sparkles className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(title, 'title')}
                  >
                    {copied === 'title' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <Input
                id="fb-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">{title.length}/100</p>

              {/* Title Variations */}
              {showTitleOptions && (
                <div className="space-y-1 p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Click to use a title variation:
                  </p>
                  {titleVariations.map((variation, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setTitle(variation);
                        setSelectedTitleIndex(index);
                        setShowTitleOptions(false);
                      }}
                      className={cn(
                        'w-full text-left p-2 rounded text-sm hover:bg-muted transition-colors',
                        selectedTitleIndex === index && 'bg-primary/10 border border-primary/30'
                      )}
                    >
                      {variation}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label htmlFor="fb-price">Price</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="fb-price"
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>

            {/* Condition Badge */}
            <div className="flex items-center gap-2">
              <Label>FB Condition:</Label>
              <Badge variant="outline">{fbCondition}</Badge>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="fb-desc">Description</Label>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDescTemplates(!showDescTemplates)}
                    title="Description templates"
                  >
                    <FileText className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(description, 'description')}
                  >
                    {copied === 'description' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <Textarea
                id="fb-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
              />

              {/* Description Templates */}
              {showDescTemplates && (
                <div className="space-y-2 p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Choose a description style:
                  </p>
                  <div className="flex gap-2">
                    {descriptionTemplates.map((template, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDescription(template.template);
                          setShowDescTemplates(false);
                        }}
                        className="flex-1"
                      >
                        {template.name}
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                    onClick={() => {
                      const newGenerated = generateFBListingText(item);
                      setDescription(newGenerated.description);
                      setShowDescTemplates(false);
                    }}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Reset to default
                  </Button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={copyAll} variant="outline" className="w-full">
                {copied === 'all' ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                Copy All Details
              </Button>
              <Button onClick={openFBMarketplace} className="w-full bg-[#1877F2] hover:bg-[#166FE5]">
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Facebook Marketplace
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-2">
                After posting on Facebook, paste the listing URL here
              </p>
              <p className="text-xs text-muted-foreground">
                (Copy the URL from your browser or the share button)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="listing-url">Facebook Listing URL</Label>
              <Input
                id="listing-url"
                placeholder="https://www.facebook.com/marketplace/item/..."
                value={listingUrl}
                onChange={(e) => setListingUrl(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('edit')} className="flex-1">
                Back
              </Button>
              <Button onClick={handleComplete} className="flex-1">
                <Check className="w-4 h-4 mr-2" />
                Mark as Listed
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
