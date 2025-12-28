import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Megaphone,
  Copy,
  Check,
  Sparkles,
  Target,
  Users,
  DollarSign,
  Image as ImageIcon,
  Type,
  AlertCircle,
  RefreshCw,
  Wand2,
} from 'lucide-react';

/**
 * Facebook Ad Creator Component
 * 
 * Helps create properly formatted Facebook/Instagram ads following
 * Meta's best practices and character limits.
 * 
 * Character Limits:
 * - Primary Text: 125 chars (recommended), 63,206 max
 * - Headline: 40 chars (recommended), 255 max
 * - Description: 30 chars (recommended), 30 max shown
 * - Link Description: 20 chars shown
 * 
 * Ad Objectives:
 * - Awareness (video focus)
 * - Traffic
 * - Engagement
 * - App Promotion
 * - Leads
 * - Sales
 */

type AdObjective = 'awareness' | 'traffic' | 'engagement' | 'app_promotion' | 'leads' | 'sales';

interface AdTemplate {
  id: string;
  name: string;
  objective: AdObjective;
  description: string;
  primaryText: string;
  headline: string;
  linkDescription: string;
  callToAction: string;
}

const AD_TEMPLATES: AdTemplate[] = [
  {
    id: 'sale',
    name: 'Flash Sale',
    objective: 'sales',
    description: 'Promote a limited-time sale or discount',
    primaryText: '🔥 FLASH SALE! {{discount}}% OFF everything this weekend only!\n\nDon\'t miss out on incredible savings. Shop now before it\'s too late! ⏰',
    headline: '{{discount}}% OFF - Limited Time!',
    linkDescription: 'Shop the sale now',
    callToAction: 'Shop Now',
  },
  {
    id: 'product_launch',
    name: 'Product Launch',
    objective: 'awareness',
    description: 'Announce a new product or service',
    primaryText: '✨ Introducing {{product_name}} - The solution you\'ve been waiting for!\n\n{{benefit_1}}\n{{benefit_2}}\n{{benefit_3}}\n\nBe among the first to experience it.',
    headline: 'Introducing {{product_name}}',
    linkDescription: 'Learn more',
    callToAction: 'Learn More',
  },
  {
    id: 'lead_gen',
    name: 'Lead Generation',
    objective: 'leads',
    description: 'Collect leads with a free offer',
    primaryText: '📚 FREE {{offer}}!\n\nDiscover {{benefit}} in our comprehensive guide.\n\n✅ {{feature_1}}\n✅ {{feature_2}}\n✅ {{feature_3}}\n\nDownload your free copy today! 👇',
    headline: 'Get Your Free {{offer}}',
    linkDescription: 'Download free',
    callToAction: 'Sign Up',
  },
  {
    id: 'testimonial',
    name: 'Customer Testimonial',
    objective: 'engagement',
    description: 'Share social proof from happy customers',
    primaryText: '"{{testimonial}}" - {{customer_name}}\n\n⭐⭐⭐⭐⭐\n\nJoin thousands of satisfied customers who love our {{product}}!',
    headline: 'See Why Customers Love Us',
    linkDescription: 'Read reviews',
    callToAction: 'Learn More',
  },
  {
    id: 'marketplace_item',
    name: 'Marketplace Item',
    objective: 'traffic',
    description: 'Promote a single item for sale',
    primaryText: '📦 {{item_name}} FOR SALE!\n\nCondition: {{condition}}\nPrice: ${{price}}\n\n{{description}}\n\n📍 Local pickup available\n💬 Message for details',
    headline: '{{item_name}} - ${{price}}',
    linkDescription: 'View listing',
    callToAction: 'Message',
  },
  {
    id: 'event',
    name: 'Event Promotion',
    objective: 'engagement',
    description: 'Promote an upcoming event',
    primaryText: '🎉 You\'re Invited!\n\n{{event_name}}\n📅 {{date}}\n📍 {{location}}\n\n{{description}}\n\nLimited spots available - RSVP today!',
    headline: '{{event_name}}',
    linkDescription: 'RSVP now',
    callToAction: 'Sign Up',
  },
];

const CALL_TO_ACTIONS = [
  'Shop Now',
  'Learn More',
  'Sign Up',
  'Download',
  'Get Quote',
  'Book Now',
  'Contact Us',
  'Subscribe',
  'Apply Now',
  'Get Offer',
  'Watch More',
  'Message',
  'See Menu',
  'Get Directions',
  'Call Now',
];

