import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ShoppingBag,
  Users,
  Megaphone,
  FileSpreadsheet,
  MessageSquare,
  Calendar,
  Shield,
  Package,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { useItems } from '@/hooks/useInventory';
import { MarketplaceExport } from './MarketplaceExport';
import { CustomerListExport } from './CustomerListExport';
import { AdCreationHelper } from './AdCreationHelper';

/**
 * Facebook Tools Panel
 * 
 * Central hub for all Facebook Marketplace and advertising tools:
 * 1. Marketplace CSV Export - Bulk upload inventory to FB Marketplace
 * 2. Customer List Export - Create custom audiences for FB Ads  
 * 3. Ad Creation Helper - Create formatted ad copy
 * 
 * Also provides quick links to other FB-related features.
 */

interface QuickLink {
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
  component?: string;
}

const QUICK_LINKS: QuickLink[] = [
  {
    icon: <FileSpreadsheet className="w-5 h-5" />,
    title: 'FB Marketplace Upload',
    description: 'Upload spreadsheet to Marketplace',
    href: 'https://www.facebook.com/marketplace/you/selling',
  },
  {
    icon: <Users className="w-5 h-5" />,
    title: 'Ads Manager',
    description: 'Manage your ad campaigns',
    href: 'https://www.facebook.com/adsmanager',
  },
  {
    icon: <Megaphone className="w-5 h-5" />,
    title: 'Audience Manager',
    description: 'Create and manage audiences',
    href: 'https://business.facebook.com/asset-library/audiences',
  },
  {
    icon: <HelpCircle className="w-5 h-5" />,
    title: 'Customer List Guide',
    description: 'Formatting guidelines',
    href: 'https://www.facebook.com/help/1943158472539049',
  },
];

const FEATURE_CARDS = [
  {
    id: 'marketplace',
    icon: <Package className="w-8 h-8 text-blue-500" />,
    title: 'Marketplace Export',
    description: 'Export your inventory to a CSV file formatted for Facebook Marketplace bulk upload.',
    features: [
      'Select items by status',
      'Customize pricing and markup',
      'Include shipping options',
      'Auto-generate descriptions',
    ],
  },
  {
    id: 'audience',
    icon: <Users className="w-8 h-8 text-purple-500" />,
    title: 'Customer Audience',
    description: 'Create customer lists for Facebook Ads custom audience targeting.',
    features: [
      'All Meta identifier columns',
      'CCPA compliance options',
      'Bulk data import',
      'Customer value tracking',
    ],
  },
  {
    id: 'ads',
    icon: <Megaphone className="w-8 h-8 text-green-500" />,
    title: 'Ad Creator',
    description: 'Create properly formatted ad copy with character limits and templates.',
    features: [
      'Multiple ad templates',
      'Character count validation',
      'Live ad preview',
      'All campaign objectives',
    ],
  },
];

