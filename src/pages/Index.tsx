import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plane,
  Building2,
  Car,
  Search,
  Loader2,
  Shield,
  User,
  Sparkles,
  ArrowLeftRight,
  CalendarDays,
  Users,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AirportAutocomplete } from "@/components/flights/AirportAutocomplete";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import logo from "@/assets/logo-black-gold-shield.png";

type SearchKind = "flights" | "hotels" | "cars";
type TripType = "one_way" | "round_trip";

const cabinOptions = [
  { value: "economy", label: "Economy" },
  { value: "premium_economy", label: "Premium Economy" },
  { value: "business", label: "Business" },
  { value: "first", label: "First" },
];

function normalizeArray(payload: unknown): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");

  if (typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const candidates = [
    obj.data,
    obj.results,
    obj.offers,
    obj.flights,
    obj.hotels,
    obj.cars,
    obj.items,
    obj.response,
    obj.journeys,
    obj.itineraries,
    obj.SearchResults,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
    }
  }

  for (const value of Object.values(obj)) {
    const nested = normalizeArray(value);
    if (nested.length) return nested;
  }

  return [];
}

function extractError(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const messages = [
    obj.error,
    obj.message,
    (obj.data as Record<string, unknown> | undefined)?.error,
    (obj.data as Record<string, unknown> | undefined)?.message,
  ];
  const first = messages.find((m) => typeof m === "string" && m.trim().length > 0);
  return typeof first === "string" ? first : null;
}

function extractPrice(result: Record<string, unknown>): { amount: string; currency: string } {
  const maybeNumbers = [
    result.customer_amount,
    result.total_amount,
    result.total,
    result.price,
    result.amount,
    (result.pricing as Record<string, unknown> | undefined)?.total,
    (result.fare as Record<string, unknown> | undefined)?.amount,
  ];
  const maybeCurrencies = [
    result.customer_currency,
    result.total_currency,
    result.currency,
    (result.pricing as Record<string, unknown> | undefined)?.currency,
    (result.fare as Record<string, unknown> | undefined)?.currency,
  ];

  const amountValue = maybeNumbers.find((v) => typeof v === "string" || typeof v === "number");
  const currencyValue = maybeCurrencies.find((v) => typeof v === "string");
  return {
    amount: amountValue !== undefined ? String(amountValue) : "Contact for price",
    currency: typeof currencyValue === "string" ? currencyValue : "",
  };
}

function extractProviderUrl(result: Record<string, unknown>): string | null {
  const direct = [
    result.booking_url,
    result.redirect_url,
    result.checkout_url,
    result.payment_url,
    result.deep_link,
    result.deeplink,
    result.url,
  ];
  const nested = [
    (result.booking as Record<string, unknown> | undefined)?.url,
    (result.checkout as Record<string, unknown> | undefined)?.url,
    (result.links as Record<string, unknown> | undefined)?.checkout,
    (result.links as Record<string, unknown> | undefined)?.booking,
  ];
  const value = [...direct, ...nested].find((v) => typeof v === "string" && v.startsWith("http"));
  return typeof value === "string" ? value : null;
}

function extractOfferReference(result: Record<string, unknown>): string | null {
  const value =
    (result.id as string | undefined) ??
    (result.offer_id as string | undefined) ??
    (result.reference as string | undefined);
  if (typeof value === "string" && value.trim().length > 0) return value;
  return null;
}

