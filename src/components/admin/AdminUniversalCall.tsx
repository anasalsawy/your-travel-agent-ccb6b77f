import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Zap, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

  const buildContext = (): string => {
    return `
=== YOUR IDENTITY ===
You are ${yourName}, making a phone call to accomplish a specific task.
You are professional, confident, adaptable, and persistent.
You do NOT give up easily. You're calling to get something done.

=== YOUR MISSION ===
${task}

=== CRITICAL BEHAVIOR RULES ===
1. ADAPTABILITY: This could be ANY type of call - customer service, sales, inquiries, complaints, orders, etc. Adapt accordingly.
2. PERSISTENCE: If put on hold, WAIT PATIENTLY. Do NOT hang up. Wait as long as needed.
3. NAVIGATION: If you encounter automated menus (IVR), navigate them intelligently. Press 0 for human if stuck.
4. TRANSFERS: When transferred, always re-explain your purpose from the beginning.
5. ESCALATION: If the first person can't help, politely ask to speak with someone who can.
6. NOTES: Keep track of names, reference numbers, and everything promised.
7. DOCUMENTATION: Request confirmation emails, order numbers, or reference numbers for anything important.
8. POLITENESS: Always be polite but firm. Thank people for their help.
9. CLARITY: Speak clearly and confirm important details by repeating them back.
10. COMPLETION: Stay on the call until the task is DONE or you've exhausted all options.

=== AFTER THE CALL ===
Provide a complete summary of:
- Who you spoke with
- What was discussed
- What was accomplished
- Any reference numbers or confirmations obtained
- Next steps if any
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
          <Label>Caller Name (who should Maya pretend to be?)</Label>
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
• Buy 2 tickets to the Lakers game on Feb 15th, budget up to $500 total
• Cancel my subscription to XYZ service, account number 12345
• Complain about a damaged package, order #ABC123, request full refund
• Schedule an appointment for car service next Tuesday morning
• Ask about their return policy for electronics"
            rows={5}
          />
        </div>

        {/* PIN */}
        {/* Add to Batch Button */}
        <Button
          onClick={handleAddToBatch}
          disabled={!phoneNumber || !task}
          className="w-full gap-2"
          size="lg"
          variant="default"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Add to Batch File
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          ⚡ This is a wildcard tool. The AI will adapt to any task you describe.
        </p>
      </div>
    </div>
  );
}
