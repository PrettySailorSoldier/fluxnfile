import { useState } from 'react';
import { useTheme, BackgroundSettings } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Palette, Upload, X, RotateCcw, Sun, Moon, Monitor, Check, Undo2, Move } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BackgroundImageEditor } from './BackgroundImageEditor';

const presetThemes = [
  {
    name: 'Default',
    primary: '#7FE8D8',
    accent: '#D896FF',
    text: '#1A1A1A',
  },
  {
    name: 'Ocean',
    primary: '#4A9FE8',
    accent: '#6ECFF6',
    text: '#1E3A5F',
  },
  {
    name: 'Sunset',
    primary: '#FF7E5F',
    accent: '#FFB88C',
    text: '#2D1B1B',
  },
  {
    name: 'Forest',
    primary: '#4CAF50',
    accent: '#8BC34A',
    text: '#1B2E1B',
  },
  {
    name: 'Rose',
    primary: '#E91E63',
    accent: '#F8BBD9',
    text: '#2E1B24',
  },
  {
    name: 'Midnight',
    primary: '#7C4DFF',
    accent: '#B388FF',
    text: '#1A1A2E',
  },
];

export function ThemeCustomizer() {
  const { user } = useAuth();
  const {
    mode,
    setMode,
    primaryColor,
    accentColor,
    textColor,
    backgroundImageUrl,
    backgroundSettings,
    updateColors,
    updateBackgroundSettings,
    resetTheme,
  } = useTheme();

  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bgEditorOpen, setBgEditorOpen] = useState(false);

  const [localPrimary, setLocalPrimary] = useState(primaryColor);
  const [localAccent, setLocalAccent] = useState(accentColor);
  const [localText, setLocalText] = useState(textColor);
  const [localBgImage, setLocalBgImage] = useState<string | null>(backgroundImageUrl);

  // Store original values when dialog opens for undo functionality
  const [originalPrimary, setOriginalPrimary] = useState(primaryColor);
  const [originalAccent, setOriginalAccent] = useState(accentColor);
  const [originalText, setOriginalText] = useState(textColor);
  const [originalBgImage, setOriginalBgImage] = useState<string | null>(backgroundImageUrl);

  // Sync local state when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      // Store original values for undo
      setOriginalPrimary(primaryColor);
      setOriginalAccent(accentColor);
      setOriginalText(textColor);
      setOriginalBgImage(backgroundImageUrl);
      // Set local editing values
      setLocalPrimary(primaryColor);
      setLocalAccent(accentColor);
      setLocalText(textColor);
      setLocalBgImage(backgroundImageUrl);
    }
    setOpen(isOpen);
  };

  // Undo all changes back to original values when dialog opened
  const handleUndo = () => {
    setLocalPrimary(originalPrimary);
    setLocalAccent(originalAccent);
    setLocalText(originalText);
    setLocalBgImage(originalBgImage);
    toast.info('Changes undone');
  };

  // Cancel and close without saving
  const handleCancel = () => {
    setLocalPrimary(originalPrimary);
    setLocalAccent(originalAccent);
    setLocalText(originalText);
    setLocalBgImage(originalBgImage);
    setOpen(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/background-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('item-photos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('item-photos')
        .getPublicUrl(fileName);

      setLocalBgImage(publicUrl);
      toast.success('Background uploaded');
    } catch (error) {
      toast.error('Failed to upload background');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      await updateColors({
        primaryColor: localPrimary,
        accentColor: localAccent,
        textColor: localText,
        backgroundImageUrl: localBgImage,
      });
      toast.success('Theme saved');
      setOpen(false);
    } catch (error) {
      toast.error('Failed to save theme');
    }
  };

  const handleReset = async () => {
    setLocalPrimary('#7FE8D8');
    setLocalAccent('#D896FF');
    setLocalText('#1A1A1A');
    setLocalBgImage(null);

    try {
      await resetTheme();
      toast.success('Theme reset to default');
    } catch (error) {
      toast.error('Failed to reset theme');
    }
  };

  const removeBackground = () => {
    setLocalBgImage(null);
  };

  const applyPreset = (preset: typeof presetThemes[0]) => {
    setLocalPrimary(preset.primary);
    setLocalAccent(preset.accent);
    setLocalText(preset.text);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Palette className="w-4 h-4" />
          Theme & Appearance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Dark Mode Toggle */}
        <div className="flex items-center justify-between">
          <Label className="text-sm">Appearance</Label>
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 w-8 p-0',
                mode === 'light' && 'bg-background shadow-sm'
              )}
              onClick={() => setMode('light')}
            >
              <Sun className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 w-8 p-0',
                mode === 'dark' && 'bg-background shadow-sm'
              )}
              onClick={() => setMode('dark')}
            >
              <Moon className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 w-8 p-0',
                mode === 'system' && 'bg-background shadow-sm'
              )}
              onClick={() => setMode('system')}
            >
              <Monitor className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              Customize Colors & Background
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto max-w-md">
            <DialogHeader>
              <DialogTitle>Customize Theme</DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="colors" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="presets">Presets</TabsTrigger>
                <TabsTrigger value="colors">Colors</TabsTrigger>
                <TabsTrigger value="background">Background</TabsTrigger>
              </TabsList>

              {/* Presets Tab */}
              <TabsContent value="presets" className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {presetThemes.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => applyPreset(preset)}
                      className={cn(
                        'p-3 rounded-lg border-2 text-left transition-all hover:scale-105',
                        localPrimary === preset.primary &&
                          localAccent === preset.accent
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <div className="flex gap-2 mb-2">
                        <div
                          className="w-6 h-6 rounded-full border"
                          style={{ backgroundColor: preset.primary }}
                        />
                        <div
                          className="w-6 h-6 rounded-full border"
                          style={{ backgroundColor: preset.accent }}
                        />
                      </div>
                      <p className="text-sm font-medium">{preset.name}</p>
                    </button>
                  ))}
                </div>
              </TabsContent>

              {/* Colors Tab */}
              <TabsContent value="colors" className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Primary Color</Label>
                    <p className="text-xs text-muted-foreground">
                      Used for buttons, links, and active states
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={localPrimary}
                        onChange={(e) => setLocalPrimary(e.target.value)}
                        className="w-14 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        value={localPrimary}
                        onChange={(e) => setLocalPrimary(e.target.value)}
                        className="flex-1 font-mono text-sm"
                        placeholder="#7FE8D8"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Accent Color</Label>
                    <p className="text-xs text-muted-foreground">
                      Used for highlights and secondary elements
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={localAccent}
                        onChange={(e) => setLocalAccent(e.target.value)}
                        className="w-14 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        value={localAccent}
                        onChange={(e) => setLocalAccent(e.target.value)}
                        className="flex-1 font-mono text-sm"
                        placeholder="#D896FF"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Text Color</Label>
                    <p className="text-xs text-muted-foreground">
                      Primary text color (light mode only)
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={localText}
                        onChange={(e) => setLocalText(e.target.value)}
                        className="w-14 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        value={localText}
                        onChange={(e) => setLocalText(e.target.value)}
                        className="flex-1 font-mono text-sm"
                        placeholder="#1A1A1A"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Background Tab */}
              <TabsContent value="background" className="space-y-4">
                <div className="space-y-3">
                  <Label>Background Image</Label>
                  {localBgImage ? (
                    <div className="space-y-3">
                      <div
                        className="relative w-full h-40 rounded-lg border overflow-hidden"
                        style={{
                          backgroundImage: `url(${localBgImage})`,
                          backgroundSize: `${backgroundSettings.zoom}%`,
                          backgroundPosition: `${backgroundSettings.positionX}% ${backgroundSettings.positionY}%`,
                          backgroundRepeat: 'no-repeat',
                        }}
                      >
                        <Button
                          size="icon"
                          variant="destructive"
                          className="absolute top-2 right-2"
                          onClick={removeBackground}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setBgEditorOpen(true)}
                      >
                        <Move className="w-4 h-4 mr-2" />
                        Adjust Position & Zoom
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed rounded-lg p-8 text-center">
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        disabled={uploading}
                        className="hidden"
                        id="bg-upload"
                      />
                      <label htmlFor="bg-upload" className="cursor-pointer">
                        <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                        <p className="text-sm font-medium">
                          {uploading ? 'Uploading...' : 'Click to upload background'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          PNG, JPG up to 5MB
                        </p>
                      </label>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* Preview */}
            <div className="space-y-2 pt-4 border-t">
              <Label>Preview</Label>
              <div
                className="p-4 rounded-lg relative overflow-hidden"
                style={{
                  backgroundImage: localBgImage ? `url(${localBgImage})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: localBgImage ? undefined : '#F5EDFF',
                }}
              >
                <div className="bg-card/95 backdrop-blur-sm p-4 rounded-lg space-y-3 border">
                  <p className="font-medium" style={{ color: localText }}>
                    Sample heading text
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This is how secondary text looks
                  </p>
                  <div className="flex gap-2">
                    <div
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ backgroundColor: localPrimary }}
                    >
                      Primary Button
                    </div>
                    <div
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{
                        backgroundColor: localAccent,
                        color: localText,
                      }}
                    >
                      Accent
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <div className="flex gap-2">
                <Button onClick={handleSave} className="flex-1">
                  <Check className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleUndo} className="flex-1">
                  <Undo2 className="w-4 h-4 mr-2" />
                  Undo Changes
                </Button>
                <Button variant="ghost" size="sm" onClick={handleReset} className="flex-1 text-destructive hover:text-destructive">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset All
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>

      {/* Background Image Editor Dialog */}
      {localBgImage && (
        <BackgroundImageEditor
          imageUrl={localBgImage}
          open={bgEditorOpen}
          onOpenChange={setBgEditorOpen}
          initialSettings={{
            imageUrl: localBgImage,
            zoom: backgroundSettings.zoom,
            positionX: backgroundSettings.positionX,
            positionY: backgroundSettings.positionY,
          }}
          onSave={(settings) => {
            updateBackgroundSettings({
              zoom: settings.zoom,
              positionX: settings.positionX,
              positionY: settings.positionY,
            });
            toast.success('Background position updated');
          }}
        />
      )}
    </Card>
  );
}
