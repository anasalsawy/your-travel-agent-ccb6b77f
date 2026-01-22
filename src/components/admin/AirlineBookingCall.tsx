import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Loader2, CheckCircle, XCircle, Plane, CreditCard, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * AIRLINE BOOKING CALL - SIMPLIFIED
 * 
 * Auto-generates everything from minimal input:
 * 1. Which airline to call
 * 2. What ticket to book (route, dates, passengers)
 * 3. Payment information
 * 
 * Maya handles: IVR navigation, hold times, agent interaction, booking confirmation
 */

export interface BookingDetails {
  // Route
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  
  // Passengers
  passengers: string;
  passengerNames: string;
  
  // Class & Preferences
  cabinClass: string;
  flexibleDates: boolean;
  
  // Payment
  cardholderName: string;
  cardLastFour: string;
  cardType: string;
  billingZip: string;
  
  // Special requests
  seatPreference: string;
  specialRequests: string;

  // Customer contact (for confirmation emails from airline)
  customerEmail: string;
  customerPhone: string;
}

export interface BatchCallRowData {
  phone_number: string;
  language: string;
  first_message: string;
  prompt: string;
  other_dyn_variable: string;
}

export interface AirlineBookingCallProps {
  /** Pre-fill booking details from a ticket request */
  initialBooking?: Partial<BookingDetails>;
  /** Pre-select airline by value (e.g., "alaska", "delta") or by name */
  initialAirline?: string;
  /** Link to a ticket request ID for call logging */
  ticketRequestId?: string;
  /** Callback when call is initiated */
  onCallStarted?: (callResult: { success: boolean; message: string; callLogId?: string }) => void;
  /** Callback to add to batch file */
  onAddToBatch?: (row: BatchCallRowData) => void;
}

export const AIRLINES = [
  { value: "alaska", label: "Alaska Airlines", phone: "+1-800-252-7522", code: "AS" },
  { value: "american", label: "American Airlines", phone: "+1-800-433-7300", code: "AA" },
  { value: "delta", label: "Delta Airlines", phone: "+1-800-221-1212", code: "DL" },
  { value: "united", label: "United Airlines", phone: "+1-800-864-8331", code: "UA" },
  { value: "southwest", label: "Southwest Airlines", phone: "+1-800-435-9792", code: "WN" },
  { value: "jetblue", label: "JetBlue Airways", phone: "+1-800-538-2583", code: "B6" },
  { value: "spirit", label: "Spirit Airlines", phone: "+1-801-401-2222", code: "NK" },
  { value: "frontier", label: "Frontier Airlines", phone: "+1-801-401-9000", code: "F9" },
  { value: "hawaiian", label: "Hawaiian Airlines", phone: "+1-800-367-5320", code: "HA" },
  { value: "air_france", label: "Air France", phone: "+1-800-237-2747", code: "AF" },
  { value: "british_airways", label: "British Airways", phone: "+1-800-247-9297", code: "BA" },
  { value: "lufthansa", label: "Lufthansa", phone: "+1-800-645-3880", code: "LH" },
  { value: "emirates", label: "Emirates", phone: "+1-800-777-3999", code: "EK" },
  { value: "qatar", label: "Qatar Airways", phone: "+1-877-777-2827", code: "QR" },
  { value: "turkish", label: "Turkish Airlines", phone: "+1-800-874-8875", code: "TK" },
  { value: "other", label: "Other Airline", phone: "", code: "" },
];

const CABIN_CLASSES = [
  { value: "economy", label: "Economy" },
  { value: "premium_economy", label: "Premium Economy" },
  { value: "business", label: "Business Class" },
  { value: "first", label: "First Class" },
];

const DEFAULT_BOOKING: BookingDetails = {
  origin: "",
  destination: "",
  departureDate: "",
  returnDate: "",
  passengers: "1",
  passengerNames: "",
  cabinClass: "economy",
  flexibleDates: false,
  cardholderName: "",
  cardLastFour: "",
  cardType: "visa",
  billingZip: "",
  seatPreference: "",
  specialRequests: "",
  customerEmail: "",
  customerPhone: "",
};

