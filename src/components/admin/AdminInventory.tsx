import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { CreditCard, Plane, Plus, RefreshCw, Trash2, Edit, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

interface GiftCard {
  id: string;
  airline: string;
  card_identifier: string;
  balance: number;
  original_balance: number;
  purchase_price: number | null;
  expiry_date: string | null;
  status: string;
  notes: string | null;
  card_reference: string;
  created_at: string;
}

interface PointsAccount {
  id: string;
  airline: string;
  account_identifier: string;
  points_balance: number;
  expiry_date: string | null;
  purchase_price: number | null;
  owner_name: string | null;
  status: string;
  notes: string | null;
  login_reference: string;
  created_at: string;
}

const AIRLINES = ['Alaska', 'American', 'United', 'Delta', 'Southwest', 'JetBlue', 'Spirit', 'Frontier', 'Other'];
const POINTS_AIRLINES = ['Alaska', 'American', 'United', 'Delta', 'Southwest', 'Other'];

export function AdminInventory() {
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const [pointsAccounts, setPointsAccounts] = useState<PointsAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCardDialog, setShowCardDialog] = useState(false);
  const [showPointsDialog, setShowPointsDialog] = useState(false);
  const [editingCard, setEditingCard] = useState<GiftCard | null>(null);
  const [editingPoints, setEditingPoints] = useState<PointsAccount | null>(null);

  // Gift Card Form
  const [cardForm, setCardForm] = useState({
    airline: '',
    card_identifier: '',
    balance: '',
    original_balance: '',
    purchase_price: '',
    expiry_date: '',
    card_reference: '',
    notes: ''
  });

  // Points Account Form
  const [pointsForm, setPointsForm] = useState({
    airline: '',
    account_identifier: '',
    points_balance: '',
    expiry_date: '',
    purchase_price: '',
    owner_name: '',
    login_reference: '',
    notes: ''
  });

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const [cardsRes, pointsRes] = await Promise.all([
        supabase.from('gift_cards').select('*').order('created_at', { ascending: false }),
        supabase.from('points_accounts').select('*').order('created_at', { ascending: false })
      ]);

      if (cardsRes.data) setGiftCards(cardsRes.data as GiftCard[]);
      if (pointsRes.data) setPointsAccounts(pointsRes.data as PointsAccount[]);
    } catch (error) {
      console.error('Error fetching inventory:', error);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCard = async () => {
    if (!cardForm.airline || !cardForm.card_identifier || !cardForm.balance || !cardForm.card_reference) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const data = {
        airline: cardForm.airline,
        card_identifier: cardForm.card_identifier,
        balance: parseFloat(cardForm.balance),
        original_balance: parseFloat(cardForm.original_balance || cardForm.balance),
        purchase_price: cardForm.purchase_price ? parseFloat(cardForm.purchase_price) : null,
        expiry_date: cardForm.expiry_date || null,
        card_reference: cardForm.card_reference,
        notes: cardForm.notes || null
      };

      if (editingCard) {
        const { error } = await supabase.from('gift_cards').update(data).eq('id', editingCard.id);
        if (error) throw error;
        toast.success('Gift card updated');
      } else {
        const { error } = await supabase.from('gift_cards').insert(data);
        if (error) throw error;
        toast.success('Gift card added');
      }

      setShowCardDialog(false);
      setEditingCard(null);
      resetCardForm();
      fetchInventory();
    } catch (error: any) {
      console.error('Error saving card:', error);
      toast.error(error.message || 'Failed to save gift card');
    }
  };

  const handleSavePoints = async () => {
    if (!pointsForm.airline || !pointsForm.account_identifier || !pointsForm.points_balance || !pointsForm.login_reference) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const data = {
        airline: pointsForm.airline,
        account_identifier: pointsForm.account_identifier,
        points_balance: parseInt(pointsForm.points_balance),
        expiry_date: pointsForm.expiry_date || null,
        purchase_price: pointsForm.purchase_price ? parseFloat(pointsForm.purchase_price) : null,
        owner_name: pointsForm.owner_name || null,
        login_reference: pointsForm.login_reference,
        notes: pointsForm.notes || null
      };

      if (editingPoints) {
        const { error } = await supabase.from('points_accounts').update(data).eq('id', editingPoints.id);
        if (error) throw error;
        toast.success('Points account updated');
      } else {
        const { error } = await supabase.from('points_accounts').insert(data);
        if (error) throw error;
        toast.success('Points account added');
      }

      setShowPointsDialog(false);
      setEditingPoints(null);
      resetPointsForm();
      fetchInventory();
    } catch (error: any) {
      console.error('Error saving points:', error);
      toast.error(error.message || 'Failed to save points account');
    }
  };

  const handleDeleteCard = async (id: string) => {
    if (!confirm('Are you sure you want to delete this gift card?')) return;
    try {
      const { error } = await supabase.from('gift_cards').delete().eq('id', id);
      if (error) throw error;
      toast.success('Gift card deleted');
      fetchInventory();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const handleDeletePoints = async (id: string) => {
    if (!confirm('Are you sure you want to delete this points account?')) return;
    try {
      const { error } = await supabase.from('points_accounts').delete().eq('id', id);
      if (error) throw error;
      toast.success('Points account deleted');
      fetchInventory();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const resetCardForm = () => {
    setCardForm({
      airline: '',
      card_identifier: '',
      balance: '',
      original_balance: '',
      purchase_price: '',
      expiry_date: '',
      card_reference: '',
      notes: ''
    });
  };

  const resetPointsForm = () => {
    setPointsForm({
      airline: '',
      account_identifier: '',
      points_balance: '',
      expiry_date: '',
      purchase_price: '',
      owner_name: '',
      login_reference: '',
      notes: ''
    });
  };

  const openEditCard = (card: GiftCard) => {
    setEditingCard(card);
    setCardForm({
      airline: card.airline,
      card_identifier: card.card_identifier,
      balance: card.balance.toString(),
      original_balance: card.original_balance.toString(),
      purchase_price: card.purchase_price?.toString() || '',
      expiry_date: card.expiry_date || '',
      card_reference: card.card_reference,
      notes: card.notes || ''
    });
    setShowCardDialog(true);
  };

  const openEditPoints = (account: PointsAccount) => {
    setEditingPoints(account);
    setPointsForm({
      airline: account.airline,
      account_identifier: account.account_identifier,
      points_balance: account.points_balance.toString(),
      expiry_date: account.expiry_date || '',
      purchase_price: account.purchase_price?.toString() || '',
      owner_name: account.owner_name || '',
      login_reference: account.login_reference,
      notes: account.notes || ''
    });
    setShowPointsDialog(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available':
      case 'active':
        return <Badge className="bg-green-500">Active</Badge>;
      case 'reserved':
        return <Badge className="bg-yellow-500">Reserved</Badge>;
      case 'depleted':
        return <Badge className="bg-gray-500">Depleted</Badge>;
      case 'expired':
      case 'suspended':
        return <Badge className="bg-red-500">{status}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Calculate totals
  const totalCardBalance = giftCards.filter(c => c.status === 'available').reduce((sum, c) => sum + c.balance, 0);
  const totalPoints = pointsAccounts.filter(p => p.status === 'active').reduce((sum, p) => sum + p.points_balance, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Gift Card Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCardBalance.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{giftCards.filter(c => c.status === 'available').length} cards available</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Plane className="h-4 w-4" /> Points Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPoints.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{pointsAccounts.filter(p => p.status === 'active').length} accounts active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Booking Capacity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">~${Math.floor(totalCardBalance + (totalPoints * 0.015)).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Estimated ticket value</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="cards">
        <div className="flex justify-between items-center mb-4">
          <TabsList>
            <TabsTrigger value="cards">Gift Cards</TabsTrigger>
            <TabsTrigger value="points">Points Accounts</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={fetchInventory}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>

        <TabsContent value="cards">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Gift Cards</CardTitle>
                <CardDescription>Manage prepaid cards for airline bookings</CardDescription>
              </div>
              <Dialog open={showCardDialog} onOpenChange={(open) => {
                setShowCardDialog(open);
                if (!open) { setEditingCard(null); resetCardForm(); }
              }}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" /> Add Card</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{editingCard ? 'Edit Gift Card' : 'Add Gift Card'}</DialogTitle>
                    <DialogDescription>Enter the gift card details securely</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Airline *</Label>
                        <Select value={cardForm.airline} onValueChange={(v) => setCardForm({...cardForm, airline: v})}>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {AIRLINES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Card ID/Nickname *</Label>
                        <Input placeholder="e.g., AA-1234" value={cardForm.card_identifier} onChange={(e) => setCardForm({...cardForm, card_identifier: e.target.value})} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Current Balance *</Label>
                        <Input type="number" placeholder="500.00" value={cardForm.balance} onChange={(e) => setCardForm({...cardForm, balance: e.target.value})} />
                      </div>
                      <div>
                        <Label>Original Balance</Label>
                        <Input type="number" placeholder="500.00" value={cardForm.original_balance} onChange={(e) => setCardForm({...cardForm, original_balance: e.target.value})} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Purchase Price</Label>
                        <Input type="number" placeholder="What you paid" value={cardForm.purchase_price} onChange={(e) => setCardForm({...cardForm, purchase_price: e.target.value})} />
                      </div>
                      <div>
                        <Label>Expiry Date</Label>
                        <Input type="date" value={cardForm.expiry_date} onChange={(e) => setCardForm({...cardForm, expiry_date: e.target.value})} />
                      </div>
                    </div>
                    <div>
                      <Label>Full Card Number *</Label>
                      <Input type="password" placeholder="16-digit card number" value={cardForm.card_reference} onChange={(e) => setCardForm({...cardForm, card_reference: e.target.value})} />
                      <p className="text-xs text-muted-foreground mt-1">Stored securely, used for phone bookings</p>
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Textarea placeholder="Any additional details..." value={cardForm.notes} onChange={(e) => setCardForm({...cardForm, notes: e.target.value})} />
                    </div>
                    <Button onClick={handleSaveCard} className="w-full">{editingCard ? 'Update Card' : 'Add Card'}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : giftCards.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No gift cards added yet</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Airline</TableHead>
                      <TableHead>Card ID</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {giftCards.map((card) => (
                      <TableRow key={card.id}>
                        <TableCell className="font-medium">{card.airline}</TableCell>
                        <TableCell>{card.card_identifier}</TableCell>
                        <TableCell>${card.balance.toLocaleString()}</TableCell>
                        <TableCell className="text-muted-foreground">{card.purchase_price ? `$${card.purchase_price}` : '-'}</TableCell>
                        <TableCell>{card.expiry_date ? format(new Date(card.expiry_date), 'MMM d, yyyy') : '-'}</TableCell>
                        <TableCell>{getStatusBadge(card.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEditCard(card)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteCard(card.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="points">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Points Accounts</CardTitle>
                <CardDescription>Manage airline points accounts (purchased logs)</CardDescription>
              </div>
              <Dialog open={showPointsDialog} onOpenChange={(open) => {
                setShowPointsDialog(open);
                if (!open) { setEditingPoints(null); resetPointsForm(); }
              }}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" /> Add Account</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{editingPoints ? 'Edit Points Account' : 'Add Points Account'}</DialogTitle>
                    <DialogDescription>Enter the account login details securely</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Airline *</Label>
                        <Select value={pointsForm.airline} onValueChange={(v) => setPointsForm({...pointsForm, airline: v})}>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {POINTS_AIRLINES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Account ID *</Label>
                        <Input placeholder="Username or nickname" value={pointsForm.account_identifier} onChange={(e) => setPointsForm({...pointsForm, account_identifier: e.target.value})} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Points Balance *</Label>
                        <Input type="number" placeholder="50000" value={pointsForm.points_balance} onChange={(e) => setPointsForm({...pointsForm, points_balance: e.target.value})} />
                      </div>
                      <div>
                        <Label>Expiry Date</Label>
                        <Input type="date" value={pointsForm.expiry_date} onChange={(e) => setPointsForm({...pointsForm, expiry_date: e.target.value})} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Purchase Price</Label>
                        <Input type="number" placeholder="What you paid" value={pointsForm.purchase_price} onChange={(e) => setPointsForm({...pointsForm, purchase_price: e.target.value})} />
                      </div>
                      <div>
                        <Label>Owner Name</Label>
                        <Input placeholder="Original account owner" value={pointsForm.owner_name} onChange={(e) => setPointsForm({...pointsForm, owner_name: e.target.value})} />
                      </div>
                    </div>
                    <div>
                      <Label>Login Credentials *</Label>
                      <Textarea placeholder="Username: xxx&#10;Password: xxx&#10;Security Q&A if any" value={pointsForm.login_reference} onChange={(e) => setPointsForm({...pointsForm, login_reference: e.target.value})} className="font-mono text-sm" />
                      <p className="text-xs text-muted-foreground mt-1">Stored securely for booking access</p>
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Textarea placeholder="Any additional details..." value={pointsForm.notes} onChange={(e) => setPointsForm({...pointsForm, notes: e.target.value})} />
                    </div>
                    <Button onClick={handleSavePoints} className="w-full">{editingPoints ? 'Update Account' : 'Add Account'}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : pointsAccounts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No points accounts added yet</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Airline</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Points</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pointsAccounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.airline}</TableCell>
                        <TableCell>{account.account_identifier}</TableCell>
                        <TableCell>{account.points_balance.toLocaleString()}</TableCell>
                        <TableCell className="text-muted-foreground">{account.purchase_price ? `$${account.purchase_price}` : '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{account.owner_name || '-'}</TableCell>
                        <TableCell>{account.expiry_date ? format(new Date(account.expiry_date), 'MMM d, yyyy') : '-'}</TableCell>
                        <TableCell>{getStatusBadge(account.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEditPoints(account)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeletePoints(account.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
