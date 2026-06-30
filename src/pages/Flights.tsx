import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plane, ArrowRight, Search } from "lucide-react";
import { format } from "date-fns";
import { AirportAutocomplete } from "@/components/flights/AirportAutocomplete";

interface Segment {
  origin: string;
  destination: string;
  departing_at: string;
  arriving_at: string;
  marketing_carrier: string;
  marketing_carrier_iata: string;
  flight_number: string;
  duration: string;
  cabin_class: string;
}
interface Slice {
  origin: string;
  destination: string;
  duration: string;
  segments: Segment[];
}
interface Offer {
  id: string;
  owner: { name: string; iata_code: string; logo_symbol_url?: string };
  total_amount: string;
  total_currency: string;
  customer_amount: number;
  customer_currency: string;
  expires_at: string;
  passenger_count: number;
  slices: Slice[];
}

function fmtDuration(iso: string) {
  if (!iso) return "";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return iso;
  return [m[1] ? `${m[1]}h` : "", m[2] ? `${m[2]}m` : ""].filter(Boolean).join(" ");
}
function fmtTime(iso: string) {
  try { return format(new Date(iso), "HH:mm"); } catch { return iso; }
}
function fmtDate(iso: string) {
  try { return format(new Date(iso), "EEE, MMM d"); } catch { return iso; }
}

