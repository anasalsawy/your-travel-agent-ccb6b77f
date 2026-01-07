import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, X, Building2, Mail, Phone, Globe, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { format } from "date-fns";

interface Seller {
  id: string;
  user_id: string;
  business_name: string;
  contact_email: string;
  contact_phone: string | null;
  website: string | null;
  description: string | null;
  status: "pending" | "approved" | "rejected" | "suspended";
  admin_notes: string | null;
  created_at: string;
  approved_at: string | null;
}

export function AdminSellers() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSellers();
  }, []);

  const fetchSellers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sellers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error fetching sellers", description: error.message, variant: "destructive" });
    } else {
      setSellers(data || []);
    }
    setLoading(false);
  };

  const updateSellerStatus = async (sellerId: string, status: "approved" | "rejected" | "suspended") => {
    setUpdating(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    const updateData: any = {
      status,
      admin_notes: adminNotes || null,
    };

    if (status === "approved") {
      updateData.approved_at = new Date().toISOString();
      updateData.approved_by = user?.id;
    }

    const { error } = await supabase
      .from("sellers")
      .update(updateData)
      .eq("id", sellerId);

    if (error) {
      toast({ title: "Error updating seller", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Seller updated", description: `Seller has been ${status}.` });
      fetchSellers();
      setSelectedSeller(null);
      setAdminNotes("");
    }
    setUpdating(false);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      approved: "default",
      rejected: "destructive",
      suspended: "outline",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingSellers = sellers.filter(s => s.status === "pending");
  const otherSellers = sellers.filter(s => s.status !== "pending");

  return (
    <div className="space-y-6">
      {/* Pending Applications */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Pending Applications
            {pendingSellers.length > 0 && (
              <Badge variant="secondary">{pendingSellers.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingSellers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No pending applications</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSellers.map((seller) => (
                  <TableRow key={seller.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{seller.business_name}</p>
                        {seller.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{seller.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {seller.contact_email}
                        </span>
                        {seller.contact_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {seller.contact_phone}
                          </span>
                        )}
                        {seller.website && (
                          <a href={seller.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                            <Globe className="w-3 h-3" /> Website <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{format(new Date(seller.created_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => { setSelectedSeller(seller); setAdminNotes(seller.admin_notes || ""); }}>
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* All Sellers */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>All Sellers</CardTitle>
        </CardHeader>
        <CardContent>
          {otherSellers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No sellers yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Approved</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {otherSellers.map((seller) => (
                  <TableRow key={seller.id}>
                    <TableCell>
                      <p className="font-medium">{seller.business_name}</p>
                    </TableCell>
                    <TableCell>{seller.contact_email}</TableCell>
                    <TableCell>{getStatusBadge(seller.status)}</TableCell>
                    <TableCell>
                      {seller.approved_at ? format(new Date(seller.approved_at), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => { setSelectedSeller(seller); setAdminNotes(seller.admin_notes || ""); }}>
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selectedSeller} onOpenChange={(open) => !open && setSelectedSeller(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Seller Application</DialogTitle>
            <DialogDescription>
              {selectedSeller?.business_name}
            </DialogDescription>
          </DialogHeader>
          
          {selectedSeller && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p>{getStatusBadge(selectedSeller.status)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Applied</p>
                  <p>{format(new Date(selectedSeller.created_at), "MMM d, yyyy")}</p>
                </div>
              </div>

              <div>
                <p className="text-muted-foreground text-sm mb-1">Description</p>
                <p className="text-sm">{selectedSeller.description || "No description provided"}</p>
              </div>

              <div className="flex flex-col gap-1 text-sm">
                <span className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" /> {selectedSeller.contact_email}
                </span>
                {selectedSeller.contact_phone && (
                  <span className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" /> {selectedSeller.contact_phone}
                  </span>
                )}
                {selectedSeller.website && (
                  <a href={selectedSeller.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                    <Globe className="w-4 h-4" /> {selectedSeller.website} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div>
                <label className="text-sm text-muted-foreground">Admin Notes</label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes about this application..."
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {selectedSeller?.status === "pending" && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => updateSellerStatus(selectedSeller.id, "rejected")}
                  disabled={updating}
                >
                  {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4 mr-1" />}
                  Reject
                </Button>
                <Button
                  onClick={() => updateSellerStatus(selectedSeller.id, "approved")}
                  disabled={updating}
                >
                  {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                  Approve
                </Button>
              </>
            )}
            {selectedSeller?.status === "approved" && (
              <Button
                variant="destructive"
                onClick={() => updateSellerStatus(selectedSeller.id, "suspended")}
                disabled={updating}
              >
                Suspend Seller
              </Button>
            )}
            {selectedSeller?.status === "suspended" && (
              <Button
                onClick={() => updateSellerStatus(selectedSeller.id, "approved")}
                disabled={updating}
              >
                Reinstate Seller
              </Button>
            )}
            {selectedSeller?.status === "rejected" && (
              <Button
                onClick={() => updateSellerStatus(selectedSeller.id, "approved")}
                disabled={updating}
              >
                Approve
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