const OBJECTIVE_INFO: Record<AdObjective, { label: string; icon: React.ReactNode; description: string }> = {
  awareness: { label: 'Awareness', icon: <Megaphone className="w-4 h-4" />, description: 'Increase brand awareness, video focus' },
  traffic: { label: 'Traffic', icon: <Target className="w-4 h-4" />, description: 'Drive traffic to your website' },
  engagement: { label: 'Engagement', icon: <Users className="w-4 h-4" />, description: 'Get more engagement on posts' },
  app_promotion: { label: 'App Promotion', icon: <ImageIcon className="w-4 h-4" />, description: 'Drive app installs' },
  leads: { label: 'Leads', icon: <DollarSign className="w-4 h-4" />, description: 'Collect contact information' },
  sales: { label: 'Sales', icon: <DollarSign className="w-4 h-4" />, description: 'Drive product sales' },
};

interface AdContent {
  primaryText: string;
  headline: string;
  linkDescription: string;
  callToAction: string;
  objective: AdObjective;
}

export function AdCreationHelper() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<AdTemplate | null>(null);
  
  const [adContent, setAdContent] = useState<AdContent>({
    primaryText: '',
    headline: '',
    linkDescription: '',
    callToAction: 'Learn More',
    objective: 'traffic',
  });

  // Character count helpers
  const getCharCount = (text: string, recommended: number) => {
    const count = text.length;
    const isOver = count > recommended;
    return { count, recommended, isOver };
  };

  // Apply template
  const applyTemplate = (template: AdTemplate) => {
    setSelectedTemplate(template);
    setAdContent({
      primaryText: template.primaryText,
      headline: template.headline,
      linkDescription: template.linkDescription,
      callToAction: template.callToAction,
      objective: template.objective,
    });
    toast.success(`Applied "${template.name}" template`);
  };

  // Copy text
  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      toast.success(`${field} copied!`);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  // Copy all
  const handleCopyAll = async () => {
    const fullAd = `PRIMARY TEXT:
${adContent.primaryText}

HEADLINE:
${adContent.headline}

LINK DESCRIPTION:
${adContent.linkDescription}

CALL TO ACTION:
${adContent.callToAction}

OBJECTIVE:
${OBJECTIVE_INFO[adContent.objective].label}`;

    try {
      await navigator.clipboard.writeText(fullAd);
      toast.success('Full ad copied to clipboard!');
    } catch {
      toast.error('Failed to copy');
    }
  };

  // Generate variations (simple AI-like suggestions)
  const generateVariation = (field: keyof AdContent) => {
    const variations: Record<string, string[]> = {
      headline: [
        'Limited Time Offer!',
        'Don\'t Miss Out!',
        'Exclusive Deal Today',
        'New & Improved',
        'Best Seller Alert',
        'Just Arrived!',
        'Popular Choice',
        'Trending Now',
      ],
      linkDescription: [
        'Shop now',
        'Get started',
        'Claim yours',
        'See details',
        'Explore more',
        'Find out how',
      ],
    };

    if (field === 'headline' || field === 'linkDescription') {
      const options = variations[field];
      const random = options[Math.floor(Math.random() * options.length)];
      setAdContent(prev => ({ ...prev, [field]: random }));
      toast.success('Generated new variation');
    }
  };

  const primaryTextStatus = getCharCount(adContent.primaryText, 125);
  const headlineStatus = getCharCount(adContent.headline, 40);
  const linkDescStatus = getCharCount(adContent.linkDescription, 20);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Megaphone className="w-4 h-4" />
          Ad Creator
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-blue-500" />
            Facebook Ad Creator
          </DialogTitle>
          <DialogDescription>
            Create properly formatted ads for Facebook and Instagram
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 mt-4">
          {/* Left: Templates */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Templates</Label>
              <Badge variant="outline">{AD_TEMPLATES.length} available</Badge>
            </div>
            
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {AD_TEMPLATES.map((template) => (
                  <Card
                    key={template.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedTemplate?.id === template.id ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => applyTemplate(template)}
                  >
                    <CardHeader className="p-3 pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{template.name}</CardTitle>
                        <Badge variant="secondary" className="text-xs">
                          {OBJECTIVE_INFO[template.objective].label}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs">
                        {template.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {template.primaryText.substring(0, 80)}...
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Right: Editor */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Ad Content</Label>
              <div className="flex gap-2">
                <Select
                  value={adContent.objective}
                  onValueChange={(v: AdObjective) => 
                    setAdContent(prev => ({ ...prev, objective: v }))
                  }
                >
                  <SelectTrigger className="w-36 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OBJECTIVE_INFO).map(([key, info]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          {info.icon}
                          {info.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {/* Primary Text */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="primary">Primary Text</Label>
                    <span className={`text-xs ${primaryTextStatus.isOver ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                      {primaryTextStatus.count}/{primaryTextStatus.recommended} 
                      {primaryTextStatus.isOver && ' (may be truncated)'}
                    </span>
                  </div>
                  <div className="relative">
                    <Textarea
                      id="primary"
                      value={adContent.primaryText}
                      onChange={(e) => setAdContent(prev => ({ ...prev, primaryText: e.target.value }))}
                      placeholder="Write your main ad copy here..."
                      rows={5}
                      className="pr-10"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => handleCopy(adContent.primaryText, 'Primary text')}
                    >
                      {copied === 'Primary text' ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Headline */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="headline">Headline</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => generateVariation('headline')}
                      >
                        <Wand2 className="w-3 h-3 mr-1" />
                        Suggest
                      </Button>
                      <span className={`text-xs ${headlineStatus.isOver ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                        {headlineStatus.count}/{headlineStatus.recommended}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <Input
                      id="headline"
                      value={adContent.headline}
                      onChange={(e) => setAdContent(prev => ({ ...prev, headline: e.target.value }))}
                      placeholder="Catchy headline..."
                      className="pr-10"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1/2 right-2 -translate-y-1/2 h-6 w-6"
                      onClick={() => handleCopy(adContent.headline, 'Headline')}
                    >
                      {copied === 'Headline' ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Link Description */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="linkDesc">Link Description</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => generateVariation('linkDescription')}
                      >
                        <Wand2 className="w-3 h-3 mr-1" />
                        Suggest
                      </Button>
                      <span className={`text-xs ${linkDescStatus.isOver ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                        {linkDescStatus.count}/{linkDescStatus.recommended}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <Input
                      id="linkDesc"
                      value={adContent.linkDescription}
                      onChange={(e) => setAdContent(prev => ({ ...prev, linkDescription: e.target.value }))}
                      placeholder="Short description..."
                      className="pr-10"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1/2 right-2 -translate-y-1/2 h-6 w-6"
                      onClick={() => handleCopy(adContent.linkDescription, 'Link description')}
                    >
                      {copied === 'Link description' ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Call to Action */}
                <div className="space-y-2">
                  <Label>Call to Action Button</Label>
                  <Select
                    value={adContent.callToAction}
                    onValueChange={(v) => setAdContent(prev => ({ ...prev, callToAction: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CALL_TO_ACTIONS.map((cta) => (
                        <SelectItem key={cta} value={cta}>
                          {cta}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Preview */}
                <div className="space-y-2">
                  <Label>Ad Preview</Label>
                  <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
                    <CardContent className="p-4 space-y-3">
                      {/* Simulated FB Ad Card */}
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                          <span className="text-white font-bold text-sm">FB</span>
                        </div>
                        <div>
                          <p className="font-medium text-sm">Your Business</p>
                          <p className="text-xs text-muted-foreground">Sponsored · 📍</p>
                        </div>
                      </div>
                      
                      <p className="text-sm whitespace-pre-wrap">
                        {adContent.primaryText || 'Your ad text will appear here...'}
                      </p>
                      
                      <div className="bg-white dark:bg-slate-700 rounded-lg overflow-hidden border">
                        <div className="aspect-video bg-slate-200 dark:bg-slate-600 flex items-center justify-center">
                          <ImageIcon className="w-12 h-12 text-slate-400" />
                        </div>
                        <div className="p-3 space-y-1">
                          <p className="text-xs text-muted-foreground uppercase">
                            yourwebsite.com
                          </p>
                          <p className="font-medium text-sm">
                            {adContent.headline || 'Headline'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {adContent.linkDescription || 'Link description'}
                          </p>
                        </div>
                      </div>
                      
                      <Button className="w-full" size="sm">
                        {adContent.callToAction}
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                {/* Tips */}
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <div className="flex gap-2">
                    <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-600 dark:text-blue-400">
                      <p className="font-medium mb-1">Ad Best Practices</p>
                      <ul className="space-y-0.5 text-blue-500">
                        <li>• Keep primary text under 125 characters</li>
                        <li>• Use emojis sparingly for visual appeal</li>
                        <li>• Include a clear call-to-action</li>
                        <li>• Test multiple headlines</li>
                        <li>• Match imagery to your message</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => {
              setAdContent({
                primaryText: '',
                headline: '',
                linkDescription: '',
                callToAction: 'Learn More',
                objective: 'traffic',
              });
              setSelectedTemplate(null);
            }}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Reset
          </Button>
          <Button onClick={handleCopyAll} className="gap-2">
            <Copy className="w-4 h-4" />
            Copy All Ad Content
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