export function AirlineBookingCall({ initialBooking, initialAirline, ticketRequestId, onCallStarted, onAddToBatch }: AirlineBookingCallProps = {}) {
  const [selectedAirline, setSelectedAirline] = useState<string>("");
  const [customPhone, setCustomPhone] = useState<string>("");
  const [pin, setPin] = useState("");
  const [calling, setCalling] = useState(false);
  const [testingPayload, setTestingPayload] = useState(false);
  const [callResult, setCallResult] = useState<{ success: boolean; message: string; callLogId?: string } | null>(null);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const { toast } = useToast();

  const [booking, setBooking] = useState<BookingDetails>({ ...DEFAULT_BOOKING, ...initialBooking });

  // Update when initial values change (e.g., when opened with different ticket request)
  useEffect(() => {
    if (initialBooking) {
      setBooking({ ...DEFAULT_BOOKING, ...initialBooking });
    }
    if (initialAirline) {
      // Try to match by value first, then by label
      const matchedAirline = AIRLINES.find(
        a => a.value === initialAirline.toLowerCase() || 
             a.label.toLowerCase().includes(initialAirline.toLowerCase())
      );
      if (matchedAirline) {
        setSelectedAirline(matchedAirline.value);
      }
    }
  }, [initialBooking, initialAirline]);

  const updateBooking = (field: keyof BookingDetails, value: string | boolean) => {
    setBooking((prev) => ({ ...prev, [field]: value }));
  };

  const getAirline = () => AIRLINES.find((a) => a.value === selectedAirline);
  const getPhoneNumber = () => getAirline()?.phone || customPhone;

  // AUTO-GENERATE system prompt based on minimal inputs
  const generateSystemPrompt = (): string => {
    const airline = getAirline();
    const isRoundTrip = !!booking.returnDate;

    return `
=== MAYA'S IDENTITY ===
You are Maya, a professional travel agent from "Your Travel Agent" agency.
You are calling ${airline?.label || "the airline"} to book a flight for a customer.
You have FULL AUTHORITY to complete this booking including payment.

=== YOUR MISSION ===
BOOK A FLIGHT with the following details:

ROUTE: ${booking.origin} → ${booking.destination}
TYPE: ${isRoundTrip ? "Round-trip" : "One-way"}
DEPARTURE: ${booking.departureDate}
${isRoundTrip ? `RETURN: ${booking.returnDate}` : ""}
PASSENGERS: ${booking.passengers} passenger(s)
PASSENGER NAMES: ${booking.passengerNames || "Will provide when asked"}
CABIN CLASS: ${CABIN_CLASSES.find(c => c.value === booking.cabinClass)?.label || "Economy"}
${booking.seatPreference ? `SEAT PREFERENCE: ${booking.seatPreference}` : ""}
${booking.specialRequests ? `SPECIAL REQUESTS: ${booking.specialRequests}` : ""}

=== CUSTOMER CONTACT FOR CONFIRMATION ===
When the booking is complete, tell the airline to send confirmation to:
- Email: ${booking.customerEmail || "Will provide when asked"}
- Phone: ${booking.customerPhone || "Will provide when asked"}
IMPORTANT: Make sure to provide this info so the customer gets their confirmation!

=== PAYMENT INFORMATION ===
When ready to pay, you have authorization to use:
- Card Type: ${booking.cardType.toUpperCase()}
- Cardholder Name: ${booking.cardholderName}
- Last 4 digits: ${booking.cardLastFour}
- Billing Zip: ${booking.billingZip}

IMPORTANT: When they ask for the full card number, say "Please hold while I get the card."
Then PAUSE and wait - the admin will enter the card number using the secure keypad.
Do NOT make up a card number.

=== IVR NAVIGATION ===
When you encounter automated phone menus:
1. LISTEN carefully to all options
2. Use the keypad touch tone tool to press numbers
3. Common paths for NEW BOOKINGS:
   - Press 1 for English
   - Press 2 for New Reservations/Bookings
   - Press 0 to speak to a human agent
4. If stuck, press 0 repeatedly to reach an agent
5. Say "agent" or "representative" if voice-activated

=== HOLD TIME BEHAVIOR ===
- NEVER hang up while on hold
- Wait patiently for up to 45 minutes
- When an agent answers, immediately identify yourself

=== CONVERSATION FLOW ===
1. Greet the agent professionally
2. State you're calling to book a new flight
3. Provide route and date details
4. Confirm passenger information
5. Ask about pricing and available flights
6. Select the best option for the customer
7. Proceed with payment when asked
8. Get confirmation number
9. Request email confirmation

=== NEGOTIATION ===
- Ask about any current promotions or discounts
- Inquire about flexible date savings
- Check if there are better prices on alternative flights
- Accept reasonable pricing for the requested route

=== CRITICAL RULES ===
1. BE PERSISTENT - Airlines have long hold times, don't give up
2. BE CLEAR - Spell out names phonetically if needed
3. CONFIRM EVERYTHING - Repeat back dates, flight numbers, prices
4. GET CONFIRMATION - Always get a confirmation/PNR number
5. REQUEST EMAIL - Ask them to send email confirmation
6. TAKE NOTES - Remember everything discussed
7. BE POLITE - Thank agents for their help

=== PHONETIC ALPHABET (NATO) - USE THIS FOR ALL SPELLING ===
When spelling names, confirmation numbers, or any letters:
A-Alpha, B-Bravo, C-Charlie, D-Delta, E-Echo, F-Foxtrot, G-Golf, H-Hotel,
I-India, J-Juliet, K-Kilo, L-Lima, M-Mike, N-November, O-Oscar, P-Papa,
Q-Quebec, R-Romeo, S-Sierra, T-Tango, U-Uniform, V-Victor, W-Whiskey,
X-X-ray, Y-Yankee, Z-Zulu

Example: "Smith" = "Sierra, Mike, India, Tango, Hotel"
Example: "Confirmation ABC123" = "Alpha, Bravo, Charlie, One, Two, Three"

ALWAYS use phonetics when:
- Spelling passenger names
- Repeating confirmation/PNR numbers
- Verifying email addresses
- Clarifying any letters that could be misheard (B/D, M/N, S/F, etc.)

=== NUMBER PRONUNCIATION ===
- Say each digit individually: "1-2-3-4" not "twelve thirty-four"
- For zeros, say "zero" not "oh"
- For dates: "January fifteenth, twenty twenty-six" then confirm "That's 01/15/2026"
- Pause between digit groups for clarity

=== CREDIT CARD READING - CRITICAL TECHNIQUE ===
When the admin enters card digits via keypad, read them to the agent like this:
1. FIRST FOUR: "The first four digits are: 4, 1, 4, 7" (pause)
2. NEXT FOUR: "The next four digits are: 8, 9, 2, 3" (pause)
3. NEXT FOUR: "The next four digits are: 0, 0, 1, 2" (pause)
4. LAST FOUR: "And the last four digits are: ${booking.cardLastFour}"
5. EXPIRATION: "Expiration date is..." (wait for admin to enter)
6. CVV: "Security code is..." (wait for admin to enter)

ALWAYS ask: "Would you like me to repeat any of those numbers?"
If they read back, confirm: "Yes, that's correct" or "Let me correct that..."

=== VERIFICATION LOOPS - ALWAYS DO THIS ===
After every critical piece of information, verify:
1. YOU say it → THEY repeat it back → YOU confirm
2. THEY say it → YOU repeat it back → THEY confirm

Examples:
- "So that's flight Delta 1247 departing at 3:45 PM, correct?"
- "Let me confirm the total: $847.50 including all taxes and fees?"
- "The confirmation number is Alpha-Bravo-Charlie-1-2-3, is that right?"

=== WHEN THEY SPEAK TOO FAST ===
Say: "I'm sorry, could you repeat that slowly? I want to make sure I get this right for my customer."
Or: "Could you spell that out for me using the phonetic alphabet?"

=== AFTER BOOKING ===
Provide a complete summary including:
- Flight number(s) and times (spelled phonetically)
- Confirmation/PNR number (spelled phonetically)
- Total price paid
- Seat assignments if any
- Any special notes
- Confirm email was sent to: ${booking.customerEmail}
`.trim();
  };

  // AUTO-GENERATE first message
  const generateFirstMessage = (): string => {
    const airline = getAirline();
    const isRoundTrip = !!booking.returnDate;
    
    return `Hello, this is Maya from Your Travel Agent agency. I'd like to book a ${isRoundTrip ? "round-trip" : "one-way"} flight from ${booking.origin} to ${booking.destination}, departing ${booking.departureDate}${isRoundTrip ? ` and returning ${booking.returnDate}` : ""}. I have ${booking.passengers} passenger${Number(booking.passengers) > 1 ? "s" : ""} traveling in ${CABIN_CLASSES.find(c => c.value === booking.cabinClass)?.label || "Economy"}. Could you help me find the best available options?`;
  };

  const handleCall = async () => {
    // Validate required fields
    if (!selectedAirline) {
      toast({ title: "Select an airline", variant: "destructive" });
      return;
    }
    if (!booking.origin || !booking.destination) {
      toast({ title: "Enter origin and destination", variant: "destructive" });
      return;
    }
    if (!booking.departureDate) {
      toast({ title: "Enter departure date", variant: "destructive" });
      return;
    }
    if (!pin) {
      toast({ title: "Enter PIN to authorize call", variant: "destructive" });
      return;
    }

    const phoneNumber = getPhoneNumber();
    if (!phoneNumber) {
      toast({ title: "Phone number required", variant: "destructive" });
      return;
    }

    setCalling(true);
    setCallResult(null);

    try {
      // PIN verification
      const correctPin = "1234";
      if (pin !== correctPin) {
        setCallResult({ success: false, message: "Invalid PIN. Access denied." });
        setCalling(false);
        return;
      }

      const systemPrompt = generateSystemPrompt();
      const firstMessage = generateFirstMessage();

      console.log("=== AUTO-GENERATED SYSTEM PROMPT ===");
      console.log(systemPrompt);
      console.log("=== AUTO-GENERATED FIRST MESSAGE ===");
      console.log(firstMessage);

      const { data, error } = await supabase.functions.invoke("make-outbound-call", {
        body: {
          phone_number: phoneNumber.replace(/[^\d+]/g, ""),
          first_message: firstMessage,
          context: systemPrompt,
          use_maya_brain: true,
          call_type: "airline_booking",
          // New fields for call logging
          ticket_request_id: ticketRequestId || null,
          airline: getAirline()?.label || "Unknown",
          customer_email: booking.customerEmail || null,
          customer_phone: booking.customerPhone || null,
          passenger_names: booking.passengerNames || null,
        },
      });

      if (error) throw error;

      if (data?.success) {
        const result = {
          success: true,
          message: `Call initiated to ${getAirline()?.label}! Maya is now booking your flight.`,
          callLogId: data.call_log_id,
        };
        setCallResult(result);
        onCallStarted?.(result);
        toast({
          title: "Booking Call Started! ✈️",
          description: `Maya is calling ${getAirline()?.label} to book ${booking.origin} → ${booking.destination}`,
        });
      } else {
        const result = {
          success: false,
          message: data?.error || "Failed to initiate call",
        };
        setCallResult(result);
        onCallStarted?.(result);
      }
    } catch (error: any) {
      console.error("Call error:", error);
      const result = { success: false, message: error.message || "Failed to initiate call" };
      setCallResult(result);
      onCallStarted?.(result);
      toast({ title: "Call Failed", description: error.message, variant: "destructive" });
    } finally {
      setCalling(false);
    }
  };

  // DRY RUN - Test what payload would be sent without placing a call
  const handleTestPayload = async () => {
    if (!selectedAirline) {
      toast({ title: "Select an airline first", variant: "destructive" });
      return;
    }

    setTestingPayload(true);
    setDryRunResult(null);

    try {
      const systemPrompt = generateSystemPrompt();
      const firstMessage = generateFirstMessage();
      const phoneNumber = getPhoneNumber();

      const { data, error } = await supabase.functions.invoke("make-outbound-call", {
        body: {
          phone_number: phoneNumber?.replace(/[^\d+]/g, "") || "+1-800-TEST",
          first_message: firstMessage,
          context: systemPrompt,
          use_maya_brain: true,
          call_type: "airline_booking",
          ticket_request_id: ticketRequestId || null,
          airline: getAirline()?.label || "Unknown",
          customer_email: booking.customerEmail || null,
          customer_phone: booking.customerPhone || null,
          passenger_names: booking.passengerNames || null,
          dry_run: true, // THIS IS THE KEY - no actual call placed
        },
      });

      if (error) throw error;

      setDryRunResult(data);
      toast({
        title: "Payload Generated ✅",
        description: "Check the result below - this is exactly what would be sent",
      });
    } catch (error: any) {
      console.error("Test payload error:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setTestingPayload(false);
    }
  };

  const handleAddToBatch = () => {
    if (!selectedAirline) {
      toast({ title: "Select an airline first", variant: "destructive" });
      return;
    }
    if (!booking.origin || !booking.destination || !booking.departureDate) {
      toast({ title: "Fill in route and date first", variant: "destructive" });
      return;
    }

    const phoneNumber = getPhoneNumber();
    const systemPrompt = generateSystemPrompt();
    const firstMessage = generateFirstMessage();

    onAddToBatch?.({
      phone_number: phoneNumber?.replace(/[^\d+]/g, "") || "",
      language: "",
      first_message: firstMessage,
      prompt: systemPrompt,
      other_dyn_variable: JSON.stringify({
        airline: getAirline()?.label,
        route: `${booking.origin} → ${booking.destination}`,
        customer_email: booking.customerEmail,
      }),
    });

    toast({
      title: "Added to Batch! 📋",
      description: `${getAirline()?.label} booking added to batch file`,
    });
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
            <Plane className="w-6 h-6 text-white" />
          </div>
          <div>
            <CardTitle>Book Ticket by Phone</CardTitle>
            <CardDescription>
              Just enter airline, route, and payment - Maya handles everything else
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Step 1: Select Airline */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">1</div>
            Which airline?
          </div>
          
          <Select value={selectedAirline} onValueChange={setSelectedAirline}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Select airline to call..." />
            </SelectTrigger>
            <SelectContent>
              {AIRLINES.map((airline) => (
                <SelectItem key={airline.value} value={airline.value}>
                  <span className="font-medium">{airline.label}</span>
                  {airline.phone && <span className="text-muted-foreground ml-2">{airline.phone}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedAirline === "other" && (
            <Input
              value={customPhone}
              onChange={(e) => setCustomPhone(e.target.value)}
              placeholder="Enter airline phone number"
            />
          )}
        </div>

        {/* Step 2: Flight Details */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">2</div>
            What ticket?
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input
                value={booking.origin}
                onChange={(e) => updateBooking("origin", e.target.value.toUpperCase())}
                placeholder="JFK, LAX, ORD..."
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input
                value={booking.destination}
                onChange={(e) => updateBooking("destination", e.target.value.toUpperCase())}
                placeholder="MIA, SFO, LHR..."
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Departure Date</Label>
              <Input
                type="date"
                value={booking.departureDate}
                onChange={(e) => updateBooking("departureDate", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Return Date (optional)</Label>
              <Input
                type="date"
                value={booking.returnDate}
                onChange={(e) => updateBooking("returnDate", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Passengers</Label>
              <Select value={booking.passengers} onValueChange={(v) => updateBooking("passengers", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} passenger{n > 1 ? "s" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cabin Class</Label>
              <Select value={booking.cabinClass} onValueChange={(v) => updateBooking("cabinClass", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CABIN_CLASSES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Passenger Name(s)</Label>
            <Input
              value={booking.passengerNames}
              onChange={(e) => updateBooking("passengerNames", e.target.value)}
              placeholder="John Smith, Jane Smith (as on ID)"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Customer Email (for confirmation)</Label>
              <Input
                type="email"
                value={booking.customerEmail}
                onChange={(e) => updateBooking("customerEmail", e.target.value)}
                placeholder="customer@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Customer Phone</Label>
              <Input
                type="tel"
                value={booking.customerPhone}
                onChange={(e) => updateBooking("customerPhone", e.target.value)}
                placeholder="+1 555-123-4567"
              />
            </div>
          </div>
        </div>

        {/* Step 3: Payment Info */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">3</div>
            <CreditCard className="w-4 h-4" />
            Payment details
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cardholder Name</Label>
              <Input
                value={booking.cardholderName}
                onChange={(e) => updateBooking("cardholderName", e.target.value)}
                placeholder="Name on card"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Card Type</Label>
              <Select value={booking.cardType} onValueChange={(v) => updateBooking("cardType", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visa">Visa</SelectItem>
                  <SelectItem value="mastercard">Mastercard</SelectItem>
                  <SelectItem value="amex">American Express</SelectItem>
                  <SelectItem value="discover">Discover</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Last 4 Digits</Label>
              <Input
                value={booking.cardLastFour}
                onChange={(e) => updateBooking("cardLastFour", e.target.value.slice(0, 4))}
                placeholder="1234"
                maxLength={4}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Billing Zip</Label>
              <Input
                value={booking.billingZip}
                onChange={(e) => updateBooking("billingZip", e.target.value)}
                placeholder="12345"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            💡 Maya will tell the agent she has payment ready. Full card details are handled securely.
          </p>
        </div>

        {/* Optional: Special Requests */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Special Requests (optional)</Label>
          <Textarea
            value={booking.specialRequests}
            onChange={(e) => updateBooking("specialRequests", e.target.value)}
            placeholder="Window seat, wheelchair assistance, dietary needs..."
            rows={2}
          />
        </div>

        {/* Test Payload Button */}
        <div className="border-t pt-4">
          <Button
            onClick={handleTestPayload}
            disabled={testingPayload || !selectedAirline}
            variant="outline"
            className="w-full"
          >
            {testingPayload ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              "🔍 Test Payload (No Call)"
            )}
          </Button>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Shows exactly what would be sent to ElevenLabs without placing a call
          </p>
        </div>

        {/* Dry Run Result */}
        {dryRunResult && (
          <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">📦 Payload That Would Be Sent</h4>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setDryRunResult(null)}
              >
                Clear
              </Button>
            </div>
            
            <div className="text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Endpoint:</span>
                <code className="bg-background px-2 py-0.5 rounded">{dryRunResult.endpoint}</code>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">System Prompt Length:</span>
                <span className="font-mono">{dryRunResult.system_prompt_length} chars</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">First Message Length:</span>
                <span className="font-mono">{dryRunResult.first_message_length} chars</span>
              </div>
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer font-medium text-primary">View Full Payload (JSON)</summary>
              <pre className="mt-2 p-3 bg-background rounded border overflow-auto max-h-96 text-[10px]">
                {JSON.stringify(dryRunResult.payload, null, 2)}
              </pre>
            </details>

            <details className="text-xs">
              <summary className="cursor-pointer font-medium text-primary">View System Prompt</summary>
              <pre className="mt-2 p-3 bg-background rounded border overflow-auto max-h-96 whitespace-pre-wrap text-[10px]">
                {dryRunResult.payload?.conversation_config_override?.agent?.prompt?.prompt || "No prompt in payload"}
              </pre>
            </details>

            <details className="text-xs">
              <summary className="cursor-pointer font-medium text-primary">View First Message</summary>
              <pre className="mt-2 p-3 bg-background rounded border overflow-auto max-h-40 whitespace-pre-wrap text-[10px]">
                {dryRunResult.payload?.conversation_config_override?.agent?.first_message || "No first message in payload"}
              </pre>
            </details>
          </div>
        )}

        {/* PIN & Call Button */}
        <div className="border-t pt-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">Owner PIN</Label>
              <Input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN to authorize"
                maxLength={6}
              />
            </div>
            
            <Button
              onClick={handleCall}
              disabled={calling || !selectedAirline || !booking.origin || !booking.destination}
              size="lg"
              className="h-12 px-8"
            >
              {calling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Calling...
                </>
              ) : (
                <>
                  <Phone className="w-4 h-4 mr-2" />
                  Book Now
                </>
              )}
            </Button>
            
            {onAddToBatch && (
              <Button
                variant="outline"
                onClick={handleAddToBatch}
                disabled={!selectedAirline || !booking.origin || !booking.destination}
                size="lg"
                className="h-12 px-8"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Add to Batch
              </Button>
            )}
          </div>

          {callResult && (
            <div className={`p-3 rounded-lg flex items-start gap-2 ${
              callResult.success ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"
            }`}>
              {callResult.success ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="text-sm">{callResult.message}</span>
            </div>
          )}
        </div>

        {/* What Maya Will Do */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
          <p className="font-medium">Maya will automatically:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Navigate IVR phone menus using DTMF tones</li>
            <li>Wait on hold patiently (up to 45 minutes)</li>
            <li>Provide all flight and passenger details</li>
            <li>Negotiate for the best available price</li>
            <li>Complete payment when ready</li>
            <li>Get confirmation number and request email</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