export default function Flights() {
  const { toast } = useToast();
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [adults, setAdults] = useState("1");
  const [cabin, setCabin] = useState("economy");
  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [searched, setSearched] = useState(false);

  const [bookingOffer, setBookingOffer] = useState<Offer | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [paxForms, setPaxForms] = useState<any[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSearched(true);
    setOffers([]);
    try {
      const { data, error } = await supabase.functions.invoke("flight-search-router", {
        body: {
          origin: origin.trim().toUpperCase(),
          destination: destination.trim().toUpperCase(),
          departure_date: departureDate,
          return_date: returnDate || undefined,
          adults: parseInt(adults),
          cabin_class: cabin,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setOffers(data?.offers || []);
      if (!data?.offers?.length) {
        toast({ title: "No flights found", description: "Try different dates or airports." });
      }
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message || "Try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openBooking = (offer: Offer) => {
    setBookingOffer(offer);
    setContactEmail("");
    setContactPhone("");
    setPaxForms(Array.from({ length: offer.passenger_count }, () => ({
      title: "mr", gender: "m", given_name: "", family_name: "", born_on: "",
    })));
  };

  const handleBook = async () => {
    if (!bookingOffer) return;
    for (const p of paxForms) {
      if (!p.given_name || !p.family_name || !p.born_on) {
        toast({ title: "Missing info", description: "Fill all passenger fields.", variant: "destructive" });
        return;
      }
    }
    if (!contactEmail) {
      toast({ title: "Email required", variant: "destructive" });
      return;
    }
    setBookingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("duffel-create-checkout", {
        body: {
          offer_id: bookingOffer.id,
          passengers: paxForms,
          contact_email: contactEmail,
          contact_phone: contactPhone,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: any) {
      toast({ title: "Booking failed", description: err.message || "Try again.", variant: "destructive" });
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-display font-bold mb-2">Search Flights</h1>
          <p className="text-muted-foreground">Real-time fares from 300+ airlines. Instant ticketing.</p>
        </div>

        <Card className="p-6 mb-8">
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="md:col-span-1">
              <Label htmlFor="origin">From</Label>
              <AirportAutocomplete id="origin" value={origin} onChange={setOrigin} placeholder="LAX or Los Angeles" />
            </div>
            <div className="md:col-span-1">
              <Label htmlFor="dest">To</Label>
              <AirportAutocomplete id="dest" value={destination} onChange={setDestination} placeholder="HNL or Honolulu" />
            </div>
            <div className="md:col-span-1">
              <Label htmlFor="dep">Departure</Label>
              <Input id="dep" type="date" value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)} required />
            </div>
            <div className="md:col-span-1">
              <Label htmlFor="ret">Return (optional)</Label>
              <Input id="ret" type="date" value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)} />
            </div>
            <div className="md:col-span-1">
              <Label>Travelers</Label>
              <Select value={adults} onValueChange={setAdults}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map(n => <SelectItem key={n} value={String(n)}>{n} adult{n > 1 ? "s" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-1">
              <Label>Cabin</Label>
              <Select value={cabin} onValueChange={setCabin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="economy">Economy</SelectItem>
                  <SelectItem value="premium_economy">Premium Economy</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="first">First</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-6">
              <Button type="submit" variant="hero" size="lg" disabled={loading} className="w-full md:w-auto">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Searching...</> : <><Search className="w-4 h-4" /> Search Flights</>}
              </Button>
            </div>
          </form>
        </Card>

        {loading && (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="mt-4 text-muted-foreground">Searching live airline inventory...</p>
          </div>
        )}

        {!loading && searched && offers.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">No flights found for these dates.</Card>
        )}

        <div className="space-y-4">
          {offers.map(offer => (
            <Card key={offer.id} className="p-6 hover:border-primary/50 transition-colors">
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex-1 space-y-4">
                  {offer.slices.map((slice, si) => (
                    <div key={si}>
                      {slice.segments.map((seg, segi) => (
                        <div key={segi} className="flex items-center gap-3 text-sm">
                          <Plane className="w-4 h-4 text-primary shrink-0" />
                          <div className="flex-1 grid grid-cols-3 gap-2">
                            <div>
                              <div className="font-semibold">{fmtTime(seg.departing_at)} {seg.origin}</div>
                              <div className="text-xs text-muted-foreground">{fmtDate(seg.departing_at)}</div>
                            </div>
                            <div className="text-center text-xs text-muted-foreground">
                              <div>{fmtDuration(seg.duration)}</div>
                              <ArrowRight className="w-4 h-4 mx-auto" />
                              <div>{seg.marketing_carrier_iata} {seg.flight_number}</div>
                            </div>
                            <div>
                              <div className="font-semibold">{fmtTime(seg.arriving_at)} {seg.destination}</div>
                              <div className="text-xs text-muted-foreground">{fmtDate(seg.arriving_at)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {si < offer.slices.length - 1 && <div className="border-t my-3" />}
                    </div>
                  ))}
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary">{offer.owner.name}</Badge>
                    <Badge variant="outline">{offer.passenger_count} passenger{offer.passenger_count > 1 ? "s" : ""}</Badge>
                  </div>
                </div>
                <div className="md:w-48 text-right md:border-l md:pl-6">
                  <div className="text-3xl font-bold text-primary">
                    ${offer.customer_amount.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground mb-3">{offer.customer_currency} • total</div>
                  <Button variant="hero" className="w-full" onClick={() => openBooking(offer)}>
                    Book Now
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={!!bookingOffer} onOpenChange={(o) => !o && setBookingOffer(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Passenger Details</DialogTitle>
          </DialogHeader>
          {bookingOffer && (
            <div className="space-y-4">
              <Card className="p-4 bg-muted/30">
                <div className="text-sm text-muted-foreground">Total</div>
                <div className="text-2xl font-bold text-primary">
                  ${bookingOffer.customer_amount.toFixed(2)} {bookingOffer.customer_currency}
                </div>
              </Card>

              {paxForms.map((p, i) => (
                <Card key={i} className="p-4 space-y-3">
                  <div className="font-semibold">Passenger {i + 1}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Title</Label>
                      <Select value={p.title} onValueChange={(v) => {
                        const next = [...paxForms]; next[i].title = v; setPaxForms(next);
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mr">Mr</SelectItem>
                          <SelectItem value="ms">Ms</SelectItem>
                          <SelectItem value="mrs">Mrs</SelectItem>
                          <SelectItem value="miss">Miss</SelectItem>
                          <SelectItem value="dr">Dr</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Gender</Label>
                      <Select value={p.gender} onValueChange={(v) => {
                        const next = [...paxForms]; next[i].gender = v; setPaxForms(next);
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="m">Male</SelectItem>
                          <SelectItem value="f">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Given (First) Name</Label>
                      <Input value={p.given_name} onChange={(e) => {
                        const next = [...paxForms]; next[i].given_name = e.target.value; setPaxForms(next);
                      }} />
                    </div>
                    <div>
                      <Label>Family (Last) Name</Label>
                      <Input value={p.family_name} onChange={(e) => {
                        const next = [...paxForms]; next[i].family_name = e.target.value; setPaxForms(next);
                      }} />
                    </div>
                    <div className="col-span-2">
                      <Label>Date of Birth</Label>
                      <Input type="date" value={p.born_on} onChange={(e) => {
                        const next = [...paxForms]; next[i].born_on = e.target.value; setPaxForms(next);
                      }} />
                    </div>
                  </div>
                </Card>
              ))}

              <Card className="p-4 space-y-3">
                <div className="font-semibold">Contact</div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1..." />
                </div>
              </Card>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingOffer(null)}>Cancel</Button>
            <Button variant="hero" onClick={handleBook} disabled={bookingLoading}>
              {bookingLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : "Continue to Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
