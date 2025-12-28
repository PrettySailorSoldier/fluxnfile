import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Package, Loader2, Upload, AlertCircle, Info } from 'lucide-react';

interface ParsedItem {
  title: string;
  orderDate: string;
  price: number;
  imageUrl?: string;
  selected: boolean;
}

interface AmazonImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AmazonImportDialog({ open, onOpenChange }: AmazonImportDialogProps) {
  const { team, user } = useAuth();
  const queryClient = useQueryClient();
  
  const [htmlInput, setHtmlInput] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [defaultMarkup, setDefaultMarkup] = useState('50');

  // Parse Amazon HTML
  const parseAmazonHTML = () => {
    setIsParsing(true);
    
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlInput, 'text/html');
      
      const items: ParsedItem[] = [];
      
      // Amazon's order item structure - multiple selectors for different page versions
      const orderCards = doc.querySelectorAll('.order, .order-card, [data-order-id], .a-box-group');
      
      orderCards.forEach((orderCard) => {
        // Extract order date
        const dateElement = orderCard.querySelector('.order-date, [data-order-date], .a-color-secondary');
        let orderDate = new Date().toISOString();
        if (dateElement?.textContent) {
          const dateMatch = dateElement.textContent.match(/(\w+\s+\d+,?\s+\d{4})|(\d+\/\d+\/\d{4})/);
          if (dateMatch) {
            try {
              const parsed = new Date(dateMatch[0]);
              if (!isNaN(parsed.getTime())) {
                orderDate = parsed.toISOString();
              }
            } catch {
              // Keep default date
            }
          }
        }
        
        // Find all items in this order
        const itemElements = orderCard.querySelectorAll('.product, .item, [data-asin], .yohtmlc-item, .a-fixed-left-grid');
        
        itemElements.forEach((itemEl) => {
          // Extract title - try multiple selectors
          const titleElement = itemEl.querySelector(
            '.product-title, .item-title, a[href*="/dp/"], .a-link-normal[href*="/gp/product"]'
          );
          const title = titleElement?.textContent?.trim() || '';
          
          // Extract price - try multiple selectors
          const priceElement = itemEl.querySelector(
            '.product-price, .item-price, .a-price .a-offscreen, .a-color-price, .yohtmlc-item .a-text-bold'
          );
          const priceText = priceElement?.textContent?.trim().replace(/[$,]/g, '') || '0';
          const price = parseFloat(priceText) || 0;
          
          // Extract image
          const imgElement = itemEl.querySelector('img');
          const imageUrl = imgElement?.src || imgElement?.getAttribute('data-src') || undefined;
          
          if (title && title.length > 5 && price > 0) {
            // Avoid duplicates
            const isDuplicate = items.some(i => i.title === title && i.price === price);
            if (!isDuplicate) {
              items.push({
                title,
                orderDate,
                price,
                imageUrl,
                selected: true,
              });
            }
          }
        });
      });
      
      // If orderCards approach didn't work, try a broader search
      if (items.length === 0) {
        // Look for any product links with prices nearby
        const allLinks = doc.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product"]');
        allLinks.forEach((link) => {
          const title = link.textContent?.trim();
          if (!title || title.length < 5) return;
          
          // Look for price in parent containers
          let parent = link.parentElement;
          let price = 0;
          for (let i = 0; i < 5 && parent; i++) {
            const priceEl = parent.querySelector('.a-price .a-offscreen, .a-color-price');
            if (priceEl) {
              price = parseFloat(priceEl.textContent?.replace(/[$,]/g, '') || '0');
              break;
            }
            parent = parent.parentElement;
          }
          
          if (price > 0) {
            const isDuplicate = items.some(i => i.title === title && i.price === price);
            if (!isDuplicate) {
              items.push({
                title,
                orderDate: new Date().toISOString(),
                price,
                imageUrl: undefined,
                selected: true,
              });
            }
          }
        });
      }
      
