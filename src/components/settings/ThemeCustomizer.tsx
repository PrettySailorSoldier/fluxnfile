import { useState, useEffect } from 'react';
import { useUserPreferences, useUpdateUserPreferences } from '@/hooks/useUserPreferences';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Palette, Upload, X, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export function ThemeCustomizer() {
  const { user } = useAuth();
  const { data: preferences } = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#7FE8D8');
  const [accentColor, setAccentColor] = useState('#D896FF');
  const [textColor, setTextColor] = useState('#1A1A1A');

  useEffect(() => {
    if (preferences) {
      setBgImage(preferences.background_image_url);
      if (preferences.primary_color) setPrimaryColor(preferences.primary_color);
      if (preferences.accent_color) setAccentColor(preferences.accent_color);
      if (preferences.text_color) setTextColor(preferences.text_color);
    }
  }, [preferences]);

  // Apply theme to document
  useEffect(() => {
    if (preferences?.background_image_url) {
      document.body.style.backgroundImage = `url(${preferences.background_image_url})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
    } else {
      document.body.style.backgroundImage = '';
    }

    return () => {
      document.body.style.backgroundImage = '';
    };
  }, [preferences?.background_image_url]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/background.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('item-photos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('item-photos')
        .getPublicUrl(fileName);

      setBgImage(publicUrl);
      toast.success('Background uploaded');
    } catch (error) {
      toast.error('Failed to upload background');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      await updatePreferences.mutateAsync({
        background_image_url: bgImage,
        primary_color: primaryColor,
        accent_color: accentColor,
        text_color: textColor,
      });
      toast.success('Theme saved');
      setOpen(false);
    } catch (error) {
      toast.error('Failed to save theme');
    }
  };

  const handleReset = async () => {
    setBgImage(null);
    setPrimaryColor('#7FE8D8');
    setAccentColor('#D896FF');
    setTextColor('#1A1A1A');
    
    try {
      await updatePreferences.mutateAsync({
        background_image_url: null,
        primary_color: null,
        accent_color: null,
        text_color: null,
      });
      toast.success('Theme reset to default');
    } catch (error) {
      toast.error('Failed to reset theme');
    }
  };

  const removeBackground = () => {
    setBgImage(null);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Palette className="w-4 h-4" />
          Theme & Appearance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          Customize your app's look and feel
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              Customize Theme
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Customize Theme</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Background Image */}
              <div className="space-y-2">
                <Label>Background Image</Label>
                {bgImage ? (
                  <div className="relative">
                    <img 
                      src={bgImage} 
                      alt="Background preview" 
                      className="w-full h-32 object-cover rounded-lg"
                    />
                    <Button
                      size="icon"
                      variant="destructive"
                      className="absolute top-2 right-2"
                      onClick={removeBackground}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploading}
                      className="hidden"
                      id="bg-upload"
                    />
                    <label htmlFor="bg-upload" className="cursor-pointer">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {uploading ? 'Uploading...' : 'Click to upload background'}
                      </p>
                    </label>
                  </div>
                )}
              </div>

              {/* Color Pickers */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Primary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="flex-1 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Accent Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="flex-1 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Text Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="flex-1 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label>Preview</Label>
                <div 
                  className="p-4 rounded-lg"
                  style={{
                    backgroundImage: bgImage ? `url(${bgImage})` : undefined,
                    backgroundSize: 'cover',
                    backgroundColor: bgImage ? undefined : '#F5EDFF',
                  }}
                >
                  <div className="bg-card/90 backdrop-blur p-4 rounded-lg space-y-2">
                    <p style={{ color: textColor }}>Sample text</p>
                    <div className="flex gap-2">
                      <div 
                        className="px-3 py-1 rounded text-sm"
                        style={{ backgroundColor: primaryColor }}
                      >
                        Primary
                      </div>
                      <div 
                        className="px-3 py-1 rounded text-sm"
                        style={{ backgroundColor: accentColor }}
                      >
                        Accent
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button onClick={handleSave} className="flex-1">
                  Save Theme
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
