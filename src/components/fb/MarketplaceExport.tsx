import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Download,
  FileSpreadsheet,
  ShoppingBag,
  Users,
  Settings2,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { Item, conditionLabels } from '@/hooks/useInventory';

/**
 * Facebook Marketplace CSV Export Component
 * Exports inventory items to Facebook Marketplace spreadsheet format
 * 
 * FB Marketplace CSV Columns:
 * - title (String, Required) - Item title
 * - price (Number, Required) - Price rounded to nearest whole number
 * - description (String, Required) - Item description
 * - local_pickup (Yes/No) - Can be picked up locally
 * - seller_provided_label_cost (Number) - Shipping label cost
 * - prepaid_shipping_weight (Float) - Weight in pounds
 */

interface MarketplaceExportProps {
  items: Item[];
}

interface ExportSettings {
  includeLocalPickup: boolean;
  defaultLocalPickup: 'Yes' | 'No';
  includeShipping: boolean;
  defaultShippingWeight: number;
  defaultShippingCost: number;
  statusFilter: string[];
  priceMarkup: number;
  roundPrices: boolean;
}

const DEFAULT_SETTINGS: ExportSettings = {
  includeLocalPickup: true,
  defaultLocalPickup: 'Yes',
  includeShipping: false,
  defaultShippingWeight: 1.0,
  defaultShippingCost: 0,
  statusFilter: ['ready_to_list', 'listed'],
  priceMarkup: 0,
  roundPrices: true,
};

