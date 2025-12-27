import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, Loader2, Search, Facebook } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { VoucherFormDialog } from "./VoucherFormDialog";
import type { Tables } from "@/integrations/supabase/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FacebookPostDialog } from "./FacebookPostDialog";

type Voucher = Tables<"vouchers">;

export function AdminVouchers() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const [deleteVoucher, setDeleteVoucher] = useState<Voucher | null>(null);
  const [facebookVoucher, setFacebookVoucher] = useState<Voucher | null>(null);
  const { toast } = useToast();

  const fetchVouchers = async () => {
    const { data, error } = await supabase
      .from("vouchers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setVouchers(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchVouchers();
  }, []);

  const handleDelete = async () => {
    if (!deleteVoucher) return;

    const { error } = await supabase
      .from("vouchers")
      .delete()
      .eq("id", deleteVoucher.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Voucher deleted successfully" });
      fetchVouchers();
    }
    setDeleteVoucher(null);
  };

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available": return "bg-success/20 text-success";
      case "sold": return "bg-primary/20 text-primary";
      case "reserved": return "bg-warning/20 text-warning";
      case "disabled": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const filteredVouchers = vouchers.filter(v =>
    v.title.toLowerCase().includes(search.toLowerCase()) ||
    v.airline.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search vouchers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card"
          />
        </div>
        <Button variant="hero" onClick={() => { setEditingVoucher(null); setIsFormOpen(true); }}>
          <Plus className="w-4 h-4" />
          Add Voucher
        </Button>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-4 font-medium">Voucher</th>
                <th className="text-left p-4 font-medium">Value</th>
                <th className="text-left p-4 font-medium">Price</th>
                <th className="text-left p-4 font-medium">Discount</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVouchers.map((voucher) => (
                <tr key={voucher.id} className="border-t border-border hover:bg-muted/20">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {voucher.airline.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium">{voucher.title}</div>
                        <div className="text-sm text-muted-foreground">{voucher.airline}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">{formatCurrency(Number(voucher.face_value), voucher.currency || "USD")}</td>
                  <td className="p-4 font-semibold text-primary">{formatCurrency(Number(voucher.sale_price), voucher.currency || "USD")}</td>
                  <td className="p-4">
                    <Badge variant="secondary">{Number(voucher.discount_percent)}%</Badge>
                  </td>
                  <td className="p-4">
                    <Badge className={getStatusColor(voucher.status || "available")}>{voucher.status}</Badge>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditingVoucher(voucher); setIsFormOpen(true); }}
                        title="Edit voucher"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setFacebookVoucher(voucher)}
                        title="Generate Facebook post"
                        className="text-[#1877F2] hover:text-[#1877F2] hover:bg-[#1877F2]/10"
                      >
                        <Facebook className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteVoucher(voucher)}
                        title="Delete voucher"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredVouchers.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            No vouchers found
          </div>
        )}
      </div>

      <VoucherFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        voucher={editingVoucher}
        onSuccess={fetchVouchers}
      />

      <AlertDialog open={!!deleteVoucher} onOpenChange={() => setDeleteVoucher(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Voucher</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteVoucher?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FacebookPostDialog
        open={!!facebookVoucher}
        onOpenChange={() => setFacebookVoucher(null)}
        voucher={facebookVoucher}
      />
    </div>
  );
}