export function FacebookToolsPanel() {
  const { data: items = [] } = useItems();
  const [activeTab, setActiveTab] = useState('overview');

  // Stats
  const readyToListCount = items.filter(i => i.status === 'ready_to_list').length;
  const listedCount = items.filter(i => i.status === 'listed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg"
              alt="Facebook"
              className="w-7 h-7"
            />
            Facebook Tools
          </h2>
          <p className="text-muted-foreground">
            Marketplace exports, customer audiences, and ad creation
          </p>
        </div>
        <div className="flex gap-2">
          {items.length > 0 && <MarketplaceExport items={items} />}
          <CustomerListExport />
          <AdCreationHelper />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="quick-links">Quick Links</TabsTrigger>
          <TabsTrigger value="help">Help & Guides</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Package className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{readyToListCount}</p>
                    <p className="text-sm text-muted-foreground">Ready to List</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <ShoppingBag className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{listedCount}</p>
                    <p className="text-sm text-muted-foreground">Currently Listed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <FileSpreadsheet className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{items.length}</p>
                    <p className="text-sm text-muted-foreground">Total Inventory</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FEATURE_CARDS.map((card) => (
              <Card key={card.id} className="relative overflow-hidden">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    {card.icon}
                    <Badge variant="outline">New</Badge>
                  </div>
                  <CardTitle className="text-lg">{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {card.features.map((feature, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {items.length > 0 && (
                  <MarketplaceExport items={items} />
                )}
                <CustomerListExport />
                <AdCreationHelper />
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => window.open('https://www.facebook.com/marketplace/create/item', '_blank')}
                >
                  <ShoppingBag className="w-4 h-4" />
                  New FB Listing
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quick-links" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {QUICK_LINKS.map((link, i) => (
              <Card key={i} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => link.href && window.open(link.href, '_blank')}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    {link.icon}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{link.title}</p>
                    <p className="text-sm text-muted-foreground">{link.description}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="help" className="space-y-4">
          <ScrollArea className="h-[400px]">
            <div className="space-y-6 pr-4">
              {/* Marketplace CSV Guide */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5" />
                    Marketplace CSV Format
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    When uploading items to Facebook Marketplace via spreadsheet, use these columns:
                  </p>
                  <div className="bg-muted p-4 rounded-lg space-y-2 font-mono text-sm">
                    <p><strong>title</strong> (String, Required) - Item title</p>
                    <p><strong>price</strong> (Number, Required) - Whole number price</p>
                    <p><strong>description</strong> (String, Required) - Item description</p>
                    <p><strong>local_pickup</strong> (Yes/No) - Local pickup option</p>
                    <p><strong>seller_provided_label_cost</strong> (Number) - Shipping label cost</p>
                    <p><strong>prepaid_shipping_weight</strong> (Float) - Weight in pounds</p>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-sm">
                    <p className="font-medium text-yellow-700 dark:text-yellow-300">Important:</p>
                    <ul className="mt-1 text-yellow-600 dark:text-yellow-400 space-y-1">
                      <li>• Save file as CSV format</li>
                      <li>• Don't remove or rename headers</li>
                      <li>• Category is auto-detected from title/description</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Customer List Guide */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Customer List Format
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    For Facebook Ads custom audiences, include at least one main identifier:
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium mb-2">Main Identifiers</p>
                      <ul className="space-y-1 text-muted-foreground">
                        <li><code className="bg-muted px-1 rounded">email</code> - Email address</li>
                        <li><code className="bg-muted px-1 rounded">phone</code> - With country code</li>
                        <li><code className="bg-muted px-1 rounded">madid</code> - Mobile ad ID</li>
                        <li><code className="bg-muted px-1 rounded">appuid</code> - FB app user ID</li>
                        <li><code className="bg-muted px-1 rounded">pageuid</code> - Page user ID</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium mb-2">Additional (Recommended)</p>
                      <ul className="space-y-1 text-muted-foreground">
                        <li><code className="bg-muted px-1 rounded">fn</code> - First name</li>
                        <li><code className="bg-muted px-1 rounded">ln</code> - Last name</li>
                        <li><code className="bg-muted px-1 rounded">ct</code> - City</li>
                        <li><code className="bg-muted px-1 rounded">st</code> - State</li>
                        <li><code className="bg-muted px-1 rounded">country</code> - ISO code (US, GB)</li>
                        <li><code className="bg-muted px-1 rounded">zip</code> - Postal code</li>
                      </ul>
                    </div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
                    <p className="font-medium text-blue-700 dark:text-blue-300">Tips for better match rates:</p>
                    <ul className="mt-1 text-blue-600 dark:text-blue-400 space-y-1">
                      <li>• Include multiple identifiers per customer</li>
                      <li>• Always include country code in phone numbers</li>
                      <li>• Use ISO 2-letter country codes</li>
                      <li>• Minimum 100 customers recommended</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Ad Copy Guide */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="w-5 h-5" />
                    Ad Copy Best Practices
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium mb-2">Character Limits</p>
                      <ul className="space-y-1 text-muted-foreground">
                        <li>Primary Text: <strong>125</strong> recommended</li>
                        <li>Headline: <strong>40</strong> recommended</li>
                        <li>Description: <strong>30</strong> shown</li>
                        <li>Link Desc: <strong>20</strong> shown</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium mb-2">Supported Objectives</p>
                      <ul className="space-y-1 text-muted-foreground">
                        <li>• Awareness (video focus)</li>
                        <li>• Traffic</li>
                        <li>• Engagement</li>
                        <li>• App Promotion</li>
                        <li>• Leads</li>
                        <li>• Sales</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
