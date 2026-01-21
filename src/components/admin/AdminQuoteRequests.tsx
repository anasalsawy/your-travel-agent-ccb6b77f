import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, MessageSquare, Phone, Send, CheckCircle, Clock, RefreshCw } from "lucide-react";
import { format } from "date-fns";

interface QuoteRequest {
  id: string;
  conversation_id: string;
  message: string;
  customer_context: string | null;
  admin_response: string | null;
  responded_at: string | null;
  is_read: boolean;
  created_at: string;
  conversation?: {
    customer_phone: string | null;
    customer_name: string | null;
    status: string | null;
  };
}

export function AdminQuoteRequests() {
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<QuoteRequest | null>(null);
  const [quoteText, setQuoteText] = useState("");
  const [sending, setSending] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      // Fetch quote_request alerts with conversation details
      const { data: alerts, error } = await supabase
        .from("admin_alerts")
        .select(`
          id,
          conversation_id,
          message,
          customer_context,
          admin_response,
          responded_at,
          is_read,
          created_at
        `)
        .eq("alert_type", "quote_request")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch conversation details for each alert
      const requestsWithConversations = await Promise.all(
        (alerts || []).map(async (alert) => {
          const { data: conversation } = await supabase
            .from("ai_conversations")
            .select("customer_phone, customer_name, status")
            .eq("id", alert.conversation_id)
            .single();

          return {
            ...alert,
            conversation: conversation || undefined,
          };
        })
      );

      setRequests(requestsWithConversations);
    } catch (error) {
      console.error("Error fetching quote requests:", error);
      toast.error("Failed to load quote requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleOpenRequest = (request: QuoteRequest) => {
    setSelectedRequest(request);
    setQuoteText(request.admin_response || "");
    
    // Mark as read
    if (!request.is_read) {
      supabase
        .from("admin_alerts")
        .update({ is_read: true })
        .eq("id", request.id)
        .then(() => {
          setRequests(prev => 
            prev.map(r => r.id === request.id ? { ...r, is_read: true } : r)
          );
        });
    }
  };

  const handleSendQuote = async () => {
    if (!selectedRequest || !quoteText.trim()) {
      toast.error("Please enter a quote");
      return;
    }

    const phoneNumber = selectedRequest.conversation?.customer_phone;
    if (!phoneNumber) {
      toast.error("No phone number found for this customer");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-quote", {
        body: {
          alertId: selectedRequest.id,
          quote: quoteText,
          phoneNumber: phoneNumber,
        },
      });

      if (error) throw error;

      toast.success("Quote sent to customer via WhatsApp!");
      
      // Update local state
      setRequests(prev =>
        prev.map(r =>
          r.id === selectedRequest.id
            ? { ...r, admin_response: quoteText, responded_at: new Date().toISOString() }
            : r
        )
      );
      setSelectedRequest(null);
      setQuoteText("");
    } catch (error) {
      console.error("Error sending quote:", error);
      toast.error("Failed to send quote. Check Twilio configuration.");
    } finally {
      setSending(false);
    }
  };

  const pendingCount = requests.filter(r => !r.admin_response).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">WhatsApp Quote Requests</h2>
          <p className="text-sm text-muted-foreground">
            Customers waiting for quotes from Maya
          </p>
        </div>
        <div className="flex gap-2">
          {pendingCount > 0 && (
            <Badge variant="destructive" className="px-3 py-1">
              {pendingCount} pending
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={fetchRequests}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Request List */}
      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No quote requests yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              When customers ask Maya for flight prices on WhatsApp, they'll appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {requests.map((request) => (
            <Card
              key={request.id}
              className={`cursor-pointer transition-all hover:border-primary/50 ${
                !request.is_read && !request.admin_response ? "border-orange-500/50 bg-orange-500/5" : ""
              }`}
              onClick={() => handleOpenRequest(request)}
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">
                        {request.conversation?.customer_phone || "Unknown"}
                      </span>
                      {request.conversation?.customer_name && (
                        <span className="text-muted-foreground">
                          ({request.conversation.customer_name})
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {request.customer_context || request.message}
                    </p>
                    
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {format(new Date(request.created_at), "MMM d, h:mm a")}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    {request.admin_response ? (
                      <Badge variant="default" className="bg-green-600">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Quoted
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-orange-500 text-orange-500">
                        Pending
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quote Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Respond to Quote Request
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              {/* Customer Info */}
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="w-4 h-4" />
                  <span className="font-medium">
                    {selectedRequest.conversation?.customer_phone || "Unknown"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(selectedRequest.created_at), "MMMM d, yyyy 'at' h:mm a")}
                </p>
              </div>

              {/* Request Details */}
              <div>
                <h4 className="font-medium mb-2">Request Details</h4>
                <div className="p-4 bg-card border rounded-lg whitespace-pre-wrap text-sm">
                  {selectedRequest.message}
                </div>
              </div>

              {/* Previous Response */}
              {selectedRequest.admin_response && (
                <div>
                  <h4 className="font-medium mb-2 text-green-600">Previous Response</h4>
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-sm">
                    {selectedRequest.admin_response}
                  </div>
                </div>
              )}

              {/* Quote Input */}
              <div>
                <h4 className="font-medium mb-2">Your Quote</h4>
                <Textarea
                  value={quoteText}
                  onChange={(e) => setQuoteText(e.target.value)}
                  placeholder="Enter the quote to send to customer...&#10;&#10;Example: I can get you LAX to LHR business class for $2,400 roundtrip. That's about 55% off retail. Valid for the next 48 hours!"
                  className="min-h-[120px]"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Maya will send this to the customer via WhatsApp with a friendly message wrapper.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSelectedRequest(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSendQuote} disabled={sending || !quoteText.trim()}>
                  {sending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Send Quote via WhatsApp
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
