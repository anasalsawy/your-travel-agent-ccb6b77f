import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Calendar, ArrowRight } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Voucher = Tables<"vouchers">;

interface VoucherCardProps {
  voucher: Voucher;
}

export function VoucherCard({ voucher }: VoucherCardProps) {
  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "No expiry";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="glass-card overflow-hidden hover-lift group">
      {/* Header with airline */}
      <div className="p-6 pb-4 border-b border-border/50">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-xl font-bold text-primary">
              {voucher.airline.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h3 className="font-display font-semibold text-lg">{voucher.airline}</h3>
              <p className="text-sm text-muted-foreground">{voucher.type}</p>
            </div>
          </div>
          <div className="discount-badge">
            -{Number(voucher.discount_percent)}%
          </div>
        </div>
        <h4 className="font-medium text-foreground">{voucher.title}</h4>
      </div>

      {/* Pricing */}
      <div className="p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-sm text-muted-foreground line-through">
              {formatCurrency(Number(voucher.face_value), voucher.currency || "USD")}
            </div>
            <div className="price-tag">
              {formatCurrency(Number(voucher.sale_price), voucher.currency || "USD")}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">You save</div>
            <div className="text-lg font-bold text-success">
              {formatCurrency(Number(voucher.face_value) - Number(voucher.sale_price), voucher.currency || "USD")}
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          {voucher.verified_balance && (
            <div className="verified-badge">
              <ShieldCheck className="w-3 h-3" />
              Verified
            </div>
          )}
          {voucher.is_refundable && (
            <Badge variant="secondary" className="text-xs">Refundable</Badge>
          )}
          {voucher.is_transferable && (
            <Badge variant="secondary" className="text-xs">Transferable</Badge>
          )}
        </div>

        {/* Expiry */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4" />
          <span>Expires: {formatDate(voucher.expiry_date)}</span>
        </div>

        {/* CTA */}
        <Button variant="hero" className="w-full group" asChild>
          <Link to={`/vouchers/${voucher.id}`}>
            View Details
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
