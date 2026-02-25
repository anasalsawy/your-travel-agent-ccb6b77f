import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, Search, Car, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface CarRentalRequest {
  id: string;
  pickup_location: string;
  dropoff_location: string | null;
  pickup_date: string;
  dropoff_date: string;
  pickup_time: string | null;
  dropoff_time: string | null;
  car_type: string | null;
  transmission: string | null;
  contact_email: string;
  contact_phone: string | null;
  special_notes: string | null;
  status: string;
  quoted_price: number | null;
  admin_notes: string | null;
  budget: number | null;
  drivers_age: number | null;
  num_drivers: number | null;
  needs_insurance: boolean | null;
  needs_gps: boolean | null;
  needs_child_seat: boolean | null;
  rental_company: string | null;
  created_at: string;
}

const statusOptions = ["submitted", "quoted", "confirmed", "completed", "cancelled"];

export function AdminCarRentals() {
  const [requests, setRequests] = useState<CarRentalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CarRentalRequest | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("car_rental_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load car rental requests");
    } else {
      setRequests(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, []);

  const filtered = requests.filter((r) =>
    `${r.pickup_location} ${r.dropoff_location || ""} ${r.contact_email} ${r.car_type || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const openDetail = (req: CarRentalRequest) => {
    setSelected(req);
    setEditStatus(req.status);
    setEditPrice(req.quoted_price?.toString() || "");
    setEditNotes(req.admin_notes || "");
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase
      .from("car_rental_requests")
      .update({
        status: editStatus,
        quoted_price: editPrice ? parseFloat(editPrice) : null,
        admin_notes: editNotes || null,
      })
      .eq("id", selected.id);

    if (error) {
      toast.error("Failed to update");
    } else {
      toast.success("Car rental request updated");
      setSelected(null);
      fetchRequests();
    }
    setSaving(false);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "submitted": return "bg-warning/20 text-warning border-warning/30";
      case "quoted": return "bg-primary/20 text-primary border-primary/30";
      case "confirmed": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "completed": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "cancelled": return "bg-destructive/20 text-destructive border-destructive/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const summary = {
    total: requests.length,
    submitted: requests.filter((r) => r.status === "submitted").length,
    quoted: requests.filter((r) => r.status === "quoted").length,
    confirmed: requests.filter((r) => r.status === "confirmed").length,
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{summary.total}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Submitted</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-yellow-500">{summary.submitted}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Quoted</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-primary">{summary.quoted}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Confirmed</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-400">{summary.confirmed}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Car className="w-5 h-5" /> Car Rental Requests</CardTitle>
            <CardDescription>View and manage all car rental submissions</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchRequests}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search location, email, car type..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No car rental requests found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Dropoff</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Car Type</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((req) => (
                  <TableRow key={req.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => openDetail(req)}>
                    <TableCell className="font-medium">{req.pickup_location}</TableCell>
                    <TableCell>{req.dropoff_location || "Same"}</TableCell>
                    <TableCell className="text-sm">
                      {req.pickup_date} → {req.dropoff_date}
                    </TableCell>
                    <TableCell>{req.car_type || "—"}</TableCell>
                    <TableCell className="text-sm">{req.contact_email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor(req.status)}>{req.status}</Badge>
                    </TableCell>
                    <TableCell>{req.quoted_price ? `$${req.quoted_price}` : "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(req.created_at), "MMM d, h:mm a")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Car Rental Request</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Pickup:</span>
                  <p className="font-medium">{selected.pickup_location}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Dropoff:</span>
                  <p className="font-medium">{selected.dropoff_location || "Same as pickup"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Dates:</span>
                  <p className="font-medium">{selected.pickup_date} → {selected.dropoff_date}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Times:</span>
                  <p className="font-medium">{selected.pickup_time || "—"} / {selected.dropoff_time || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Car Type:</span>
                  <p className="font-medium">{selected.car_type || "Any"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Transmission:</span>
                  <p className="font-medium">{selected.transmission || "Any"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Contact:</span>
                  <p className="font-medium">{selected.contact_email}</p>
                  {selected.contact_phone && <p className="text-xs">{selected.contact_phone}</p>}
                </div>
                <div>
                  <span className="text-muted-foreground">Budget:</span>
                  <p className="font-medium">{selected.budget ? `$${selected.budget}` : "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Drivers:</span>
                  <p className="font-medium">{selected.num_drivers || 1} (age {selected.drivers_age || 25}+)</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Extras:</span>
                  <p className="font-medium">
                    {[selected.needs_insurance && "Insurance", selected.needs_gps && "GPS", selected.needs_child_seat && "Child Seat"].filter(Boolean).join(", ") || "None"}
                  </p>
                </div>
              </div>

              {selected.special_notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Notes:</span>
                  <p className="italic">{selected.special_notes}</p>
                </div>
              )}

              <div className="border-t pt-4 space-y-3">
                <div>
                  <label className="text-sm text-muted-foreground">Status</label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Quoted Price ($)</label>
                  <Input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="Enter price" />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Admin Notes</label>
                  <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Internal notes..." />
                </div>
                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
