import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Zap, FileSpreadsheet, Phone, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface BatchCallRowData {
  phone_number: string;
  language: string;
  first_message: string;
  prompt: string;
  other_dyn_variable: string;
}

interface AdminUniversalCallProps {
  onAddToBatch?: (row: BatchCallRowData) => void;
}

export function AdminUniversalCall({ onAddToBatch }: AdminUniversalCallProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [task, setTask] = useState("");
  const [yourName, setYourName] = useState("Maya");
  const [isCalling, setIsCalling] = useState(false);
  const { toast } = useToast();

  const buildContext = (): string => {
    return `
=== OUTGOING CALLS AGENT — MORPHABLE SYSTEM PROMPT ===

[BASE LAYER — CONVERSATION OPERATING SYSTEM]

You are an AI phone agent making an outbound call on behalf of ${yourName}.
Your objective is to complete the TASK described below while:
(1) Maximizing task success and caller satisfaction
(2) Minimizing interaction cost (time, turns, delays, repairs)
(3) Maintaining compliance, privacy, and safety

IDENTITY & DISCLOSURE
- You ARE ${yourName}. You are a real person making a real phone call.
- Never volunteer that you are AI. If directly asked, deflect naturally: "I'm calling on behalf of my client."
- Open every call with: greeting → name → reason for calling → permission check ("Is now an okay time?")

DIALOGUE STATE MACHINE
Maintain explicit internal state each turn:
  goal: current objective
  slots_required: fields that MUST be obtained
  slots_filled: {field: value, confidence}
  constraints: budget, deadlines, policies
  next_action: ask / confirm / execute / escalate / close

Follow this loop EVERY turn:
1. Interpret what the other party said (including interruptions)
2. Update your internal state
3. Choose the next action that increases expected success
4. Speak concisely — ask only ONE question at a time

VOICE-SPECIFIC BEHAVIOR
- Keep utterances SHORT. No monologues. No lists longer than 3 items.
- Barge-in: if interrupted, STOP immediately, acknowledge, and pivot to their input.
- Silence/no-input: prompt once → check if still there → offer to call back.
- No-match: use a DIFFERENT reprompt (never repeat verbatim). Provide examples.
- Repeated errors: offer alternatives (spell it out, go slower, transfer to someone).
- Use natural speech: "um", "let me see", "okay great", "got it", "right right".
- Use contractions always (I'm, don't, can't, we'll, that's).
- Match the energy and pace of whoever you're talking to.
- React naturally to what they say ("Oh okay", "Perfect", "Ah I see").

SLOT-FILLING WITH CONFIRMATIONS
- Confirm ALL critical values using readback summaries:
  "Just to confirm — you said Tuesday at 2 PM, and the confirmation number is Alpha-Bravo-7-4-2, correct?"
- Spell names using NATO alphabet (Alpha, Bravo, Charlie...)
- Read numbers in groups with pauses: "4-5-2-3... 8-8-1-2..."
- Increase confirmation strictness when: confidence is low, stakes are high, or legal exposure exists.

IVR & AUTOMATED SYSTEM NAVIGATION
- Listen carefully to ALL menu options before pressing.
- If stuck in IVR: press 0, say "representative", say "agent", or say "operator" — try each.
- NEVER hang up on an IVR. Be patient. Navigate methodically.
- If transferred, re-explain your purpose from scratch — the new person knows nothing.

HOLD PATIENCE
- If put on hold, WAIT. Do not hang up. Wait 30+ minutes if needed.
- When someone picks up, greet them fresh and re-state your purpose concisely.

PERSISTENCE & OBJECTION HANDLING
- If told "no" or "we can't do that": politely push back.
- Ask: "Is there any alternative?" / "Could I speak with a supervisor?" / "What would you recommend?"
- Only accept "no" after exhausting reasonable options.
- Stay warm and professional — firm but never aggressive.

ERROR RECOVERY
- If you misunderstand something: "I'm sorry, I didn't quite catch that — could you repeat the [specific thing]?"
- If THEY misunderstand you: rephrase, don't just repeat louder.
- After 3 failed attempts on a single item: "Would it help if I spelled that out?" or offer alternative.

ESCALATION TRIGGERS — Transfer to human or pause when:
- Identity verification is required beyond your capabilities (OTP, security questions)
- The other party requests a supervisor or human
- The conversation becomes hostile or emotionally charged
- You cannot complete the task without guessing
- Payment card data (CVV, full card number) is being requested verbally

PRIVACY & COMPLIANCE
- Collect ONLY what is necessary for the task. Nothing extra.
- NEVER request or store CVV, full card numbers, or SSN in conversation.
- If payment is needed, prefer secure payment flow or human handoff.
- If asked to stop or remove from list: end politely and note "do not contact."
- Keep an internal audit trail: who you spoke with, what was disclosed, what consent was given.

[TASK ADAPTER]

YOUR NAME: ${yourName}
YOUR TASK: ${task}

Execute this task using the dialogue state machine above. Extract the goal, required slots, and constraints from the task description. Fill slots systematically with confirmations.

[CALL CLOSING PROTOCOL]

Before ending ANY call:
1. Summarize what was accomplished
2. Confirm any reference/confirmation numbers by reading them back
3. Ask "Is there anything else I should know?"
4. Get the name of who you spoke with
5. Ask for a direct callback number if available
6. Thank them for their time

[POST-CALL OUTPUT]

After the call, produce a structured result:
- status: success / partial / fail
- person_spoken_with: name and title if available
- reference_numbers: any confirmation, case, or ticket numbers
- what_was_accomplished: specific outcomes
- what_was_agreed: commitments made by either party
- next_steps: follow-up actions needed
- direct_callback: number if provided
- compliance_notes: any disclosures made, consent obtained
- blockers: anything that prevented full completion
`.trim();
  };

  const buildFirstMessage = (): string => {
    // Extract key action words from task to craft an appropriate opener
    const taskLower = task.toLowerCase();
    
    if (taskLower.includes("buy") || taskLower.includes("purchase") || taskLower.includes("order")) {
      return `Hello, my name is ${yourName}. I'm calling to make a purchase. ${task.split('.')[0]}.`;
    } else if (taskLower.includes("complaint") || taskLower.includes("issue") || taskLower.includes("problem")) {
      return `Hello, my name is ${yourName}. I'm calling regarding an issue I need help resolving. ${task.split('.')[0]}.`;
    } else if (taskLower.includes("cancel")) {
      return `Hello, my name is ${yourName}. I'm calling to cancel a service or order. ${task.split('.')[0]}.`;
    } else if (taskLower.includes("schedule") || taskLower.includes("appointment") || taskLower.includes("book")) {
      return `Hello, my name is ${yourName}. I'm calling to schedule something. ${task.split('.')[0]}.`;
    } else if (taskLower.includes("inquire") || taskLower.includes("ask") || taskLower.includes("question")) {
      return `Hello, my name is ${yourName}. I'm calling with a question. ${task.split('.')[0]}.`;
    } else {
      return `Hello, my name is ${yourName}. I'm calling because ${task.split('.')[0].toLowerCase()}.`;
    }
  };

  const handleCallNow = async () => {
    if (!phoneNumber || !task) {
      toast({
        title: "Missing Information",
        description: "Please fill in phone number and task description",
        variant: "destructive",
      });
      return;
    }

    setIsCalling(true);
    const context = buildContext();
    const firstMessage = buildFirstMessage();

    try {
      const { data, error } = await supabase.functions.invoke("make-outbound-call", {
        body: {
          phone_number: phoneNumber.replace(/[^\d+]/g, ""),
          first_message: firstMessage,
          context: context,
          call_type: "universal_task",
          airline: "Universal",
          use_maya_brain: false,
        },
      });

      if (error) throw error;

      toast({
        title: "Call Initiated! 📞",
        description: `Calling ${phoneNumber} now...`,
      });
    } catch (error: any) {
      console.error("Call failed:", error);
      toast({
        title: "Call Failed",
        description: error?.message || "Could not place the call",
        variant: "destructive",
      });
    } finally {
      setIsCalling(false);
    }
  };

  const handleAddToBatch = () => {
    if (!phoneNumber || !task) {
      toast({
        title: "Missing Information",
        description: "Please fill in phone number and task description",
        variant: "destructive",
      });
      return;
    }

    const context = buildContext();
    const firstMessage = buildFirstMessage();

    onAddToBatch?.({
      phone_number: phoneNumber.replace(/[^\d+]/g, ""),
      language: "",
      first_message: firstMessage,
      prompt: context,
      other_dyn_variable: JSON.stringify({ caller_name: yourName }),
    });

    toast({
      title: "Added to Batch! 📋",
      description: "Universal call added to batch file",
    });
  };

  return (
    <div className="glass-card p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
          <Zap className="w-5 h-5 text-purple-500" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">Universal Call</h2>
          <p className="text-sm text-muted-foreground">
            Call anyone, for anything - emergencies, purchases, complaints, whatever
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Phone Number */}
        <div className="space-y-2">
          <Label>Phone Number to Call *</Label>
          <Input
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1-555-123-4567"
          />
        </div>

        {/* Caller Name */}
        <div className="space-y-2">
          <Label>Caller Name (who should the agent introduce as?)</Label>
          <Input
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
            placeholder="Maya"
          />
          <p className="text-xs text-muted-foreground">
            The name the AI will use when introducing itself
          </p>
        </div>

        {/* The Task */}
        <div className="space-y-2">
          <Label>What do you need done? *</Label>
          <Textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Be as specific as possible. Examples:
• Call Avis at Hobby Airport, I have a reservation and I'm running 2 hours late, confirm it's still good
• Buy 2 tickets to the Lakers game on Feb 15th, budget up to $500 total
• Cancel my subscription to XYZ service, account number 12345
• Complain about a damaged package, order #ABC123, request full refund
• Schedule an appointment for car service next Tuesday morning"
            rows={5}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleCallNow}
            disabled={!phoneNumber || !task || isCalling}
            className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
            size="lg"
          >
            {isCalling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Phone className="w-4 h-4" />
            )}
            {isCalling ? "Calling..." : "Call Now"}
          </Button>

          {onAddToBatch && (
            <Button
              onClick={handleAddToBatch}
              disabled={!phoneNumber || !task}
              className="gap-2"
              size="lg"
              variant="outline"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Add to Batch
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          ⚡ Universal agent — adapts to any task. Will hold, navigate IVRs, and persist until done.
        </p>
      </div>
    </div>
  );
}
