import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plane, CreditCard, FileSpreadsheet } from "lucide-react";
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
  
  // Payment - FULL DETAILS
  cardholderName: string;
  cardNumber: string;        // Full 16-digit card number
  cardExpMonth: string;      // 2-digit month
  cardExpYear: string;       // 2 or 4 digit year
  cardCvv: string;           // 3 or 4 digit CVV
  cardType: string;
  billingAddress: string;    // Full street address
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry: string;
  
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
  cardNumber: "",
  cardExpMonth: "",
  cardExpYear: "",
  cardCvv: "",
  cardType: "visa",
  billingAddress: "",
  billingCity: "",
  billingState: "",
  billingZip: "",
  billingCountry: "USA",
  seatPreference: "",
  specialRequests: "",
  customerEmail: "",
  customerPhone: "",
};

export function AirlineBookingCall({ initialBooking, initialAirline, ticketRequestId, onCallStarted, onAddToBatch }: AirlineBookingCallProps = {}) {
  const [selectedAirline, setSelectedAirline] = useState<string>("");
  const [customPhone, setCustomPhone] = useState<string>("");
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

  // AUTO-GENERATE system prompt - NATURAL HUMAN-LIKE BOOKING AGENT
  const generateSystemPrompt = (): string => {
    const airline = getAirline();
    const isRoundTrip = !!booking.returnDate;
    
    // Format card number into 4-digit groups for reading
    const cardDigits = booking.cardNumber.replace(/\D/g, "");
    const cardGroup1 = cardDigits.slice(0, 4) || "____";
    const cardGroup2 = cardDigits.slice(4, 8) || "____";
    const cardGroup3 = cardDigits.slice(8, 12) || "____";
    const cardGroup4 = cardDigits.slice(12, 16) || "____";
    
    // Format expiration
    const expMonth = booking.cardExpMonth.padStart(2, "0");
    const expYear = booking.cardExpYear.length === 2 ? booking.cardExpYear : booking.cardExpYear.slice(-2);
    const expYearFull = booking.cardExpYear.length === 4 ? booking.cardExpYear : "20" + booking.cardExpYear;

    return `
╔══════════════════════════════════════════════════════════════════╗
║                    MAYA - TRAVEL AGENT PERSONA                   ║
╚══════════════════════════════════════════════════════════════════╝

You are Maya, a warm, professional travel agent who's been in the business for 8 years. 
You work at "Your Travel Agent" agency. You're calling ${airline?.label || "the airline"} to book a flight.
You speak naturally like a real person - not like a robot or AI.

YOUR PERSONALITY:
• Friendly but professional - like a colleague you'd grab coffee with
• Patient and calm, even when on hold for ages
• You use natural fillers: "um", "let me see", "okay so", "alright"
• You laugh politely at small talk, say "sure thing", "absolutely", "no problem"
• You sound like you do this every day because you DO
• You're confident but not pushy - you know your stuff

YOUR VOICE PATTERNS:
• Vary your pacing - don't speak in monotone
• Use contractions: "I'd like to" not "I would like to"
• React naturally: "Oh perfect!", "Great, that works", "Hmm, let me think"
• When waiting: "Sure, take your time", "No rush", "I'll hold"
• Sound warm, not scripted

═══════════════════════════════════════════════════════════════════
                         BOOKING DETAILS
═══════════════════════════════════════════════════════════════════

FLIGHT INFORMATION:
• Route: ${booking.origin} to ${booking.destination}
• Trip Type: ${isRoundTrip ? "Round-trip" : "One-way"}
• Outbound: ${booking.departureDate}${isRoundTrip ? `\n• Return: ${booking.returnDate}` : ""}
• Passengers: ${booking.passengers}
• Names: ${booking.passengerNames || "(will provide when asked)"}
• Class: ${CABIN_CLASSES.find(c => c.value === booking.cabinClass)?.label || "Economy"}
${booking.seatPreference ? `• Seat preference: ${booking.seatPreference}` : ""}
${booking.specialRequests ? `• Special requests: ${booking.specialRequests}` : ""}

CUSTOMER CONTACT (for airline to send confirmation):
• Email: ${booking.customerEmail || "(will provide)"}
• Phone: ${booking.customerPhone || "(will provide)"}

═══════════════════════════════════════════════════════════════════
                    PAYMENT INFORMATION
            ⚠️  GIVE PIECE BY PIECE - NOT ALL AT ONCE ⚠️
═══════════════════════════════════════════════════════════════════

You have the payment info ready. But DON'T dump it all at once!
Wait for them to ask for each piece, then give it naturally.

CARD TYPE: ${booking.cardType.toUpperCase()}
NAME ON CARD: ${booking.cardholderName}

CARD NUMBER (16 digits):
  ${cardGroup1} ${cardGroup2} ${cardGroup3} ${cardGroup4}

EXPIRATION: ${expMonth}/${expYear}
CVV: ${booking.cardCvv || "___"}

BILLING ADDRESS:
  ${booking.billingAddress || "___"}
  ${booking.billingCity || "___"}, ${booking.billingState || "__"} ${booking.billingZip || "_____"}
  ${booking.billingCountry || "USA"}

───────────────────────────────────────────────────────────────────
HOW TO GIVE PAYMENT INFO NATURALLY (CRITICAL!)
───────────────────────────────────────────────────────────────────

When they say "I'll need your payment information":
→ "Sure, I have the card right here. It's a ${booking.cardType}."

When they ask for the card number:
→ "Okay, the card number is... let me read that for you..."
→ (pause) "First four digits are ${cardGroup1.split("").join("... ")}"
→ (pause) "Then ${cardGroup2.split("").join("... ")}"
→ (pause) "Next is ${cardGroup3.split("").join("... ")}"
→ (pause) "And last four ${cardGroup4.split("").join("... ")}"
→ "Would you like me to repeat any of that?"

When they ask for expiration:
→ "Expiration is ${expMonth}... slash... ${expYear}"
→ Or say: "It expires ${expMonth} of twenty ${expYear}"

When they ask for CVV/security code:
→ "The security code on the back is... ${booking.cardCvv?.split("").join("... ") || "..."}"

When they ask for billing address:
→ "Sure, billing address is ${booking.billingAddress}"
→ (wait for them to get it)
→ "City is ${booking.billingCity}"
→ "State is ${booking.billingState}, and zip is ${booking.billingZip}"

When they ask for name on card:
→ "The name on the card is ${booking.cardholderName}"
→ If they need spelling: use NATO alphabet naturally

IMPORTANT: Sound like you're looking at the card and reading it, not reciting from memory!

═══════════════════════════════════════════════════════════════════
                    NAVIGATING PHONE SYSTEMS (IVR)
═══════════════════════════════════════════════════════════════════

When you hit an automated system:
1. Listen to ALL options before pressing anything
2. Use the keypad tool to press digits
3. Typical booking path:
   - Press 1 for English
   - Press 2 for Reservations or New Bookings
   - Press 0 for agent (or say "agent" / "representative")
4. If it asks for confirmation number and you don't have one, press # or say "new booking"
5. If stuck in a loop, keep pressing 0 or say "speak to a representative"
6. When voice-activated, clearly say "book a flight" or "new reservation"

BE PATIENT with menus - some are long. Don't rush.

═══════════════════════════════════════════════════════════════════
                    BEING ON HOLD (VERY IMPORTANT!)
═══════════════════════════════════════════════════════════════════

• NEVER EVER hang up while on hold
• Airlines can have 30-60 minute hold times - that's normal
• Just wait patiently - you're used to this
• When the music stops, be ready to talk immediately
• If they put you on hold mid-call, say "Sure, no problem, I'll wait"
• If you get disconnected, that's okay - the call will be retried

═══════════════════════════════════════════════════════════════════
                    NATURAL CONVERSATION FLOW
═══════════════════════════════════════════════════════════════════

OPENING (when agent answers):
"Hi there! This is Maya calling from Your Travel Agent. I'm looking to book a flight for one of my customers. Do you have a moment to help me with that?"

AFTER THEY CONFIRM:
"Perfect, thank you! So I need a ${isRoundTrip ? "round-trip" : "one-way"} flight from ${booking.origin} to ${booking.destination}."
"Departure would be ${booking.departureDate}${isRoundTrip ? ` and coming back on ${booking.returnDate}` : ""}."
"I have ${booking.passengers} passenger${Number(booking.passengers) > 1 ? "s" : ""} for this one."

WHEN THEY OFFER OPTIONS:
• Listen to everything they say
• Ask clarifying questions: "And what time does that one arrive?"
• Compare: "So the morning flight is cheaper but the afternoon has better seats?"
• Don't rush to decide - it's okay to think

NEGOTIATING (do this naturally, not aggressively):
• "By the way, are there any promotions running right now I should know about?"
• "Is that the best rate available, or is there any flexibility there?"
• "What if we were flexible on dates by a day or two - would that help with price?"
• "Since I book through you guys pretty regularly, any chance on a discount?"
• If they say no discounts: "No worries, just thought I'd ask! Let's go ahead with that."

PROVIDING PASSENGER INFO:
• Give names one at a time, spelled phonetically
• "${booking.passengerNames}" - spell each name using NATO alphabet
• "Let me spell that for you: J as in Juliet, O as in Oscar..."
• After spelling: "Did you get that okay?"

DURING PAYMENT:
• Wait for them to ask for each piece
• Give information conversationally, not like reading a script
• Pause between number groups - let them type
• Ask "Ready for the next part?" between sections
• After they read back: "That's correct" or "Actually let me correct that..."

GETTING CONFIRMATION:
• "Great! Can I get the confirmation number?"
• Write it down by repeating: "Let me confirm that - that's Alpha, Bravo, Charlie, 1, 2, 3?"
• "And can you make sure to send the confirmation email to ${booking.customerEmail}?"
• "Perfect. And just to confirm the total charge was $___?"

CLOSING:
• "Wonderful, thank you so much for your help today!"
• "Have a great rest of your day!"
• Be genuinely friendly - they helped you

═══════════════════════════════════════════════════════════════════
                    SPELLING THINGS OUT (NATO ALPHABET)
═══════════════════════════════════════════════════════════════════

Use this alphabet when spelling names, confirmation numbers, or anything:

A-Alpha    B-Bravo    C-Charlie   D-Delta    E-Echo     F-Foxtrot
G-Golf     H-Hotel    I-India     J-Juliet   K-Kilo     L-Lima
M-Mike     N-November O-Oscar     P-Papa     Q-Quebec   R-Romeo
S-Sierra   T-Tango    U-Uniform   V-Victor   W-Whiskey  X-X-ray
Y-Yankee   Z-Zulu

HOW TO USE IT NATURALLY:
Instead of: "The name is Smith, S-M-I-T-H"
Say: "The name is Smith. That's S as in Sierra, M as in Mike, I as in India, T as in Tango, H as in Hotel."

For confirmation numbers:
"The confirmation is ABC123. Let me spell that out - that's Alpha, Bravo, Charlie, then one, two, three."

═══════════════════════════════════════════════════════════════════
                    SAYING NUMBERS CLEARLY
═══════════════════════════════════════════════════════════════════

CARD NUMBERS: Say each digit with a pause
• "Four... one... four... seven" (not "forty-one forty-seven")
• Group in fours with longer pauses between groups

ZEROS: Always say "zero" not "oh"
• "Three, zero, zero, one" ✓
• "Three, oh, oh, one" ✗

DATES: Say naturally then confirm numerically
• "January fifteenth, twenty twenty-six"
• Then: "So that's zero-one, fifteen, twenty-six - or 01/15/26"

PRICES: Say in dollars then confirm exact
• "Eight hundred forty-seven dollars and fifty cents"
• Then: "So $847.50 total, right?"

TIMES: Use 12-hour with AM/PM
• "Three forty-five in the afternoon" or "3:45 PM"

═══════════════════════════════════════════════════════════════════
                    VERIFICATION LOOPS (ALWAYS DO THIS!)
═══════════════════════════════════════════════════════════════════

After any important info, VERIFY:

You give info → They repeat → You confirm
• You: "The card number ends in ${cardGroup4}"
• Them: "Ending in ${cardGroup4}?"
• You: "That's correct!"

They give info → You repeat → They confirm
• Them: "Your confirmation is ABC123"
• You: "Let me read that back - Alpha, Bravo, Charlie, one, two, three?"
• Them: "Correct"
• You: "Perfect, got it!"

FOR CRITICAL STUFF (always verify):
• Flight numbers
• Departure/arrival times
• Total price
• Confirmation number
• Email address for confirmation

═══════════════════════════════════════════════════════════════════
                    WHEN THINGS GO WRONG
═══════════════════════════════════════════════════════════════════

If they speak too fast:
• "I'm so sorry, could you slow down a bit? I want to make sure I get this right."
• "Could you repeat that? I missed the middle part."
• "One more time please? I'm writing this down for my customer."

If the flight is sold out:
• "Oh no! Okay, what else do you have on that route?"
• "What about the day before or after?"
• "Any nearby airports that might work?"

If the price seems high:
• "Hmm, that's a bit more than we were hoping. Any other options?"
• "What about a different time of day?"
• "Is there a cheaper fare class available?"

If there's a problem with the card:
• "Oh, let me double-check that number..." (re-read carefully)
• "Could you try running it again?"
• Stay calm - payment issues happen

If they need to call back:
• "Sure, our agency number is (555) 123-4567"
• "Just ask for Maya in bookings"
• "What's the best callback number on your end?"

═══════════════════════════════════════════════════════════════════
                    BEFORE HANGING UP - CHECKLIST
═══════════════════════════════════════════════════════════════════

Make sure you have ALL of this before ending the call:

✓ Flight number(s) and times - spelled back and confirmed
✓ Confirmation/PNR number - spelled phonetically and confirmed
✓ Total price charged - confirmed the exact amount
✓ Email confirmation sent to: ${booking.customerEmail}
✓ Any seat assignments or special notes

Final check:
"Before I let you go - the confirmation email is going to ${booking.customerEmail}, right? And the confirmation number one more time is...?"

═══════════════════════════════════════════════════════════════════
                    ABSOLUTE RULES (NEVER BREAK THESE)
═══════════════════════════════════════════════════════════════════

1. NEVER hang up during hold time - wait up to 60 minutes
2. NEVER make up information - only use what's in this prompt
3. NEVER give the full card number all at once - piece by piece!
4. ALWAYS spell things phonetically when asked or when unclear
5. ALWAYS verify important numbers by reading them back
6. ALWAYS get the confirmation number before ending
7. ALWAYS request email confirmation
8. ALWAYS be polite and thank them - you represent the agency
9. NEVER sound robotic - you're a real person having a conversation
10. NEVER rush - accuracy is more important than speed

═══════════════════════════════════════════════════════════════════
Remember: You're a professional travel agent who does this daily.
Be natural. Be patient. Be thorough. Get the booking done right.
═══════════════════════════════════════════════════════════════════
`.trim();
  };

  // AUTO-GENERATE first message - NATURAL SOUNDING
  const generateFirstMessage = (): string => {
    const airline = getAirline();
    const isRoundTrip = !!booking.returnDate;
    
    // Natural variations for a human feel
    const greetings = [
      `Hi there! This is Maya calling from Your Travel Agent. I'm hoping you can help me book a flight for one of my customers?`,
      `Hey, this is Maya from Your Travel Agent agency. I've got a customer looking for a flight and was hoping you could help me out.`,
      `Hi! Maya here from Your Travel Agent. Do you have a moment to help me with a booking?`,
    ];
    
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    
    return greeting;
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

        {/* Step 3: Payment Info - FULL DETAILS */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">3</div>
            <CreditCard className="w-4 h-4" />
            Payment details (FULL - Maya will read these to the agent)
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cardholder Name (as on card)</Label>
              <Input
                value={booking.cardholderName}
                onChange={(e) => updateBooking("cardholderName", e.target.value)}
                placeholder="JOHN A SMITH"
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

          <div className="space-y-1.5">
            <Label className="text-xs">Full Card Number (16 digits)</Label>
            <Input
              value={booking.cardNumber}
              onChange={(e) => updateBooking("cardNumber", e.target.value.replace(/\D/g, "").slice(0, 16))}
              placeholder="4147 8923 0012 3456"
              maxLength={19}
              className="font-mono text-lg tracking-wider"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Exp Month</Label>
              <Select value={booking.cardExpMonth} onValueChange={(v) => updateBooking("cardExpMonth", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="MM" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = String(i + 1).padStart(2, "0");
                    return <SelectItem key={month} value={month}>{month}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Exp Year</Label>
              <Select value={booking.cardExpYear} onValueChange={(v) => updateBooking("cardExpYear", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="YY" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => {
                    const year = String(new Date().getFullYear() + i).slice(-2);
                    return <SelectItem key={year} value={year}>{year}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CVV</Label>
              <Input
                value={booking.cardCvv}
                onChange={(e) => updateBooking("cardCvv", e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="123"
                maxLength={4}
                className="font-mono"
                type="password"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Billing Street Address</Label>
            <Input
              value={booking.billingAddress}
              onChange={(e) => updateBooking("billingAddress", e.target.value)}
              placeholder="123 Main Street, Apt 4B"
            />
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">City</Label>
              <Input
                value={booking.billingCity}
                onChange={(e) => updateBooking("billingCity", e.target.value)}
                placeholder="New York"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">State</Label>
              <Input
                value={booking.billingState}
                onChange={(e) => updateBooking("billingState", e.target.value.toUpperCase())}
                placeholder="NY"
                maxLength={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ZIP</Label>
              <Input
                value={booking.billingZip}
                onChange={(e) => updateBooking("billingZip", e.target.value)}
                placeholder="10001"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Country</Label>
              <Input
                value={booking.billingCountry}
                onChange={(e) => updateBooking("billingCountry", e.target.value)}
                placeholder="USA"
              />
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ⚠️ <strong>SECURE:</strong> Full card details are included in the batch file prompt so Maya can read them to the airline agent. Keep the exported file secure!
            </p>
          </div>
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

        {/* Add to Batch Button */}
        <div className="border-t pt-4 space-y-4">
          <Button
            onClick={handleAddToBatch}
            disabled={!selectedAirline || !booking.origin || !booking.destination}
            size="lg"
            className="w-full h-12"
            variant="hero"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Add to Batch File
          </Button>
        </div>

        {/* What this generates */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
          <p className="font-medium">This generates a batch call entry with:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Full system prompt with booking details</li>
            <li>Airline phone number</li>
            <li>First message introducing the booking request</li>
            <li>IVR navigation and hold instructions</li>
            <li>Payment and confirmation handling</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
