import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Phone, Bot, RefreshCw, Play, CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

interface BookingQueueItem {
  id: string;
  quote_id: string | null;
  ticket_request_id: string | null;
  status: string;
  booking_method: string;
  inventory_type: string;
  inventory_id: string | null;
  priority: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  call_log_id: string | null;
  booking_result: any;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

interface TicketRequest {
  id: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
  passengers: number;
  contact_email: string;
  contact_phone: string | null;
  quoted_price: number | null;
}

export function AdminBookingQueue() {
  const [queue, setQueue] = useState<BookingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<BookingQueueItem | null>(null);
  const [ticketDetails, setTicketDetails] = useState<TicketRequest | null>(null);

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('booking_queue')
        .select('*')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQueue(data || []);
    } catch (error) {
      console.error('Error fetching queue:', error);
      toast.error('Failed to load booking queue');
    } finally {
      setLoading(false);
    }
  };

  const fetchTicketDetails = async (ticketRequestId: string) => {
    const { data } = await supabase
      .from('ticket_requests')
      .select('*')
      .eq('id', ticketRequestId)
      .single();
    
    if (data) setTicketDetails(data);
  };

  const handleOpenDetails = async (item: BookingQueueItem) => {
    setSelectedItem(item);
    if (item.ticket_request_id) {
      await fetchTicketDetails(item.ticket_request_id);
    }
  };

  const handleStartBooking = async (item: BookingQueueItem) => {
    try {
      // Update status to in_progress
      const { error } = await supabase
        .from('booking_queue')
        .update({ 
          status: 'in_progress', 
          started_at: new Date().toISOString() 
        })
        .eq('id', item.id);

      if (error) throw error;

      if (item.booking_method === 'alaska_points' || item.booking_method === 'points') {
        toast.info('Points booking queued for NeuralAgent execution');
        // This would trigger an external automation tool
      } else {
        toast.info('Card booking - Maya will call airline IVR');
        // This would trigger the make-outbound-call function
      }

      fetchQueue();
    } catch (error: any) {
      toast.error(error.message || 'Failed to start booking');
    }
  };

  const handleMarkComplete = async (item: BookingQueueItem, success: boolean) => {
    try {
      const { error } = await supabase
        .from('booking_queue')
        .update({ 
          status: success ? 'completed' : 'failed',
          completed_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (error) throw error;
      toast.success(success ? 'Booking marked complete' : 'Booking marked failed');
      fetchQueue();
      setSelectedItem(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case 'in_progress':
        return <Badge className="bg-yellow-500 gap-1"><Play className="h-3 w-3" /> In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-green-500 gap-1"><CheckCircle className="h-3 w-3" /> Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getMethodBadge = (method: string) => {
    if (method.includes('points')) {
      return <Badge variant="secondary" className="gap-1"><Bot className="h-3 w-3" /> Points (NeuralAgent)</Badge>;
    }
    return <Badge variant="outline" className="gap-1"><Phone className="h-3 w-3" /> Card (Maya IVR)</Badge>;
  };

  // Summary stats
  const pending = queue.filter(q => q.status === 'pending').length;
  const inProgress = queue.filter(q => q.status === 'in_progress').length;
  const completedToday = queue.filter(q => 
    q.status === 'completed' && 
    q.completed_at && 
    new Date(q.completed_at).toDateString() === new Date().toDateString()
  ).length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{inProgress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{completedToday}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{queue.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Booking Queue</CardTitle>
            <CardDescription>Paid bookings awaiting execution via Maya IVR or NeuralAgent</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchQueue}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : queue.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No bookings in queue. Paid ticket requests will appear here automatically.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.ticket_request_id ? (
                        <Button variant="link" className="p-0 h-auto" onClick={() => handleOpenDetails(item)}>
                          View Details <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">Quote #{item.quote_id?.slice(0, 8)}</span>
                      )}
                    </TableCell>
                    <TableCell>{getMethodBadge(item.booking_method)}</TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell>
                      <Badge variant={item.priority === 1 ? "default" : "outline"}>
                        P{item.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(item.created_at), 'MMM d, h:mm a')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {item.status === 'pending' && (
                          <Button size="sm" onClick={() => handleStartBooking(item)}>
                            <Play className="h-4 w-4 mr-1" /> Start
                          </Button>
                        )}
                        {item.status === 'in_progress' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handleMarkComplete(item, true)}>
                              <CheckCircle className="h-4 w-4 mr-1" /> Done
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleMarkComplete(item, false)}>
                              <XCircle className="h-4 w-4 mr-1" /> Fail
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => { setSelectedItem(null); setTicketDetails(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Booking Details</DialogTitle>
            <DialogDescription>
              {selectedItem?.booking_method.includes('points') 
                ? 'This booking requires NeuralAgent for points redemption'
                : 'Maya will call the airline IVR to complete this booking'
              }
            </DialogDescription>
          </DialogHeader>
          
          {ticketDetails && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Route:</span>
                  <p className="font-medium">{ticketDetails.origin} → {ticketDetails.destination}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Dates:</span>
                  <p className="font-medium">
                    {ticketDetails.departure_date}
                    {ticketDetails.return_date && ` - ${ticketDetails.return_date}`}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Passengers:</span>
                  <p className="font-medium">{ticketDetails.passengers}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Quoted Price:</span>
                  <p className="font-medium">${ticketDetails.quoted_price?.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Contact:</span>
                  <p className="font-medium">{ticketDetails.contact_email}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Phone:</span>
                  <p className="font-medium">{ticketDetails.contact_phone || '-'}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <span className="text-sm text-muted-foreground">Booking Method:</span>
                <div className="mt-1">{getMethodBadge(selectedItem?.booking_method || '')}</div>
              </div>

              {selectedItem?.error_message && (
                <div className="bg-destructive/10 p-3 rounded text-sm text-destructive">
                  <strong>Error:</strong> {selectedItem.error_message}
                </div>
              )}

              {selectedItem?.booking_result && (
                <div className="bg-muted p-3 rounded">
                  <span className="text-sm font-medium">Booking Result:</span>
                  <pre className="text-xs mt-2 overflow-auto">
                    {JSON.stringify(selectedItem.booking_result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
