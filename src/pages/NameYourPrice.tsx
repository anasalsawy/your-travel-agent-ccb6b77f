import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { CalendarIcon, Gavel, DollarSign, Loader2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function NameYourPricePage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState<Date>();
  const [returnDate, setReturnDate] = useState<Date>();
  const [tripType, setTripType] = useState("round-trip");
  const [passengers, setPassengers] = useState("1");
  const [cabinClass, setCabinClass] = useState("economy");
  const [bidAmount, setBidAmount] = useState("");
  const [waitHours, setWaitHours] = useState("24");
  const [flexDates, setFlexDates] = useState("0");
  const [flexAirline, setFlexAirline] = useState(true);
  const [flexStops, setFlexStops] = useState(true);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        setContactEmail(session.user.email || "");
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departureDate) {
      toast({ title: "Missing date", description: "Please select a departure date.", variant: "destructive" });
      return;
    }
    if (!bidAmount || parseFloat(bidAmount) < 50) {
      toast({ title: "Bid too low", description: "Minimum bid is $50 per ticket.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("nyop-create-bid", {
        body: {
          origin,
          destination,
          departure_date: format(departureDate, "yyyy-MM-dd"),
          return_date: returnDate ? format(returnDate, "yyyy-MM-dd") : null,
          trip_type: tripType,
          passengers,
          cabin_class: cabinClass,
          bid_amount: bidAmount,
          wait_window_hours: waitHours,
          flex_dates_days: flexDates,
          flex_airline: flexAirline,
          flex_stops: flexStops,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          special_notes: specialNotes,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({ title: "Bid placed", description: "We're hunting for your fare now." });
      navigate("/nyop/" + (data as any).bid.id);
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-10 px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-3">
            <Gavel className="w-4 h-4" /> Name Your Own Price
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">
            Set your price. We'll try to book it.
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Tell us where, when, and what you're willing to pay. Our agents hunt wholesale fares in the background.
            If we find one at or below your bid, we book it and email you a payment link at your price.
            No match by your deadline? You pay nothing.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="origin">From (airport code)</Label>
              <Input id="origin" value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} placeholder="JFK" maxLength={3} required />
            </div>
            <div>
              <Label htmlFor="destination">To (airport code)</Label>
              <Input id="destination" value={destination} onChange={(e) => setDestination(e.target.value.toUpperCase())} placeholder="LAX" maxLength={3} required />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Trip type</Label>
              <Select value={tripType} onValueChange={setTripType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="round-trip">Round trip</SelectItem>
                  <SelectItem value="one-way">One way</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Departure</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className={cn("w-full justify-start", !departureDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {departureDate ? format(departureDate, "MMM d, yyyy") : "Pick"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={departureDate} onSelect={setDepartureDate} disabled={(d) => d < new Date()} /></PopoverContent>
              </Popover>
            </div>
            {tripType === "round-trip" && (
              <div>
                <Label>Return</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className={cn("w-full justify-start", !returnDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {returnDate ? format(returnDate, "MMM d, yyyy") : "Pick"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={returnDate} onSelect={setReturnDate} disabled={(d) => !departureDate || d < departureDate} /></PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Passengers</Label>
              <Select value={passengers} onValueChange={setPassengers}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4,5,6,7,8,9].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cabin</Label>
              <Select value={cabinClass} onValueChange={setCabinClass}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="economy">Economy</SelectItem>
                  <SelectItem value="premium_economy">Premium Economy</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="first">First</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Wait window</Label>
              <Select value={waitHours} onValueChange={setWaitHours}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 hour</SelectItem>
                  <SelectItem value="6">6 hours</SelectItem>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="72">3 days</SelectItem>
                  <SelectItem value="168">7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <Label htmlFor="bid" className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" /> Your bid (per ticket, USD)
            </Label>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">$</span>
              <Input id="bid" type="number" min="50" step="1" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} placeholder="450" className="pl-8 text-2xl h-14 font-semibold" required />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Minimum $50 · You only pay if we find a fare at or below your bid.</p>
          </div>

          <details className="border rounded-lg p-4">
            <summary className="cursor-pointer font-medium">Flexibility (helps us match)</summary>
            <div className="mt-4 space-y-3">
              <div>
                <Label>Date flexibility (±days)</Label>
                <Select value={flexDates} onValueChange={setFlexDates}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Exact dates only</SelectItem>
                    <SelectItem value="1">± 1 day</SelectItem>
                    <SelectItem value="3">± 3 days</SelectItem>
                    <SelectItem value="7">± 7 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between"><Label>Any airline</Label><Switch checked={flexAirline} onCheckedChange={setFlexAirline} /></div>
              <div className="flex items-center justify-between"><Label>Allow connections</Label><Switch checked={flexStops} onCheckedChange={setFlexStops} /></div>
            </div>
          </details>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Contact email</Label>
              <Input id="email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} placeholder="Preferred times, seat preferences, etc." />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Placing bid…</> : <><Gavel className="mr-2 h-5 w-5" /> Place my bid</>}
          </Button>

          <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-2">
            <Clock className="w-3 h-3" /> No charge until we match your bid. You approve every purchase.
          </p>
        </form>
      </div>
    </Layout>
  );
}
