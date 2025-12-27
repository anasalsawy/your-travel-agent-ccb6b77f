import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, Eye, DollarSign, Plane, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type TicketRequest = Tables<"ticket_requests">;

interface AdminTicketRequestsProps {
  isAdmin?: boolean;
}

export function AdminTicketRequests({ isAdmin = false }: AdminTicketRequestsProps) {
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState<TicketRequest | null>(null);
  const [quotedPrice, setQuotedPrice] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [ticketInfo, setTicketInfo] = useState("");
  const [updating, setUpdating] = useState(false);
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
      setSelectedRequest(null);
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

  const handleMarkTicketed = async () => {
    if (!selectedRequest || !ticketInfo) {
      toast({ title: "Error", description: "Please enter ticket information", variant: "destructive" });
      return;
    }
    await handleUpdateRequest(selectedRequest.id, {
      status: "ticketed",
      issued_ticket_info: ticketInfo,
      admin_notes: adminNotes || null,
    });
  };

  const handleMarkCompleted = async () => {
    if (!selectedRequest) return;
    await handleUpdateRequest(selectedRequest.id, {
      status: "completed",
      admin_notes: adminNotes || null,
    });
  };

  const handleUpdateStatus = async (status: string) => {
    if (!selectedRequest) return;
    await handleUpdateRequest(selectedRequest.id, {
      status: status as any,
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
      case "ticketed":
        return "bg-success/20 text-success";
      case "submitted":
      case "quoted":
      case "paid":
        return "bg-warning/20 text-warning";
      case "cancelled":
        return "bg-destructive/20 text-destructive";
      default:
        return "bg-muted text-muted-foreground";
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
        <div className="p-4 rounded-xl bg-accent/10 border border-accent/30">
          <p className="text-accent font-medium">
            ✈️ {pendingCount} new ticket request(s) awaiting quote
          </p>
        </div>
      )}

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
                <th className="text-left p-4 font-medium">Details</th>
                <th className="text-left p-4 font-medium">Quote</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => (
                <tr key={request.id} className="border-t border-border hover:bg-muted/20">
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
                    <div className="text-sm">{request.passengers} pax • {request.cabin_class}</div>
                    {request.preferred_airline && (
                      <div className="text-xs text-muted-foreground">{request.preferred_airline}</div>
                    )}
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
                    <Badge className={getStatusColor(request.status || "submitted")}>
                      {request.status}
                    </Badge>
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

        {filteredRequests.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            No ticket requests found
          </div>
        )}
      </div>

      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ticket Request Details</DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-6">
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
                </div>
              </div>

              {selectedRequest.preferred_airline && (
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground mb-1">Preferred Airline</div>
                  <div>{selectedRequest.preferred_airline}</div>
                </div>
              )}

              {selectedRequest.special_notes && (
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground mb-1">Special Notes</div>
                  <p className="text-sm whitespace-pre-line">{selectedRequest.special_notes}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Admin Notes</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Internal notes about this request..."
                  rows={2}
                />
              </div>

              {isAdmin && selectedRequest.status === "submitted" && (
                <div className="space-y-3">
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
                    Send Quote
                  </Button>
                </div>
              )}

              {selectedRequest.status === "paid" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Ticket Information</Label>
                    <Textarea
                      value={ticketInfo}
                      onChange={(e) => setTicketInfo(e.target.value)}
                      placeholder="Enter confirmation number, e-ticket details, etc..."
                      rows={3}
                    />
                  </div>
                  <Button
                    variant="hero"
                    className="w-full"
                    onClick={handleMarkTicketed}
                    disabled={updating || !ticketInfo}
                  >
                    {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Mark as Ticketed
                  </Button>
                </div>
              )}

              {selectedRequest.status === "ticketed" && (
                <Button
                  variant="hero"
                  className="w-full"
                  onClick={handleMarkCompleted}
                  disabled={updating}
                >
                  {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Mark as Completed
                </Button>
              )}

              {selectedRequest.issued_ticket_info && (
                <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                  <div className="text-sm font-medium text-success mb-1">Ticket Info</div>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{selectedRequest.issued_ticket_info}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t border-border">
                <Label className="self-center">Quick Status:</Label>
                <Select 
                  value={selectedRequest.status || "submitted"} 
                  onValueChange={(v) => handleUpdateStatus(v)}
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