      if (items.length === 0) {
        toast.error('No items found. Make sure you copied the full Amazon orders page HTML.');
      } else {
        setParsedItems(items);
        toast.success(`Found ${items.length} items!`);
      }
    } catch (error) {
      console.error('Parse error:', error);
      toast.error('Failed to parse HTML. Please try again.');
    } finally {
      setIsParsing(false);
    }
  };

  // Import selected items
  const importItems = useMutation({
    mutationFn: async () => {
      if (!team?.id || !user?.id) throw new Error('Not authenticated');
      
      const selectedItems = parsedItems.filter(item => item.selected);
      if (selectedItems.length === 0) {
        throw new Error('No items selected');
      }

      const markup = parseFloat(defaultMarkup) / 100;
      
      const itemsToInsert = selectedItems.map(item => ({
        team_id: team.id,
        created_by: user.id,
        title: item.title.slice(0, 255), // Limit title length
        original_cost: item.price,
        target_price: Math.round(item.price * (1 + markup) * 100) / 100,
        acquisition_date: new Date(item.orderDate).toISOString().split('T')[0],
        acquisition_source: 'Amazon',
        condition: 'new' as const,
        status: 'acquired' as const,
        photos: item.imageUrl ? [item.imageUrl] : [],
        amazon_review_status: 'pending',
        reviewed_by: [],
      }));

      const { error } = await supabase.from('items').insert(itemsToInsert);
      if (error) throw error;

      return selectedItems.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success(`Successfully imported ${count} items!`);
      setHtmlInput('');
      setParsedItems([]);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const toggleItemSelection = (index: number) => {
    setParsedItems(items =>
      items.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const toggleAll = () => {
    const allSelected = parsedItems.every(item => item.selected);
    setParsedItems(items =>
      items.map(item => ({ ...item, selected: !allSelected }))
    );
  };

  const selectedCount = parsedItems.filter(item => item.selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Import from Amazon Orders
          </DialogTitle>
          <DialogDescription>
            Paste your Amazon orders page HTML to bulk import items
          </DialogDescription>
        </DialogHeader>

        {parsedItems.length === 0 ? (
          // Step 1: Paste HTML
          <div className="space-y-4">
            <Card className="bg-muted/50 border-dashed">
              <CardContent className="p-4">
                <div className="flex items-start gap-2 mb-3">
                  <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="font-medium text-sm">How to get Amazon orders HTML:</span>
                </div>
                <ol className="text-sm text-muted-foreground space-y-1 ml-6 list-decimal">
                  <li>Go to Amazon.com → Your Orders</li>
                  <li>Right-click anywhere on the page</li>
                  <li>Select "View Page Source" (or press Ctrl+U / Cmd+Option+U)</li>
                  <li>Press Ctrl+A (Cmd+A on Mac) to select all</li>
                  <li>Copy and paste below</li>
                </ol>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="html-input">Amazon Orders HTML</Label>
              <Textarea
                id="html-input"
                placeholder="Paste the full HTML source code here..."
                value={htmlInput}
                onChange={(e) => setHtmlInput(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
            </div>

            <Button
              onClick={parseAmazonHTML}
              disabled={!htmlInput.trim() || isParsing}
              className="w-full"
            >
              {isParsing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Parse Items
                </>
              )}
            </Button>
          </div>
        ) : (
          // Step 2: Review and Import
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" onClick={toggleAll}>
                  {parsedItems.every(item => item.selected) ? 'Deselect All' : 'Select All'}
                </Button>
                <Badge variant="secondary">
                  {selectedCount} of {parsedItems.length} selected
                </Badge>
              </div>
              
              <div className="flex items-center gap-2">
                <Label htmlFor="markup" className="text-sm whitespace-nowrap">Default Markup:</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="markup"
                    type="number"
                    value={defaultMarkup}
                    onChange={(e) => setDefaultMarkup(e.target.value)}
                    className="w-16 text-sm"
                  />
                  <span className="text-sm">%</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-4">
              {parsedItems.map((item, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  <Checkbox
                    checked={item.selected}
                    onCheckedChange={() => toggleItemSelection(index)}
                    className="mt-1"
                  />
                  
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-16 h-16 object-cover rounded flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm line-clamp-2">{item.title}</h4>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>Cost: ${item.price.toFixed(2)}</span>
                      <span>→</span>
                      <span>
                        Target: ${(item.price * (1 + parseFloat(defaultMarkup || '0') / 100)).toFixed(2)}
                      </span>
                      <span className="text-green-600">
                        (+{defaultMarkup || 0}%)
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ordered: {new Date(item.orderDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setParsedItems([])}
                className="flex-1"
              >
                Start Over
              </Button>
              <Button
                onClick={() => importItems.mutate()}
                disabled={selectedCount === 0 || importItems.isPending}
                className="flex-1"
              >
                {importItems.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  `Import ${selectedCount} Item${selectedCount !== 1 ? 's' : ''}`
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
