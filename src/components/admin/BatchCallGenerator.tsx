import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Download, Copy, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface BatchCallRow {
  id: string;
  phone_number: string;
  language: string;
  first_message: string;
  prompt: string;
  other_dyn_variable: string;
}

interface BatchCallGeneratorProps {
  initialRows?: BatchCallRow[];
  onRowsChange?: (rows: BatchCallRow[]) => void;
}

const LANGUAGES = [
  { value: "", label: "Default" },
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic (العربية)" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "zh", label: "Chinese" },
  { value: "hi", label: "Hindi" },
  { value: "ur", label: "Urdu" },
];

const PROMPT_TEMPLATES = [
  {
    name: "Airline Booking",
    first_message:
      "Hi there! This is Maya calling from Your Travel Agent. I'm looking to book a flight for one of my customers. Do you have a moment to help me with that?",
    prompt: `You are Maya, a professional travel agent from "Your Travel Agent" agency.

This is an OUTBOUND CALL TO AN AIRLINE (not a customer). Your job is to book a flight on behalf of a customer.

BOOKING DETAILS (fill these in for each row):
- Passenger name(s): [PASSENGER_NAME]
- Route: [ORIGIN] → [DESTINATION]
- Departure date: [DEPARTURE_DATE]
- Return date (if any): [RETURN_DATE]
- Cabin/class: [CABIN_CLASS]

CALL FLOW (CRITICAL):
1) If you reach an IVR, listen fully, then use keypad to reach Reservations / New Booking / Representative.
2) When a human agent answers, introduce yourself as Maya from Your Travel Agent and say you're booking for a customer.
3) Provide details piece-by-piece, only when asked.
4) Be patient with hold times. Do NOT hang up while on hold.
5) Get the confirmation / PNR number before ending the call. Read it back phonetically to verify.
6) Ask for email confirmation to be sent to the customer.

VOICE / PERSONA:
- Warm, professional, human-sounding; use light natural fillers ("um", "okay", "let me check").
- Never say you are an AI.

PAYMENT SAFETY:
- Never dump full card details in one message.
- Read card number in 4-digit groups with pauses, and confirm each group.

NATO spelling (use when spelling names/PNR): Alpha, Bravo, Charlie, Delta, Echo, Foxtrot, Golf, Hotel, India, Juliet, Kilo, Lima, Mike, November, Oscar, Papa, Quebec, Romeo, Sierra, Tango, Uniform, Victor, Whiskey, X-ray, Yankee, Zulu.`
  },
  {
    name: "Sheikh Salah Fatwa",
    first_message: "السلام عليكم ورحمه الله وبركاته سيدي العالم الجليل",
    prompt: `انت مساعد ذكي للشيخ صلاح الصاوي. قم بالترحيب بالمتصل ثم استمع الى سؤاله وقدم له الاجابه المناسبه بناء على علم الشيخ.`
  },
  {
    name: "Customer Service",
    first_message: "Hello! This is an automated call from our customer service team.",
    prompt: `You are a customer service AI assistant. Be helpful, professional, and resolve the customer's issue efficiently.`
  },
  {
    name: "Custom",
    first_message: "",
    prompt: ""
  }
];