export function MarketplaceExport({ items }: MarketplaceExportProps) {
  const [open, setOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_SETTINGS);

  // Filter items based on status
  const filteredItems = useMemo(() => {
    return items.filter((item) =>
      settings.statusFilter.includes(item.status)
    );
  }, [items, settings.statusFilter]);

  // Select all filtered items
  const handleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map((item) => item.id)));
    }
  };

  // Toggle individual item
  const toggleItem = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedItems(newSet);
  };

  // Calculate final price
  const calculatePrice = (item: Item): number => {
    let price = item.target_price || item.original_cost * 2;
    price = price * (1 + settings.priceMarkup / 100);
    if (settings.roundPrices) {
      price = Math.round(price);
    }
    return price;
  };

  // Generate description for FB Marketplace
  const generateDescription = (item: Item): string => {
    const parts = [];

    // Condition
    parts.push(`Condition: ${conditionLabels[item.condition]}`);

    // Description
    if (item.description) {
      parts.push('');
      parts.push(item.description);
    }

    // Notes
    if (item.refurbish_notes) {
      parts.push('');
      parts.push(`Notes: ${item.refurbish_notes}`);
    }

    // Category
    if (item.category?.name) {
      parts.push('');
      parts.push(`Category: ${item.category.name}`);
    }

    // Footer
    parts.push('');
    if (settings.includeLocalPickup && settings.defaultLocalPickup === 'Yes') {
      parts.push('📍 Local pickup available');
    }
    if (settings.includeShipping) {
      parts.push('📦 Shipping available');
    }
    parts.push('💵 Serious inquiries only');

    return parts.join('\n');
  };

  // Generate CSV content
  const generateCSV = (): string => {
    const selectedItemsList = filteredItems.filter((item) =>
      selectedItems.has(item.id)
    );

    if (selectedItemsList.length === 0) {
      toast.error('No items selected');
      return '';
    }

    // CSV Headers (Facebook Marketplace format)
    const headers = [
      'title',
      'price',
      'description',
      settings.includeLocalPickup ? 'local_pickup' : null,
      settings.includeShipping ? 'seller_provided_label_cost' : null,
      settings.includeShipping ? 'prepaid_shipping_weight' : null,
    ].filter(Boolean);

    const rows = selectedItemsList.map((item) => {
      const title = item.title || `${item.category?.name || 'Item'} - ${conditionLabels[item.condition]}`;
      const price = calculatePrice(item);
      const description = generateDescription(item);

      const row = [
        `"${title.replace(/"/g, '""')}"`,
        price,
        `"${description.replace(/"/g, '""')}"`,
      ];

      if (settings.includeLocalPickup) {
        row.push(settings.defaultLocalPickup);
      }

      if (settings.includeShipping) {
        row.push(item.shipping_cost || settings.defaultShippingCost);
        row.push(settings.defaultShippingWeight);
      }

      return row.join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  };

  // Download CSV file
  const handleExport = () => {
    const csv = generateCSV();
    if (!csv) return;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `fb_marketplace_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${selectedItems.size} items to CSV!`);
    setOpen(false);
  };

  // Copy CSV to clipboard
  const handleCopy = async () => {
    const csv = generateCSV();
    if (!csv) return;

    try {
      await navigator.clipboard.writeText(csv);
      toast.success('CSV copied to clipboard!');
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileSpreadsheet className="w-4 h-4" />
          Export to FB Marketplace
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-blue-500" />
            Export to Facebook Marketplace
          </DialogTitle>
          <DialogDescription>
            Generate a CSV file compatible with Facebook Marketplace bulk upload
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="items" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="items">Select Items</TabsTrigger>
            <TabsTrigger value="settings">
              <Settings2 className="w-4 h-4 mr-1" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                  onCheckedChange={handleSelectAll}
                />
                <Label>Select All ({filteredItems.length} items)</Label>
              </div>
              <Badge variant="outline">
                {selectedItems.size} selected
              </Badge>
            </div>

            <ScrollArea className="h-[300px] border rounded-lg p-3">
              {filteredItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No items match the current filters</p>
                  <p className="text-sm">
                    Adjust status filter in Settings tab
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-lg cursor-pointer"
                      onClick={() => toggleItem(item.id)}
                    >
                      <Checkbox checked={selectedItems.has(item.id)} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {item.title || 'Untitled Item'}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{conditionLabels[item.condition]}</span>
                          <span>•</span>
                          <span>${calculatePrice(item)}</span>
                          {item.category?.name && (
                            <>
                              <span>•</span>
                              <span>{item.category.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {item.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Preview */}
            {selectedItems.size > 0 && (
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-sm font-medium mb-2">CSV Preview (first item):</p>
                <pre className="text-xs overflow-auto max-h-32 bg-background p-2 rounded">
                  {generateCSV().split('\n').slice(0, 3).join('\n')}
                </pre>
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            {/* Status Filter */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Include Items with Status</Label>
              <div className="grid grid-cols-3 gap-2">
                {['ready_to_list', 'listed', 'acquired', 'refurbishing', 'sold', 'shipped'].map(
                  (status) => (
                    <div key={status} className="flex items-center gap-2">
                      <Checkbox
                        id={`status-${status}`}
                        checked={settings.statusFilter.includes(status)}
                        onCheckedChange={(checked) => {
                          const newFilter = checked
                            ? [...settings.statusFilter, status]
                            : settings.statusFilter.filter((s) => s !== status);
                          setSettings({ ...settings, statusFilter: newFilter });
                        }}
                      />
                      <Label htmlFor={`status-${status}`} className="text-sm capitalize">
                        {status.replace('_', ' ')}
                      </Label>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Pricing</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="markup" className="text-xs text-muted-foreground">
                    Price Markup (%)
                  </Label>
                  <Input
                    id="markup"
                    type="number"
                    value={settings.priceMarkup}
                    onChange={(e) =>
                      setSettings({ ...settings, priceMarkup: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox
                    id="round"
                    checked={settings.roundPrices}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, roundPrices: !!checked })
                    }
                  />
                  <Label htmlFor="round" className="text-sm">
                    Round to whole numbers
                  </Label>
                </div>
              </div>
            </div>

            {/* Local Pickup */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="local"
                  checked={settings.includeLocalPickup}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, includeLocalPickup: !!checked })
                  }
                />
                <Label htmlFor="local" className="text-sm font-medium">
                  Include Local Pickup Column
                </Label>
              </div>
              {settings.includeLocalPickup && (
                <Select
                  value={settings.defaultLocalPickup}
                  onValueChange={(value: 'Yes' | 'No') =>
                    setSettings({ ...settings, defaultLocalPickup: value })
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Shipping */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="shipping"
                  checked={settings.includeShipping}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, includeShipping: !!checked })
                  }
                />
                <Label htmlFor="shipping" className="text-sm font-medium">
                  Include Shipping Columns
                </Label>
              </div>
              {settings.includeShipping && (
                <div className="grid grid-cols-2 gap-4 pl-6">
                  <div className="space-y-2">
                    <Label htmlFor="weight" className="text-xs text-muted-foreground">
                      Default Weight (lbs)
                    </Label>
                    <Input
                      id="weight"
                      type="number"
                      step="0.1"
                      value={settings.defaultShippingWeight}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultShippingWeight: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cost" className="text-xs text-muted-foreground">
                      Default Label Cost ($)
                    </Label>
                    <Input
                      id="cost"
                      type="number"
                      step="0.01"
                      value={settings.defaultShippingCost}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultShippingCost: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-700 dark:text-blue-300">
                    Facebook Marketplace Requirements
                  </p>
                  <ul className="mt-1 text-blue-600 dark:text-blue-400 space-y-1">
                    <li>• File must be CSV format</li>
                    <li>• Prices should be whole numbers</li>
                    <li>• Do not remove or rename headers</li>
                    <li>• Category is auto-detected from title/description</li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleCopy} disabled={selectedItems.size === 0}>
            Copy to Clipboard
          </Button>
          <Button onClick={handleExport} disabled={selectedItems.size === 0} className="gap-2">
            <Download className="w-4 h-4" />
            Download CSV ({selectedItems.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
