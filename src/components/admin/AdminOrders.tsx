import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, Eye, Check, X, ExternalLink, Image, Download, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { 
  notifyCustomerOrderDelivered,
  notifyCustomerPaymentApproved,
  notifyCustomerPaymentRejected
} from "@/lib/notifications";

type Order = Tables<"orders"> & { 
  vouchers: Tables<"vouchers"> | null;
};

interface AdminOrdersProps {
  isAdmin?: boolean;
}

export function AdminOrders({ isAdmin = false }: AdminOrdersProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [deliveryInfo, setDeliveryInfo] = useState("");
  const [updating, setUpdating] = useState(false);
  const [proofSignedUrl, setProofSignedUrl] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);
  const { toast } = useToast();

  const getSignedProofUrl = async (filePath: string) => {
    setLoadingProof(true);
    try {
      // Check if it's a file path (not a URL or tx hash)
      if (!filePath.startsWith("http") && filePath.includes("/")) {
        const { data, error } = await supabase.storage
          .from("proof-uploads")
          .createSignedUrl(filePath, 3600); // 1 hour expiry
        
        if (data && !error) {
          setProofSignedUrl(data.signedUrl);
        } else {
          setProofSignedUrl(null);
        }
      } else {
        // It's either a URL or a tx hash, keep as is
        setProofSignedUrl(null);
      }
    } catch {
      setProofSignedUrl(null);
    }
    setLoadingProof(false);
  };

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, vouchers(*)")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setOrders((data || []) as Order[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const resolveOrderCustomerEmail = async (order: Order): Promise<string | null> => {
    if (order.customer_email) return order.customer_email;

    if (!order.user_id) return null;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", order.user_id)
      .maybeSingle();

    if (error) return null;

    const email = profile?.email || null;

    // Backfill missing customer_email on the order so future notifications never miss it.
    if (email) {
      await supabase.from("orders").update({ customer_email: email }).eq("id", order.id);
    }

    return email;
  };

  const handleUpdateOrder = async (orderId: string, updates: Partial<Tables<"orders">>) => {
    setUpdating(true);
    const { error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", orderId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Order updated successfully" });
      fetchOrders();
      setSelectedOrder(null);
    }
    setUpdating(false);
  };

  const handleApprove = async (order: Order) => {
    await handleUpdateOrder(order.id, {
      payment_status: "completed",
      order_status: "paid",
      admin_notes: adminNotes || null,
    });

    const customerEmail = await resolveOrderCustomerEmail(order);

    if (!customerEmail) {
      toast({
        title: "Customer email missing",
        description: "Cannot send approval email because this order has no customer email.",
        variant: "destructive",
      });
      return;
    }

    await notifyCustomerPaymentApproved(customerEmail, {
      orderId: order.id,
      amount: Number(order.amount_paid),
    });
  };

  const handleReject = async (order: Order) => {
    if (!adminNotes) {
      toast({ title: "Error", description: "Please provide a reason for rejection", variant: "destructive" });
      return;
    }
    await handleUpdateOrder(order.id, {
      payment_status: "failed",
      order_status: "cancelled",
      admin_notes: adminNotes,
    });

    const customerEmail = await resolveOrderCustomerEmail(order);

    if (!customerEmail) {
      toast({
        title: "Customer email missing",
        description: "Cannot send rejection email because this order has no customer email.",
        variant: "destructive",
      });
      return;
    }

    await notifyCustomerPaymentRejected(customerEmail, {
      orderId: order.id,
      amount: Number(order.amount_paid),
      rejectionReason: adminNotes,
    });
  };

  const handleMarkDelivered = async (order: Order) => {
    if (!deliveryInfo) {
      toast({ title: "Error", description: "Please provide delivery information", variant: "destructive" });
      return;
    }

    const customerEmail = await resolveOrderCustomerEmail(order);

    await handleUpdateOrder(order.id, {
      order_status: "delivered",
      delivery_status: "delivered",
      delivery_info: deliveryInfo,
    });

    if (!customerEmail) {
      toast({
        title: "Customer email missing",
        description: "Order marked delivered, but no customer email was found to notify.",
        variant: "destructive",
      });
      return;
    }

    await notifyCustomerOrderDelivered(customerEmail, {
      orderId: order.id,
      voucherTitle: order.vouchers?.title || "Voucher",
      deliveryInfo,
    });
  };

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
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
      case "delivered":
      case "paid":
        return "bg-success/20 text-success";
      case "pending":
      case "processing":
        return "bg-warning/20 text-warning";
      case "under_review":
      case "payment_under_review":
        return "bg-primary/20 text-primary";
      case "cancelled":
      case "failed":
        return "bg-destructive/20 text-destructive";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case "stripe": return "Card";
      case "bitcoin": return "Bitcoin";
      case "zelle": return "Zelle";
      default: return method;
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      o.vouchers?.title?.toLowerCase().includes(search.toLowerCase()) ||
      o.id.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || o.payment_status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const pendingCount = orders.filter(o => o.payment_status === "processing" || o.payment_status === "under_review").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pendingCount > 0 && (
        <div className="p-4 rounded-xl bg-primary/10 border border-primary/30">
          <p className="text-primary font-medium">
            🔍 {pendingCount} order(s) awaiting payment review
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] bg-card">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-4 font-medium">Order</th>
                <th className="text-left p-4 font-medium">Customer</th>
                <th className="text-left p-4 font-medium">Amount</th>
                <th className="text-left p-4 font-medium">Method</th>
                <th className="text-left p-4 font-medium">Payment</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Date</th>
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-t border-border hover:bg-muted/20">
                  <td className="p-4">
                    <div className="font-medium">{order.vouchers?.title || "—"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{order.id.slice(0, 8)}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">{order.customer_email || "—"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{order.user_id?.slice(0, 8) || "—"}</div>
                  </td>
                  <td className="p-4 font-semibold">{formatCurrency(Number(order.amount_paid))}</td>
                  <td className="p-4">
                    <Badge variant="secondary">{getPaymentMethodLabel(order.payment_method)}</Badge>
                  </td>
                  <td className="p-4">
                    <Badge className={getStatusColor(order.payment_status || "pending")}>
                      {order.payment_status}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <Badge className={getStatusColor(order.order_status || "pending")}>
                      {order.order_status}
                    </Badge>
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {formatDate(order.created_at || "")}
                  </td>
                  <td className="p-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedOrder(order);
                        setAdminNotes(order.admin_notes || "");
                        setDeliveryInfo(order.delivery_info || "");
                        setProofSignedUrl(null);
                        if (order.proof_upload_url) {
                          getSignedProofUrl(order.proof_upload_url);
                        }
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredOrders.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            No orders found
          </div>
        )}
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground mb-1">Voucher</div>
                  <div className="font-medium">{selectedOrder.vouchers?.title || "—"}</div>
                  <div className="text-sm text-muted-foreground">{selectedOrder.vouchers?.airline}</div>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground mb-1">Amount</div>
                  <div className="font-bold text-xl text-primary">{formatCurrency(Number(selectedOrder.amount_paid))}</div>
                  <div className="text-sm text-muted-foreground">{getPaymentMethodLabel(selectedOrder.payment_method)}</div>
                </div>
              </div>

              {/* Customer Email */}
              {selectedOrder.customer_email && (
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Customer Email
                  </div>
                  <div className="font-medium">{selectedOrder.customer_email}</div>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground mb-1">Payment Status</div>
                  <Badge className={getStatusColor(selectedOrder.payment_status || "pending")}>
                    {selectedOrder.payment_status}
                  </Badge>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground mb-1">Order Status</div>
                  <Badge className={getStatusColor(selectedOrder.order_status || "pending")}>
                    {selectedOrder.order_status}
                  </Badge>
                </div>
              </div>

              {selectedOrder.proof_upload_url && (
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    Payment Proof
                  </div>
                  {loadingProof ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading proof...
                    </div>
                  ) : proofSignedUrl ? (
                    <div className="space-y-3">
                      {/* Thumbnail preview */}
                      <div className="border border-border rounded-lg overflow-hidden bg-card">
                        <img 
                          src={proofSignedUrl} 
                          alt="Payment proof"
                          className="max-h-48 w-auto object-contain mx-auto"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={proofSignedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-primary hover:underline text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Open Full Size
                        </a>
                        <a
                          href={proofSignedUrl}
                          download
                          className="flex items-center gap-2 text-primary hover:underline text-sm"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </a>
                      </div>
                      <p className="text-xs text-muted-foreground">Link expires in 1 hour</p>
                    </div>
                  ) : selectedOrder.proof_upload_url.startsWith("http") ? (
                    <a
                      href={selectedOrder.proof_upload_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View Proof
                    </a>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Transaction Hash / Reference:</p>
                      <code className="text-xs bg-card p-2 rounded block break-all">
                        {selectedOrder.proof_upload_url}
                      </code>
                    </div>
                  )}
                </div>
              )}

              {(selectedOrder.payment_method === "bitcoin" || selectedOrder.payment_method === "zelle") && (
                <>
                  {selectedOrder.btc_amount && (
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="text-sm text-muted-foreground mb-1">BTC Amount</div>
                      <div className="font-mono">{selectedOrder.btc_amount} BTC</div>
                      <div className="text-xs text-muted-foreground">To: {selectedOrder.btc_address}</div>
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label>Admin Notes</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes about this order..."
                  rows={2}
                />
              </div>

              {isAdmin && (selectedOrder.payment_status === "processing" || selectedOrder.payment_status === "under_review") && (
                <div className="flex gap-3">
                  <Button
                    variant="hero"
                    className="flex-1"
                    onClick={() => handleApprove(selectedOrder)}
                    disabled={updating}
                  >
                    {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Approve Payment
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => handleReject(selectedOrder)}
                    disabled={updating}
                  >
                    {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    Reject
                  </Button>
                </div>
              )}

              {selectedOrder.payment_status === "completed" && selectedOrder.order_status !== "delivered" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Delivery Information</Label>
                    <Textarea
                      value={deliveryInfo}
                      onChange={(e) => setDeliveryInfo(e.target.value)}
                      placeholder="Enter voucher code, confirmation number, or delivery details..."
                      rows={3}
                    />
                  </div>
                  <Button
                    variant="hero"
                    className="w-full"
                    onClick={() => handleMarkDelivered(selectedOrder)}
                    disabled={updating}
                  >
                    {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Mark as Delivered
                  </Button>
                </div>
              )}

              {selectedOrder.order_status === "delivered" && selectedOrder.delivery_info && (
                <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                  <div className="text-sm font-medium text-success mb-1">Delivery Info</div>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{selectedOrder.delivery_info}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