function extractRouteTitle(result: Record<string, unknown>): string {
  const direct =
    (result.name as string | undefined) ??
    (result.title as string | undefined) ??
    (result.route as string | undefined);
  if (direct && direct.trim()) return direct;

  const origin = result.origin as string | undefined;
  const destination = result.destination as string | undefined;
  if (origin && destination) return `${origin} -> ${destination}`;

  const slices = result.slices as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(slices) && slices.length > 0) {
    const first = slices[0];
    const last = slices[slices.length - 1];
    const from = (first?.origin as string | undefined) ?? ((first?.segments as Array<Record<string, unknown>> | undefined)?.[0]?.origin as string | undefined);
    const to = (last?.destination as string | undefined) ?? ((last?.segments as Array<Record<string, unknown>> | undefined)?.slice(-1)[0]?.destination as string | undefined);
    if (from && to) return `${from} -> ${to}`;
  }

  const itineraries = result.itineraries as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(itineraries) && itineraries.length > 0) {
    const segments = itineraries[0]?.segments as Array<Record<string, unknown>> | undefined;
    const from = segments?.[0]?.departure as Record<string, unknown> | undefined;
    const to = segments?.slice(-1)[0]?.arrival as Record<string, unknown> | undefined;
    const fromCode = (from?.iataCode as string | undefined) ?? (from?.iata_code as string | undefined);
    const toCode = (to?.iataCode as string | undefined) ?? (to?.iata_code as string | undefined);
    if (fromCode && toCode) return `${fromCode} -> ${toCode}`;
  }

  return "Route unavailable";
}

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isStaffOrAdmin, setIsStaffOrAdmin] = useState(false);
  const [searchKind, setSearchKind] = useState<SearchKind>("flights");
  const [tripType, setTripType] = useState<TripType>("round_trip");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Record<string, unknown>[]>([]);
  const [bookingLoadingRef, setBookingLoadingRef] = useState<string | null>(null);

  const [flightForm, setFlightForm] = useState({
    origin: "",
    destination: "",
    departure_date: "",
    return_date: "",
    adults: 1,
    cabin_class: "economy",
  });
  const [hotelForm, setHotelForm] = useState({
    location: "DXB",
    check_in_date: "",
    check_out_date: "",
    guests: 2,
    rooms: 1,
  });
  const [carForm, setCarForm] = useState({
    pickup_location: "DXB",
    dropoff_location: "DXB",
    pickup_date: "",
    pickup_time: "10:00",
    dropoff_date: "",
    dropoff_time: "10:00",
    driver_age: 30,
  });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        void checkStaffOrAdminRole(session.user.id);
      } else {
        setIsStaffOrAdmin(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        void checkStaffOrAdminRole(session.user.id);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const checkStaffOrAdminRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "staff"]);
    setIsStaffOrAdmin((data?.length || 0) > 0);
  };

  const validate = (): string | null => {
    if (searchKind !== "flights") return null;
    if (!flightForm.origin || flightForm.origin.length !== 3) return "Choose a valid origin airport.";
    if (!flightForm.destination || flightForm.destination.length !== 3) return "Choose a valid destination airport.";
    if (flightForm.origin === flightForm.destination) return "Origin and destination must be different.";
    if (!flightForm.departure_date) return "Departure date is required.";
    if (tripType === "round_trip" && !flightForm.return_date) return "Return date is required for round-trip.";
    if (tripType === "round_trip" && flightForm.return_date < flightForm.departure_date) {
      return "Return date must be after departure date.";
    }
    return null;
  };

  const runSearch = async () => {
    const validationError = validate();
    if (validationError) {
      setSearchError(validationError);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      let params: Record<string, unknown> = {};
      if (searchKind === "flights") {
        params = {
          ...flightForm,
          origin: flightForm.origin.trim().toUpperCase(),
          destination: flightForm.destination.trim().toUpperCase(),
          return_date: tripType === "round_trip" ? flightForm.return_date : undefined,
        };
      }
      if (searchKind === "hotels") params = { ...hotelForm };
      if (searchKind === "cars") params = { ...carForm };

      const { data, error } = await supabase.functions.invoke("booking", {
        body: {
          action: "search",
          product: searchKind,
          params,
        },
      });

      if (error) throw new Error(error.message || "Search request failed");

      const payload = data as Record<string, unknown> | null;
      const message = extractError(payload);
      if (message) {
        setSearchError(message);
      }

      const normalized = normalizeArray(payload);
      setSearchResults(normalized);

      if (!normalized.length && !message) {
        setSearchError("No results returned for this search. Try changing route, dates, or travelers.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Search failed";
      setSearchError(msg);
    } finally {
      setSearchLoading(false);
    }
  };

  const swapRoute = () => {
    setFlightForm((prev) => ({
      ...prev,
      origin: prev.destination,
      destination: prev.origin,
    }));
  };

  const continueProviderFlow = async (result: Record<string, unknown>) => {
    const localRef = extractOfferReference(result) ?? crypto.randomUUID();
    setBookingLoadingRef(localRef);
    setSearchError(null);
    try {
      const urlDirect = extractProviderUrl(result);
      if (urlDirect) {
        window.location.href = urlDirect;
        return;
      }

      const offerId = extractOfferReference(result);
      if (!offerId) {
        throw new Error("Provider did not return an offer id/link for this result.");
      }

      // If provider does not expose a direct checkout URL on search results,
      // continue via the full flights booking page with this offer preselected.
      const params = new URLSearchParams({
        origin: flightForm.origin.trim().toUpperCase(),
        destination: flightForm.destination.trim().toUpperCase(),
        departure_date: flightForm.departure_date,
        adults: String(flightForm.adults),
        cabin_class: flightForm.cabin_class,
        selected_offer: offerId,
      });
      if (tripType === "round_trip" && flightForm.return_date) {
        params.set("return_date", flightForm.return_date);
      }
      navigate(`/flights?${params.toString()}`);
      return;
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : "Could not start provider booking flow.");
    } finally {
      setBookingLoadingRef(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#07122a] text-white">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-slate-700/70 bg-[#07122a]/95 backdrop-blur-xl">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <img src={logo} alt="Your Travel Agent" className="h-10 w-10 object-contain" />
              <span className="hidden text-lg font-display font-bold sm:block">Your Travel Agent</span>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-1 sm:gap-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Button variant="ghost" size="sm" className="h-10 px-3 text-slate-200 hover:bg-slate-800 hover:text-white" asChild>
                <Link to="/flights">Flights</Link>
              </Button>
              <Button variant="ghost" size="sm" className="h-10 px-3 text-slate-200 hover:bg-slate-800 hover:text-white" asChild>
                <Link to="/car-rental">Cars</Link>
              </Button>
              <Button variant="ghost" size="sm" className="h-10 px-3 text-slate-200 hover:bg-slate-800 hover:text-white" asChild>
                <Link to="/request-ticket">Custom Quote</Link>
              </Button>
              {isStaffOrAdmin && (
                <Button variant="ghost" size="sm" className="h-10 px-3 text-slate-200 hover:bg-slate-800 hover:text-white" asChild>
                  <Link to="/admin">Admin</Link>
                </Button>
              )}
              {user ? (
                <Button variant="outline" size="sm" className="h-10 px-3 border-slate-600 text-slate-100 hover:bg-slate-800" asChild>
                  <Link to="/dashboard">
                    <User className="mr-2 h-4 w-4" /> Dashboard
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-10 px-3 border-slate-600 text-slate-100 hover:bg-slate-800" asChild>
                  <Link to="/auth">Sign In</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="pt-16">
        <section className="relative overflow-hidden border-b border-slate-700/60">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_15%,rgba(59,130,246,.35),transparent_40%),radial-gradient(circle_at_90%_5%,rgba(34,211,238,.3),transparent_42%),linear-gradient(180deg,#08142f_0%,#07122a_60%,#070f21_100%)]" />

          <div className="relative z-10 container mx-auto px-4 py-8 sm:py-10 md:py-14">
            <div className="mx-auto grid max-w-6xl gap-6 sm:gap-8 lg:grid-cols-[1.2fr_2fr] lg:items-start">
              <div className="space-y-4 sm:space-y-5">
                <p className="inline-flex items-center rounded-full border border-sky-300/35 bg-sky-300/10 px-3 py-1 text-xs tracking-[0.15em] text-sky-200">
                  Airline Booking Dashboard
                </p>
                <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">
                  Build Complete Trips
                  <span className="mt-1 block text-sky-300">Flights, Hotels, Cars</span>
                </h1>
                <p className="max-w-md text-sm text-slate-200 sm:text-base">
                  Start with airport suggestions as you type, choose one-way or round-trip, then search live inventory in one streamlined form.
                </p>
                <div className="grid grid-cols-1 gap-3 pt-1 text-sm sm:grid-cols-3">
                  <Card className="border-slate-600/60 bg-slate-900/35 p-3 text-center">
                    <p className="font-semibold text-sky-200">Fast</p>
                    <p className="text-xs text-slate-300">Autocomplete</p>
                  </Card>
                  <Card className="border-slate-600/60 bg-slate-900/35 p-3 text-center">
                    <p className="font-semibold text-sky-200">Flexible</p>
                    <p className="text-xs text-slate-300">Trip controls</p>
                  </Card>
                  <Card className="border-slate-600/60 bg-slate-900/35 p-3 text-center">
                    <p className="font-semibold text-sky-200">Unified</p>
                    <p className="text-xs text-slate-300">One search desk</p>
                  </Card>
                </div>
              </div>

              <Card className="rounded-2xl border-slate-500/60 bg-white p-3 text-slate-900 shadow-[0_30px_90px_rgba(2,6,23,0.5)] sm:p-4 md:p-6">
                <Tabs
                  value={searchKind}
                  onValueChange={(v) => {
                    setSearchKind(v as SearchKind);
                    setSearchError(null);
                    setSearchResults([]);
                  }}
                >
                  <TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-slate-100 p-1 text-slate-700">
                    <TabsTrigger value="flights" className="min-h-11 text-xs sm:text-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                      <Plane className="mr-2 h-4 w-4" /> Flights
                    </TabsTrigger>
                    <TabsTrigger value="hotels" className="min-h-11 text-xs sm:text-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                      <Building2 className="mr-2 h-4 w-4" /> Hotels
                    </TabsTrigger>
                    <TabsTrigger value="cars" className="min-h-11 text-xs sm:text-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                      <Car className="mr-2 h-4 w-4" /> Cars
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="mt-5">
                  {searchKind === "flights" && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-1">
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => setTripType("one_way")}
                            className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition ${
                              tripType === "one_way" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"
                            }`}
                          >
                            One-way
                          </button>
                          <button
                            type="button"
                            onClick={() => setTripType("round_trip")}
                            className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition ${
                              tripType === "round_trip" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"
                            }`}
                          >
                            <ArrowLeftRight className="mr-2 inline h-4 w-4" /> Round-trip
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
                        <div className="sm:col-span-2 lg:col-span-5">
                          <Label className="mb-2 block text-xs font-semibold tracking-wide text-slate-600">From</Label>
                          <AirportAutocomplete
                            id="flight-origin"
                            value={flightForm.origin}
                            onChange={(iata) => setFlightForm((p) => ({ ...p, origin: iata.toUpperCase() }))}
                            placeholder="City or airport"
                            inputClassName="h-11 border-slate-300 bg-white text-slate-900 placeholder:text-slate-500"
                            menuClassName="bg-white border-slate-200 text-slate-900"
                          />
                        </div>

                        <div className="flex items-end justify-start sm:justify-center lg:col-span-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={swapRoute}
                            className="h-11 w-11 rounded-full border-slate-300"
                            title="Swap origin and destination"
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="sm:col-span-2 lg:col-span-5">
                          <Label className="mb-2 block text-xs font-semibold tracking-wide text-slate-600">To</Label>
                          <AirportAutocomplete
                            id="flight-destination"
                            value={flightForm.destination}
                            onChange={(iata) => setFlightForm((p) => ({ ...p, destination: iata.toUpperCase() }))}
                            placeholder="City or airport"
                            inputClassName="h-11 border-slate-300 bg-white text-slate-900 placeholder:text-slate-500"
                            menuClassName="bg-white border-slate-200 text-slate-900"
                          />
                        </div>

                        <div className="lg:col-span-3">
                          <Label className="mb-2 block text-xs font-semibold tracking-wide text-slate-600">
                            <CalendarDays className="mr-1 inline h-3.5 w-3.5" /> Departure
                          </Label>
                          <Input
                            type="date"
                            value={flightForm.departure_date}
                            onChange={(e) => setFlightForm((p) => ({ ...p, departure_date: e.target.value }))}
                            className="h-11 bg-white text-slate-900"
                          />
                        </div>

                        <div className="lg:col-span-3">
                          <Label className="mb-2 block text-xs font-semibold tracking-wide text-slate-600">Return</Label>
                          <Input
                            type="date"
                            disabled={tripType === "one_way"}
                            min={flightForm.departure_date || undefined}
                            value={flightForm.return_date}
                            onChange={(e) => setFlightForm((p) => ({ ...p, return_date: e.target.value }))}
                            placeholder={tripType === "one_way" ? "Not needed" : "Select date"}
                            className={`h-11 bg-white text-slate-900 ${tripType === "one_way" ? "opacity-60" : ""}`}
                          />
                        </div>

                        <div className="lg:col-span-3">
                          <Label className="mb-2 block text-xs font-semibold tracking-wide text-slate-600">
                            <Users className="mr-1 inline h-3.5 w-3.5" /> Adults
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={9}
                            value={flightForm.adults}
                            onChange={(e) => setFlightForm((p) => ({ ...p, adults: Number(e.target.value || 1) }))}
                            className="h-11 bg-white text-slate-900"
                          />
                        </div>

                        <div className="lg:col-span-3">
                          <Label className="mb-2 block text-xs font-semibold tracking-wide text-slate-600">Cabin</Label>
                          <Select
                            value={flightForm.cabin_class}
                            onValueChange={(v) => setFlightForm((p) => ({ ...p, cabin_class: v }))}
                          >
                            <SelectTrigger className="h-11 bg-white text-slate-900">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {cabinOptions.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <p className="text-xs text-slate-500">Tip: click in From/To fields to see popular airport suggestions instantly.</p>
                    </div>
                  )}

                  {searchKind === "hotels" && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <Input
                        value={hotelForm.location}
                        onChange={(e) => setHotelForm((p) => ({ ...p, location: e.target.value.toUpperCase() }))}
                        placeholder="City or airport"
                        className="h-11 bg-white text-slate-900"
                      />
                      <Input
                        type="date"
                        value={hotelForm.check_in_date}
                        onChange={(e) => setHotelForm((p) => ({ ...p, check_in_date: e.target.value }))}
                        className="h-11 bg-white text-slate-900"
                      />
                      <Input
                        type="date"
                        value={hotelForm.check_out_date}
                        onChange={(e) => setHotelForm((p) => ({ ...p, check_out_date: e.target.value }))}
                        className="h-11 bg-white text-slate-900"
                      />
                      <Input
                        type="number"
                        min={1}
                        value={hotelForm.guests}
                        onChange={(e) => setHotelForm((p) => ({ ...p, guests: Number(e.target.value || 1) }))}
                        placeholder="Guests"
                        className="h-11 bg-white text-slate-900"
                      />
                      <Input
                        type="number"
                        min={1}
                        value={hotelForm.rooms}
                        onChange={(e) => setHotelForm((p) => ({ ...p, rooms: Number(e.target.value || 1) }))}
                        placeholder="Rooms"
                        className="h-11 bg-white text-slate-900"
                      />
                    </div>
                  )}

                  {searchKind === "cars" && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Input
                        value={carForm.pickup_location}
                        onChange={(e) => setCarForm((p) => ({ ...p, pickup_location: e.target.value.toUpperCase() }))}
                        placeholder="Pickup (IATA)"
                        className="h-11 bg-white text-slate-900"
                      />
                      <Input
                        value={carForm.dropoff_location}
                        onChange={(e) => setCarForm((p) => ({ ...p, dropoff_location: e.target.value.toUpperCase() }))}
                        placeholder="Dropoff (IATA)"
                        className="h-11 bg-white text-slate-900"
                      />
                      <Input
                        type="date"
                        value={carForm.pickup_date}
                        onChange={(e) => setCarForm((p) => ({ ...p, pickup_date: e.target.value }))}
                        className="h-11 bg-white text-slate-900"
                      />
                      <Input
                        type="date"
                        value={carForm.dropoff_date}
                        onChange={(e) => setCarForm((p) => ({ ...p, dropoff_date: e.target.value }))}
                        className="h-11 bg-white text-slate-900"
                      />
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    size="lg"
                    onClick={runSearch}
                    disabled={searchLoading}
                    className="h-12 w-full rounded-full bg-slate-900 px-8 font-semibold text-white hover:bg-slate-800 sm:w-auto"
                  >
                    {searchLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    Search {searchKind}
                  </Button>
                  <Button variant="outline" size="lg" className="h-12 w-full rounded-full sm:w-auto" asChild>
                    <Link to="/request-ticket">
                      <Sparkles className="mr-2 h-4 w-4" /> Concierge Quote
                    </Link>
                  </Button>
                </div>

                {searchError && (
                  <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{searchError}</div>
                )}

                {searchResults.length > 0 && (
                  <div className="mt-5 max-h-[360px] space-y-3 overflow-auto pr-1">
                    {searchResults.slice(0, 20).map((r, i) => {
                      const name = extractRouteTitle(r);
                      const offerPrice = extractPrice(r);
                      const price = offerPrice.amount;
                      const currency = offerPrice.currency;
                      const ref = extractOfferReference(r) ?? "N/A";

                      return (
                        <Card key={i} className="border border-slate-200 bg-white text-slate-900 p-3 sm:p-4">
                          <div className="grid gap-3 sm:grid-cols-4">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Route / Title</div>
                              <div className="text-sm font-semibold text-slate-900">{name}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price</div>
                              <div className="text-sm font-semibold text-slate-900">
                                {price} {currency}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reference</div>
                              <div className="truncate text-sm text-slate-700">{ref}</div>
                            </div>
                            <div className="flex items-center justify-start sm:justify-end">
                              {searchKind === "flights" ? (
                                <Button
                                  size="sm"
                                  className="bg-slate-900 text-white hover:bg-slate-800"
                                  onClick={() => continueProviderFlow(r)}
                                  disabled={bookingLoadingRef === ref}
                                >
                                  {bookingLoadingRef === ref ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                  Continue with Provider
                                </Button>
                              ) : (
                                <Button asChild size="sm" className="bg-slate-900 text-white hover:bg-slate-800">
                                  <Link
                                    to="/request-ticket"
                                    state={{
                                      prefill: {
                                        product: searchKind,
                                        result: r,
                                        route: name,
                                        reference: ref,
                                        price,
                                        currency,
                                      },
                                    }}
                                  >
                                    Select Offer
                                  </Link>
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-800 py-8">
          <div className="container mx-auto px-4 text-center text-sm text-slate-300">
            Protected bookings, transparent operations, and real agent assistance when you need it.
            <div className="mt-2 inline-flex items-center gap-2 text-sky-300">
              <Shield className="h-4 w-4" /> Agency-grade support
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 py-6">
        <div className="container mx-auto flex flex-wrap items-center justify-center gap-6 px-4 text-sm text-slate-400">
          <Link to="/faq" className="transition-colors hover:text-white">
            FAQ
          </Link>
          <Link to="/about" className="transition-colors hover:text-white">
            About
          </Link>
          <Link to="/car-rental" className="transition-colors hover:text-white">
            Car Rental
          </Link>
          <Link to="/privacy" className="transition-colors hover:text-white">
            Privacy
          </Link>
          <Link to="/terms" className="transition-colors hover:text-white">
            Terms
          </Link>
          <Link to="/contact" className="transition-colors hover:text-white">
            Contact
          </Link>
        </div>
      </footer>
    </div>
  );
};

export default Index;
