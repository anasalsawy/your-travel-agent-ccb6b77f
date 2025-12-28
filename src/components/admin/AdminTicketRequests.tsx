import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { 
  Loader2, Search, Eye, DollarSign, Plane, Check, X, 
  FileCheck, AlertCircle, CheckCircle2, Circle, Image as ImageIcon,
  ExternalLink, Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import {
  notifyCustomerDepositApproved,
  notifyCustomerDepositRejected,
  notifyCustomerTicketIssuedBalanceDue,
  notifyCustomerBalanceApproved,
  notifyCustomerBalanceRejected
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

interface AdminTicketRequestsProps {
  isAdmin?: boolean;
}

const WORKFLOW_STAGES = [
  { key: "submitted", label: "New Request", description: "Awaiting quote" },
  { key: "quoted", label: "Quote Sent", description: "Awaiting payment" },
  { key: "payment_review", label: "Payment Review", description: "Proof uploaded" },
  { key: "paid", label: "Paid", description: "Ready to issue ticket" },
  { key: "ticketed", label: "Ticketed", description: "Ticket issued" },
  { key: "completed", label: "Completed", description: "Request closed" },
];

export function AdminTicketRequests({ isAdmin = false }: AdminTicketRequestsProps) {
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState<TicketRequest | null>(null);
  const [quotedPrice, setQuotedPrice] = useState("");
  const [depositPercent, setDepositPercent] = useState("50");
  const [adminNotes, setAdminNotes] = useState("");
  const [ticketInfo, setTicketInfo] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [updating, setUpdating] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [depositProofUrl, setDepositProofUrl] = useState<string | null>(null);
  const [balanceProofUrl, setBalanceProofUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from("ticket_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setRequests((data || []) as TicketRequest[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  // Load proof URLs when request selected
  useEffect(() => {
    const loadProofUrls = async () => {
      if (!selectedRequest) {
        setProofUrl(null);
        setDepositProofUrl(null);
        setBalanceProofUrl(null);
        return;
      }

      const loadUrl = async (path: string | null | undefined) => {
        if (!path) return null;
        if (path.startsWith("http")) return path;
        const { data } = await supabase.storage.from("proof-uploads").createSignedUrl(path, 3600);
        return data?.signedUrl || null;
      };

      const [proof, deposit, balance] = await Promise.all([
        loadUrl(selectedRequest.proof_upload_url),
        loadUrl(selectedRequest.deposit_proof_url),
        loadUrl(selectedRequest.balance_proof_url),
      ]);
      setProofUrl(proof);
      setDepositProofUrl(deposit);
      setBalanceProofUrl(balance);
    };
    loadProofUrls();
  }, [selectedRequest?.proof_upload_url, selectedRequest?.deposit_proof_url, selectedRequest?.balance_proof_url]);

  const handleUpdateRequest = async (requestId: string, updates: Partial<TicketRequest>) => {
    setUpdating(true);
    const { error } = await supabase.from("ticket_requests").update(updates).eq("id", requestId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Request updated successfully" });
      fetchRequests();
      const { data } = await supabase.from("ticket_requests").select("*").eq("id", requestId).single();
      if (data) setSelectedRequest(data as TicketRequest);
    }
    setUpdating(false);
  };

  const handleSendQuote = async () => {
    if (!selectedRequest || !quotedPrice) {
      toast({ title: "Error", description: "Please enter a quote amount", variant: "destructive" });
      return;
    }
    const price = parseFloat(quotedPrice);
    const depPercent = Math.min(100, Math.max(1, parseInt(depositPercent) || 50));
    const depAmount = Math.round(price * (depPercent / 100));
    const balAmount = price - depAmount;
    
    await handleUpdateRequest(selectedRequest.id, {
      quoted_price: price,
      status: "quoted",
      deposit_amount: depAmount,
      balance_amount: balAmount,
      admin_notes: adminNotes || null,
    });
  };

  const handleApprovePayment = async () => {
    if (!selectedRequest) return;
    await handleUpdateRequest(selectedRequest.id, {
      payment_status: "completed",
      status: "paid",
      admin_notes: adminNotes || null,
    });
  };

  const handleRejectPayment = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      toast({ title: "Error", description: "Please provide a rejection reason", variant: "destructive" });
      return;
    }
    await handleUpdateRequest(selectedRequest.id, {
      payment_status: "failed",
      status: "quoted",
      proof_upload_url: null,
      admin_notes: `Payment rejected: ${rejectionReason}${adminNotes ? `\n\nNotes: ${adminNotes}` : ""}`,
    });
    setRejectionReason("");
  };

  // Split payment handlers
  const handleApproveDeposit = async () => {
    if (!selectedRequest) return;
    await handleUpdateRequest(selectedRequest.id, {
      deposit_status: "approved",
      admin_notes: adminNotes || null,
    });
    await notifyCustomerDepositApproved(selectedRequest.contact_email, {
      requestId: selectedRequest.id,
      origin: selectedRequest.origin,
      destination: selectedRequest.destination,
      depositAmount: Number(selectedRequest.deposit_amount),
    });
  };

  const handleRejectDeposit = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      toast({ title: "Error", description: "Please provide a rejection reason", variant: "destructive" });
      return;
    }
    await handleUpdateRequest(selectedRequest.id, {
      deposit_status: "rejected",
      deposit_proof_url: null,
      admin_notes: `Deposit rejected: ${rejectionReason}`,
    });
    await notifyCustomerDepositRejected(selectedRequest.contact_email, {
      requestId: selectedRequest.id,
      origin: selectedRequest.origin,
      destination: selectedRequest.destination,
      depositAmount: Number(selectedRequest.deposit_amount),
      rejectionReason,
    });
    setRejectionReason("");
  };

  const handleApproveBalance = async () => {
    if (!selectedRequest) return;
    await handleUpdateRequest(selectedRequest.id, {
      balance_status: "approved",
      payment_status: "completed",
      status: "completed",
      admin_notes: adminNotes || null,
    });
    await notifyCustomerBalanceApproved(selectedRequest.contact_email, {
      requestId: selectedRequest.id,
      origin: selectedRequest.origin,
      destination: selectedRequest.destination,
      balanceAmount: Number(selectedRequest.balance_amount),
    });
  };

  const handleRejectBalance = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      toast({ title: "Error", description: "Please provide a rejection reason", variant: "destructive" });
      return;
    }
    await handleUpdateRequest(selectedRequest.id, {
      balance_status: "rejected",
      balance_proof_url: null,
      admin_notes: `Balance rejected: ${rejectionReason}`,
    });
    await notifyCustomerBalanceRejected(selectedRequest.contact_email, {
      requestId: selectedRequest.id,
      origin: selectedRequest.origin,
      destination: selectedRequest.destination,
      balanceAmount: Number(selectedRequest.balance_amount),
      rejectionReason,
    });
    setRejectionReason("");
  };

  const handleMarkTicketed = async () => {
    if (!selectedRequest || !ticketInfo.trim()) {
      toast({ title: "Error", description: "Please enter ticket information", variant: "destructive" });
      return;
    }
    
    const isSplitPayment = selectedRequest.payment_plan === "deposit";
    
    if (isSplitPayment) {
      // For split payments, set balance_status to 'due' and notify with balance due date
      const balanceDueDate = selectedRequest.balance_due_date || (() => {
        const d = new Date(selectedRequest.departure_date);
        d.setDate(d.getDate() - 3);
        return d.toISOString().split('T')[0];
      })();
      
      await handleUpdateRequest(selectedRequest.id, {
        status: "ticketed",
        issued_ticket_info: ticketInfo,
        balance_status: "due",
        balance_due_date: balanceDueDate,
        admin_notes: adminNotes || null,
      });
      
      await notifyCustomerTicketIssuedBalanceDue(selectedRequest.contact_email, {
        requestId: selectedRequest.id,
        origin: selectedRequest.origin,
        destination: selectedRequest.destination,
        departureDate: selectedRequest.departure_date,
        balanceAmount: Number(selectedRequest.balance_amount),
        balanceDueDate: balanceDueDate,
        ticketInfo,
      });
    } else {
      await handleUpdateRequest(selectedRequest.id, {
        status: "ticketed",
        issued_ticket_info: ticketInfo,
        admin_notes: adminNotes || null,
      });
    }
  };

  const handleMarkCompleted = async () => {
    if (!selectedRequest) return;
    await handleUpdateRequest(selectedRequest.id, { status: "completed", admin_notes: adminNotes || null });
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(amount);
  const formatDate = (date: string) => new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const getCurrentStage = (request: TicketRequest) => {
    if (request.status === "completed") return "completed";
    if (request.status === "ticketed") return "ticketed";
    if (request.status === "paid" || request.payment_status === "completed") return "paid";
    
    // Split payment stages
    if (request.payment_plan === "deposit") {
      if (request.balance_status === "under_review") return "payment_review";
      if (request.deposit_status === "under_review") return "payment_review";
      if (request.deposit_status === "approved") return "paid";
    }
    
    if (request.payment_status === "processing" || request.proof_upload_url) return "payment_review";
    if (request.status === "quoted") return "quoted";
    return "submitted";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": case "ticketed": case "paid": return "bg-success/20 text-success";
      case "payment_review": return "bg-warning/20 text-warning animate-pulse";
      case "submitted": case "quoted": return "bg-primary/20 text-primary";
      case "cancelled": return "bg-destructive/20 text-destructive";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getNextActionLabel = (request: TicketRequest) => {
    const stage = getCurrentStage(request);
    const isSplit = request.payment_plan === "deposit";
    
    if (isSplit) {
      if (request.deposit_status === "under_review") return "Review Deposit";
      if (request.balance_status === "under_review") return "Review Balance";
      if (request.deposit_status === "approved" && request.status !== "ticketed") return "Issue Ticket";
      if (request.balance_status === "due" || request.balance_status === "past_due") return "Awaiting Balance";
    }
    
    switch (stage) {
      case "submitted": return "Send Quote";
      case "quoted": return "Awaiting Payment";
      case "payment_review": return "Review Payment";
      case "paid": return "Issue Ticket";
      case "ticketed": return "Complete";
      default: return "—";
    }
  };

  const filteredRequests = requests.filter(r => {
    const matchesSearch = r.origin.toLowerCase().includes(search.toLowerCase()) ||
      r.destination.toLowerCase().includes(search.toLowerCase()) ||
      r.contact_email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = requests.filter(r => r.status === "submitted").length;
  const paymentReviewCount = requests.filter(r => 
    r.payment_status === "processing" || 
    r.deposit_status === "under_review" || 
    r.balance_status === "under_review" ||
    (r.proof_upload_url && r.payment_status !== "completed")
  ).length;

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const currentStage = selectedRequest ? getCurrentStage(selectedRequest) : null;
  const isSplitPayment = selectedRequest?.payment_plan === "deposit";
  const isDepositReview = isSplitPayment && selectedRequest?.deposit_status === "under_review";
  const isBalanceReview = isSplitPayment && selectedRequest?.balance_status === "under_review";
  const isDepositApproved = isSplitPayment && selectedRequest?.deposit_status === "approved";

  return (
    <div className="space-y-6">
      {/* Alerts */}
      <div className="space-y-3">
        {pendingCount > 0 && (
          <div className="p-4 rounded-xl bg-accent/10 border border-accent/30">
            <p className="text-accent font-medium">✈️ {pendingCount} new ticket request(s) awaiting quote</p>
          </div>
        )}
        {paymentReviewCount > 0 && (
          <div className="p-4 rounded-xl bg-warning/10 border border-warning/30">
            <p className="text-warning font-medium">💳 {paymentReviewCount} payment(s) awaiting review</p>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search requests..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-card" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] bg-card"><SelectValue placeholder="Filter by status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Requests</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="quoted">Quoted</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="ticketed">Ticketed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-4 font-medium">Route</th>
                <th className="text-left p-4 font-medium">Dates</th>
                <th className="text-left p-4 font-medium">Customer</th>
                <th className="text-left p-4 font-medium">Quote</th>
                <th className="text-left p-4 font-medium">Stage</th>
                <th className="text-left p-4 font-medium">Next Action</th>
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => {
                const stage = getCurrentStage(request);
                return (
                  <tr key={request.id} className={`border-t border-border hover:bg-muted/20 ${stage === "payment_review" ? "bg-warning/5" : ""}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Plane className="w-4 h-4 text-primary" />
                        <div>
                          <div className="font-medium">{request.origin} → {request.destination}</div>
                          <div className="text-xs text-muted-foreground">
                            {request.trip_type}
                            {request.payment_plan === "deposit" && <Badge className="ml-2 text-xs bg-accent/20 text-accent">Split Pay</Badge>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm">{formatDate(request.departure_date)}</div>
                      {request.return_date && <div className="text-xs text-muted-foreground">Return: {formatDate(request.return_date)}</div>}
                    </td>
                    <td className="p-4"><div className="text-xs text-muted-foreground">{request.contact_email}</div></td>
                    <td className="p-4">
                      {request.quoted_price ? (
                        <div className="font-semibold text-primary">{formatCurrency(Number(request.quoted_price))}</div>
                      ) : request.budget ? (
                        <div className="text-sm text-muted-foreground">Budget: {formatCurrency(Number(request.budget))}</div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-4"><Badge className={getStatusColor(stage)}>{stage === "payment_review" ? "⚡ Payment Review" : request.status}</Badge></td>
                    <td className="p-4"><span className="text-sm font-medium">{getNextActionLabel(request)}</span></td>
                    <td className="p-4">
                      <Button variant="ghost" size="icon" onClick={async () => {
                        // Fetch fresh data to ensure we have latest proof URLs
                        const { data: freshData } = await supabase
                          .from("ticket_requests")
                          .select("*")
                          .eq("id", request.id)
                          .single();
                        const req = (freshData || request) as TicketRequest;
                        setSelectedRequest(req);
                        setQuotedPrice(req.quoted_price ? String(req.quoted_price) : "");
                        setAdminNotes(req.admin_notes || "");
                        setTicketInfo(req.issued_ticket_info || "");
                        setRejectionReason("");
                      }}><Eye className="w-4 h-4" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredRequests.length === 0 && <div className="p-12 text-center text-muted-foreground">No ticket requests found</div>}
      </div>

      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Ticket Request Details
              {currentStage && <Badge className={getStatusColor(currentStage)}>{currentStage === "payment_review" ? "⚡ Payment Review Required" : selectedRequest?.status}</Badge>}
              {isSplitPayment && <Badge className="bg-accent/20 text-accent">Split Payment</Badge>}
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-6">
              {/* Split Payment Summary */}
              {isSplitPayment && (
                <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
                  <div className="flex items-center gap-2 mb-3"><Clock className="w-5 h-5 text-accent" /><span className="font-semibold">Split Payment Plan</span></div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Total:</span> <strong>{formatCurrency(Number(selectedRequest.quoted_price))}</strong></div>
                    <div><span className="text-muted-foreground">Deposit:</span> <strong>{formatCurrency(Number(selectedRequest.deposit_amount))}</strong> <Badge className="ml-1 text-xs">{selectedRequest.deposit_status}</Badge></div>
                    <div><span className="text-muted-foreground">Balance:</span> <strong>{formatCurrency(Number(selectedRequest.balance_amount))}</strong> <Badge className="ml-1 text-xs">{selectedRequest.balance_status}</Badge></div>
                  </div>
                  {selectedRequest.balance_due_date && <div className="mt-2 text-sm"><span className="text-muted-foreground">Balance Due:</span> <strong>{formatDate(selectedRequest.balance_due_date)}</strong></div>}
                </div>
              )}

              {/* Request Details */}
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 text-xl font-bold text-primary mb-2"><Plane className="w-5 h-5" />{selectedRequest.origin} → {selectedRequest.destination}</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Departure:</span> {formatDate(selectedRequest.departure_date)}</div>
                  {selectedRequest.return_date && <div><span className="text-muted-foreground">Return:</span> {formatDate(selectedRequest.return_date)}</div>}
                  <div><span className="text-muted-foreground">Passengers:</span> {selectedRequest.passengers}</div>
                  <div><span className="text-muted-foreground">Class:</span> {selectedRequest.cabin_class}</div>
                </div>
              </div>

              {/* Customer Info */}
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground mb-1">Customer</div>
                <div className="font-medium">{selectedRequest.contact_email}</div>
              </div>

              {/* Deposit Proof (for split payments) */}
              {isSplitPayment && depositProofUrl && (
                <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
                  <div className="flex items-center gap-2 mb-3"><ImageIcon className="w-5 h-5 text-warning" /><span className="font-semibold text-warning">Deposit Proof</span></div>
                  <img src={depositProofUrl} alt="Deposit proof" className="max-w-full max-h-64 rounded-lg border border-border" />
                </div>
              )}

              {/* Balance Proof (for split payments) */}
              {isSplitPayment && balanceProofUrl && (
                <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
                  <div className="flex items-center gap-2 mb-3"><ImageIcon className="w-5 h-5 text-warning" /><span className="font-semibold text-warning">Balance Proof</span></div>
                  <img src={balanceProofUrl} alt="Balance proof" className="max-w-full max-h-64 rounded-lg border border-border" />
                </div>
              )}

              {/* Regular Proof (for full payments) */}
              {!isSplitPayment && proofUrl && (
                <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
                  <div className="flex items-center gap-2 mb-3"><ImageIcon className="w-5 h-5 text-warning" /><span className="font-semibold text-warning">Payment Proof</span></div>
                  <img src={proofUrl} alt="Payment proof" className="max-w-full max-h-64 rounded-lg border border-border" />
                </div>
              )}

              {/* Admin Notes */}
              <div className="space-y-2"><Label>Admin Notes</Label><Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Internal notes..." rows={2} /></div>

              {/* Deposit Review Actions */}
              {isDepositReview && (
                <div className="space-y-4 p-4 rounded-lg border-2 border-warning/50 bg-warning/5">
                  <Label className="text-warning font-semibold">⚡ Action: Review Deposit Payment</Label>
                  <div className="flex gap-3">
                    <Button variant="default" className="flex-1 bg-success hover:bg-success/90" onClick={handleApproveDeposit} disabled={updating}>
                      {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve Deposit
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={() => { if (!rejectionReason.trim()) { const r = prompt("Rejection reason:"); if (r) { setRejectionReason(r); handleRejectDeposit(); } } else handleRejectDeposit(); }} disabled={updating}>
                      <X className="w-4 h-4" /> Reject Deposit
                    </Button>
                  </div>
                  <Input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Rejection reason (required to reject)" />
                </div>
              )}

              {/* Balance Review Actions */}
              {isBalanceReview && (
                <div className="space-y-4 p-4 rounded-lg border-2 border-warning/50 bg-warning/5">
                  <Label className="text-warning font-semibold">⚡ Action: Review Balance Payment</Label>
                  <div className="flex gap-3">
                    <Button variant="default" className="flex-1 bg-success hover:bg-success/90" onClick={handleApproveBalance} disabled={updating}>
                      {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve Balance
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={() => { if (!rejectionReason.trim()) { const r = prompt("Rejection reason:"); if (r) { setRejectionReason(r); handleRejectBalance(); } } else handleRejectBalance(); }} disabled={updating}>
                      <X className="w-4 h-4" /> Reject Balance
                    </Button>
                  </div>
                  <Input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Rejection reason (required to reject)" />
                </div>
              )}

              {/* Issue Ticket (for split payments after deposit approved) */}
              {isSplitPayment && isDepositApproved && selectedRequest.status !== "ticketed" && selectedRequest.status !== "completed" && (
                <div className="space-y-3 p-4 rounded-lg border-2 border-dashed border-success/50">
                  <Label className="text-success font-semibold">✅ Action: Issue Ticket (Balance Due After)</Label>
                  <Textarea value={ticketInfo} onChange={(e) => setTicketInfo(e.target.value)} placeholder="Enter PNR, confirmation, flight info..." rows={3} />
                  <Button variant="hero" className="w-full" onClick={handleMarkTicketed} disabled={updating || !ticketInfo.trim()}>
                    {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Issue Ticket & Set Balance Due
                  </Button>
                </div>
              )}

              {/* Standard flow actions (non-split) */}
              {currentStage === "submitted" && isAdmin && (
                <div className="space-y-3 p-4 rounded-lg border-2 border-dashed border-primary/50">
                  <Label className="text-primary font-semibold">👉 Action: Send Quote</Label>
                  <div className="relative"><DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type="number" value={quotedPrice} onChange={(e) => setQuotedPrice(e.target.value)} placeholder="Enter quote amount..." className="pl-10" /></div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground whitespace-nowrap">Deposit %:</Label>
                    <Input type="number" min="1" max="100" value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} className="w-20" />
                    {quotedPrice && (
                      <span className="text-xs text-muted-foreground">
                        = {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(Math.round(parseFloat(quotedPrice) * (parseInt(depositPercent) || 50) / 100))} deposit
                      </span>
                    )}
                  </div>
                  <Button variant="hero" className="w-full" onClick={handleSendQuote} disabled={updating || !quotedPrice}>{updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />} Send Quote</Button>
                </div>
              )}

              {!isSplitPayment && currentStage === "payment_review" && (
                <div className="space-y-4 p-4 rounded-lg border-2 border-warning/50 bg-warning/5">
                  <Label className="text-warning font-semibold">⚡ Action: Review Payment</Label>
                  <div className="flex gap-3">
                    <Button variant="default" className="flex-1 bg-success hover:bg-success/90" onClick={handleApprovePayment} disabled={updating}><Check className="w-4 h-4" /> Approve</Button>
                    <Button variant="destructive" className="flex-1" onClick={() => { if (!rejectionReason.trim()) { const r = prompt("Rejection reason:"); if (r) { setRejectionReason(r); handleRejectPayment(); } } else handleRejectPayment(); }} disabled={updating}><X className="w-4 h-4" /> Reject</Button>
                  </div>
                  <Input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Rejection reason..." />
                </div>
              )}

              {!isSplitPayment && currentStage === "paid" && (
                <div className="space-y-3 p-4 rounded-lg border-2 border-dashed border-success/50">
                  <Label className="text-success font-semibold">✅ Action: Issue Ticket</Label>
                  <Textarea value={ticketInfo} onChange={(e) => setTicketInfo(e.target.value)} placeholder="Enter PNR, confirmation..." rows={3} />
                  <Button variant="hero" className="w-full" onClick={handleMarkTicketed} disabled={updating || !ticketInfo.trim()}><Check className="w-4 h-4" /> Issue Ticket</Button>
                </div>
              )}

              {currentStage === "ticketed" && (!isSplitPayment || selectedRequest.balance_status === "approved") && (
                <div className="space-y-3 p-4 rounded-lg border-2 border-dashed border-primary/50">
                  <Button variant="hero" className="w-full" onClick={handleMarkCompleted} disabled={updating}><Check className="w-4 h-4" /> Mark Completed</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
