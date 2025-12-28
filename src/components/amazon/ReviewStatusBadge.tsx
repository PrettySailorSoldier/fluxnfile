import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, Users } from 'lucide-react';

type ReviewStatus = 'pending' | 'reviewed_grant' | 'reviewed_crybaby' | 'reviewed_both' | null;

interface ReviewStatusBadgeProps {
  status: ReviewStatus;
  reviewedBy?: string[];
  size?: 'sm' | 'default';
}

export function ReviewStatusBadge({ status, reviewedBy, size = 'default' }: ReviewStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          label: 'Needs Review',
          variant: 'secondary' as const,
          className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
        };
      case 'reviewed_grant':
        return {
          icon: CheckCircle,
          label: 'Reviewed by Grant',
          variant: 'default' as const,
          className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
        };
      case 'reviewed_crybaby':
        return {
          icon: CheckCircle,
          label: 'Reviewed by CryBaby',
          variant: 'default' as const,
          className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
        };
      case 'reviewed_both':
        return {
          icon: Users,
          label: 'Reviewed by Both',
          variant: 'default' as const,
          className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;
  
  const Icon = config.icon;
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <Badge variant={config.variant} className={config.className}>
      <Icon className={`${iconSize} mr-1`} />
      {config.label}
    </Badge>
  );
}
