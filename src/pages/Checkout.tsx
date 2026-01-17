import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Bitcoin, ArrowLeft, Copy, Check, Upload, DollarSign, HelpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SupportButtons } from "@/components/SupportButtons";
import type { Tables } from "@/integrations/supabase/types";
// Notifications are now handled by database triggers - no client-side calls needed

type Voucher = Tables<"vouchers">;
type PaymentMethod = "bitcoin" | "zelle" | "paypal";

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
                    paymentMethod === "paypal" ? "border-primary bg-primary/5" : "border-border"
                  }`}>
                    <RadioGroupItem value="paypal" id="paypal" />
                    <Label htmlFor="paypal" className="flex items-center gap-3 cursor-pointer flex-1">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.773.773 0 0 1 .763-.654h6.18c2.098 0 3.564.563 4.368 1.67.349.481.562 1.005.653 1.607.096.63.05 1.398-.138 2.335l-.004.016v.467l.365.206c.308.166.555.358.751.577.317.354.523.793.613 1.304.093.532.069 1.165-.071 1.881-.161.823-.422 1.539-.779 2.126-.332.545-.755 1.001-1.253 1.35a4.88 4.88 0 0 1-1.608.732c-.596.152-1.259.227-1.969.227h-.467a1.426 1.426 0 0 0-1.406 1.2l-.035.2-.59 3.748-.027.144a.159.159 0 0 1-.159.136H7.076Z" fill="#253B80"/>
                        <path d="M19.817 7.86c-.014.093-.03.188-.048.286-.616 3.163-2.726 4.255-5.42 4.255H12.7a.667.667 0 0 0-.658.563l-.848 5.379-.24 1.525a.35.35 0 0 0 .346.406h2.431a.585.585 0 0 0 .578-.494l.024-.125.458-2.9.029-.16a.585.585 0 0 1 .577-.494h.365c2.355 0 4.2-.957 4.74-3.724.226-.757.11-1.541-.486-2.035a1.724 1.724 0 0 0-.199-.148Z" fill="#179BD7"/>
                        <path d="M18.817 7.465a4.79 4.79 0 0 0-.59-.131 7.47 7.47 0 0 0-1.188-.087h-3.594a.577.577 0 0 0-.578.494l-.76 4.846-.023.145a.667.667 0 0 1 .658-.563h1.65c2.693 0 4.803-1.092 5.42-4.255.018-.098.034-.193.047-.286a3.009 3.009 0 0 0-.458-.196c-.172-.013-.323.02-.584.033Z" fill="#222D65"/>
                      </svg>
                      <div>
                        <p className="font-medium">PayPal</p>
                        <p className="text-xs text-muted-foreground">Send payment via PayPal</p>
                      </div>
                    </Label>
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

                {paymentMethod === "bitcoin" && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-card/50 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Amount in BTC</span>
                        <span className="font-mono font-bold text-warning">{btcAmount} BTC</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">USD/BTC Rate</span>
                        <span className="font-mono">${btcRate}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Send to this address</Label>
                      <div className="flex gap-2">
                        <Input value={btcAddress} readOnly className="font-mono text-xs bg-card" />
                        <Button variant="outline" size="icon" onClick={() => copyToClipboard(btcAddress)}>
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="txHash">Transaction Hash</Label>
                      <Input
                        id="txHash"
                        placeholder="Enter your transaction hash..."
                        value={txHash}
                        onChange={(e) => setTxHash(e.target.value)}
                        className="bg-card font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Or upload screenshot proof</Label>
                      <div className="border border-dashed border-border rounded-xl p-4 text-center">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                          className="hidden"
                          id="proofUpload"
                        />
                        <label htmlFor="proofUpload" className="cursor-pointer">
                          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            {proofFile ? proofFile.name : "Click to upload"}
                          </p>
                        </label>
                      </div>
                    </div>

                    <Button variant="hero" size="lg" className="w-full" onClick={handleBitcoinSubmit} disabled={processing}>
                      {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                      Submit Payment Proof
                    </Button>
                  </div>
                )}

                {paymentMethod === "paypal" && (
                  <div className="space-y-4">
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
                        <li>Select "Friends & Family" to avoid fees</li>
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
                          id="paypalProofUpload"
                        />
                        <label htmlFor="paypalProofUpload" className="cursor-pointer">
                          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            {proofFile ? proofFile.name : "Click to upload screenshot"}
                          </p>
                        </label>
                      </div>
                    </div>

                    <Button variant="hero" size="lg" className="w-full" onClick={handlePayPalSubmit} disabled={processing || !proofFile || !paypalEmail}>
                      {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                      Submit PayPal Payment
                    </Button>
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
