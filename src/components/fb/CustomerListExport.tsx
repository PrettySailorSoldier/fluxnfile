import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  Download,
  Users,
  Plus,
  Trash2,
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
} from 'lucide-react';

/**
 * Facebook Custom Audience Customer List Export
 * 
 * Generates CSV files following Meta's customer list formatting guidelines
 * for creating Custom Audiences in Facebook Ads Manager.
 * 
 * Required columns (at least one):
 * - email: Email addresses
 * - phone: Phone numbers with country code
 * - madid: Mobile advertiser ID (AAID or IDFA)
 * - appuid: Facebook app user ID
 * - pageuid: Facebook Page user ID
 * 
 * Optional columns:
 * - fn: First name
 * - ln: Last name
 * - ct: City
 * - st: State/Region
 * - country: ISO 2-letter country code
 * - zip: Zip/postal code
 * - dob: Date of birth
 * - doby: Year of birth
 * - gen: Gender (M/F)
 * - age: Age
 * - value: Customer value (numeric)
 * - add_to_messaging_cb_for_wa: WhatsApp messaging (Yes/blank)
 * - data_processing_options: LDU for California
 * - data_processing_options_state: 1000 for California
 * - data_processing_options_country: 1 for US
 */

interface Customer {
  id: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
  dateOfBirth?: string;
  gender?: 'M' | 'F';
  value?: number;
  addToWhatsApp?: boolean;
  isCaliforniaResident?: boolean;
}

interface ColumnConfig {
  key: keyof Customer | string;
  header: string;
  enabled: boolean;
  required: boolean;
  description: string;
  example: string;
}

const MAIN_IDENTIFIERS: ColumnConfig[] = [
  { key: 'email', header: 'email', enabled: true, required: true, description: 'Email addresses', example: 'john@example.com' },
  { key: 'phone', header: 'phone', enabled: true, required: false, description: 'Phone with country code', example: '+12223334444' },
];

const ADDITIONAL_IDENTIFIERS: ColumnConfig[] = [
  { key: 'firstName', header: 'fn', enabled: true, required: false, description: 'First name', example: 'John' },
  { key: 'lastName', header: 'ln', enabled: true, required: false, description: 'Last name', example: 'Doe' },
  { key: 'city', header: 'ct', enabled: false, required: false, description: 'City', example: 'Seattle' },
  { key: 'state', header: 'st', enabled: false, required: false, description: 'State/Region', example: 'WA' },
  { key: 'country', header: 'country', enabled: false, required: false, description: 'ISO country code', example: 'US' },
  { key: 'zip', header: 'zip', enabled: false, required: false, description: 'Zip/Postal code', example: '98101' },
  { key: 'dateOfBirth', header: 'dob', enabled: false, required: false, description: 'Date of birth (MMDDYYYY)', example: '01151990' },
  { key: 'gender', header: 'gen', enabled: false, required: false, description: 'Gender (M/F)', example: 'M' },
];

const OPTIONAL_COLUMNS: ColumnConfig[] = [
  { key: 'value', header: 'value', enabled: false, required: false, description: 'Customer value (numeric)', example: '150' },
  { key: 'addToWhatsApp', header: 'add_to_messaging_cb_for_wa', enabled: false, required: false, description: 'Add to WhatsApp audience', example: 'Yes' },
];

const DATA_PROCESSING_COLUMNS: ColumnConfig[] = [
  { key: 'dataProcessingOptions', header: 'data_processing_options', enabled: false, required: false, description: 'LDU for Limited Data Use', example: 'LDU' },
  { key: 'dataProcessingState', header: 'data_processing_options_state', enabled: false, required: false, description: '1000 for California', example: '1000' },
  { key: 'dataProcessingCountry', header: 'data_processing_options_country', enabled: false, required: false, description: '1 for US', example: '1' },
];

const SAMPLE_CUSTOMERS: Customer[] = [
  { id: '1', email: 'john.doe@example.com', phone: '+12125551234', firstName: 'John', lastName: 'Doe', city: 'New York', state: 'NY', country: 'US', zip: '10001', gender: 'M', value: 250 },
  { id: '2', email: 'jane.smith@example.com', phone: '+14155559876', firstName: 'Jane', lastName: 'Smith', city: 'San Francisco', state: 'CA', country: 'US', zip: '94102', gender: 'F', value: 180, isCaliforniaResident: true },
  { id: '3', email: 'bob.johnson@example.com', firstName: 'Bob', lastName: 'Johnson', city: 'Seattle', state: 'WA', country: 'US', zip: '98101', gender: 'M', value: 420 },
];

