import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, Users } from 'lucide-react';

type ReviewStatus = 'pending' | 'reviewed_grant' | 'reviewed_crybaby' | 'reviewed_both' | null;

interface ReviewStatusBadgeProps {
  status: ReviewStatus;
  size?: 'sm' | 'default';
}

export function ReviewStatusBadge({ status, size = 'default' }: ReviewStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          label: 'Needs Review',
          className: 'bg-warning/20 text-warning-foreground border-warning/30',
        };
      case 'reviewed_grant':
        return {
          icon: CheckCircle,
          label: 'Reviewed by Grant',
          className: 'bg-primary/20 text-primary border-primary/30',
        };
      case 'reviewed_crybaby':
        return {
          icon: CheckCircle,
          label: 'Reviewed by CryBaby',
          className: 'bg-accent/20 text-accent-foreground border-accent/30',
        };
      case 'reviewed_both':
        return {
          icon: Users,
          label: 'Reviewed by Both',
          className: 'bg-success/20 text-success border-success/30',
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;
  
  const Icon = config.icon;
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <Badge variant="outline" className={`${config.className} ${textSize}`}>
      <Icon className={`${iconSize} mr-1`} />
      {config.label}
    </Badge>
  );
}
