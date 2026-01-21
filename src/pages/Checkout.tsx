import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft, Copy, Check, Upload, DollarSign, HelpCircle, Shield, ExternalLink } from "lucide-react";
import { PayPalBuyerProtection, PayPalIcon, PayPalTrustBadge } from "@/components/payment/PayPalBuyerProtection";
import { EscrowBuyerProtection, EscrowIcon, EscrowTrustBadge, EscrowHowItWorks } from "@/components/payment/EscrowBuyerProtection";
import { useToast } from "@/hooks/use-toast";
import { SupportButtons } from "@/components/SupportButtons";
import type { Tables } from "@/integrations/supabase/types";
// Notifications are now handled by database triggers - no client-side calls needed

type Voucher = Tables<"vouchers">;
type PaymentMethod = "zelle" | "paypal" | "escrow";

export default function CheckoutPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("zelle");
  const [user, setUser] = useState<any>(null);
  const [btcAddress, setBtcAddress] = useState("");
  const [btcRate, setBtcRate] = useState("43500");
  const [zelleEmail, setZelleEmail] = useState("Amalmsaid4@gmail.com");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [zelleConfirmation, setZelleConfirmation] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      // Get user
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate(`/auth?redirect=/checkout/voucher/${id}`);
        return;
      }
      setUser(session.user);

      // Get voucher
      if (id) {
        const { data: voucherData } = await supabase
          .from("vouchers")
          .select("*")
          .eq("id", id)
          .single();
        
        if (voucherData) {
          setVoucher(voucherData);
        }
      }

      // Get settings
      const { data: settings } = await supabase
        .from("site_settings")
        .select("*")
        .in("key", ["btc_address", "btc_rate", "zelle_email", "paypal_email"]);
      
      if (settings) {
        const address = settings.find(s => s.key === "btc_address");
        const rate = settings.find(s => s.key === "btc_rate");
        const zelle = settings.find(s => s.key === "zelle_email");
        const paypal = settings.find(s => s.key === "paypal_email");
        if (address?.value) setBtcAddress(address.value);
        if (rate?.value) setBtcRate(rate.value);
        if (zelle?.value) setZelleEmail(zelle.value);
        if (paypal?.value) setPaypalEmail(paypal.value);
      }

      setLoading(false);
    };

    fetchData();
  }, [id, navigate]);

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const btcAmount = voucher ? (Number(voucher.sale_price) / parseFloat(btcRate)).toFixed(8) : "0";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Copied to clipboard." });
  };

  const handleStripeCheckout = async () => {
    if (!voucher || !user) return;
    
    setProcessing(true);
    
    try {
      // Create order with customer email
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          voucher_id: voucher.id,
          amount_paid: Number(voucher.sale_price),
          payment_method: "stripe",
          payment_status: "pending",
          customer_email: user.email,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Notifications are handled by database triggers

      // In a real app, you'd redirect to Stripe Checkout here
      toast({
        title: "Demo Mode",
        description: "Stripe integration requires setup. Order created in pending state.",
      });

      navigate(`/dashboard`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process payment.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleBitcoinSubmit = async () => {
    if (!voucher || !user || (!txHash && !proofFile)) {
      toast({
        title: "Error",
        description: "Please provide transaction hash or upload proof.",
        variant: "destructive",
      });
      return;
    }
    
    setProcessing(true);
    
    try {
      let proofUrl = "";
      
      if (proofFile) {
        const fileExt = proofFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("proof-uploads")
          .upload(fileName, proofFile);
        
        if (uploadError) {
          throw new Error("Failed to upload proof file");
        }
        proofUrl = fileName;
      } else {
        proofUrl = txHash;
      }

      // First create order with pending status
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          voucher_id: voucher.id,
          amount_paid: Number(voucher.sale_price),
          payment_method: "bitcoin",
          payment_status: "pending",
          order_status: "pending",
          btc_address: btcAddress,
          btc_amount: btcAmount,
          customer_email: user.email,
        })
        .select()
        .single();

      if (orderError || !order) throw orderError || new Error("Failed to create order");

      // Submit proof atomically (this updates status + creates payment_proof record)
      const { error: submitError } = await supabase.rpc("submit_order_payment_proof", {
        p_order_id: order.id,
        p_proof_upload_url: proofUrl,
      });

      if (submitError) throw submitError;

      // Notifications are handled by database triggers

      toast({
        title: "Payment Submitted!",
        description: "Your payment is now under review. We'll notify you once verified.",
      });

      navigate("/dashboard?payment_submitted=true");
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

  const handleZelleSubmit = async () => {
    if (!voucher || !user || !proofFile) {
      toast({
        title: "Error",
        description: "Please upload a screenshot of your Zelle payment.",
        variant: "destructive",
      });
      return;
    }
    
    setProcessing(true);
    
    try {
      const fileExt = proofFile.name.split('.').pop();
      const fileName = `${user.id}/zelle-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("proof-uploads")
        .upload(fileName, proofFile);
      
      if (uploadError) {
        throw new Error("Failed to upload proof file");
      }

      const deliveryInfo = zelleConfirmation ? `Confirmation: ${zelleConfirmation}` : null;

      // First create order with pending status
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          voucher_id: voucher.id,
          amount_paid: Number(voucher.sale_price),
          payment_method: "zelle",
          payment_status: "pending",
          order_status: "pending",
          delivery_info: deliveryInfo,
          customer_email: user.email,
        })
        .select()
        .single();

      if (orderError || !order) throw orderError || new Error("Failed to create order");

      // Submit proof atomically (this updates status + creates payment_proof record)
      const { error: submitError } = await supabase.rpc("submit_order_payment_proof", {
        p_order_id: order.id,
        p_proof_upload_url: fileName,
      });

      if (submitError) throw submitError;

      // Notifications are handled by database triggers

      toast({
        title: "Payment Submitted!",
        description: "Your payment is now under review. We'll notify you once verified.",
      });

      navigate("/dashboard?payment_submitted=true");
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

  const handlePayPalSubmit = async () => {
    if (!voucher || !user || !proofFile) {
      toast({
        title: "Error",
        description: "Please upload a screenshot of your PayPal payment.",
        variant: "destructive",
      });
      return;
    }
    
    setProcessing(true);
    
    try {
      const fileExt = proofFile.name.split('.').pop();
      const fileName = `${user.id}/paypal-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("proof-uploads")
        .upload(fileName, proofFile);
      
      if (uploadError) {
        throw new Error("Failed to upload proof file");
      }

      // First create order with pending status
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          voucher_id: voucher.id,
          amount_paid: Number(voucher.sale_price),
          payment_method: "paypal",
          payment_status: "pending",
          order_status: "pending",
          customer_email: user.email,
        })
        .select()
        .single();

      if (orderError || !order) throw orderError || new Error("Failed to create order");

      // Submit proof atomically (this updates status + creates payment_proof record)
      const { error: submitError } = await supabase.rpc("submit_order_payment_proof", {
        p_order_id: order.id,
        p_proof_upload_url: fileName,
      });

      if (submitError) throw submitError;

      toast({
        title: "Payment Submitted!",
        description: "Your payment is now under review. We'll notify you once verified.",
      });

      navigate("/dashboard?payment_submitted=true");
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

  const resetProof = () => {
    setProofFile(null);
    setTxHash("");
    setZelleConfirmation("");
  };

  if (loading) {
    return (
      <Layout hideFooter>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!voucher) {
    return (
      <Layout hideFooter>
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
    <Layout hideFooter>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="max-w-4xl mx-auto">
            <h1 className="font-display text-3xl font-bold mb-8 text-center">
              Secure <span className="text-gradient">Checkout</span>
            </h1>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Order Summary */}
              <div className="glass-card p-6 lg:p-8 h-fit">
                <h2 className="font-display text-xl font-semibold mb-6">Order Summary</h2>
                
                <div className="flex items-center gap-4 p-4 rounded-xl bg-card/50 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-lg font-bold text-primary">
                    {voucher.airline.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{voucher.title}</h3>
                    <p className="text-sm text-muted-foreground">{voucher.airline}</p>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Face Value</span>
                    <span>{formatCurrency(Number(voucher.face_value), voucher.currency || "USD")}</span>
                  </div>
                  <div className="flex justify-between text-success">
                    <span>Discount ({Number(voucher.discount_percent)}%)</span>
                    <span>-{formatCurrency(Number(voucher.face_value) - Number(voucher.sale_price), voucher.currency || "USD")}</span>
                  </div>
                  <div className="border-t border-border pt-3 flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="text-gradient">{formatCurrency(Number(voucher.sale_price), voucher.currency || "USD")}</span>
                  </div>
                </div>

                {/* Support section */}
                <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 mb-3">
                    <HelpCircle className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Need Help?</span>
                  </div>
                  <SupportButtons variant="inline" showLabels />
                </div>
              </div>

              {/* Payment Method */}
              <div className="glass-card p-6 lg:p-8">
                <h2 className="font-display text-xl font-semibold mb-6">Payment Method</h2>
                
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(v) => { setPaymentMethod(v as PaymentMethod); resetProof(); }}
                  className="space-y-4 mb-6"
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


                  <div className={`relative flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
                    paymentMethod === "escrow" ? "border-[#00A651] bg-[#00A651]/5" : "border-border"
                  }`}>
                    <RadioGroupItem value="escrow" id="escrow" />
                    <Label htmlFor="escrow" className="flex items-center gap-3 cursor-pointer flex-1">
                      <EscrowIcon className="w-5 h-5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">Escrow.com</p>
                          <EscrowTrustBadge compact />
                        </div>
                        <p className="text-xs text-muted-foreground">Maximum buyer protection - funds held until verified</p>
                      </div>
                    </Label>
                    {paymentMethod === "escrow" && (
                      <Shield className="w-4 h-4 text-[#00A651] absolute top-2 right-2" />
                    )}
                  </div>

                  <div className={`relative flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
                    paymentMethod === "paypal" ? "border-[#0070BA] bg-[#0070BA]/5" : "border-border"
                  }`}>
                    <RadioGroupItem value="paypal" id="paypal" />
                    <Label htmlFor="paypal" className="flex items-center gap-3 cursor-pointer flex-1">
                      <PayPalIcon />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">PayPal</p>
                          <PayPalTrustBadge compact />
                        </div>
                        <p className="text-xs text-muted-foreground">Protected by PayPal Buyer Protection</p>
                      </div>
                    </Label>
                    {paymentMethod === "paypal" && (
                      <Shield className="w-4 h-4 text-[#0070BA] absolute top-2 right-2" />
                    )}
                  </div>
                </RadioGroup>

                {paymentMethod === "zelle" && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-[#6D1ED4]/10 border border-[#6D1ED4]/30 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Amount to Send</span>
                        <span className="font-bold text-lg">{formatCurrency(Number(voucher.sale_price), voucher.currency || "USD")}</span>
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

                    <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                      <p className="font-medium mb-2">Instructions:</p>
                      <ol className="list-decimal list-inside space-y-1 text-xs">
                        <li>Open your Zelle app or bank app with Zelle</li>
                        <li>Send <strong>{formatCurrency(Number(voucher.sale_price))}</strong> to <strong>{zelleEmail}</strong></li>
                        <li>Take a screenshot of the confirmation</li>
                        <li>Upload the screenshot below</li>
                      </ol>
                    </div>

                    <div className="space-y-2">
                      <Label>Upload Payment Screenshot *</Label>
                      <div className="border border-dashed border-border rounded-xl p-4 text-center">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                          className="hidden"
                          id="zelleProofUpload"
                        />
                        <label htmlFor="zelleProofUpload" className="cursor-pointer">
                          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            {proofFile ? proofFile.name : "Click to upload screenshot"}
                          </p>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="zelleConfirmation">Confirmation Code (Optional)</Label>
                      <Input
                        id="zelleConfirmation"
                        placeholder="Enter Zelle confirmation code if available..."
                        value={zelleConfirmation}
                        onChange={(e) => setZelleConfirmation(e.target.value)}
                        className="bg-card"
                      />
                    </div>

                    <Button variant="hero" size="lg" className="w-full" onClick={handleZelleSubmit} disabled={processing || !proofFile}>
                      {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                      Submit Zelle Payment
                    </Button>
                  </div>
                )}

                {paymentMethod === "escrow" && (
                  <div className="space-y-4">
                    {/* Escrow.com Buyer Protection Banner */}
                    <EscrowBuyerProtection />

                    <div className="p-4 rounded-xl bg-[#00A651]/10 border border-[#00A651]/30 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Amount</span>
                        <span className="font-bold text-lg">{formatCurrency(Number(voucher.sale_price), voucher.currency || "USD")}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Escrow Fee (est.)</span>
                        <span>~3.25%</span>
                      </div>
                    </div>

                    <EscrowHowItWorks />

                    <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                      <p className="font-medium mb-2">How to pay with Escrow.com:</p>
                      <ol className="list-decimal list-inside space-y-1 text-xs">
                        <li>Click the button below to start an Escrow.com transaction</li>
                        <li>Complete payment on Escrow.com's secure platform</li>
                        <li>We'll deliver your voucher once funds are secured</li>
                        <li>Verify the voucher works, then approve the release</li>
                      </ol>
                    </div>

                    <Button 
                      size="lg" 
                      className="w-full bg-[#00A651] hover:bg-[#008c44] text-white gap-2" 
                      onClick={() => {
                        toast({
                          title: "Escrow.com Integration",
                          description: "You'll be contacted to complete the Escrow.com transaction. Check your email for details.",
                        });
                      }}
                      disabled={processing}
                    >
                      {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                      <Shield className="w-4 h-4" />
                      Start Secure Escrow Transaction
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    
                    <p className="text-center text-[10px] text-muted-foreground">
                      Your payment is protected by Escrow.com, a licensed escrow company since 1999.
                    </p>
                  </div>
                )}

                {paymentMethod === "paypal" && (
                  <div className="space-y-4">
                    {/* PayPal Buyer Protection Banner */}
                    <PayPalBuyerProtection />

                    <div className="p-4 rounded-xl bg-[#0070BA]/10 border border-[#0070BA]/30 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Amount to Send</span>
                        <span className="font-bold text-lg">{formatCurrency(Number(voucher.sale_price), voucher.currency || "USD")}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Send PayPal payment to:</Label>
                      <div className="flex gap-2">
                        <Input value={paypalEmail || "Not configured"} readOnly className="bg-card font-mono text-sm" />
                        <Button variant="outline" size="icon" onClick={() => copyToClipboard(paypalEmail)} disabled={!paypalEmail}>
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                      <p className="font-medium mb-2">Instructions:</p>
                      <ol className="list-decimal list-inside space-y-1 text-xs">
                        <li>Open PayPal app or website</li>
                        <li>Send <strong>{formatCurrency(Number(voucher.sale_price))}</strong> to <strong>{paypalEmail}</strong></li>
                        <li>Select "Goods & Services" for buyer protection</li>
                        <li>Take a screenshot of the confirmation</li>
                        <li>Upload the screenshot below</li>
                      </ol>
                    </div>

                    {/* Trust messaging */}
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
                      <Shield className="w-4 h-4 text-success flex-shrink-0" />
                      <p className="text-xs text-success">
                        <strong>100% Protected:</strong> If your voucher isn't delivered, PayPal will refund your full payment.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Upload Payment Screenshot *</Label>
                      <div className="border border-dashed border-[#0070BA]/30 rounded-xl p-4 text-center hover:border-[#0070BA]/50 transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                          className="hidden"
                          id="paypalProofUpload"
                        />
                        <label htmlFor="paypalProofUpload" className="cursor-pointer">
                          <Upload className="w-8 h-8 mx-auto mb-2 text-[#0070BA]" />
                          <p className="text-sm text-muted-foreground">
                            {proofFile ? proofFile.name : "Click to upload screenshot"}
                          </p>
                        </label>
                      </div>
                    </div>

                    <Button 
                      size="lg" 
                      className="w-full bg-[#0070BA] hover:bg-[#003087] text-white" 
                      onClick={handlePayPalSubmit} 
                      disabled={processing || !proofFile || !paypalEmail}
                    >
                      {processing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      <Shield className="w-4 h-4 mr-2" />
                      Pay Securely with PayPal
                    </Button>
                    
                    <p className="text-center text-[10px] text-muted-foreground">
                      By paying with PayPal, you're covered by PayPal Buyer Protection for 180 days.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
