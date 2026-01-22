import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ELEVENLABS GET CONVERSATION
 * 
 * Fetches conversation details from ElevenLabs API and updates our call_logs.
 * Can be called:
 * 1. Manually from admin UI to fetch a specific conversation
 * 2. Automatically after a call ends (from webhook or polling)
 * 
 * Returns: Full transcript, analysis, and any issues identified
 */

interface TranscriptEntry {
  role: "agent" | "user";
  message: string;
  time_in_call_secs: number;
  tool_calls?: any[];
  tool_results?: any[];
  feedback?: any;
  conversation_turn_metrics?: any;
}

interface ConversationResponse {
  agent_id: string;
  conversation_id: string;
  status: "processing" | "done" | "failed";
  transcript: TranscriptEntry[];
  metadata: {
    start_time_unix_secs: number;
    call_duration_secs: number;
    cost?: number;
  };
  analysis?: {
    call_successful: boolean;
    transcript_summary?: string;
    data_collection_results?: Record<string, any>;
    evaluation_criteria_results?: Record<string, any>;
  };
  has_audio: boolean;
  has_user_audio: boolean;
  has_response_audio: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!ELEVENLABS_API_KEY) {
    console.error("[GetConversation] Missing ELEVENLABS_API_KEY");
    return new Response(
      JSON.stringify({ error: "Missing ElevenLabs API key" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[GetConversation] Missing Supabase credentials");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { conversation_id, call_log_id } = await req.json();

    if (!conversation_id && !call_log_id) {
      return new Response(
        JSON.stringify({ error: "conversation_id or call_log_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let targetConversationId = conversation_id;

    // If we have a call_log_id but no conversation_id, look it up
    if (!targetConversationId && call_log_id) {
      const { data: callLog } = await supabase
        .from("call_logs")
        .select("conversation_id")
        .eq("id", call_log_id)
        .single();

      if (!callLog?.conversation_id) {
        return new Response(
          JSON.stringify({ error: "No conversation_id found for this call" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      targetConversationId = callLog.conversation_id;
    }

    console.log("[GetConversation] Fetching:", targetConversationId);

    // Fetch conversation from ElevenLabs
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${targetConversationId}`,
      {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[GetConversation] ElevenLabs API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: `ElevenLabs API error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const conversationData: ConversationResponse = await response.json();
    console.log("[GetConversation] Got conversation:", {
      status: conversationData.status,
      transcript_length: conversationData.transcript?.length,
      duration: conversationData.metadata?.call_duration_secs,
    });

    // Format transcript as readable text
    const formattedTranscript = conversationData.transcript
      ?.map((entry) => {
        const speaker = entry.role === "agent" ? "Maya" : "Airline";
        const time = `[${Math.floor(entry.time_in_call_secs / 60)}:${String(entry.time_in_call_secs % 60).padStart(2, "0")}]`;
        return `${time} ${speaker}: ${entry.message}`;
      })
      .join("\n") || "";

    // Analyze the transcript for issues and improvements
    const analysis = analyzeConversation(conversationData.transcript || []);

    // Build update object for call_logs
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
      transcript: formattedTranscript,
      duration_seconds: conversationData.metadata?.call_duration_secs,
    };

    // Map ElevenLabs status
    if (conversationData.status === "done") {
      updates.status = "completed";
      updates.ended_at = new Date().toISOString();
    } else if (conversationData.status === "failed") {
      updates.status = "failed";
      updates.ended_at = new Date().toISOString();
    }

    // Add analysis summary if available
    if (conversationData.analysis?.transcript_summary) {
      updates.call_summary = conversationData.analysis.transcript_summary;
    } else if (analysis.summary) {
      updates.call_summary = analysis.summary;
    }

    // Extract confirmation number from transcript
    if (analysis.confirmationNumber) {
      updates.confirmation_number = analysis.confirmationNumber;
    }

    // Extract booked price
    if (analysis.bookedPrice) {
      updates.booked_price = analysis.bookedPrice;
    }

    // Store detailed analysis in admin_notes
    if (analysis.issues.length > 0 || analysis.improvements.length > 0) {
      const analysisNotes = [];
      if (analysis.issues.length > 0) {
        analysisNotes.push("ISSUES DETECTED:");
        analysisNotes.push(...analysis.issues.map(i => `- ${i}`));
      }
      if (analysis.improvements.length > 0) {
        analysisNotes.push("\nSUGGESTED IMPROVEMENTS:");
        analysisNotes.push(...analysis.improvements.map(i => `- ${i}`));
      }
      updates.admin_notes = analysisNotes.join("\n");
    }

    // Update call_logs if we can find the record
    let callLogUpdated = false;
    const { data: existingLog } = await supabase
      .from("call_logs")
      .select("id, ticket_request_id")
      .eq("conversation_id", targetConversationId)
      .single();

    if (existingLog) {
      const { error: updateError } = await supabase
        .from("call_logs")
        .update(updates)
        .eq("id", existingLog.id);

      if (updateError) {
        console.error("[GetConversation] Failed to update call_logs:", updateError);
      } else {
        callLogUpdated = true;
        console.log("[GetConversation] Updated call_logs:", existingLog.id);

        // If booking was successful, update ticket_request
        if (existingLog.ticket_request_id && analysis.bookingSuccessful) {
          const ticketUpdates: Record<string, any> = {
            active_call_id: null,
          };

          if (analysis.confirmationNumber) {
            ticketUpdates.issued_ticket_info = 
              `[Auto-extracted from call] Confirmation: ${analysis.confirmationNumber}` +
              (analysis.bookedPrice ? ` | Price: $${analysis.bookedPrice}` : "");
          }

          await supabase
            .from("ticket_requests")
            .update(ticketUpdates)
            .eq("id", existingLog.ticket_request_id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        conversation_id: targetConversationId,
        status: conversationData.status,
        duration_seconds: conversationData.metadata?.call_duration_secs,
        transcript: formattedTranscript,
        call_log_updated: callLogUpdated,
        analysis: {
          booking_successful: analysis.bookingSuccessful,
          confirmation_number: analysis.confirmationNumber,
          booked_price: analysis.bookedPrice,
          issues: analysis.issues,
          improvements: analysis.improvements,
          summary: analysis.summary,
        },
        raw_analysis: conversationData.analysis,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[GetConversation] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to get conversation";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Analyze conversation transcript for issues and improvements
 */
function analyzeConversation(transcript: TranscriptEntry[]) {
  const issues: string[] = [];
  const improvements: string[] = [];
  let bookingSuccessful = false;
  let confirmationNumber: string | null = null;
  let bookedPrice: number | null = null;

  const fullText = transcript.map(t => t.message).join(" ");
  const agentMessages = transcript.filter(t => t.role === "agent").map(t => t.message);
  const userMessages = transcript.filter(t => t.role === "user").map(t => t.message);

  // Check for confirmation number
  const confirmPatterns = [
    /confirmation\s*(?:number|code)?\s*(?:is)?\s*:?\s*([A-Z0-9]{5,8})/i,
    /PNR\s*(?:is)?\s*:?\s*([A-Z0-9]{5,8})/i,
    /record\s*locator\s*(?:is)?\s*:?\s*([A-Z0-9]{5,8})/i,
    /booking\s*(?:reference|number|code)\s*(?:is)?\s*:?\s*([A-Z0-9]{5,8})/i,
    /([A-Z]{2}[A-Z0-9]{4})/g, // Typical 6-char PNR format
  ];

  for (const pattern of confirmPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      confirmationNumber = match[1].toUpperCase();
      bookingSuccessful = true;
      break;
    }
  }

  // Check for price
  const pricePatterns = [
    /total\s*(?:is|comes?\s*to|of)?\s*\$?([\d,]+(?:\.\d{2})?)/i,
    /\$?([\d,]+(?:\.\d{2})?)\s*(?:is\s*(?:the|your))?\s*total/i,
    /charge\s*(?:of|is)?\s*\$?([\d,]+(?:\.\d{2})?)/i,
    /(?:that(?:'s| is| will be))?\s*\$?([\d,]+(?:\.\d{2})?)\s*(?:dollars?)?/i,
  ];

  for (const pattern of pricePatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      const price = parseFloat(match[1].replace(/,/g, ""));
      if (price > 50 && price < 50000) {
        bookedPrice = price;
        break;
      }
    }
  }

  // Analyze agent behavior
  const agentText = agentMessages.join(" ").toLowerCase();
  const userText = userMessages.join(" ").toLowerCase();

  // Check for issues
  if (agentText.includes("i am an ai") || agentText.includes("i'm an ai") || agentText.includes("artificial intelligence")) {
    issues.push("Agent revealed it is AI - should maintain human persona");
    improvements.push("Add stronger instruction to never reveal AI nature");
  }

  if (agentText.includes("i don't have") || agentText.includes("i cannot") || agentText.includes("i'm not able")) {
    issues.push("Agent expressed inability to complete task");
  }

  if (userText.includes("are you a robot") || userText.includes("are you real") || userText.includes("is this automated")) {
    issues.push("Airline rep suspected AI - may need more natural speech patterns");
    improvements.push("Add more natural filler words and varied response timing");
  }

  if (transcript.length < 5) {
    issues.push("Very short conversation - may have been disconnected or rejected");
  }

  // Check for payment info handling
  if (agentText.includes("credit card") || agentText.includes("card number")) {
    if (agentText.match(/\d{4}\s*\d{4}\s*\d{4}\s*\d{4}/)) {
      issues.push("Full card number spoken at once - should be in groups with pauses");
      improvements.push("Ensure card numbers are spoken in 4-digit groups with natural pauses");
    }
  }

  // Check for hold time
  const holdMentions = fullText.match(/hold|wait|moment|minute/gi) || [];
  if (holdMentions.length > 3) {
    improvements.push("Consider adding more patience phrases for hold times");
  }

  // Generate summary
  let summary = "";
  if (bookingSuccessful) {
    summary = `Booking completed successfully. Confirmation: ${confirmationNumber || "extracted"}. `;
    if (bookedPrice) summary += `Total: $${bookedPrice}. `;
  } else if (transcript.length > 0) {
    const lastAgentMessage = agentMessages[agentMessages.length - 1] || "";
    if (lastAgentMessage.toLowerCase().includes("thank you") || lastAgentMessage.toLowerCase().includes("goodbye")) {
      summary = "Call ended normally but no confirmation number was extracted. ";
    } else {
      summary = "Call may have ended unexpectedly or without completing booking. ";
    }
  }

  if (issues.length > 0) {
    summary += `${issues.length} issue(s) detected. `;
  }

  return {
    issues,
    improvements,
    bookingSuccessful,
    confirmationNumber,
    bookedPrice,
    summary,
  };
}
