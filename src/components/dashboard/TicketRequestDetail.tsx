import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { 
  Loader2, 
  CreditCard, 
  Bitcoin, 
  DollarSign, 
  Upload, 
  Copy, 
  Check,
  ArrowLeft,
  Calendar,
  Plane,
  CheckCircle2,
  Circle,
  MessageSquare
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { notifyTicketPaymentProofUploaded, notifyCustomerTicketPaymentUnderReview } from "@/lib/notifications";

type TicketRequest = Tables<"ticket_requests">;
type PaymentMethod = "stripe" | "bitcoin" | "zelle";

interface TicketRequestDetailProps {
  request: TicketRequest;
  onBack: () => void;
  onUpdate: () => void;
}

const STATUS_STEPS = [
  { key: "submitted", label: "Requested" },
  { key: "quoted", label: "Quoted" },
  { key: "paid", label: "Payment Pending" },
  { key: "processing", label: "Under Review" },
  { key: "ticketed", label: "Ticket Issued" },
  { key: "completed", label: "Completed" },
];

export function TicketRequestDetail({ request, onBack, onUpdate }: TicketRequestDetailProps) {
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("zelle");
  const [btcAddress, setBtcAddress] = useState("");
  const [btcRate, setBtcRate] = useState("43500");
  const [zelleEmail, setZelleEmail] = useState("Amalmsaid4@gmail.com");
  const [copied, setCopied] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data: settings } = await supabase
        .from("site_settings")
        .select("*")
        .in("key", ["btc_address", "btc_rate", "zelle_email"]);
      
      if (settings) {
        const address = settings.find(s => s.key === "btc_address");
        const rate = settings.find(s => s.key === "btc_rate");
        const zelle = settings.find(s => s.key === "zelle_email");
        if (address?.value) setBtcAddress(address.value);
        if (rate?.value) setBtcRate(rate.value);
        if (zelle?.value) setZelleEmail(zelle.value);
      }
    };
    fetchSettings();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const btcAmount = request.quoted_price 
    ? (Number(request.quoted_price) / parseFloat(btcRate)).toFixed(8) 
    : "0";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Copied to clipboard." });
  };

  const getCurrentStepIndex = () => {
    const status = request.status || "submitted";
    const paymentStatus = request.payment_status;
    
    if (status === "completed") return 5;
    if (status === "ticketed") return 4;
    if (paymentStatus === "processing") return 3;
    if (status === "paid" || paymentStatus === "completed") return 2;
    if (status === "quoted") return 1;
    return 0;
  };

  const isQuoteReady = request.status === "quoted" || !!request.quoted_price;
  const isPaymentRejected = request.payment_status === "failed";
  const canPay = isQuoteReady && request.payment_status !== "completed" && request.payment_status !== "processing";
  const isPaymentPending = request.payment_status === "processing";

  const handlePaymentSubmit = async () => {
    if (!request.quoted_price) return;
    
    if (paymentMethod !== "stripe" && !proofFile && !txHash) {
      toast({
        title: "Error",
        description: "Please upload payment proof or enter transaction details.",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);

    try {
      let proofUrl = "";
      
      if (proofFile) {
        const fileExt = proofFile.name.split('.').pop();
        const fileName = `ticket-requests/${request.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("proof-uploads")
          .upload(fileName, proofFile);
        
        if (!uploadError) {
          proofUrl = fileName;
        }
      }

      // Update ticket request with payment info
      const { error: updateError } = await supabase
        .from("ticket_requests")
        .update({
          payment_method: paymentMethod,
          payment_status: paymentMethod === "stripe" ? "pending" : "processing",
          proof_upload_url: proofUrl || txHash || null,
          btc_address: paymentMethod === "bitcoin" ? btcAddress : null,
          btc_amount: paymentMethod === "bitcoin" ? btcAmount : null,
        })
        .eq("id", request.id);

      if (updateError) throw updateError;

      // Send notifications for proof upload
      if (paymentMethod !== "stripe") {
        await Promise.allSettled([
          notifyTicketPaymentProofUploaded({
            requestId: request.id,
            origin: request.origin,
            destination: request.destination,
            amount: Number(request.quoted_price),
            paymentMethod: paymentMethod === "bitcoin" ? "Bitcoin" : "Zelle",
          }),
          notifyCustomerTicketPaymentUnderReview(request.contact_email, {
            requestId: request.id,
            origin: request.origin,
            destination: request.destination,
            amount: Number(request.quoted_price),
          }),
        ]);
      }

      toast({
        title: paymentMethod === "stripe" ? "Redirecting to payment..." : "Payment Submitted!",
        description: paymentMethod === "stripe" 
          ? "Please complete payment on the next page."
          : "We'll verify your payment and issue your ticket shortly.",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit payment.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" onClick={onBack} className="mb-2">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Requests
      </Button>

      {/* Status Tracker */}
      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-semibold mb-6">Request Status</h3>
        <div className="flex items-center justify-between relative">
          {/* Progress line */}
          <div className="absolute top-4 left-0 right-0 h-0.5 bg-border" />
          <div 
            className="absolute top-4 left-0 h-0.5 bg-primary transition-all duration-500"
            style={{ width: `${(getCurrentStepIndex() / (STATUS_STEPS.length - 1)) * 100}%` }}
          />
          
          {STATUS_STEPS.map((step, index) => {
            const currentIndex = getCurrentStepIndex();
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isCancelled = request.status === "cancelled";
            
            return (
              <div key={step.key} className="flex flex-col items-center relative z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  isCancelled 
                    ? "bg-destructive/20 text-destructive" 
                    : isCompleted 
                      ? "bg-primary text-primary-foreground" 
                      : isCurrent 
                        ? "bg-primary/20 border-2 border-primary text-primary"
                        : "bg-muted text-muted-foreground"
                }`}>
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                </div>
                <span className={`text-xs mt-2 text-center max-w-[80px] ${
                  isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Request Details */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Plane className="w-6 h-6 text-accent" />
          <h3 className="font-display text-xl font-semibold">
            {request.origin} → {request.destination}
          </h3>
          <Badge className={`ml-auto ${
            request.status === "completed" || request.status === "ticketed" 
              ? "bg-success/20 text-success"
              : request.status === "cancelled"
                ? "bg-destructive/20 text-destructive"
                : "bg-warning/20 text-warning"
          }`}>
            {request.status}
          </Badge>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>
              {formatDate(request.departure_date)}
              {request.return_date && ` - ${formatDate(request.return_date)}`}
            </span>
          </div>
          <div className="text-muted-foreground">
            {request.passengers} passenger(s) • {request.cabin_class}
          </div>
          {request.preferred_airline && (
            <div className="text-muted-foreground">
              Preferred: {request.preferred_airline}
            </div>
          )}
          {request.flexibility && (
            <div className="text-muted-foreground">
              Flexibility: {request.flexibility}
            </div>
          )}
        </div>

        {request.special_notes && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground">{request.special_notes}</p>
          </div>
        )}
      </div>

      {/* Quote Section - Only show when quote is ready */}
      {isQuoteReady && (
        <div className="glass-card p-6 border-2 border-primary/30">
          <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            Quote Ready
          </h3>
          
          <div className="text-center py-4">
            <div className="text-sm text-muted-foreground mb-1">Your Quoted Price</div>
            <div className="font-display text-4xl font-bold text-gradient">
              {formatCurrency(Number(request.quoted_price))}
            </div>
          </div>

          {request.admin_notes && (
            <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm font-medium text-primary mb-1">Note from Agent:</p>
              <p className="text-sm text-muted-foreground">{request.admin_notes}</p>
            </div>
          )}

          {/* Payment Rejected Notice */}
          {isPaymentRejected && (
            <div className="mt-4 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
              <p className="text-sm font-medium text-destructive mb-2">⚠️ Payment Verification Failed</p>
              <p className="text-sm text-muted-foreground mb-3">
                Your previous payment proof could not be verified. Please review the notes below and re-upload your payment proof.
              </p>
              {request.admin_notes && request.admin_notes.includes("Payment rejected") && (
                <div className="p-3 rounded bg-destructive/5 text-sm">
                  <strong>Reason:</strong> {request.admin_notes.split("Payment rejected:")[1]?.split("\n")[0] || "See notes above"}
                </div>
              )}
            </div>
          )}

          {/* Payment Section */}
          {canPay && (
            <div className="mt-6 space-y-4">
              <div className={`p-4 rounded-lg border ${isPaymentRejected ? "bg-warning/10 border-warning/30" : "bg-accent/10 border-accent/20"}`}>
                <p className={`text-sm font-medium ${isPaymentRejected ? "text-warning" : "text-accent"}`}>
                  {isPaymentRejected 
                    ? "🔄 Please re-upload your payment proof below."
                    : "✨ To proceed, confirm and pay using one of the options below."
                  }
                </p>
              </div>

              <h4 className="font-semibold text-sm">Select Payment Method</h4>
              
              <RadioGroup
                value={paymentMethod}
                onValueChange={(v) => { setPaymentMethod(v as PaymentMethod); setProofFile(null); setTxHash(""); }}
                className="space-y-3"
              >
                <div className={`flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
                  paymentMethod === "zelle" ? "border-primary bg-primary/5" : "border-border"
                }`}>
                  <RadioGroupItem value="zelle" id="zelle" />
                  <Label htmlFor="zelle" className="flex items-center gap-3 cursor-pointer flex-1">
                    <DollarSign className="w-5 h-5 text-[#6D1ED4]" />
                    <div>
                      <p className="font-medium">Zelle</p>
                      <p className="text-xs text-muted-foreground">Send payment via Zelle</p>
                    </div>
                  </Label>
                </div>

                <div className={`flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
                  paymentMethod === "bitcoin" ? "border-primary bg-primary/5" : "border-border"
                }`}>
                  <RadioGroupItem value="bitcoin" id="bitcoin" />
                  <Label htmlFor="bitcoin" className="flex items-center gap-3 cursor-pointer flex-1">
                    <Bitcoin className="w-5 h-5 text-warning" />
                    <div>
                      <p className="font-medium">Bitcoin</p>
                      <p className="text-xs text-muted-foreground">Pay with cryptocurrency</p>
                    </div>
                  </Label>
                </div>

                <div className={`flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
                  paymentMethod === "stripe" ? "border-primary bg-primary/5" : "border-border"
                }`}>
                  <RadioGroupItem value="stripe" id="stripe" />
                  <Label htmlFor="stripe" className="flex items-center gap-3 cursor-pointer flex-1">
                    <CreditCard className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-medium">Credit/Debit Card</p>
                      <p className="text-xs text-muted-foreground">Secure payment via Stripe</p>
                    </div>
                  </Label>
                </div>
              </RadioGroup>

              {/* Zelle Instructions */}
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
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                        className="flex-1"
                      />
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

              {/* Bitcoin Instructions */}
              {paymentMethod === "bitcoin" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-warning/10 border border-warning/30 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">USD Amount</span>
                      <span className="font-semibold">{formatCurrency(Number(request.quoted_price))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">BTC Amount</span>
                      <span className="font-bold text-warning">{btcAmount} BTC</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Send Bitcoin to:</Label>
                    <div className="flex gap-2">
                      <Input value={btcAddress} readOnly className="bg-card font-mono text-xs" />
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(btcAddress)}>
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Transaction Hash (optional)</Label>
                    <Input
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                      placeholder="Enter transaction hash"
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Or Upload Payment Proof</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                    />
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <Button 
                variant="hero" 
                size="lg" 
                className="w-full mt-4" 
                onClick={handlePaymentSubmit}
                disabled={processing}
              >
                {processing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {paymentMethod === "stripe" ? (
                  <>Pay {formatCurrency(Number(request.quoted_price))}</>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Submit Payment Proof
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Payment Under Review */}
          {isPaymentPending && (
            <div className="mt-6 p-4 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-sm font-medium text-warning mb-1">⏳ Payment Under Review</p>
              <p className="text-sm text-muted-foreground">
                We've received your payment proof and are verifying it. You'll receive an email once confirmed.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Ticket Issued */}
      {request.issued_ticket_info && (
        <div className="glass-card p-6 border-2 border-success/30">
          <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2 text-success">
            <CheckCircle2 className="w-5 h-5" />
            Ticket Issued
          </h3>
          <div className="p-4 rounded-lg bg-success/10">
            <p className="text-sm whitespace-pre-line">{request.issued_ticket_info}</p>
          </div>
        </div>
      )}

      {/* Contact Support */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold">Need Help?</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Have questions about your quote or need to make changes? Contact our support team.
        </p>
        <Button variant="outline" onClick={() => window.open("https://wa.me/1234567890", "_blank")}>
          Contact Support
        </Button>
      </div>
    </div>
  );
}
