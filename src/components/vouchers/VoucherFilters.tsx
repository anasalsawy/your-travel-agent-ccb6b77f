import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

interface VoucherFiltersProps {
  airlines: string[];
  selectedAirline: string;
  onAirlineChange: (value: string) => void;
  selectedType: string;
  onTypeChange: (value: string) => void;
  discountRange: number[];
  onDiscountChange: (value: number[]) => void;
  onReset: () => void;
}

export function VoucherFilters({
  airlines,
  selectedAirline,
  onAirlineChange,
  selectedType,
  onTypeChange,
  discountRange,
  onDiscountChange,
  onReset,
}: VoucherFiltersProps) {
  return (
    <div className="glass-card p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">Filters</h3>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="w-4 h-4 mr-1" />
          Reset
        </Button>
      </div>

      {/* Airline filter */}
      <div className="space-y-2">
        <Label>Airline</Label>
        <Select value={selectedAirline} onValueChange={onAirlineChange}>
          <SelectTrigger>
            <SelectValue placeholder="All Airlines" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Airlines</SelectItem>
            {airlines.map((airline) => (
              <SelectItem key={airline} value={airline}>
                {airline}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Type filter */}
      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={selectedType} onValueChange={onTypeChange}>
          <SelectTrigger>
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="voucher">Voucher</SelectItem>
            <SelectItem value="certificate">Certificate</SelectItem>
            <SelectItem value="gift_card">Gift Card</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Discount range */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Min. Discount</Label>
          <span className="text-sm text-primary font-semibold">{discountRange[0]}%+</span>
        </div>
        <Slider
          value={discountRange}
          onValueChange={onDiscountChange}
          max={50}
          step={5}
          className="w-full"
        />
      </div>
    </div>
  );
}
