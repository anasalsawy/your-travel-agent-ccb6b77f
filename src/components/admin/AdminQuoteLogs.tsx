import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, TrendingUp, TrendingDown, CheckCircle, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface QuoteLog {
  id: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_name: string | null;
  route: string;
  travel_dates: string;
  passengers: number;
  market_price: number | null;
  quoted_price: number;
  discount_applied: number | null;
  payment_method: string | null;
  status: string;
  auto_approved: boolean;
  conversation_id: string | null;
  created_at: string;
}

export function AdminQuoteLogs() {
  const [quotes, setQuotes] = useState<QuoteLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchQuotes();
  }, [statusFilter]);

  const fetchQuotes = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('quote_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setQuotes((data || []) as QuoteLog[]);
    } catch (error) {
      console.error('Error fetching quotes:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'quoted':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600"><Clock className="h-3 w-3 mr-1" /> Quoted</Badge>;
      case 'accepted':
        return <Badge className="bg-blue-500"><CheckCircle className="h-3 w-3 mr-1" /> Accepted</Badge>;
      case 'booked':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" /> Booked</Badge>;
      case 'declined':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Declined</Badge>;
      case 'expired':
        return <Badge variant="secondary">Expired</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPaymentBadge = (method: string | null) => {
    if (!method) return null;
    switch (method) {
      case 'gift_card':
        return <Badge variant="outline" className="text-purple-600">Gift Card</Badge>;
      case 'points':
        return <Badge variant="outline" className="text-blue-600">Points</Badge>;
      case 'hybrid':
        return <Badge variant="outline" className="text-indigo-600">Hybrid</Badge>;
      case 'declined':
        return <Badge variant="destructive">Declined</Badge>;
      default:
        return <Badge variant="outline">{method}</Badge>;
    }
  };

  // Calculate stats
  const totalQuotes = quotes.length;
  const acceptedQuotes = quotes.filter(q => q.status === 'accepted' || q.status === 'booked').length;
  const avgDiscount = quotes.filter(q => q.discount_applied).reduce((sum, q) => sum + (q.discount_applied || 0), 0) / (quotes.filter(q => q.discount_applied).length || 1);
  const totalRevenue = quotes.filter(q => q.status === 'booked').reduce((sum, q) => sum + q.quoted_price, 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Quotes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalQuotes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              {totalQuotes > 0 ? Math.round((acceptedQuotes / totalQuotes) * 100) : 0}%
              <TrendingUp className="h-4 w-4 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Discount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              {Math.round(avgDiscount)}%
              <TrendingDown className="h-4 w-4 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Booked Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Quote Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Quote History</CardTitle>
            <CardDescription>All quotes generated by Maya</CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="quoted">Quoted</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="booked">Booked</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchQuotes}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : quotes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No quotes yet. Maya will log quotes here automatically.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Market</TableHead>
                  <TableHead>Quote</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(quote.created_at), 'MMM d, h:mm a')}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {quote.customer_name || quote.customer_email || quote.customer_phone || 'Unknown'}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{quote.route}</TableCell>
                    <TableCell className="text-sm">{quote.travel_dates}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {quote.market_price ? `$${quote.market_price.toLocaleString()}` : '-'}
                    </TableCell>
                    <TableCell className="font-medium text-green-600">
                      ${quote.quoted_price.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {quote.discount_applied ? (
                        <span className="text-primary font-medium">{Math.round(quote.discount_applied)}%</span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{getPaymentBadge(quote.payment_method)}</TableCell>
                    <TableCell>{getStatusBadge(quote.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
