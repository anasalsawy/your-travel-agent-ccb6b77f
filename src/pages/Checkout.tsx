import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CreditCard, Bitcoin, ArrowLeft, Copy, Check, Upload, DollarSign, HelpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SupportButtons } from "@/components/SupportButtons";
import type { Tables } from "@/integrations/supabase/types";
import { notifyNewOrder, notifyPaymentProofUploaded, notifyCustomerOrderReceived, notifyCustomerPaymentUnderReview } from "@/lib/notifications";

type Voucher = Tables<"vouchers">;
type PaymentMethod = "stripe" | "bitcoin" | "zelle";

export default function CheckoutPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("stripe");
  const [user, setUser] = useState<any>(null);
  const [btcAddress, setBtcAddress] = useState("");
  const [btcRate, setBtcRate] = useState("43500");
  const [zelleEmail, setZelleEmail] = useState("Amalmsaid4@gmail.com");
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
        .in("key", ["btc_address", "btc_rate", "zelle_email"]);
      
      if (settings) {
        const address = settings.find(s => s.key === "btc_address");
        const rate = settings.find(s => s.key === "btc_rate");
        const zelle = settings.find(s => s.key === "zelle_email");
        if (address?.value) setBtcAddress(address.value);
        if (rate?.value) setBtcRate(rate.value);
        if (zelle?.value) setZelleEmail(zelle.value);
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
      // Create order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          voucher_id: voucher.id,
          amount_paid: Number(voucher.sale_price),
          payment_method: "stripe",
          payment_status: "pending",
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Send notifications
      notifyNewOrder({
        orderId: order.id,
        voucherTitle: voucher.title,
        amount: Number(voucher.sale_price),
        paymentMethod: "stripe",
        customerEmail: user.email,
      });
      notifyCustomerOrderReceived(user.email, {
        orderId: order.id,
        voucherTitle: voucher.title,
        amount: Number(voucher.sale_price),
        paymentMethod: "Credit Card",
      });

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
        
        if (!uploadError) {
          // Store file path instead of public URL for private bucket
          proofUrl = fileName;
        }
      }

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          voucher_id: voucher.id,
          amount_paid: Number(voucher.sale_price),
          payment_method: "bitcoin",
          payment_status: "processing",
          btc_address: btcAddress,
          btc_amount: btcAmount,
          proof_upload_url: proofUrl || txHash,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Send notifications
      notifyNewOrder({
        orderId: order.id,
        voucherTitle: voucher.title,
        amount: Number(voucher.sale_price),
        paymentMethod: "bitcoin",
        customerEmail: user.email,
      });
      notifyPaymentProofUploaded({
        orderId: order.id,
        voucherTitle: voucher.title,
        amount: Number(voucher.sale_price),
        paymentMethod: "Bitcoin",
      });
      notifyCustomerPaymentUnderReview(user.email, {
        orderId: order.id,
        voucherTitle: voucher.title,
        amount: Number(voucher.sale_price),
      });

      toast({
        title: "Payment Submitted!",
        description: "We'll verify your payment and deliver the voucher shortly.",
      });

      navigate("/dashboard");
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
      let proofUrl = "";
      
      const fileExt = proofFile.name.split('.').pop();
      const fileName = `${user.id}/zelle-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("proof-uploads")
        .upload(fileName, proofFile);
      
      if (!uploadError) {
        // Store file path instead of public URL for private bucket
        proofUrl = fileName;
      }

      const deliveryInfo = zelleConfirmation ? `Confirmation: ${zelleConfirmation}` : null;

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          voucher_id: voucher.id,
          amount_paid: Number(voucher.sale_price),
          payment_method: "zelle",
          payment_status: "processing",
          proof_upload_url: proofUrl,
          delivery_info: deliveryInfo,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Send notifications
      notifyNewOrder({
        orderId: order.id,
        voucherTitle: voucher.title,
        amount: Number(voucher.sale_price),
        paymentMethod: "zelle",
        customerEmail: user.email,
      });
      notifyPaymentProofUploaded({
        orderId: order.id,
        voucherTitle: voucher.title,
        amount: Number(voucher.sale_price),
        paymentMethod: "Zelle",
      });
      notifyCustomerPaymentUnderReview(user.email, {
        orderId: order.id,
        voucherTitle: voucher.title,
        amount: Number(voucher.sale_price),
      });

      toast({
        title: "Payment Submitted!",
        description: "We'll verify your Zelle payment and deliver the voucher shortly.",
      });

      navigate("/dashboard");
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

                {paymentMethod === "stripe" && (
                  <Button variant="hero" size="lg" className="w-full" onClick={handleStripeCheckout} disabled={processing}>
                    {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                    Pay {formatCurrency(Number(voucher.sale_price), voucher.currency || "USD")}
                  </Button>
                )}

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
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
