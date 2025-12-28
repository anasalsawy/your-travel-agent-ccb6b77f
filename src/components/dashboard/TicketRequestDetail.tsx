import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { 
  Loader2, 
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
  MessageSquare,
  AlertTriangle,
  Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { 
  notifyTicketPaymentProofUploaded, 
  notifyCustomerTicketPaymentUnderReview,
  notifyDepositProofUploaded,
  notifyCustomerDepositUnderReview,
  notifyBalanceProofUploaded,
  notifyCustomerBalanceUnderReview
} from "@/lib/notifications";

type TicketRequest = Tables<"ticket_requests"> & {
  payment_plan?: string;
  deposit_amount?: number | null;
  balance_amount?: number | null;
  balance_due_date?: string | null;
  deposit_status?: string;
  balance_status?: string;
  deposit_proof_url?: string | null;
  balance_proof_url?: string | null;
};
type PaymentMethod = "bitcoin" | "zelle";

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
  const [splitPaymentsEnabled, setSplitPaymentsEnabled] = useState(false);
  const [paymentChoice, setPaymentChoice] = useState<'full' | 'deposit'>('full');

  useEffect(() => {
    const fetchSettings = async () => {
      const { data: settings } = await supabase
        .from("site_settings")
        .select("*")
        .in("key", ["btc_address", "btc_rate", "zelle_email", "enable_split_payments"]);
      
      if (settings) {
        const address = settings.find(s => s.key === "btc_address");
        const rate = settings.find(s => s.key === "btc_rate");
        const zelle = settings.find(s => s.key === "zelle_email");
        const splitPayments = settings.find(s => s.key === "enable_split_payments");
        if (address?.value) setBtcAddress(address.value);
        if (rate?.value) setBtcRate(rate.value);
        if (zelle?.value) setZelleEmail(zelle.value);
        if (splitPayments?.value === "true") setSplitPaymentsEnabled(true);
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

  // Calculate deposit amount (50% of quoted price)
  const depositAmount = request.deposit_amount || (request.quoted_price ? Math.round(Number(request.quoted_price) * 0.5) : 0);
  const balanceAmount = request.balance_amount || (request.quoted_price ? Number(request.quoted_price) - depositAmount : 0);
  
  // Calculate balance due date (departure - 3 days)
  const calculateBalanceDueDate = () => {
    if (request.balance_due_date) return request.balance_due_date;
    const departure = new Date(request.departure_date);
    departure.setDate(departure.getDate() - 3);
    return departure.toISOString().split('T')[0];
  };

  const btcAmountForPayment = (amount: number) => (amount / parseFloat(btcRate)).toFixed(8);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Copied to clipboard." });
  };

  const getCurrentStepIndex = () => {
    const status = request.status || "submitted";
    const paymentStatus = request.payment_status;
    const paymentPlan = request.payment_plan || 'full';
    
    if (status === "completed") return 5;
    if (status === "ticketed") return 4;
    
    // For deposit payments, check deposit_status
    if (paymentPlan === 'deposit') {
      if (request.deposit_status === 'under_review') return 3;
      if (request.deposit_status === 'approved') {
        if (request.balance_status === 'under_review') return 3;
        if (request.balance_status === 'approved') return 4;
        return 4; // Ticket issued, waiting for balance
      }
    }
    
    if (paymentStatus === "processing") return 3;
    if (status === "paid" || paymentStatus === "completed") return 2;
    if (status === "quoted") return 1;
    return 0;
  };

  const isQuoteReady = request.status === "quoted" || !!request.quoted_price;
  const isPaymentRejected = request.payment_status === "failed";
  const isDepositRejected = request.deposit_status === 'rejected';
  const isBalanceRejected = request.balance_status === 'rejected';
  
  // Determine if this is a split payment request
  const isSplitPayment = request.payment_plan === 'deposit';
  
  // Determine current payment state for split payments
  const isDepositPending = isSplitPayment && request.deposit_status === 'under_review';
  const isDepositApproved = isSplitPayment && request.deposit_status === 'approved';
  const isBalanceDue = isDepositApproved && ['due', 'past_due'].includes(request.balance_status || 'not_due');
  const isBalancePending = isSplitPayment && request.balance_status === 'under_review';
  const isBalanceApproved = isSplitPayment && request.balance_status === 'approved';
  const isBalancePastDue = request.balance_status === 'past_due';
  
  // Can pay full or deposit (for quoted requests without payment yet)
  const canPayFull = isQuoteReady && !isSplitPayment && request.payment_status !== "completed" && request.payment_status !== "processing";
  const canPayDeposit = isQuoteReady && !isSplitPayment && request.payment_status !== "completed" && request.deposit_status !== 'approved' && request.deposit_status !== 'under_review';
  const canPayBalance = isDepositApproved && isBalanceDue && !isBalancePending;
  
  const isPaymentPending = request.payment_status === "processing" || isDepositPending || isBalancePending;

  const handlePaymentSubmit = async (paymentType: 'full' | 'deposit' | 'balance') => {
    if (!request.quoted_price) return;
    
    if (!proofFile && !txHash) {
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
        const fileName = `ticket-requests/${request.id}/${paymentType}-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("proof-uploads")
          .upload(fileName, proofFile);
        
        if (!uploadError) {
          proofUrl = fileName;
        }
      }

      const proofValue = proofUrl || txHash || null;

      if (paymentType === 'full') {
        // Full payment - existing flow
        const { error: updateError } = await supabase
          .from("ticket_requests")
          .update({
            payment_method: paymentMethod,
            payment_status: "processing",
            payment_plan: "full",
            proof_upload_url: proofValue,
            btc_address: paymentMethod === "bitcoin" ? btcAddress : null,
            btc_amount: paymentMethod === "bitcoin" ? btcAmountForPayment(Number(request.quoted_price)) : null,
          })
          .eq("id", request.id);

        if (updateError) throw updateError;

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

        toast({
          title: "Payment Submitted!",
          description: "We'll verify your payment and issue your ticket shortly.",
        });
      } else if (paymentType === 'deposit') {
        // Deposit payment
        const balanceDueDate = calculateBalanceDueDate();
        
        const { error: updateError } = await supabase
          .from("ticket_requests")
          .update({
            payment_method: paymentMethod,
            payment_plan: "deposit",
            deposit_status: "under_review",
            deposit_amount: depositAmount,
            balance_amount: balanceAmount,
            balance_due_date: balanceDueDate,
            deposit_proof_url: proofValue,
            btc_address: paymentMethod === "bitcoin" ? btcAddress : null,
            btc_amount: paymentMethod === "bitcoin" ? btcAmountForPayment(depositAmount) : null,
          })
          .eq("id", request.id);

        if (updateError) throw updateError;

        await Promise.allSettled([
          notifyDepositProofUploaded({
            requestId: request.id,
            origin: request.origin,
            destination: request.destination,
            depositAmount: depositAmount,
            paymentMethod: paymentMethod === "bitcoin" ? "Bitcoin" : "Zelle",
          }),
          notifyCustomerDepositUnderReview(request.contact_email, {
            requestId: request.id,
            origin: request.origin,
            destination: request.destination,
            depositAmount: depositAmount,
          }),
        ]);

        toast({
          title: "Deposit Submitted!",
          description: "We'll verify your deposit and send you ticket details once approved.",
        });
      } else if (paymentType === 'balance') {
        // Balance payment
        const { error: updateError } = await supabase
          .from("ticket_requests")
          .update({
            balance_status: "under_review",
            balance_proof_url: proofValue,
          })
          .eq("id", request.id);

        if (updateError) throw updateError;

        await Promise.allSettled([
          notifyBalanceProofUploaded({
            requestId: request.id,
            origin: request.origin,
            destination: request.destination,
            balanceAmount: balanceAmount,
            paymentMethod: paymentMethod === "bitcoin" ? "Bitcoin" : "Zelle",
          }),
          notifyCustomerBalanceUnderReview(request.contact_email, {
            requestId: request.id,
            origin: request.origin,
            destination: request.destination,
            balanceAmount: balanceAmount,
          }),
        ]);

        toast({
          title: "Balance Payment Submitted!",
          description: "We'll verify your payment shortly.",
        });
      }

      setProofFile(null);
      setTxHash("");
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

  // Payment method selection UI
  const renderPaymentMethodSelection = () => (
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
    </RadioGroup>
  );

  // Payment instructions based on method
  const renderPaymentInstructions = (amount: number) => (
    <>
      {paymentMethod === "zelle" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[#6D1ED4]/10 border border-[#6D1ED4]/30 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount to Send</span>
              <span className="font-bold text-lg">{formatCurrency(amount)}</span>
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

      {paymentMethod === "bitcoin" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-warning/10 border border-warning/30 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">USD Amount</span>
              <span className="font-semibold">{formatCurrency(amount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">BTC Amount</span>
              <span className="font-bold text-warning">{btcAmountForPayment(amount)} BTC</span>
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
    </>
  );

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

      {/* Split Payment Summary (when active) */}
      {isSplitPayment && (
        <div className="glass-card p-6 border-2 border-accent/30">
          <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-accent" />
            Payment Plan Summary
          </h3>
          
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="text-sm text-muted-foreground mb-1">Total</div>
              <div className="font-bold text-xl">{formatCurrency(Number(request.quoted_price))}</div>
            </div>
            <div className={`p-4 rounded-lg text-center ${
              isDepositApproved ? "bg-success/20" : isDepositPending ? "bg-warning/20" : isDepositRejected ? "bg-destructive/20" : "bg-muted/50"
            }`}>
              <div className="text-sm text-muted-foreground mb-1">Deposit</div>
              <div className="font-bold text-xl">{formatCurrency(depositAmount)}</div>
              <Badge className={`mt-2 ${
                isDepositApproved ? "bg-success/20 text-success" : 
                isDepositPending ? "bg-warning/20 text-warning" : 
                isDepositRejected ? "bg-destructive/20 text-destructive" : ""
              }`}>
                {isDepositApproved ? "✓ Paid" : isDepositPending ? "Under Review" : isDepositRejected ? "Rejected" : "Pending"}
              </Badge>
            </div>
            <div className={`p-4 rounded-lg text-center ${
              isBalanceApproved ? "bg-success/20" : isBalancePending ? "bg-warning/20" : isBalanceRejected ? "bg-destructive/20" : isBalancePastDue ? "bg-destructive/20" : "bg-muted/50"
            }`}>
              <div className="text-sm text-muted-foreground mb-1">Balance</div>
              <div className="font-bold text-xl">{formatCurrency(balanceAmount)}</div>
              {request.balance_due_date && isDepositApproved && (
                <div className="text-xs text-muted-foreground mt-1">
                  Due: {formatDate(request.balance_due_date)}
                </div>
              )}
              <Badge className={`mt-2 ${
                isBalanceApproved ? "bg-success/20 text-success" : 
                isBalancePending ? "bg-warning/20 text-warning" : 
                isBalanceRejected ? "bg-destructive/20 text-destructive" :
                isBalancePastDue ? "bg-destructive/20 text-destructive animate-pulse" :
                isBalanceDue ? "bg-warning/20 text-warning" : ""
              }`}>
                {isBalanceApproved ? "✓ Paid" : isBalancePending ? "Under Review" : isBalanceRejected ? "Rejected" : isBalancePastDue ? "⚠ Past Due" : isBalanceDue ? "Due" : "Not Due Yet"}
              </Badge>
            </div>
          </div>
        </div>
      )}

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
          {(isPaymentRejected || isDepositRejected) && (
            <div className="mt-4 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
              <p className="text-sm font-medium text-destructive mb-2">⚠️ Payment Verification Failed</p>
              <p className="text-sm text-muted-foreground mb-3">
                Your previous payment proof could not be verified. Please review the notes and re-upload your payment proof.
              </p>
            </div>
          )}

          {/* Balance Rejected Notice */}
          {isBalanceRejected && (
            <div className="mt-4 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
              <p className="text-sm font-medium text-destructive mb-2">⚠️ Balance Payment Verification Failed</p>
              <p className="text-sm text-muted-foreground mb-3">
                Your balance payment proof could not be verified. Please re-upload your payment proof.
              </p>
            </div>
          )}

          {/* Payment Section - Full or Deposit Choice */}
          {(canPayFull || canPayDeposit) && !isSplitPayment && (
            <div className="mt-6 space-y-4">
              <div className="p-4 rounded-lg border bg-accent/10 border-accent/20">
                <p className="text-sm font-medium text-accent">
                  ✨ To proceed, confirm and pay using one of the options below.
                </p>
              </div>

              {/* Payment Plan Selection (only show if split payments enabled) */}
              {splitPaymentsEnabled && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm">Choose Payment Option</h4>
                  <RadioGroup
                    value={paymentChoice}
                    onValueChange={(v) => setPaymentChoice(v as 'full' | 'deposit')}
                    className="space-y-3"
                  >
                    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
                      paymentChoice === "full" ? "border-primary bg-primary/5" : "border-border"
                    }`}>
                      <RadioGroupItem value="full" id="pay-full" />
                      <Label htmlFor="pay-full" className="flex items-center gap-3 cursor-pointer flex-1">
                        <DollarSign className="w-5 h-5 text-primary" />
                        <div className="flex-1">
                          <p className="font-medium">Pay in Full</p>
                          <p className="text-xs text-muted-foreground">Pay the full amount now</p>
                        </div>
                        <span className="font-bold text-lg">{formatCurrency(Number(request.quoted_price))}</span>
                      </Label>
                    </div>

                    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
                      paymentChoice === "deposit" ? "border-primary bg-primary/5" : "border-border"
                    }`}>
                      <RadioGroupItem value="deposit" id="pay-deposit" />
                      <Label htmlFor="pay-deposit" className="flex items-center gap-3 cursor-pointer flex-1">
                        <Clock className="w-5 h-5 text-accent" />
                        <div className="flex-1">
                          <p className="font-medium">Pay Deposit (50%)</p>
                          <p className="text-xs text-muted-foreground">
                            Pay {formatCurrency(depositAmount)} now, {formatCurrency(balanceAmount)} due 3 days before departure
                          </p>
                        </div>
                        <span className="font-bold text-lg">{formatCurrency(depositAmount)}</span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              <h4 className="font-semibold text-sm">Select Payment Method</h4>
              {renderPaymentMethodSelection()}
              {renderPaymentInstructions(paymentChoice === 'deposit' ? depositAmount : Number(request.quoted_price))}

              {/* Submit Button */}
              <Button 
                variant="hero" 
                size="lg" 
                className="w-full mt-4" 
                onClick={() => handlePaymentSubmit(paymentChoice)}
                disabled={processing}
              >
                {processing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                <Upload className="w-4 h-4 mr-2" />
                {paymentChoice === 'deposit' ? 'Submit Deposit Proof' : 'Submit Payment Proof'}
              </Button>
            </div>
          )}

          {/* Deposit Under Review */}
          {isDepositPending && (
            <div className="mt-6 p-4 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-sm font-medium text-warning mb-1">⏳ Deposit Under Review</p>
              <p className="text-sm text-muted-foreground">
                We've received your deposit proof and are verifying it. You'll receive an email once confirmed.
              </p>
            </div>
          )}

          {/* Payment Under Review (full payment) */}
          {isPaymentPending && !isSplitPayment && (
            <div className="mt-6 p-4 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-sm font-medium text-warning mb-1">⏳ Payment Under Review</p>
              <p className="text-sm text-muted-foreground">
                We've received your payment proof and are verifying it. You'll receive an email once confirmed.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Balance Payment Section */}
      {canPayBalance && (
        <div className="glass-card p-6 border-2 border-warning/50 bg-warning/5">
          <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
            {isBalancePastDue ? (
              <AlertTriangle className="w-5 h-5 text-destructive" />
            ) : (
              <Clock className="w-5 h-5 text-warning" />
            )}
            {isBalancePastDue ? 'Balance Payment Overdue!' : 'Pay Remaining Balance'}
          </h3>
          
          <div className="text-center py-4 mb-4">
            <div className="text-sm text-muted-foreground mb-1">Balance Due</div>
            <div className={`font-display text-4xl font-bold ${isBalancePastDue ? 'text-destructive' : 'text-warning'}`}>
              {formatCurrency(balanceAmount)}
            </div>
            {request.balance_due_date && (
              <div className={`text-sm mt-2 ${isBalancePastDue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                {isBalancePastDue ? '⚠️ Was due: ' : 'Due by: '}{formatDate(request.balance_due_date)}
              </div>
            )}
          </div>

          <h4 className="font-semibold text-sm mb-3">Select Payment Method</h4>
          {renderPaymentMethodSelection()}
          {renderPaymentInstructions(balanceAmount)}

          <Button 
            variant="hero" 
            size="lg" 
            className={`w-full mt-4 ${isBalancePastDue ? 'bg-destructive hover:bg-destructive/90' : ''}`}
            onClick={() => handlePaymentSubmit('balance')}
            disabled={processing}
          >
            {processing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            <Upload className="w-4 h-4 mr-2" />
            Submit Balance Payment Proof
          </Button>
        </div>
      )}

      {/* Balance Under Review */}
      {isBalancePending && (
        <div className="glass-card p-6 border-2 border-warning/30">
          <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
            <p className="text-sm font-medium text-warning mb-1">⏳ Balance Payment Under Review</p>
            <p className="text-sm text-muted-foreground">
              We've received your balance payment proof and are verifying it. You'll receive an email once confirmed.
            </p>
          </div>
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
