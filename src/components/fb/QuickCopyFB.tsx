import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Copy, ExternalLink, Check } from 'lucide-react';

interface QuickCopyFBProps {
  item: {
    title?: string;
    category?: { name: string };
    condition: string;
    original_cost: number;
    target_price?: number;
    description?: string;
    refurbish_notes?: string;
  };
}

export function QuickCopyFB({ item }: QuickCopyFBProps) {
  const [copied, setCopied] = useState(false);

  const generateTitle = () => {
    // SEO-optimized title for FB Marketplace
    const parts = [];
    
    if (item.title) {
      parts.push(item.title);
    }
    
    if (item.category?.name) {
      parts.push(`• ${item.category.name}`);
    }
    
    const conditionLabel = item.condition.replace('_', ' ').toUpperCase();
    parts.push(`• ${conditionLabel}`);
    
    return parts.join(' ');
  };

  const generateDescription = () => {
    const parts = [];
    
    // Condition
    const conditionLabel = item.condition.replace('_', ' ');
    parts.push(`Condition: ${conditionLabel.charAt(0).toUpperCase() + conditionLabel.slice(1)}`);
    
    // Description
    if (item.description) {
      parts.push('');
      parts.push(item.description);
    }
    
    // Notes (if any flaws)
    if (item.refurbish_notes) {
      parts.push('');
      parts.push(`Notes: ${item.refurbish_notes}`);
    }
    
    // Price
    if (item.target_price) {
      parts.push('');
      parts.push(`Price: $${item.target_price.toFixed(2)} (firm)`);
    }
    
    // Standard footer
    parts.push('');
    parts.push('📍 Local pickup preferred');
    parts.push('💵 Cash only');
    parts.push('📸 More photos available upon request');
    
    return parts.join('\n');
  };

  const handleCopy = async () => {
    const title = generateTitle();
    const description = generateDescription();
    const fullListing = `${title}\n\n${description}`;
    
    try {
      await navigator.clipboard.writeText(fullListing);
      setCopied(true);
      toast.success('Listing copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const openFBMarketplace = () => {
    window.open('https://www.facebook.com/marketplace/create/item', '_blank');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg"
            alt="Facebook"
            className="w-5 h-5"
          />
          Quick List to Facebook
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted p-3 rounded-lg space-y-2">
          <p className="font-medium text-sm">Title:</p>
          <p className="text-sm">{generateTitle()}</p>
        </div>

        <div className="bg-muted p-3 rounded-lg space-y-2">
          <p className="font-medium text-sm">Description:</p>
          <p className="text-sm whitespace-pre-wrap">{generateDescription()}</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleCopy} className="flex-1" variant="outline">
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy Listing
              </>
            )}
          </Button>
          <Button onClick={openFBMarketplace} className="flex-1">
            <ExternalLink className="w-4 h-4 mr-2" />
            Open Facebook
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Copy the listing, then paste it into Facebook Marketplace
        </p>
      </CardContent>
    </Card>
  );
}
