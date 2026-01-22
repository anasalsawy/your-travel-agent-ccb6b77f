import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Phone, PhoneOff, PhoneIncoming, Clock, CheckCircle2, XCircle, Search, RefreshCw, FileText } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface CallLog {
  id: string;
  airline: string;
  phone_number: string;
  call_type: string | null;
  status: string;
  call_sid: string | null;
  conversation_id: string | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  call_summary: string | null;
  confirmation_number: string | null;
  booked_price: number | null;
  booked_flight_info: string | null;
  passenger_names: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  ticket_request_id: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  initiated: { label: "Initiated", color: "bg-blue-500/10 text-blue-500 border-blue-500/20", icon: <Phone className="w-3 h-3" /> },
  ringing: { label: "Ringing", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", icon: <PhoneIncoming className="w-3 h-3" /> },
  in_progress: { label: "In Progress", color: "bg-green-500/10 text-green-500 border-green-500/20 animate-pulse", icon: <Phone className="w-3 h-3" /> },
  completed: { label: "Completed", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
  failed: { label: "Failed", color: "bg-red-500/10 text-red-500 border-red-500/20", icon: <XCircle className="w-3 h-3" /> },
  no_answer: { label: "No Answer", color: "bg-orange-500/10 text-orange-500 border-orange-500/20", icon: <PhoneOff className="w-3 h-3" /> },
};

export function AdminCallLogs() {
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<CallLog | null>(null);

  const fetchCallLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("call_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error fetching call logs:", error);
      toast.error("Failed to load call logs");
    } else {
      setCallLogs(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCallLogs();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("call_logs_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_logs" },
        (payload) => {
          console.log("Call log update:", payload);
          if (payload.eventType === "INSERT") {
            setCallLogs((prev) => [payload.new as CallLog, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setCallLogs((prev) =>
              prev.map((log) =>
                log.id === (payload.new as CallLog).id ? (payload.new as CallLog) : log
              )
            );
            // Also update selected log if it's the one being updated
            if (selectedLog?.id === (payload.new as CallLog).id) {
              setSelectedLog(payload.new as CallLog);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedLog?.id]);

  const filteredLogs = callLogs.filter((log) => {
    const query = searchQuery.toLowerCase();
    return (
      log.airline.toLowerCase().includes(query) ||
      log.phone_number.includes(query) ||
      log.confirmation_number?.toLowerCase().includes(query) ||
      log.status.toLowerCase().includes(query) ||
      log.call_type?.toLowerCase().includes(query)
    );
  });

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || { label: status, color: "bg-muted text-muted-foreground", icon: null };
    return (
      <Badge variant="outline" className={`gap-1 ${config.color}`}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Call Logs
            <Badge variant="secondary">{callLogs.length}</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search calls..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Button variant="outline" size="icon" onClick={fetchCallLogs}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No call logs found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedLog(log)}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="font-medium">{log.airline}</span>
                      <span className="text-sm text-muted-foreground">{log.phone_number}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {log.confirmation_number && (
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">Confirmation</span>
                        <p className="font-mono font-medium text-green-500">{log.confirmation_number}</p>
                      </div>
                    )}

                    {log.booked_price && (
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">Price</span>
                        <p className="font-medium">${log.booked_price.toLocaleString()}</p>
                      </div>
                    )}

                    <div className="text-right">
                      <span className="text-xs text-muted-foreground">Duration</span>
                      <p className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(log.duration_seconds)}
                      </p>
                    </div>

                    {getStatusBadge(log.status)}

                    <div className="text-right min-w-[100px]">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Call Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Call Details - {selectedLog?.airline}
            </DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-6 pr-4">
                {/* Status and Timing */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <div className="mt-1">{getStatusBadge(selectedLog.status)}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <span className="text-xs text-muted-foreground">Duration</span>
                    <p className="font-medium mt-1">{formatDuration(selectedLog.duration_seconds)}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <span className="text-xs text-muted-foreground">Started</span>
                    <p className="text-sm mt-1">
                      {selectedLog.started_at
                        ? format(new Date(selectedLog.started_at), "MMM d, h:mm a")
                        : "-"}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <span className="text-xs text-muted-foreground">Ended</span>
                    <p className="text-sm mt-1">
                      {selectedLog.ended_at
                        ? format(new Date(selectedLog.ended_at), "MMM d, h:mm a")
                        : "-"}
                    </p>
                  </div>
                </div>

                {/* Booking Results */}
                {(selectedLog.confirmation_number || selectedLog.booked_price) && (
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <h4 className="font-medium text-green-500 mb-2 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Booking Confirmed
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedLog.confirmation_number && (
                        <div>
                          <span className="text-xs text-muted-foreground">Confirmation Number</span>
                          <p className="font-mono text-lg font-bold">{selectedLog.confirmation_number}</p>
                        </div>
                      )}
                      {selectedLog.booked_price && (
                        <div>
                          <span className="text-xs text-muted-foreground">Total Price</span>
                          <p className="text-lg font-bold">${selectedLog.booked_price.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Call Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-muted-foreground">Phone Number</span>
                    <p className="font-mono">{selectedLog.phone_number}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Call Type</span>
                    <p>{selectedLog.call_type || "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Call SID</span>
                    <p className="font-mono text-xs truncate">{selectedLog.call_sid || "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Conversation ID</span>
                    <p className="font-mono text-xs truncate">{selectedLog.conversation_id || "-"}</p>
                  </div>
                </div>

                {/* Passenger Info */}
                {selectedLog.passenger_names && (
                  <div>
                    <span className="text-xs text-muted-foreground">Passengers</span>
                    <p>{selectedLog.passenger_names}</p>
                  </div>
                )}

                {/* Call Summary */}
                {selectedLog.call_summary && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Call Summary
                    </h4>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">{selectedLog.call_summary}</p>
                    </div>
                  </div>
                )}

                {/* Transcript */}
                {selectedLog.transcript && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Transcript
                    </h4>
                    <div className="p-3 bg-muted/50 rounded-lg max-h-60 overflow-y-auto">
                      <p className="text-sm whitespace-pre-wrap font-mono">{selectedLog.transcript}</p>
                    </div>
                  </div>
                )}

                {/* No data warning for stuck calls */}
                {selectedLog.status === "initiated" && !selectedLog.transcript && (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <h4 className="font-medium text-yellow-500 mb-1">Call Not Updated</h4>
                    <p className="text-sm text-muted-foreground">
                      This call hasn't received any webhook updates. Check that your ElevenLabs agent has the webhook URL configured.
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
