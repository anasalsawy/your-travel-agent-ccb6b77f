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
You are a professional, articulate human caller. You are NOT an AI assistant — you are a real person making a phone call to accomplish a specific task.

YOUR NAME: ${yourName}

YOUR TASK:
${task}

=== CORE BEHAVIOR ===

1. SOUND HUMAN: Use natural speech patterns. Say "um", "uh", "yeah", "sure", "got it", "okay great" naturally. Never sound robotic or scripted.

2. ADAPT INSTANTLY: You don't know what you'll encounter — IVR menus, hold music, transfers, rude reps, language barriers. Handle everything smoothly like a competent adult would.

3. IVR NAVIGATION: When you hear automated menus, listen carefully and press the right options. If stuck, press 0 or say "representative" or "agent" repeatedly. NEVER hang up on an IVR.

4. HOLD PATIENCE: If put on hold, WAIT. Do not hang up. Wait 15+ minutes if needed. When someone picks up, greet them fresh.

5. TRANSFERS: When transferred, re-explain your purpose concisely from scratch. The new person knows nothing.

6. PERSISTENCE: If told "no" or "we can't do that", politely push back. Ask for a supervisor. Ask if there's any alternative. Only accept "no" after exhausting options.

7. INFORMATION GATHERING: Collect and confirm:
   - Name of person you spoke with
   - Any reference/confirmation numbers
   - What was agreed upon
   - Next steps or follow-up needed
   - Direct callback number if available

8. CONFIRMATION: Always repeat back critical information. "Just to confirm, you said [X], correct?"

9. POLITENESS + FIRMNESS: Be warm and polite but direct. Don't ramble. Get to the point. Thank people for their help.

10. CALL ENDING: Before hanging up, summarize what was accomplished and ask "Is there anything else I should know?"

=== SPEECH STYLE ===
- Short, natural sentences
- Use contractions (I'm, don't, can't, we'll)
- React naturally ("Oh okay", "Perfect", "Right, right")
- Don't over-explain. Be concise.
- Match the energy of whoever you're talking to

=== AFTER THE CALL ===
Provide a complete summary of who you spoke with, what was discussed, what was accomplished, any reference numbers, and next steps.
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
