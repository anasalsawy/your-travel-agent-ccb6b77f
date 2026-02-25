import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  Calendar,
  Car,
  CheckCircle2,
  Circle,
  Copy,
  Check,
  DollarSign,
  Loader2,
  Upload,
  Shield,
  Clock,
  ExternalLink,
} from "lucide-react";
import { PayPalBuyerProtection, PayPalIcon, PayPalTrustBadge } from "@/components/payment/PayPalBuyerProtection";
import { EscrowBuyerProtection, EscrowIcon, EscrowTrustBadge } from "@/components/payment/EscrowBuyerProtection";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type CarRentalRequest = Tables<"car_rental_requests">;
type PaymentMethod = "zelle" | "paypal" | "escrow";

interface CarRentalDetailProps {
  request: CarRentalRequest;
  onBack: () => void;
  onUpdate: () => void;
}

const STATUS_STEPS = [
  { key: "submitted", label: "Requested" },
  { key: "quoted", label: "Quoted" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
];

export function CarRentalDetail({ request, onBack, onUpdate }: CarRentalDetailProps) {
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("zelle");
  const [zelleEmail, setZelleEmail] = useState("Amalmsaid4@gmail.com");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [txHash, setTxHash] = useState("");

  useEffect(() => {
    const fetchSettings = async () => {
      const { data: settings } = await supabase
        .from("site_settings")
        .select("*")
        .in("key", ["zelle_email", "paypal_email"]);

      if (settings) {
        const zelle = settings.find((s) => s.key === "zelle_email");
        const paypal = settings.find((s) => s.key === "paypal_email");
        if (zelle?.value) setZelleEmail(zelle.value);
        if (paypal?.value) setPaypalEmail(paypal.value);
      }
    };
    fetchSettings();
  }, []);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Copied to clipboard." });
  };

  const getCurrentStepIndex = () => {
    switch (request.status) {
      case "completed": return 3;
      case "confirmed": return 2;
      case "quoted": return 1;
      default: return 0;
    }
  };

  const isQuoteReady = request.status === "quoted" && !!request.quoted_price;
  const isCancelled = request.status === "cancelled";
  const isConfirmed = request.status === "confirmed";
  const isCompleted = request.status === "completed";

  const handlePaymentSubmit = async () => {
    if (!request.quoted_price) return;

    if (!proofFile && !txHash) {
      toast({ title: "Error", description: "Please upload payment proof or enter transaction details.", variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      let proofUrl = "";
      if (proofFile) {
        const fileExt = proofFile.name.split(".").pop();
        const fileName = `car-rentals/${request.id}/payment-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("proof-uploads").upload(fileName, proofFile);
        if (!uploadError) proofUrl = fileName;
      }

      // Update status to confirmed (admin will verify)
      const { error: updateError } = await supabase
        .from("car_rental_requests")
        .update({
          status: "confirmed",
          admin_notes: `${request.admin_notes || ""}\n[Payment] ${paymentMethod.toUpperCase()} proof: ${proofUrl || txHash}`.trim(),
        })
        .eq("id", request.id);

      if (updateError) throw updateError;

      toast({ title: "Payment Submitted!", description: "We'll verify your payment and confirm your rental shortly." });
      setProofFile(null);
      setTxHash("");
      onUpdate();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to submit payment.", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="w-4 h-4" /> Back to Rentals
      </Button>

      {/* Status Progress */}
      {!isCancelled && (
        <div className="glass-card p-6">
          <h3 className="font-semibold mb-4">Rental Status</h3>
          <div className="flex items-center justify-between">
            {STATUS_STEPS.map((step, i) => {
              const currentStep = getCurrentStepIndex();
              const isActive = i <= currentStep;
              return (
                <div key={step.key} className="flex items-center gap-2 flex-1">
                  <div className="flex flex-col items-center">
                    {isActive ? (
                      <CheckCircle2 className="w-6 h-6 text-success" />
                    ) : (
                      <Circle className="w-6 h-6 text-muted-foreground" />
                    )}
                    <span className={`text-xs mt-1 ${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 ${i < currentStep ? "bg-success" : "bg-border"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cancelled Banner */}
      {isCancelled && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30">
          <p className="font-semibold text-destructive">This rental request has been cancelled.</p>
        </div>
      )}

      {/* Rental Details */}
      <div className="glass-card p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Car className="w-5 h-5 text-primary" /> Rental Details
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Pickup Location</span>
            <p className="font-medium">{request.pickup_location}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Dropoff Location</span>
            <p className="font-medium">{request.dropoff_location || "Same as pickup"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Pickup Date</span>
            <p className="font-medium flex items-center gap-1">
              <Calendar className="w-4 h-4" /> {formatDate(request.pickup_date)}
              {request.pickup_time && ` at ${request.pickup_time}`}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Dropoff Date</span>
            <p className="font-medium flex items-center gap-1">
              <Calendar className="w-4 h-4" /> {formatDate(request.dropoff_date)}
              {request.dropoff_time && ` at ${request.dropoff_time}`}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Car Type</span>
            <p className="font-medium">{request.car_type || "Any"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Transmission</span>
            <p className="font-medium">{request.transmission || "Any"}</p>
          </div>
          {request.budget && (
            <div>
              <span className="text-muted-foreground">Your Budget</span>
              <p className="font-medium">{formatCurrency(Number(request.budget))}</p>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Extras</span>
            <p className="font-medium">
              {[request.needs_insurance && "Insurance", request.needs_gps && "GPS", request.needs_child_seat && "Child Seat"]
                .filter(Boolean)
                .join(", ") || "None"}
            </p>
          </div>
        </div>
        {request.special_notes && (
          <div className="mt-4 text-sm">
            <span className="text-muted-foreground">Special Notes</span>
            <p className="italic">{request.special_notes}</p>
          </div>
        )}
      </div>

      {/* Quote Section */}
      {request.quoted_price && (
        <div className="glass-card p-6 border-2 border-accent/30">
          <h3 className="font-semibold mb-2">Your Quote</h3>
          <div className="text-3xl font-bold text-gradient mb-2">
            {formatCurrency(Number(request.quoted_price))}
          </div>
          {request.rental_company && (
            <p className="text-sm text-muted-foreground">Rental Company: {request.rental_company}</p>
          )}
        </div>
      )}

      {/* Payment Section - only when quoted and not yet confirmed/completed */}
      {isQuoteReady && !isConfirmed && !isCompleted && (
        <div className="glass-card p-6 space-y-6">
          <h3 className="font-semibold">Confirm & Pay</h3>
          <p className="text-sm text-muted-foreground">
            Choose a payment method to confirm your car rental booking.
          </p>

          {/* Payment Method Selection */}
          <RadioGroup
            value={paymentMethod}
            onValueChange={(v) => {
              setPaymentMethod(v as PaymentMethod);
              setProofFile(null);
              setTxHash("");
            }}
            className="space-y-3"
          >
            <div className={`flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${paymentMethod === "zelle" ? "border-primary bg-primary/5" : "border-border"}`}>
              <RadioGroupItem value="zelle" id="r-zelle" />
              <Label htmlFor="r-zelle" className="flex items-center gap-3 cursor-pointer flex-1">
                <DollarSign className="w-5 h-5 text-[#6D1ED4]" />
                <div>
                  <p className="font-medium">Zelle</p>
                  <p className="text-xs text-muted-foreground">Send payment via Zelle</p>
                </div>
              </Label>
            </div>

            <div className={`relative flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${paymentMethod === "escrow" ? "border-[#00A651] bg-[#00A651]/5" : "border-border"}`}>
              <RadioGroupItem value="escrow" id="r-escrow" />
              <Label htmlFor="r-escrow" className="flex items-center gap-3 cursor-pointer flex-1">
                <EscrowIcon className="w-5 h-5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">Escrow.com</p>
                    <EscrowTrustBadge compact />
                  </div>
                  <p className="text-xs text-muted-foreground">Maximum buyer protection</p>
                </div>
              </Label>
            </div>

            <div className={`relative flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${paymentMethod === "paypal" ? "border-[#0070BA] bg-[#0070BA]/5" : "border-border"}`}>
              <RadioGroupItem value="paypal" id="r-paypal" />
              <Label htmlFor="r-paypal" className="flex items-center gap-3 cursor-pointer flex-1">
                <PayPalIcon />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">PayPal</p>
                    <PayPalTrustBadge compact />
                  </div>
                  <p className="text-xs text-muted-foreground">Protected by PayPal Buyer Protection</p>
                </div>
              </Label>
            </div>
          </RadioGroup>

          {/* Payment Instructions */}
          {paymentMethod === "zelle" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#6D1ED4]/10 border border-[#6D1ED4]/30 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount to Send</span>
                  <span className="font-bold text-lg">{formatCurrency(Number(request.quoted_price))}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Send Zelle payment to:</Label>
                <div className="flex gap-2">
                  <Input value={zelleEmail} readOnly className="bg-card font-mono text-sm" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(zelleEmail)}>
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Upload Payment Screenshot</Label>
                <div className="flex items-center gap-2">
                  <Input type="file" accept="image/*" onChange={(e) => setProofFile(e.target.files?.[0] || null)} className="flex-1" />
                  {proofFile && (
                    <Badge variant="outline" className="text-success">
                      <Check className="w-3 h-3 mr-1" />
                      {proofFile.name.slice(0, 20)}...
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}

          {paymentMethod === "escrow" && (
            <div className="space-y-4">
              <EscrowBuyerProtection />
              <div className="p-4 rounded-xl bg-[#00A651]/10 border border-[#00A651]/30">
                <p className="text-sm">Amount: <strong>{formatCurrency(Number(request.quoted_price))}</strong></p>
                <p className="text-sm text-muted-foreground mt-2">
                  We'll set up an Escrow.com transaction. Your funds are held securely until the rental is confirmed.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Transaction Reference (optional)</Label>
                <Input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="Escrow transaction ID or reference" />
              </div>
            </div>
          )}

          {paymentMethod === "paypal" && (
            <div className="space-y-4">
              <PayPalBuyerProtection />
              <div className="p-4 rounded-xl bg-[#0070BA]/10 border border-[#0070BA]/30 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold text-lg">{formatCurrency(Number(request.quoted_price))}</span>
                </div>
                <p className="text-sm">Send to: <strong>{paypalEmail || "payments@yourtravelagent.com"}</strong></p>
              </div>
              <div className="space-y-2">
                <Label>Upload Payment Screenshot</Label>
                <div className="flex items-center gap-2">
                  <Input type="file" accept="image/*" onChange={(e) => setProofFile(e.target.files?.[0] || null)} className="flex-1" />
                  {proofFile && (
                    <Badge variant="outline" className="text-success">
                      <Check className="w-3 h-3 mr-1" />
                      {proofFile.name.slice(0, 20)}...
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <Button onClick={handlePaymentSubmit} disabled={processing} className="w-full" variant="hero">
            {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
            Confirm & Pay {formatCurrency(Number(request.quoted_price))}
          </Button>
        </div>
      )}

      {/* Confirmed Message */}
      {isConfirmed && (
        <div className="p-4 rounded-xl bg-success/10 border border-success/30">
          <p className="font-semibold text-success">🎉 Your car rental is confirmed!</p>
          <p className="text-sm text-muted-foreground mt-1">We'll send you rental details closer to your pickup date.</p>
          {request.rental_company && (
            <p className="text-sm mt-2"><strong>Company:</strong> {request.rental_company}</p>
          )}
        </div>
      )}

      {/* Completed Message */}
      {isCompleted && (
        <div className="p-4 rounded-xl bg-success/10 border border-success/30">
          <p className="font-semibold text-success">✅ Rental completed. Thank you!</p>
        </div>
      )}

      {/* Submitted - waiting for quote */}
      {request.status === "submitted" && (
        <div className="p-4 rounded-xl bg-warning/10 border border-warning/30 flex items-center gap-3">
          <Clock className="w-5 h-5 text-warning" />
          <div>
            <p className="font-semibold text-warning">Quote Pending</p>
            <p className="text-sm text-muted-foreground">Our team is reviewing your request. We'll send you a quote shortly.</p>
          </div>
        </div>
      )}
    </div>
  );
}
