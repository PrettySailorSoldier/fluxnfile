import { useState, useRef, TouchEvent, MouseEvent } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Package, ChevronRight, Tag, Trash2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Item, statusConfig, calculateProfit, getProfitLevel, ItemStatus } from '@/hooks/useInventory';
import { ReviewStatusBadge } from '@/components/amazon/ReviewStatusBadge';

interface SwipeableItemProps {
  item: Item;
  isSelecting: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onClick: () => void;
  onMarkListed: () => void;
  onMarkSold: () => void;
  onDelete: () => void;
}

export function SwipeableItem({
  item,
  isSelecting,
  isSelected,
  onSelect,
  onClick,
  onMarkListed,
  onMarkSold,
  onDelete,
}: SwipeableItemProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);

  const handleTouchStart = (e: TouchEvent) => {
    if (isSelecting) return;
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = e.touches[0].clientX;
    setIsDragging(true);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging || isSelecting) return;
    currentXRef.current = e.touches[0].clientX;
    const diff = currentXRef.current - startXRef.current;
    // Limit swipe range
    const clampedDiff = Math.max(-120, Math.min(120, diff));
    setSwipeOffset(clampedDiff);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // If swiped far enough, trigger action
    if (swipeOffset < -80) {
      // Swiped left - show delete
      setSwipeOffset(-100);
    } else if (swipeOffset > 80) {
      // Swiped right - show mark actions
      setSwipeOffset(100);
    } else {
      setSwipeOffset(0);
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (isSelecting) return;
    startXRef.current = e.clientX;
    currentXRef.current = e.clientX;
    setIsDragging(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || isSelecting) return;
    currentXRef.current = e.clientX;
    const diff = currentXRef.current - startXRef.current;
    const clampedDiff = Math.max(-120, Math.min(120, diff));
    setSwipeOffset(clampedDiff);
  };

  const handleMouseUp = () => {
    handleTouchEnd();
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false);
      setSwipeOffset(0);
    }
  };

  const resetSwipe = () => {
    setSwipeOffset(0);
  };

  const handleClick = () => {
    if (Math.abs(swipeOffset) < 10) {
      if (isSelecting) {
        onSelect(item.id);
      } else {
        onClick();
      }
    }
  };

  const { netProfit, margin } = calculateProfit(item);
  const profitLevel = getProfitLevel(margin);
  const displayPrice = item.actual_price || item.target_price;

  const canMarkListed = !['listed', 'sold', 'shipped'].includes(item.status);
  const canMarkSold = item.status === 'listed';

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Left action (swipe right) - Mark as Listed/Sold */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 flex items-center gap-2 px-4 transition-opacity',
          swipeOffset > 50 ? 'opacity-100' : 'opacity-0'
        )}
        style={{ width: '100px', backgroundColor: 'hsl(var(--success))' }}
      >
        {canMarkListed && (
          <button
            onClick={() => {
              onMarkListed();
              resetSwipe();
            }}
            className="flex flex-col items-center text-white"
          >
            <Tag className="w-5 h-5" />
            <span className="text-xs mt-1">Listed</span>
          </button>
        )}
        {canMarkSold && (
          <button
            onClick={() => {
              onMarkSold();
              resetSwipe();
            }}
            className="flex flex-col items-center text-white"
          >
            <CheckCircle className="w-5 h-5" />
            <span className="text-xs mt-1">Sold</span>
          </button>
        )}
      </div>

      {/* Right action (swipe left) - Delete */}
      <div
        className={cn(
          'absolute inset-y-0 right-0 flex items-center justify-end px-4 transition-opacity',
          swipeOffset < -50 ? 'opacity-100' : 'opacity-0'
        )}
        style={{ width: '100px', backgroundColor: 'hsl(var(--destructive))' }}
      >
        <button
          onClick={() => {
            onDelete();
            resetSwipe();
          }}
          className="flex flex-col items-center text-white"
        >
          <Trash2 className="w-5 h-5" />
          <span className="text-xs mt-1">Delete</span>
        </button>
      </div>

      {/* Main card */}
      <Card
        className={cn(
          'transition-transform cursor-pointer relative',
          isSelected && 'ring-2 ring-primary'
        )}
        style={{ transform: `translateX(${swipeOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <CardContent className="p-3">
          <div className="flex gap-3">
            {/* Checkbox for selection mode */}
            {isSelecting && (
              <div className="flex items-center">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onSelect(item.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}

            {/* Photo or placeholder */}
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              {item.photos && item.photos.length > 0 ? (
                <img
                  src={item.photos[0]}
                  alt={item.title || 'Item'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Item details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium text-foreground truncate flex items-center gap-2">
                    {item.tracking_number && (
                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground flex-shrink-0">
                        #{item.tracking_number.toString().padStart(5, '0')}
                      </span>
                    )}
                    <span className="truncate">
                      {item.title || item.category?.name || 'Untitled Item'}
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {item.category?.name}
                    {item.storage_location && ` • ${item.storage_location.name}`}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
              </div>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge
                  variant="secondary"
                  className={cn('text-xs', statusConfig[item.status].className)}
                >
                  {statusConfig[item.status].label}
                </Badge>
                
                {/* Amazon review badge */}
                {item.acquisition_source === 'Amazon' && (item as any).amazon_review_status && (
                  <ReviewStatusBadge 
                    status={(item as any).amazon_review_status} 
                    size="sm" 
                  />
                )}

                <div className="flex-1 text-right">
                  <span className="text-sm text-muted-foreground">
                    ${item.original_cost.toFixed(2)}
                  </span>
                  {displayPrice && (
                    <>
                      <span className="text-muted-foreground mx-1">→</span>
                      <span className="text-sm font-medium">
                        ${displayPrice.toFixed(2)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {displayPrice && (
                <div className="mt-1 text-right">
                  <Badge
                    variant="secondary"
                    className={cn(
                      'text-xs',
                      profitLevel === 'loss' && 'profit-loss',
                      profitLevel === 'low' && 'profit-low',
                      profitLevel === 'good' && 'profit-good',
                      profitLevel === 'high' && 'profit-high'
                    )}
                  >
                    {netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} ({margin.toFixed(0)}%)
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
