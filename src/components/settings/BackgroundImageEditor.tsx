import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ZoomIn, ZoomOut, Move, Check, X } from 'lucide-react';

interface BackgroundImageEditorProps {
  imageUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (settings: BackgroundSettings) => void;
  initialSettings?: BackgroundSettings;
}

export interface BackgroundSettings {
  imageUrl: string;
  zoom: number;
  positionX: number;
  positionY: number;
}

export function BackgroundImageEditor({
  imageUrl,
  open,
  onOpenChange,
  onSave,
  initialSettings,
}: BackgroundImageEditorProps) {
  const [zoom, setZoom] = useState(initialSettings?.zoom ?? 100);
  const [positionX, setPositionX] = useState(initialSettings?.positionX ?? 50);
  const [positionY, setPositionY] = useState(initialSettings?.positionY ?? 50);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset to initial settings when dialog opens
  useEffect(() => {
    if (open) {
      setZoom(initialSettings?.zoom ?? 100);
      setPositionX(initialSettings?.positionX ?? 50);
      setPositionY(initialSettings?.positionY ?? 50);
    }
  }, [open, initialSettings]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    const deltaX = ((e.clientX - dragStart.x) / rect.width) * 100;
    const deltaY = ((e.clientY - dragStart.y) / rect.height) * 100;

    setPositionX((prev) => Math.max(0, Math.min(100, prev - deltaX)));
    setPositionY((prev) => Math.max(0, Math.min(100, prev - deltaY)));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !containerRef.current) return;

    const touch = e.touches[0];
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    const deltaX = ((touch.clientX - dragStart.x) / rect.width) * 100;
    const deltaY = ((touch.clientY - dragStart.y) / rect.height) * 100;

    setPositionX((prev) => Math.max(0, Math.min(100, prev - deltaX)));
    setPositionY((prev) => Math.max(0, Math.min(100, prev - deltaY)));
    setDragStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleSave = () => {
    onSave({
      imageUrl,
      zoom,
      positionX,
      positionY,
    });
    onOpenChange(false);
  };

  const handleReset = () => {
    setZoom(100);
    setPositionX(50);
    setPositionY(50);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Move className="w-5 h-5" />
            Adjust Background
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview Area */}
          <div
            ref={containerRef}
            className="relative w-full h-48 rounded-lg overflow-hidden border-2 border-dashed border-primary/50 cursor-move select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className="absolute inset-0 transition-none"
              style={{
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: `${zoom}%`,
                backgroundPosition: `${positionX}% ${positionY}%`,
                backgroundRepeat: 'no-repeat',
              }}
            />
            {/* Drag indicator */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/50 text-white px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5">
                <Move className="w-3 h-3" />
                Drag to reposition
              </div>
            </div>
            {/* Center crosshair */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30" />
              <div className="absolute top-1/2 left-0 right-0 h-px bg-white/30" />
            </div>
          </div>

          {/* Zoom Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <ZoomIn className="w-4 h-4" />
                Zoom
              </Label>
              <span className="text-sm text-muted-foreground">{zoom}%</span>
            </div>
            <div className="flex items-center gap-3">
              <ZoomOut className="w-4 h-4 text-muted-foreground" />
              <Slider
                value={[zoom]}
                onValueChange={([value]) => setZoom(value)}
                min={50}
                max={200}
                step={5}
                className="flex-1"
              />
              <ZoomIn className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          {/* Position Controls */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Horizontal</Label>
                <span className="text-xs text-muted-foreground">{positionX.toFixed(0)}%</span>
              </div>
              <Slider
                value={[positionX]}
                onValueChange={([value]) => setPositionX(value)}
                min={0}
                max={100}
                step={1}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Vertical</Label>
                <span className="text-xs text-muted-foreground">{positionY.toFixed(0)}%</span>
              </div>
              <Slider
                value={[positionY]}
                onValueChange={([value]) => setPositionY(value)}
                min={0}
                max={100}
                step={1}
              />
            </div>
          </div>

          {/* Quick Position Buttons */}
          <div className="space-y-2">
            <Label className="text-sm">Quick Position</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Top Left', x: 0, y: 0 },
                { label: 'Top', x: 50, y: 0 },
                { label: 'Top Right', x: 100, y: 0 },
                { label: 'Left', x: 0, y: 50 },
                { label: 'Center', x: 50, y: 50 },
                { label: 'Right', x: 100, y: 50 },
                { label: 'Bottom Left', x: 0, y: 100 },
                { label: 'Bottom', x: 50, y: 100 },
                { label: 'Bottom Right', x: 100, y: 100 },
              ].map((pos) => (
                <Button
                  key={pos.label}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => {
                    setPositionX(pos.x);
                    setPositionY(pos.y);
                  }}
                >
                  {pos.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t">
            <Button onClick={handleSave} className="flex-1">
              <Check className="w-4 h-4 mr-2" />
              Apply
            </Button>
            <Button variant="outline" onClick={handleReset}>
              Reset
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