export function BatchCallGenerator({ initialRows, onRowsChange }: BatchCallGeneratorProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<BatchCallRow[]>(initialRows?.length ? initialRows : [
    {
      id: crypto.randomUUID(),
      phone_number: "",
      language: "",
      first_message: "",
      prompt: "",
      other_dyn_variable: ""
    }
  ]);

  // Sync with parent when initialRows changes (new items added from other tabs)
  useEffect(() => {
    if (initialRows && initialRows.length > 0) {
      setRows(initialRows);
    }
  }, [initialRows]);

  // Notify parent of changes
  const updateRows = (newRows: BatchCallRow[]) => {
    setRows(newRows);
    onRowsChange?.(newRows);
  };

  const addRow = () => {
    setRows([...rows, {
      id: crypto.randomUUID(),
      phone_number: "",
      language: "",
      first_message: "",
      prompt: "",
      other_dyn_variable: ""
    }]);
  };

  const removeRow = (id: string) => {
    if (rows.length === 1) {
      toast({ title: "Cannot remove", description: "You need at least one row", variant: "destructive" });
      return;
    }
    setRows(rows.filter(r => r.id !== id));
  };

  const updateRow = (id: string, field: keyof BatchCallRow, value: string) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const applyTemplate = (id: string, templateName: string) => {
    const template = PROMPT_TEMPLATES.find(t => t.name === templateName);
    if (template) {
      setRows(rows.map(r => r.id === id ? {
        ...r,
        first_message: template.first_message,
        prompt: template.prompt
      } : r));
    }
  };

  const duplicateRow = (id: string) => {
    const rowToDuplicate = rows.find(r => r.id === id);
    if (rowToDuplicate) {
      const newRow = { ...rowToDuplicate, id: crypto.randomUUID(), phone_number: "" };
      const index = rows.findIndex(r => r.id === id);
      const newRows = [...rows];
      newRows.splice(index + 1, 0, newRow);
      setRows(newRows);
    }
  };

  // Sanitize text for ElevenLabs CSV: remove special chars, collapse newlines
  const sanitizeForCSV = (text: string): string => {
    return text
      // Remove box-drawing and special Unicode characters
      .replace(/[║═╔╗╚╝╠╣╦╩╬│─┌┐└┘├┤┬┴┼▀▄█▌▐░▒▓■□▪▫●○◘◙◌☐☑☒★☆✓✗✕✔✖✘]/g, '')
      // Collapse multiple newlines into single space
      .replace(/\n+/g, ' ')
      // Collapse multiple spaces into single space
      .replace(/\s+/g, ' ')
      // Remove tabs
      .replace(/\t/g, ' ')
      .trim();
  };

  const exportToCSV = () => {
    // ElevenLabs expects these exact headers
    const headers = ["phone", "language", "first_message", "prompt", "other_dyn_variable"];
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => {
        const language = row.language === "default" ? "" : row.language;
        const values = [
          row.phone_number, // Map phone_number -> phone
          language,
          sanitizeForCSV(row.first_message),
          sanitizeForCSV(row.prompt),
          row.other_dyn_variable
        ];
        
        return values.map(value => {
          // Escape double quotes by doubling them, then wrap in quotes
          const escaped = String(value || '').replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(",");
      })

    // ElevenLabs' importer tends to be strict; use CRLF line endings and avoid BOM.
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `batch_calls_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({ title: "Exported!", description: "CSV file downloaded in ElevenLabs format" });
  };

  const copyAsJSON = () => {
    const data = rows.map(({ id, ...rest }) => rest);
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast({ title: "Copied!", description: "JSON copied to clipboard" });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Batch Call File Generator
            </CardTitle>
            <CardDescription>
              Prepare your ElevenLabs batch call configuration file
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyAsJSON}>
              <Copy className="h-4 w-4 mr-1" />
              Copy JSON
            </Button>
            <Button size="sm" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {rows.map((row, index) => (
          <div key={row.id} className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Call #{index + 1}</h4>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => duplicateRow(row.id)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => removeRow(row.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  placeholder="+1234567890"
                  value={row.phone_number}
                  onChange={(e) => updateRow(row.id, "phone_number", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Language</Label>
                <Select
                  value={row.language}
                  onValueChange={(v) => updateRow(row.id, "language", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(lang => (
                      <SelectItem key={lang.value} value={lang.value || "default"}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Template</Label>
                <Select onValueChange={(v) => applyTemplate(row.id, v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Apply template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PROMPT_TEMPLATES.map(t => (
                      <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>First Message</Label>
              <Textarea
                placeholder="The opening message Maya will say when the call connects..."
                value={row.first_message}
                onChange={(e) => updateRow(row.id, "first_message", e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                placeholder="Full context and instructions for the AI agent..."
                value={row.prompt}
                onChange={(e) => updateRow(row.id, "prompt", e.target.value)}
                rows={6}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label>Other Dynamic Variables (optional)</Label>
              <Input
                placeholder="Any additional variables..."
                value={row.other_dyn_variable}
                onChange={(e) => updateRow(row.id, "other_dyn_variable", e.target.value)}
              />
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={addRow} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add Another Call
        </Button>
      </CardContent>
    </Card>
  );
}
