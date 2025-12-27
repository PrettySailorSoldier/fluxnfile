import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, MessageSquare } from 'lucide-react';
import { TemplateLibrary } from '@/components/fb/TemplateLibrary';
import { CategoryManager } from '@/components/settings/CategoryManager';
import { StorageLocationManager } from '@/components/settings/StorageLocationManager';
import { ThemeCustomizer } from '@/components/settings/ThemeCustomizer';
import { ProfileEditor } from '@/components/settings/ProfileEditor';
import { TeamManager } from '@/components/settings/TeamManager';

export default function Settings() {
  const { signOut } = useAuth();
  const [showTemplates, setShowTemplates] = useState(false);

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-2xl font-bold text-foreground pt-2">Settings</h1>

      {/* Profile */}
      <ProfileEditor />

      {/* Team Management */}
      <TeamManager />

      {/* Categories */}
      <CategoryManager />

      {/* Storage Locations */}
      <StorageLocationManager />

      {/* Theme */}
      <ThemeCustomizer />

      {/* Message Templates */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Message Templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Quick responses for buyer messages on Facebook Marketplace
          </p>
          <Button variant="outline" onClick={() => setShowTemplates(true)} className="w-full">
            Manage Templates
          </Button>
        </CardContent>
      </Card>

      {/* Sign Out */}
      <Button 
        variant="destructive" 
        className="w-full" 
        onClick={signOut}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Sign Out
      </Button>

      {/* Template Library Dialog */}
      <TemplateLibrary
        open={showTemplates}
        onOpenChange={setShowTemplates}
      />
    </div>
  );
}
