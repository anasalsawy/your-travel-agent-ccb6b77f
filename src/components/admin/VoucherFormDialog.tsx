import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, Check, ChevronDown, Facebook } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateFacebookPost } from "@/lib/facebook-post-generator";
import type { Tables } from "@/integrations/supabase/types";

type Voucher = Tables<"vouchers">;

interface VoucherFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucher: Voucher | null;
  onSuccess: () => void;
}

export function VoucherFormDialog({ open, onOpenChange, voucher, onSuccess }: VoucherFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fbPostOpen, setFbPostOpen] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    airline: "",
    title: "",
    type: "voucher" as "voucher" | "certificate" | "gift_card",
    face_value: "",
    currency: "USD",
    sale_price: "",
    discount_percent: "",
    expiry_date: "",
    redemption_method: "Online",
    redemption_notes: "",
    delivery_method: "Email within 24 hours",
    terms: "",
    verified_balance: true,
    verification_method: "",
    is_refundable: false,
    is_transferable: true,
    status: "available" as "available" | "reserved" | "sold" | "disabled",
  });

  useEffect(() => {
    if (voucher) {
      setFormData({
        airline: voucher.airline,
        title: voucher.title,
        type: voucher.type,
        face_value: String(voucher.face_value),
        currency: voucher.currency || "USD",
        sale_price: String(voucher.sale_price),
        discount_percent: String(voucher.discount_percent),
        expiry_date: voucher.expiry_date || "",
        redemption_method: voucher.redemption_method || "Online",
        redemption_notes: voucher.redemption_notes || "",
        delivery_method: voucher.delivery_method || "Email within 24 hours",
        terms: voucher.terms || "",
        verified_balance: voucher.verified_balance ?? true,
        verification_method: voucher.verification_method || "",
        is_refundable: voucher.is_refundable ?? false,
        is_transferable: voucher.is_transferable ?? true,
        status: voucher.status || "available",
      });
    } else {
      setFormData({
        airline: "",
        title: "",
        type: "voucher",
        face_value: "",
        currency: "USD",
        sale_price: "",
        discount_percent: "",
        expiry_date: "",
        redemption_method: "Online",
        redemption_notes: "",
        delivery_method: "Email within 24 hours",
        terms: "",
        verified_balance: true,
        verification_method: "",
        is_refundable: false,
        is_transferable: true,
        status: "available",
      });
    }
  }, [voucher, open]);

  const calculateDiscount = () => {
    const face = parseFloat(formData.face_value);
    const sale = parseFloat(formData.sale_price);
    if (face && sale) {
      const discount = ((face - sale) / face * 100).toFixed(1);
      setFormData(prev => ({ ...prev, discount_percent: discount }));
    }
  };

  // Generate Facebook post dynamically based on current form data
  const facebookPost = useMemo(() => {
    if (!formData.airline || !formData.face_value || !formData.sale_price) {
      return "";
    }
    
    const mockVoucher = {
      id: voucher?.id || "preview",
      airline: formData.airline,
      title: formData.title,
      type: formData.type,
      face_value: formData.face_value,
      sale_price: formData.sale_price,
      discount_percent: formData.discount_percent,
      expiry_date: formData.expiry_date || null,
      currency: formData.currency,
    };
    
    return generateFacebookPost(mockVoucher as any);
  }, [formData, voucher?.id]);

  const handleCopyFacebookPost = async () => {
    try {
      await navigator.clipboard.writeText(facebookPost);
      setCopied(true);
      toast({ title: "Copied!", description: "Facebook post copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Error", description: "Failed to copy to clipboard", variant: "destructive" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      airline: formData.airline,
      title: formData.title,
      type: formData.type,
      face_value: parseFloat(formData.face_value),
      currency: formData.currency,
      sale_price: parseFloat(formData.sale_price),
      discount_percent: parseFloat(formData.discount_percent),
      expiry_date: formData.expiry_date || null,
      redemption_method: formData.redemption_method,
      redemption_notes: formData.redemption_notes || null,
      delivery_method: formData.delivery_method,
      terms: formData.terms || null,
      verified_balance: formData.verified_balance,
      verification_method: formData.verification_method || null,
      is_refundable: formData.is_refundable,
      is_transferable: formData.is_transferable,
      status: formData.status,
    };

    try {
      if (voucher) {
        const { error } = await supabase
          .from("vouchers")
          .update(payload)
          .eq("id", voucher.id);

        if (error) throw error;
        toast({ title: "Success", description: "Voucher updated successfully" });
      } else {
        const { error } = await supabase
          .from("vouchers")
          .insert(payload);

        if (error) throw error;
        toast({ title: "Success", description: "Voucher created successfully" });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{voucher ? "Edit Voucher" : "Add New Voucher"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="airline">Airline *</Label>
              <Input
                id="airline"
                value={formData.airline}
                onChange={(e) => setFormData(prev => ({ ...prev, airline: e.target.value }))}
                placeholder="e.g., Delta Airlines"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Delta Travel Voucher"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={formData.type} onValueChange={(v: any) => setFormData(prev => ({ ...prev, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="voucher">Voucher</SelectItem>
                  <SelectItem value="certificate">Certificate</SelectItem>
                  <SelectItem value="gift_card">Gift Card</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v: any) => setFormData(prev => ({ ...prev, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="reserved">Reserved</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="face_value">Face Value *</Label>
              <Input
                id="face_value"
                type="number"
                step="0.01"
                value={formData.face_value}
                onChange={(e) => setFormData(prev => ({ ...prev, face_value: e.target.value }))}
                onBlur={calculateDiscount}
                placeholder="500"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sale_price">Sale Price *</Label>
              <Input
                id="sale_price"
                type="number"
                step="0.01"
                value={formData.sale_price}
                onChange={(e) => setFormData(prev => ({ ...prev, sale_price: e.target.value }))}
                onBlur={calculateDiscount}
                placeholder="400"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="discount_percent">Discount %</Label>
              <Input
                id="discount_percent"
                type="number"
                step="0.1"
                value={formData.discount_percent}
                onChange={(e) => setFormData(prev => ({ ...prev, discount_percent: e.target.value }))}
                placeholder="20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={formData.currency} onValueChange={(v) => setFormData(prev => ({ ...prev, currency: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiry_date">Expiry Date</Label>
              <Input
                id="expiry_date"
                type="date"
                value={formData.expiry_date}
                onChange={(e) => setFormData(prev => ({ ...prev, expiry_date: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="redemption_method">Redemption Method</Label>
              <Input
                id="redemption_method"
                value={formData.redemption_method}
                onChange={(e) => setFormData(prev => ({ ...prev, redemption_method: e.target.value }))}
                placeholder="Online, Phone, etc."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="delivery_method">Delivery Method</Label>
              <Input
                id="delivery_method"
                value={formData.delivery_method}
                onChange={(e) => setFormData(prev => ({ ...prev, delivery_method: e.target.value }))}
                placeholder="Email within 24 hours"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="verification_method">Verification Method</Label>
              <Input
                id="verification_method"
                value={formData.verification_method}
                onChange={(e) => setFormData(prev => ({ ...prev, verification_method: e.target.value }))}
                placeholder="Verified via airline portal"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="redemption_notes">Redemption Notes</Label>
            <Textarea
              id="redemption_notes"
              value={formData.redemption_notes}
              onChange={(e) => setFormData(prev => ({ ...prev, redemption_notes: e.target.value }))}
              placeholder="Instructions for redeeming..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="terms">Terms & Conditions</Label>
            <Textarea
              id="terms"
              value={formData.terms}
              onChange={(e) => setFormData(prev => ({ ...prev, terms: e.target.value }))}
              placeholder="Terms and conditions..."
              rows={3}
            />
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="verified_balance"
                checked={formData.verified_balance}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, verified_balance: checked }))}
              />
              <Label htmlFor="verified_balance">Verified Balance</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="is_refundable"
                checked={formData.is_refundable}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_refundable: checked }))}
              />
              <Label htmlFor="is_refundable">Refundable</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="is_transferable"
                checked={formData.is_transferable}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_transferable: checked }))}
              />
              <Label htmlFor="is_transferable">Transferable</Label>
            </div>
          </div>

          {/* Facebook Post Generator */}
          {formData.airline && formData.face_value && formData.sale_price && (
            <Collapsible open={fbPostOpen} onOpenChange={setFbPostOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <Facebook className="w-4 h-4 text-[#1877F2]" />
                    Facebook Post Generator
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform ${fbPostOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <Textarea
                    value={facebookPost}
                    readOnly
                    className="min-h-[300px] font-mono text-xs bg-transparent border-0 resize-none leading-relaxed focus-visible:ring-0"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full gap-2"
                  onClick={handleCopyFacebookPost}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-success" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Facebook Post
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Updates automatically as you edit the voucher details
                </p>
              </CollapsibleContent>
            </Collapsible>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="hero" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {voucher ? "Update Voucher" : "Create Voucher"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
