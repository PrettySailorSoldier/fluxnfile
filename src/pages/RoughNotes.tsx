import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Package,
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  Loader2,
  StickyNote,
  Check,
  Clock,
} from 'lucide-react';
import { useRoughItemsByBox, useRoughItemsCounts, RoughItem } from '@/hooks/useRoughItems';
import { AddRoughItemDialog } from '@/components/rough-notes/AddRoughItemDialog';
import { RoughItemCard } from '@/components/rough-notes/RoughItemCard';

export default function RoughNotes() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [defaultBoxLabel, setDefaultBoxLabel] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processed'>('all');
  const [expandedBoxes, setExpandedBoxes] = useState<Set<string>>(new Set());

  const { data: itemsByBox, items, isLoading } = useRoughItemsByBox();
  const counts = useRoughItemsCounts();

  // Filter items
  const filteredItemsByBox = Object.entries(itemsByBox).reduce((acc, [boxLabel, boxItems]) => {
    const filtered = boxItems.filter((item) => {
      const matchesSearch =
        !search ||
        item.item_name.toLowerCase().includes(search.toLowerCase()) ||
        item.item_notes?.toLowerCase().includes(search.toLowerCase()) ||
        boxLabel.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'pending' && !item.is_processed) ||
        (statusFilter === 'processed' && item.is_processed);

      return matchesSearch && matchesStatus;
    });

    if (filtered.length > 0) {
      acc[boxLabel] = filtered;
    }
    return acc;
  }, {} as Record<string, RoughItem[]>);

  const toggleBox = (boxLabel: string) => {
    const newExpanded = new Set(expandedBoxes);
    if (newExpanded.has(boxLabel)) {
      newExpanded.delete(boxLabel);
    } else {
      newExpanded.add(boxLabel);
    }
    setExpandedBoxes(newExpanded);
  };

  const expandAll = () => {
    setExpandedBoxes(new Set(Object.keys(filteredItemsByBox)));
  };

  const collapseAll = () => {
    setExpandedBoxes(new Set());
  };

  const handleAddToBox = (boxLabel: string) => {
    setDefaultBoxLabel(boxLabel);
    setShowAddDialog(true);
  };

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold text-foreground">Rough Notes</h1>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Add Item
        </Button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="bg-secondary/30">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">{counts.boxes}</div>
            <div className="text-xs text-muted-foreground">Boxes</div>
          </CardContent>
        </Card>
        <Card className="bg-secondary/30">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">{counts.total}</div>
            <div className="text-xs text-muted-foreground">Items</div>
          </CardContent>
        </Card>
        <Card className="bg-secondary/30">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-yellow-500">{counts.pending}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
        <Card className="bg-secondary/30">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-green-500">{counts.processed}</div>
            <div className="text-xs text-muted-foreground">Done</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search items or boxes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Items ({counts.total})</SelectItem>
              <SelectItem value="pending">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Pending ({counts.pending})
                </div>
              </SelectItem>
              <SelectItem value="processed">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Processed ({counts.processed})
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Collapse
          </Button>
        </div>
      </div>

      {/* Empty State */}
      {Object.keys(filteredItemsByBox).length === 0 ? (
        <Card className="bg-secondary/30 border-dashed">
          <CardContent className="py-12 text-center">
            <StickyNote className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-foreground mb-1">
              {items?.length === 0 ? 'No rough notes yet' : 'No matching items'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {items?.length === 0
                ? 'Add quick notes about items in boxes for later inventory entry'
                : 'Try adjusting your search or filters'}
            </p>
            {items?.length === 0 && (
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add First Item
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Boxes with Items */
        <div className="space-y-3">
          {Object.entries(filteredItemsByBox)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([boxLabel, boxItems]) => {
              const isExpanded = expandedBoxes.has(boxLabel);
              const pendingCount = boxItems.filter((i) => !i.is_processed).length;
              const processedCount = boxItems.filter((i) => i.is_processed).length;
              const boxDescription = boxItems[0]?.box_description;

              return (
                <Collapsible
                  key={boxLabel}
                  open={isExpanded}
                  onOpenChange={() => toggleBox(boxLabel)}
                >
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          )}
                          <Package className="w-5 h-5 text-primary" />
                          <div className="flex-1">
                            <CardTitle className="text-base">{boxLabel}</CardTitle>
                            {boxDescription && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {boxDescription}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {pendingCount > 0 && (
                              <Badge variant="outline" className="text-yellow-500 border-yellow-500">
                                {pendingCount} pending
                              </Badge>
                            )}
                            {processedCount > 0 && (
                              <Badge variant="outline" className="text-green-500 border-green-500">
                                {processedCount} done
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <CardContent className="pt-0 space-y-2">
                        {boxItems.map((item) => (
                          <RoughItemCard key={item.id} item={item} />
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full mt-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddToBox(boxLabel);
                          }}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add to {boxLabel}
                        </Button>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
        </div>
      )}

      {/* Add Dialog */}
      <AddRoughItemDialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) setDefaultBoxLabel('');
        }}
        defaultBoxLabel={defaultBoxLabel}
      />
    </div>
  );
}
