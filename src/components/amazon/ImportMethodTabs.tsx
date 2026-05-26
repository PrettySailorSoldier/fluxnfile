import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { FileSpreadsheet, FileCode, ClipboardList } from 'lucide-react';

export type ImportMethod = 'csv' | 'file' | 'paste';

interface ImportMethodTabsProps {
  method: ImportMethod;
  onChange: (method: ImportMethod) => void;
}

export function ImportMethodTabs({ method, onChange }: ImportMethodTabsProps) {
  return (
    <Tabs value={method} onValueChange={(v) => onChange(v as ImportMethod)}>
      <TabsList className="w-full h-auto">
        <TabsTrigger
          value="csv"
          className="flex-1 flex-col items-center gap-0.5 py-2 h-auto"
        >
          <div className="flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4" />
            <span className="text-xs font-medium">Excel Upload</span>
          </div>
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 leading-4 bg-primary/15 text-primary border-0"
          >
            Recommended
          </Badge>
        </TabsTrigger>

        <TabsTrigger
          value="file"
          className="flex-1 flex-col items-center gap-0.5 py-2 h-auto"
        >
          <div className="flex items-center gap-1.5">
            <FileCode className="w-4 h-4" />
            <span className="text-xs font-medium">HTML File</span>
          </div>
        </TabsTrigger>

        <TabsTrigger
          value="paste"
          className="flex-1 flex-col items-center gap-0.5 py-2 h-auto"
        >
          <div className="flex items-center gap-1.5">
            <ClipboardList className="w-4 h-4" />
            <span className="text-xs font-medium">Paste HTML</span>
          </div>
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 leading-4 bg-muted text-muted-foreground border-0"
          >
            Legacy
          </Badge>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
