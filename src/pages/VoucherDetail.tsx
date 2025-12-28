import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { 
  ArrowLeft, 
  ShieldCheck, 
  Calendar, 
  CreditCard, 
  Mail, 
  AlertTriangle,
  Check,
  Loader2,
  HelpCircle
} from "lucide-react";
import { SupportButtons } from "@/components/SupportButtons";
import type { Tables } from "@/integrations/supabase/types";

// Public voucher type excludes sensitive redemption_notes field
type Voucher = Omit<Tables<"vouchers">, "redemption_notes">;

export default function VoucherDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Define safe columns that can be publicly displayed (excludes redemption_notes for security)
  const SAFE_VOUCHER_COLUMNS = "id,airline,title,type,face_value,sale_price,discount_percent,currency,expiry_date,verified_balance,is_refundable,is_transferable,redemption_method,delivery_method,verification_method,terms,status,image_url,created_at,updated_at";

  useEffect(() => {
    const fetchVoucher = async () => {
      if (!id) return;
      
      const { data, error } = await supabase
        .from("vouchers")
        .select(SAFE_VOUCHER_COLUMNS)
        .eq("id", id)
        .single();
      
      if (!error && data) {
        setVoucher(data);
      }
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    
    fetchVoucher();
  }, [id]);

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "No expiry date";
    return new Date(date).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const handlePurchase = () => {
    if (!user) {
      navigate(`/auth?redirect=/vouchers/${id}`);
      return;
    }
    navigate(`/checkout/voucher/${id}`);
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!voucher) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Voucher Not Found</h1>
            <Button onClick={() => navigate("/vouchers")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Vouchers
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4">
          {/* Back button */}
          <Button variant="ghost" onClick={() => navigate("/vouchers")} className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Vouchers
          </Button>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Header card */}
              <div className="glass-card p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center text-2xl font-bold text-primary">
                      {voucher.airline.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h1 className="font-display text-2xl md:text-3xl font-bold">{voucher.title}</h1>
                      <p className="text-muted-foreground">{voucher.airline}</p>
                    </div>
                  </div>
                  <div className="discount-badge text-lg">
                    -{Number(voucher.discount_percent)}%
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {voucher.verified_balance && (
                    <div className="verified-badge">
                      <ShieldCheck className="w-4 h-4" />
                      Verified Balance
                    </div>
                  )}
                  <Badge variant="secondary">{voucher.type}</Badge>
                  {voucher.is_refundable && <Badge variant="secondary">Refundable</Badge>}
                  {voucher.is_transferable && <Badge variant="secondary">Transferable</Badge>}
                </div>

                {/* Expiry */}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-5 h-5" />
                  <span>Expires: {formatDate(voucher.expiry_date)}</span>
                </div>
              </div>

              {/* Redemption info */}
              <div className="glass-card p-8">
                <h2 className="font-display text-xl font-semibold mb-4">How to Redeem</h2>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary font-bold text-sm">1</span>
                    </div>
                    <div>
                      <p className="font-medium">Redemption Method</p>
                      <p className="text-sm text-muted-foreground">{voucher.redemption_method || "Online"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary font-bold text-sm">2</span>
                    </div>
                    <div>
                      <p className="font-medium">Instructions</p>
                      <p className="text-sm text-muted-foreground">Detailed redemption instructions will be provided after purchase.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Delivery</p>
                      <p className="text-sm text-muted-foreground">{voucher.delivery_method || "Email within 24 hours"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Terms */}
              {voucher.terms && (
                <div className="glass-card p-8">
                  <h2 className="font-display text-xl font-semibold mb-4">Terms & Conditions</h2>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{voucher.terms}</p>
                </div>
              )}

              {/* Verification */}
              <div className="glass-card p-8">
                <h2 className="font-display text-xl font-semibold mb-4">Verification Details</h2>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-success">Verified Balance</p>
                    <p className="text-sm text-muted-foreground">
                      {voucher.verification_method || "Balance confirmed via airline customer service"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar - Purchase card */}
            <div className="lg:col-span-1">
              <div className="glass-card p-8 sticky top-24">
                <div className="text-center mb-6">
                  <div className="text-sm text-muted-foreground line-through mb-1">
                    Face Value: {formatCurrency(Number(voucher.face_value), voucher.currency || "USD")}
                  </div>
                  <div className="price-tag text-5xl mb-2">
                    {formatCurrency(Number(voucher.sale_price), voucher.currency || "USD")}
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-success/10 text-success text-sm font-medium">
                    <Check className="w-4 h-4" />
                    Save {formatCurrency(Number(voucher.face_value) - Number(voucher.sale_price), voucher.currency || "USD")}
                  </div>
                </div>

                <Button variant="hero" size="xl" className="w-full mb-4" onClick={handlePurchase}>
                  <CreditCard className="w-5 h-5" />
                  Purchase Now
                </Button>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ShieldCheck className="w-4 h-4 text-success" />
                    <span>Verified & Guaranteed</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-4 h-4 text-primary" />
                    <span>Fast Email Delivery</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CreditCard className="w-4 h-4 text-accent" />
                    <span>Card or Bitcoin Payment</span>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-lg bg-warning/10 border border-warning/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-warning">
                      This voucher is subject to airline terms. Review conditions before purchase.
                    </p>
                  </div>
                </div>

                {/* Support section */}
                <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 mb-3">
                    <HelpCircle className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Need Help?</span>
                  </div>
                  <SupportButtons variant="inline" showLabels />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