export function CustomerListExport() {
  const [open, setOpen] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [mainColumns, setMainColumns] = useState<ColumnConfig[]>(MAIN_IDENTIFIERS);
  const [additionalColumns, setAdditionalColumns] = useState<ColumnConfig[]>(ADDITIONAL_IDENTIFIERS);
  const [optionalColumns, setOptionalColumns] = useState<ColumnConfig[]>(OPTIONAL_COLUMNS);
  const [dataColumns, setDataColumns] = useState<ColumnConfig[]>(DATA_PROCESSING_COLUMNS);
  const [defaultCountry, setDefaultCountry] = useState('US');

  // Parse bulk input (CSV or line-separated)
  const parseBulkInput = () => {
    const lines = bulkInput.trim().split('\n').filter(Boolean);
    if (lines.length === 0) {
      toast.error('No data to parse');
      return;
    }

    const parsed: Customer[] = [];
    
    // Try to detect format
    const firstLine = lines[0];
    const isCSV = firstLine.includes(',');
    
    if (isCSV) {
      // CSV format with headers
      const headers = firstLine.toLowerCase().split(',').map(h => h.trim());
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const customer: Customer = { id: String(i) };
        
        headers.forEach((header, idx) => {
          const value = values[idx];
          if (!value) return;
          
          switch (header) {
            case 'email': customer.email = value; break;
            case 'phone': customer.phone = value; break;
            case 'fn':
            case 'first_name':
            case 'firstname': customer.firstName = value; break;
            case 'ln':
            case 'last_name':
            case 'lastname': customer.lastName = value; break;
            case 'ct':
            case 'city': customer.city = value; break;
            case 'st':
            case 'state': customer.state = value; break;
            case 'country': customer.country = value; break;
            case 'zip':
            case 'postal':
            case 'zipcode': customer.zip = value; break;
            case 'gen':
            case 'gender': customer.gender = value.toUpperCase() as 'M' | 'F'; break;
            case 'value': customer.value = parseFloat(value) || undefined; break;
          }
        });
        
        if (customer.email || customer.phone) {
          parsed.push(customer);
        }
      }
    } else {
      // Simple email list (one per line)
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.includes('@')) {
          parsed.push({ id: String(idx), email: trimmed });
        } else if (/^[\d+\-() ]+$/.test(trimmed)) {
          parsed.push({ id: String(idx), phone: trimmed });
        }
      });
    }

    if (parsed.length > 0) {
      setCustomers(parsed);
      toast.success(`Parsed ${parsed.length} customers`);
    } else {
      toast.error('Could not parse any valid customers');
    }
  };

  // Load sample data
  const loadSampleData = () => {
    setCustomers(SAMPLE_CUSTOMERS);
    toast.success('Loaded sample customer data');
  };

  // Toggle column
  const toggleColumn = (
    columns: ColumnConfig[],
    setColumns: React.Dispatch<React.SetStateAction<ColumnConfig[]>>,
    key: string
  ) => {
    setColumns(columns.map(col =>
      col.key === key ? { ...col, enabled: !col.enabled } : col
    ));
  };

  // Format phone number
  const formatPhone = (phone: string): string => {
    // Remove all non-numeric except +
    let cleaned = phone.replace(/[^\d+]/g, '');
    // Add + if missing and starts with number
    if (!cleaned.startsWith('+') && cleaned.length > 10) {
      cleaned = '+' + cleaned;
    }
    // Add US country code if missing
    if (!cleaned.startsWith('+') && cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    }
    return cleaned;
  };

  // Generate CSV
  const generateCSV = (): string => {
    if (customers.length === 0) {
      toast.error('No customers to export');
      return '';
    }

    // Get enabled columns
    const allColumns = [
      ...mainColumns.filter(c => c.enabled),
      ...additionalColumns.filter(c => c.enabled),
      ...optionalColumns.filter(c => c.enabled),
      ...dataColumns.filter(c => c.enabled),
    ];

    // Check for at least one main identifier
    const hasMainIdentifier = mainColumns.some(c => c.enabled);
    if (!hasMainIdentifier) {
      toast.error('At least one main identifier (email or phone) is required');
      return '';
    }

    // Build header row
    const headers = allColumns.map(c => c.header);

    // Build data rows
    const rows = customers.map(customer => {
      return allColumns.map(col => {
        switch (col.key) {
          case 'email': return customer.email || '';
          case 'phone': return customer.phone ? formatPhone(customer.phone) : '';
          case 'firstName': return customer.firstName || '';
          case 'lastName': return customer.lastName || '';
          case 'city': return customer.city || '';
          case 'state': return customer.state || '';
          case 'country': return customer.country || defaultCountry;
          case 'zip': return customer.zip || '';
          case 'dateOfBirth': return customer.dateOfBirth || '';
          case 'gender': return customer.gender || '';
          case 'value': return customer.value?.toString() || '';
          case 'addToWhatsApp': return customer.addToWhatsApp ? 'Yes' : '';
          case 'dataProcessingOptions': return customer.isCaliforniaResident ? 'LDU' : '';
          case 'dataProcessingState': return customer.isCaliforniaResident ? '1000' : '';
          case 'dataProcessingCountry': return customer.isCaliforniaResident ? '1' : '';
          default: return '';
        }
      }).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  };

  // Download CSV
  const handleExport = () => {
    const csv = generateCSV();
    if (!csv) return;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fb_custom_audience_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Exported ${customers.length} customers!`);
  };

  // Copy CSV
  const handleCopy = async () => {
    const csv = generateCSV();
    if (!csv) return;

    try {
      await navigator.clipboard.writeText(csv);
      toast.success('CSV copied to clipboard!');
    } catch {
      toast.error('Failed to copy');
    }
  };

  // Validation check
  const getValidationStatus = () => {
    const issues: string[] = [];
    
    if (customers.length < 100) {
      issues.push('Facebook recommends at least 100 customers for better matching');
    }
    
    const hasMainId = mainColumns.some(c => c.enabled);
    if (!hasMainId) {
      issues.push('At least one main identifier required');
    }

    const emailCount = customers.filter(c => c.email).length;
    const phoneCount = customers.filter(c => c.phone).length;
    
    if (mainColumns.find(c => c.key === 'email')?.enabled && emailCount < customers.length) {
      issues.push(`${customers.length - emailCount} customers missing email`);
    }

    return issues;
  };

  const validationIssues = getValidationStatus();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Users className="w-4 h-4" />
          Customer List Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Facebook Custom Audience Export
          </DialogTitle>
          <DialogDescription>
            Generate a customer list CSV for Facebook Ads custom audience targeting
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="data" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="data">Customer Data</TabsTrigger>
            <TabsTrigger value="columns">Columns</TabsTrigger>
            <TabsTrigger value="preview">Preview & Export</TabsTrigger>
          </TabsList>

          <TabsContent value="data" className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadSampleData}>
                Load Sample Data
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCustomers([])}
                disabled={customers.length === 0}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Paste Customer Data (CSV or email list)</Label>
              <Textarea
                placeholder={`email,fn,ln,phone
john@example.com,John,Doe,+12125551234
jane@example.com,Jane,Smith,+14155559876

Or simply paste emails:
john@example.com
jane@example.com`}
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
              <Button onClick={parseBulkInput} disabled={!bulkInput.trim()}>
                Parse Data
              </Button>
            </div>

            {customers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Parsed Customers</Label>
                  <Badge variant="outline">{customers.length} customers</Badge>
                </div>
                <ScrollArea className="h-[200px] border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Email</th>
                        <th className="p-2 text-left">Phone</th>
                        <th className="p-2 text-left">Name</th>
                        <th className="p-2 text-left">Location</th>
                        <th className="p-2 text-left">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.slice(0, 50).map((c) => (
                        <tr key={c.id} className="border-t">
                          <td className="p-2">{c.email || '-'}</td>
                          <td className="p-2">{c.phone || '-'}</td>
                          <td className="p-2">{[c.firstName, c.lastName].filter(Boolean).join(' ') || '-'}</td>
                          <td className="p-2">{[c.city, c.state].filter(Boolean).join(', ') || '-'}</td>
                          <td className="p-2">{c.value !== undefined ? `$${c.value}` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {customers.length > 50 && (
                    <p className="p-2 text-sm text-muted-foreground text-center">
                      Showing first 50 of {customers.length} customers
                    </p>
                  )}
                </ScrollArea>
              </div>
            )}
          </TabsContent>

          <TabsContent value="columns" className="space-y-6">
            <TooltipProvider>
              {/* Main Identifiers */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">Main Identifiers</h4>
                  <Badge variant="destructive" className="text-xs">Required</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  At least one main identifier is required for matching
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {mainColumns.map((col) => (
                    <div key={col.key} className="flex items-center gap-2 p-2 border rounded">
                      <Checkbox
                        checked={col.enabled}
                        onCheckedChange={() => toggleColumn(mainColumns, setMainColumns, col.key)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <Label className="font-mono text-sm">{col.header}</Label>
                          <Tooltip>
                            <TooltipTrigger>
                              <HelpCircle className="w-3 h-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{col.description}</p>
                              <p className="text-muted-foreground">Example: {col.example}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-xs text-muted-foreground">{col.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional Identifiers */}
              <div className="space-y-3">
                <h4 className="font-medium">Additional Identifiers (Recommended)</h4>
                <p className="text-sm text-muted-foreground">
                  Including these improves match rates
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {additionalColumns.map((col) => (
                    <div key={col.key} className="flex items-center gap-2 p-2 border rounded">
                      <Checkbox
                        checked={col.enabled}
                        onCheckedChange={() => toggleColumn(additionalColumns, setAdditionalColumns, col.key)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <Label className="font-mono text-sm">{col.header}</Label>
                          <Tooltip>
                            <TooltipTrigger>
                              <HelpCircle className="w-3 h-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{col.description}</p>
                              <p className="text-muted-foreground">Example: {col.example}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Default Country */}
              <div className="space-y-2">
                <Label>Default Country Code</Label>
                <Select value={defaultCountry} onValueChange={setDefaultCountry}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="US">US</SelectItem>
                    <SelectItem value="CA">CA</SelectItem>
                    <SelectItem value="GB">GB</SelectItem>
                    <SelectItem value="AU">AU</SelectItem>
                    <SelectItem value="DE">DE</SelectItem>
                    <SelectItem value="FR">FR</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Applied when country column is enabled but customer has no country set
                </p>
              </div>

              {/* Optional Columns */}
              <div className="space-y-3">
                <h4 className="font-medium">Optional Columns</h4>
                <div className="grid grid-cols-2 gap-3">
                  {optionalColumns.map((col) => (
                    <div key={col.key} className="flex items-center gap-2 p-2 border rounded">
                      <Checkbox
                        checked={col.enabled}
                        onCheckedChange={() => toggleColumn(optionalColumns, setOptionalColumns, col.key)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <Label className="font-mono text-sm">{col.header}</Label>
                          <Tooltip>
                            <TooltipTrigger>
                              <HelpCircle className="w-3 h-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{col.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data Processing */}
              <div className="space-y-3">
                <h4 className="font-medium">Data Processing Options (CCPA)</h4>
                <p className="text-sm text-muted-foreground">
                  For California Consumer Privacy Act compliance
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {dataColumns.map((col) => (
                    <div key={col.key} className="flex items-center gap-2 p-2 border rounded">
                      <Checkbox
                        checked={col.enabled}
                        onCheckedChange={() => toggleColumn(dataColumns, setDataColumns, col.key)}
                      />
                      <Label className="font-mono text-xs">{col.header}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </TooltipProvider>
          </TabsContent>

          <TabsContent value="preview" className="space-y-4">
            {/* Validation */}
            {validationIssues.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-yellow-700 dark:text-yellow-300">Validation Warnings</p>
                    <ul className="mt-1 text-sm text-yellow-600 dark:text-yellow-400 space-y-1">
                      {validationIssues.map((issue, i) => (
                        <li key={i}>• {issue}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold">{customers.length}</p>
                  <p className="text-sm text-muted-foreground">Customers</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold">
                    {[
                      ...mainColumns.filter(c => c.enabled),
                      ...additionalColumns.filter(c => c.enabled),
                      ...optionalColumns.filter(c => c.enabled),
                      ...dataColumns.filter(c => c.enabled),
                    ].length}
                  </p>
                  <p className="text-sm text-muted-foreground">Columns</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold">
                    {customers.filter(c => c.email).length}
                  </p>
                  <p className="text-sm text-muted-foreground">With Email</p>
                </CardContent>
              </Card>
            </div>

            {/* Preview */}
            {customers.length > 0 && (
              <div className="space-y-2">
                <Label>CSV Preview</Label>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-48 font-mono">
                  {generateCSV().split('\n').slice(0, 6).join('\n')}
                  {customers.length > 5 && '\n...'}
                </pre>
              </div>
            )}

            {/* Guidelines */}
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex gap-3">
                <FileSpreadsheet className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-blue-700 dark:text-blue-300">
                    Facebook Custom Audience Requirements
                  </p>
                  <ul className="mt-1 text-blue-600 dark:text-blue-400 space-y-1">
                    <li>• File format: CSV or TXT</li>
                    <li>• Minimum 100 customers recommended</li>
                    <li>• At least one main identifier required</li>
                    <li>• Phone numbers must include country code</li>
                    <li>• Countries must be ISO 2-letter codes</li>
                    <li>• Meta will hash the data during upload</li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleCopy} disabled={customers.length === 0}>
            <Copy className="w-4 h-4 mr-1" />
            Copy CSV
          </Button>
          <Button onClick={handleExport} disabled={customers.length === 0} className="gap-2">
            <Download className="w-4 h-4" />
            Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
