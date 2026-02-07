import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LayoutTemplate } from "lucide-react";

interface TemplateSelectorProps {
  selected: string;
  onSelect: (template: string) => void;
}

const TEMPLATES = [
  {
    id: "voucher_deals",
    name: "Voucher Deals",
    description: "Dark theme with gold accents, features top vouchers with pricing",
    icon: "✈️",
  },
  {
    id: "flash_sale",
    name: "Flash Sale",
    description: "Urgent red theme for limited-time promotions and flash deals",
    icon: "🔥",
  },
  {
    id: "simple_clean",
    name: "Simple & Clean",
    description: "Light, minimal design — professional and easy to read",
    icon: "📋",
  },
  {
    id: "maya_personal",
    name: "Maya Personal",
    description: "Personal note from Maya with purple AI branding",
    icon: "💜",
  },
  {
    id: "lowest_price_ad",
    name: "Lowest Price Ad",
    description: "Price-beat guarantee with popular routes, slashed prices & payment methods",
    icon: "🏷️",
  },
];

export function TemplateSelector({ selected, onSelect }: TemplateSelectorProps) {
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <LayoutTemplate className="w-5 h-5 text-primary" />
          Email Template
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => onSelect(template.id)}
              className={cn(
                "text-left p-4 rounded-lg border-2 transition-all duration-200",
                selected === template.id
                  ? "border-primary bg-primary/10 shadow-md"
                  : "border-border bg-card hover:border-primary/50 hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">{template.icon}</span>
                <span className="font-semibold text-sm">{template.name}</span>
              </div>
              <p className="text-xs text-muted-foreground">{template.description}</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
