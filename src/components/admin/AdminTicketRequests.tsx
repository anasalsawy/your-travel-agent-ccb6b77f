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
  ExternalLink
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { 
  notifyCustomerTicketIssued, 
  notifyCustomerTicketPaymentApproved,
  notifyCustomerTicketPaymentRejected
} from "@/lib/notifications";

type TicketRequest = Tables<"ticket_requests">;

interface AdminTicketRequestsProps {
  isAdmin?: boolean;
}

// Workflow stages
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
  const [adminNotes, setAdminNotes] = useState("");
  const [ticketInfo, setTicketInfo] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [updating, setUpdating] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
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

  // Load proof image URL when request selected
  useEffect(() => {
    const loadProofUrl = async () => {
      if (selectedRequest?.proof_upload_url) {
        // Check if it's a storage path or external URL
        if (selectedRequest.proof_upload_url.startsWith("http")) {
          setProofUrl(selectedRequest.proof_upload_url);
        } else {
          // Get signed URL from storage
          const { data } = await supabase.storage
            .from("proof-uploads")
            .createSignedUrl(selectedRequest.proof_upload_url, 3600);
          setProofUrl(data?.signedUrl || null);
        }
      } else {
        setProofUrl(null);
      }
    };
    loadProofUrl();
  }, [selectedRequest?.proof_upload_url]);

  const handleUpdateRequest = async (requestId: string, updates: Partial<Tables<"ticket_requests">>) => {
    setUpdating(true);
    const { error } = await supabase
      .from("ticket_requests")
      .update(updates)
      .eq("id", requestId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Request updated successfully" });
      fetchRequests();
      // Refresh selected request
      const { data } = await supabase
        .from("ticket_requests")
        .select("*")
        .eq("id", requestId)
        .single();
      if (data) setSelectedRequest(data);
    }
    setUpdating(false);
  };

  const handleSendQuote = async () => {
    if (!selectedRequest || !quotedPrice) {
      toast({ title: "Error", description: "Please enter a quote amount", variant: "destructive" });
      return;
    }
    await handleUpdateRequest(selectedRequest.id, {
      quoted_price: parseFloat(quotedPrice),
      status: "quoted",
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

    // Send customer notification
    await notifyCustomerTicketPaymentApproved(selectedRequest.contact_email, {
      requestId: selectedRequest.id,
      origin: selectedRequest.origin,
      destination: selectedRequest.destination,
      amount: Number(selectedRequest.quoted_price),
    });
  };

  const handleRejectPayment = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      toast({ title: "Error", description: "Please provide a rejection reason", variant: "destructive" });
      return;
    }
    
    await handleUpdateRequest(selectedRequest.id, {
      payment_status: "failed",
      status: "quoted", // Reset to quoted so they can re-upload
      proof_upload_url: null, // Clear proof so they can re-upload
      admin_notes: `Payment rejected: ${rejectionReason}${adminNotes ? `\n\nNotes: ${adminNotes}` : ""}`,
    });

    // Send customer notification
    await notifyCustomerTicketPaymentRejected(selectedRequest.contact_email, {
      requestId: selectedRequest.id,
      origin: selectedRequest.origin,
      destination: selectedRequest.destination,
      amount: Number(selectedRequest.quoted_price),
      rejectionReason,
    });

    setRejectionReason("");
  };

  const handleMarkTicketed = async () => {
    if (!selectedRequest || !ticketInfo.trim()) {
      toast({ title: "Error", description: "Please enter ticket information", variant: "destructive" });
      return;
    }
    await handleUpdateRequest(selectedRequest.id, {
      status: "ticketed",
      issued_ticket_info: ticketInfo,
      admin_notes: adminNotes || null,
    });

    // Send customer notification
    await notifyCustomerTicketIssued(selectedRequest.contact_email, {
      origin: selectedRequest.origin,
      destination: selectedRequest.destination,
      departureDate: selectedRequest.departure_date,
      ticketInfo,
    });
  };

  const handleMarkCompleted = async () => {
    if (!selectedRequest) return;
    await handleUpdateRequest(selectedRequest.id, {
      status: "completed",
      admin_notes: adminNotes || null,
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
    });
  };

  // Determine current workflow stage
  const getCurrentStage = (request: TicketRequest) => {
    if (request.status === "completed") return "completed";
    if (request.status === "ticketed") return "ticketed";
    if (request.status === "paid" || request.payment_status === "completed") return "paid";
    if (request.payment_status === "processing" || request.proof_upload_url) return "payment_review";
    if (request.status === "quoted") return "quoted";
    return "submitted";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
      case "ticketed":
      case "paid":
        return "bg-success/20 text-success";
      case "payment_review":
        return "bg-warning/20 text-warning animate-pulse";
      case "submitted":
      case "quoted":
        return "bg-primary/20 text-primary";
      case "cancelled":
        return "bg-destructive/20 text-destructive";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getNextActionLabel = (request: TicketRequest) => {
    const stage = getCurrentStage(request);
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
    const matchesSearch = 
      r.origin.toLowerCase().includes(search.toLowerCase()) ||
      r.destination.toLowerCase().includes(search.toLowerCase()) ||
      r.contact_email.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const pendingCount = requests.filter(r => r.status === "submitted").length;
  const paymentReviewCount = requests.filter(r => 
    r.payment_status === "processing" || (r.proof_upload_url && r.payment_status !== "completed")
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentStage = selectedRequest ? getCurrentStage(selectedRequest) : null;

  return (
    <div className="space-y-6">
      {/* Alerts */}
      <div className="space-y-3">
        {pendingCount > 0 && (
          <div className="p-4 rounded-xl bg-accent/10 border border-accent/30">
            <p className="text-accent font-medium">
              ✈️ {pendingCount} new ticket request(s) awaiting quote
            </p>
          </div>
        )}
        {paymentReviewCount > 0 && (
          <div className="p-4 rounded-xl bg-warning/10 border border-warning/30">
            <p className="text-warning font-medium">
              💳 {paymentReviewCount} payment(s) awaiting review
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search requests..."
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
                  <tr key={request.id} className={`border-t border-border hover:bg-muted/20 ${
                    stage === "payment_review" ? "bg-warning/5" : ""
                  }`}>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Plane className="w-4 h-4 text-primary" />
                        <div>
                          <div className="font-medium">{request.origin} → {request.destination}</div>
                          <div className="text-xs text-muted-foreground">{request.trip_type}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm">{formatDate(request.departure_date)}</div>
                      {request.return_date && (
                        <div className="text-xs text-muted-foreground">Return: {formatDate(request.return_date)}</div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="text-xs text-muted-foreground">{request.contact_email}</div>
                    </td>
                    <td className="p-4">
                      {request.quoted_price ? (
                        <div className="font-semibold text-primary">{formatCurrency(Number(request.quoted_price))}</div>
                      ) : request.budget ? (
                        <div className="text-sm text-muted-foreground">Budget: {formatCurrency(Number(request.budget))}</div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-4">
                      <Badge className={getStatusColor(stage)}>
                        {stage === "payment_review" ? "⚡ Payment Review" : request.status}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <span className="text-sm font-medium">{getNextActionLabel(request)}</span>
                    </td>
                    <td className="p-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedRequest(request);
                          setQuotedPrice(request.quoted_price ? String(request.quoted_price) : "");
                          setAdminNotes(request.admin_notes || "");
                          setTicketInfo(request.issued_ticket_info || "");
                          setRejectionReason("");
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredRequests.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            No ticket requests found
          </div>
        )}
      </div>

      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Ticket Request Details
              {currentStage && (
                <Badge className={getStatusColor(currentStage)}>
                  {currentStage === "payment_review" ? "⚡ Payment Review Required" : selectedRequest?.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-6">
              {/* Workflow Progress */}
              <div className="p-4 rounded-lg bg-muted/30 border border-border">
                <Label className="text-sm text-muted-foreground mb-3 block">Workflow Progress</Label>
                <div className="flex items-center justify-between relative">
                  <div className="absolute top-4 left-0 right-0 h-0.5 bg-border" />
                  <div 
                    className="absolute top-4 left-0 h-0.5 bg-primary transition-all duration-500"
                    style={{ 
                      width: `${(WORKFLOW_STAGES.findIndex(s => s.key === currentStage) / (WORKFLOW_STAGES.length - 1)) * 100}%` 
                    }}
                  />
                  
                  {WORKFLOW_STAGES.map((stage, index) => {
                    const currentIndex = WORKFLOW_STAGES.findIndex(s => s.key === currentStage);
                    const isCompleted = index < currentIndex;
                    const isCurrent = index === currentIndex;
                    
                    return (
                      <div key={stage.key} className="flex flex-col items-center relative z-10">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                          isCompleted 
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
                        <span className={`text-xs mt-2 text-center max-w-[70px] ${
                          isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                        }`}>
                          {stage.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Current Step Action Card */}
              {currentStage !== "completed" && (
                <div className={`p-4 rounded-lg border-2 ${
                  currentStage === "payment_review" 
                    ? "bg-warning/10 border-warning/50" 
                    : "bg-primary/5 border-primary/30"
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    {currentStage === "payment_review" ? (
                      <AlertCircle className="w-5 h-5 text-warning" />
                    ) : (
                      <FileCheck className="w-5 h-5 text-primary" />
                    )}
                    <span className="font-semibold">
                      Current Step: {WORKFLOW_STAGES.find(s => s.key === currentStage)?.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {currentStage === "submitted" && "Review the request and send a quote to the customer."}
                    {currentStage === "quoted" && "Waiting for customer to submit payment."}
                    {currentStage === "payment_review" && "Customer uploaded payment proof. Review and approve or reject."}
                    {currentStage === "paid" && "Payment confirmed. Enter ticket details and issue the ticket."}
                    {currentStage === "ticketed" && "Ticket issued. Mark as complete to close the request."}
                  </p>
                </div>
              )}

              {/* Request Details */}
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 text-xl font-bold text-primary mb-2">
                  <Plane className="w-5 h-5" />
                  {selectedRequest.origin} → {selectedRequest.destination}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Departure:</span> {formatDate(selectedRequest.departure_date)}
                  </div>
                  {selectedRequest.return_date && (
                    <div>
                      <span className="text-muted-foreground">Return:</span> {formatDate(selectedRequest.return_date)}
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Trip:</span> {selectedRequest.trip_type}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Passengers:</span> {selectedRequest.passengers}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Class:</span> {selectedRequest.cabin_class}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Flexibility:</span> {selectedRequest.flexibility || "None"}
                  </div>
                </div>
              </div>

              {/* Customer & Payment Info */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground mb-1">Customer</div>
                  <div className="font-medium">{selectedRequest.contact_email}</div>
                  {selectedRequest.contact_phone && (
                    <div className="text-sm text-muted-foreground">{selectedRequest.contact_phone}</div>
                  )}
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground mb-1">Budget / Quote</div>
                  {selectedRequest.budget && (
                    <div className="text-sm">Budget: {formatCurrency(Number(selectedRequest.budget))}</div>
                  )}
                  {selectedRequest.quoted_price && (
                    <div className="font-bold text-xl text-primary">Quote: {formatCurrency(Number(selectedRequest.quoted_price))}</div>
                  )}
                  {selectedRequest.payment_method && (
                    <div className="text-sm text-muted-foreground mt-1">
                      Method: {selectedRequest.payment_method}
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Proof Section */}
              {(selectedRequest.proof_upload_url || currentStage === "payment_review") && (
                <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
                  <div className="flex items-center gap-2 mb-3">
                    <ImageIcon className="w-5 h-5 text-warning" />
                    <span className="font-semibold text-warning">Payment Proof Uploaded</span>
                  </div>
                  
                  {proofUrl ? (
                    <div className="space-y-3">
                      <img 
                        src={proofUrl} 
                        alt="Payment proof" 
                        className="max-w-full max-h-64 rounded-lg border border-border"
                      />
                      <Button variant="outline" size="sm" asChild>
                        <a href={proofUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Open Full Size
                        </a>
                      </Button>
                    </div>
                  ) : selectedRequest.proof_upload_url?.startsWith("http") ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={selectedRequest.proof_upload_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View Proof (External)
                      </a>
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Proof reference: {selectedRequest.proof_upload_url}
                    </p>
                  )}
                </div>
              )}

              {/* Special Notes */}
              {selectedRequest.special_notes && (
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground mb-1">Customer Notes</div>
                  <p className="text-sm whitespace-pre-line">{selectedRequest.special_notes}</p>
                </div>
              )}

              {/* Admin Notes */}
              <div className="space-y-2">
                <Label>Admin Notes</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Internal notes about this request..."
                  rows={2}
                />
              </div>

              {/* Action Sections Based on Stage */}
              
              {/* Stage: Submitted - Send Quote */}
              {currentStage === "submitted" && isAdmin && (
                <div className="space-y-3 p-4 rounded-lg border-2 border-dashed border-primary/50">
                  <Label className="text-primary font-semibold">👉 Action: Send Quote</Label>
                  <div className="space-y-2">
                    <Label>Quote Amount (USD)</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type="number"
                          step="0.01"
                          value={quotedPrice}
                          onChange={(e) => setQuotedPrice(e.target.value)}
                          placeholder="Enter quote..."
                          className="pl-10"
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="hero"
                    className="w-full"
                    onClick={handleSendQuote}
                    disabled={updating || !quotedPrice}
                  >
                    {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                    Send Quote to Customer
                  </Button>
                </div>
              )}

              {/* Stage: Payment Review - Approve/Reject */}
              {currentStage === "payment_review" && (
                <div className="space-y-4 p-4 rounded-lg border-2 border-warning/50 bg-warning/5">
                  <Label className="text-warning font-semibold">⚡ Action: Review Payment</Label>
                  
                  <div className="flex gap-3">
                    <Button
                      variant="default"
                      className="flex-1 bg-success hover:bg-success/90"
                      onClick={handleApprovePayment}
                      disabled={updating}
                    >
                      {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Approve Payment
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => {
                        if (!rejectionReason.trim()) {
                          const reason = prompt("Please enter a rejection reason:");
                          if (reason) {
                            setRejectionReason(reason);
                            handleRejectPayment();
                          }
                        } else {
                          handleRejectPayment();
                        }
                      }}
                      disabled={updating}
                    >
                      {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                      Reject Payment
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Rejection Reason (required to reject)</Label>
                    <Input
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="e.g., Amount doesn't match, unclear proof..."
                    />
                  </div>
                </div>
              )}

              {/* Stage: Paid - Issue Ticket */}
              {currentStage === "paid" && (
                <div className="space-y-3 p-4 rounded-lg border-2 border-dashed border-success/50">
                  <Label className="text-success font-semibold">✅ Action: Issue Ticket</Label>
                  <div className="space-y-2">
                    <Label>Ticket Information (PNR, Confirmation, etc.)</Label>
                    <Textarea
                      value={ticketInfo}
                      onChange={(e) => setTicketInfo(e.target.value)}
                      placeholder="Enter confirmation number, e-ticket details, flight info..."
                      rows={3}
                    />
                  </div>
                  <Button
                    variant="hero"
                    className="w-full"
                    onClick={handleMarkTicketed}
                    disabled={updating || !ticketInfo.trim()}
                  >
                    {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Issue Ticket & Notify Customer
                  </Button>
                </div>
              )}

              {/* Stage: Ticketed - Complete */}
              {currentStage === "ticketed" && (
                <div className="space-y-3 p-4 rounded-lg border-2 border-dashed border-primary/50">
                  <Label className="text-primary font-semibold">🎉 Action: Complete Request</Label>
                  <Button
                    variant="hero"
                    className="w-full"
                    onClick={handleMarkCompleted}
                    disabled={updating}
                  >
                    {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Mark as Completed
                  </Button>
                </div>
              )}

              {/* Issued Ticket Info */}
              {selectedRequest.issued_ticket_info && (
                <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                  <div className="text-sm font-medium text-success mb-1">Issued Ticket Info</div>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{selectedRequest.issued_ticket_info}</p>
                </div>
              )}

              {/* Quick Status Override (admin only) */}
              {isAdmin && (
                <div className="flex gap-2 pt-4 border-t border-border">
                  <Label className="self-center text-muted-foreground">Override Status:</Label>
                  <Select 
                    value={selectedRequest.status || "submitted"} 
                    onValueChange={(v) => handleUpdateRequest(selectedRequest.id, { status: v as any })}
                    disabled={updating}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="quoted">Quoted</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="ticketed">Ticketed</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
