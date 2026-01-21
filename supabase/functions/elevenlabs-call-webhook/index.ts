import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ELEVENLABS CALL WEBHOOK
 * 
 * Receives call status updates and transcripts from ElevenLabs.
 * Updates call_logs and ticket_requests accordingly.
 * 
 * Configure this webhook URL in your ElevenLabs agent settings:
 * https://[project-id].supabase.co/functions/v1/elevenlabs-call-webhook
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[Webhook] Missing Supabase credentials");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const payload = await req.json();
    console.log("[Webhook] Received payload:", JSON.stringify(payload, null, 2));

    const {
      event_type,
      call_sid,
      conversation_id,
      status,
      duration,
      transcript,
      // Additional fields that might be sent
      recording_url,
      summary,
      // Custom data we passed
      ticket_request_id,
    } = payload;

    // Find the call log by call_sid or conversation_id
    let callLog = null;
    
    if (call_sid) {
      const { data } = await supabase
        .from("call_logs")
        .select("*")
        .eq("call_sid", call_sid)
        .single();
      callLog = data;
    }
    
    if (!callLog && conversation_id) {
      const { data } = await supabase
        .from("call_logs")
        .select("*")
        .eq("conversation_id", conversation_id)
        .single();
      callLog = data;
    }

    if (!callLog) {
      console.log("[Webhook] No matching call log found for:", { call_sid, conversation_id });
      return new Response(
        JSON.stringify({ received: true, matched: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Webhook] Found call log:", callLog.id);

    // Build update object based on event type
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // Map ElevenLabs status to our status
    if (status || event_type) {
      const statusMap: Record<string, string> = {
        "initiated": "initiated",
        "ringing": "ringing",
        "in-progress": "in_progress",
        "in_progress": "in_progress",
        "answered": "in_progress",
        "completed": "completed",
        "failed": "failed",
        "busy": "failed",
        "no-answer": "no_answer",
        "canceled": "failed",
      };
      
      const newStatus = statusMap[status?.toLowerCase()] || statusMap[event_type?.toLowerCase()];
      if (newStatus) {
        updates.status = newStatus;
        
        if (newStatus === "in_progress" && !callLog.answered_at) {
          updates.answered_at = new Date().toISOString();
        }
        
        if (newStatus === "completed" || newStatus === "failed" || newStatus === "no_answer") {
          updates.ended_at = new Date().toISOString();
        }
      }
    }

    // Add duration
    if (duration) {
      updates.duration_seconds = parseInt(duration, 10);
    }

    // Add transcript
    if (transcript) {
      updates.transcript = typeof transcript === "string" 
        ? transcript 
        : JSON.stringify(transcript);
    }

    // Add summary if provided
    if (summary) {
      updates.call_summary = summary;
    }

    // Parse transcript for confirmation numbers
    if (transcript) {
      const transcriptText = typeof transcript === "string" ? transcript : JSON.stringify(transcript);
      
      // Common patterns for confirmation numbers
      const confirmationPatterns = [
        /confirmation\s*(?:number|code)?\s*(?:is)?\s*:?\s*([A-Z0-9]{5,8})/i,
        /PNR\s*(?:is)?\s*:?\s*([A-Z0-9]{5,8})/i,
        /record\s*locator\s*(?:is)?\s*:?\s*([A-Z0-9]{5,8})/i,
        /booking\s*(?:reference|number|code)\s*(?:is)?\s*:?\s*([A-Z0-9]{5,8})/i,
      ];
      
      for (const pattern of confirmationPatterns) {
        const match = transcriptText.match(pattern);
        if (match && match[1]) {
          updates.confirmation_number = match[1].toUpperCase();
          console.log("[Webhook] Extracted confirmation number:", updates.confirmation_number);
          break;
        }
      }

      // Try to extract booked price
      const pricePatterns = [
        /total\s*(?:is|comes?\s*to|of)?\s*\$?([\d,]+(?:\.\d{2})?)/i,
        /\$?([\d,]+(?:\.\d{2})?)\s*(?:is\s*(?:the|your))?\s*total/i,
        /charge\s*(?:of|is)?\s*\$?([\d,]+(?:\.\d{2})?)/i,
      ];
      
      for (const pattern of pricePatterns) {
        const match = transcriptText.match(pattern);
        if (match && match[1]) {
          const price = parseFloat(match[1].replace(/,/g, ""));
          if (price > 50 && price < 50000) { // Reasonable flight price range
            updates.booked_price = price;
            console.log("[Webhook] Extracted booked price:", updates.booked_price);
            break;
          }
        }
      }
    }

    // Update the call log
    const { error: updateError } = await supabase
      .from("call_logs")
      .update(updates)
      .eq("id", callLog.id);

    if (updateError) {
      console.error("[Webhook] Failed to update call log:", updateError);
    } else {
      console.log("[Webhook] Updated call log:", callLog.id, updates);
    }

    // If call completed and we have a confirmation, update the ticket request
    if (updates.status === "completed" && callLog.ticket_request_id) {
      const ticketUpdates: Record<string, any> = {
        active_call_id: null, // Clear active call
      };

      // If we got a confirmation number, add it to the ticket info
      if (updates.confirmation_number) {
        const existingInfo = await supabase
          .from("ticket_requests")
          .select("issued_ticket_info, admin_notes")
          .eq("id", callLog.ticket_request_id)
          .single();

        if (existingInfo.data) {
          const newInfo = `[Auto-captured from call] Confirmation: ${updates.confirmation_number}` +
            (updates.booked_price ? ` | Price: $${updates.booked_price}` : "") +
            (existingInfo.data.issued_ticket_info ? `\n\n${existingInfo.data.issued_ticket_info}` : "");
          
          ticketUpdates.issued_ticket_info = newInfo;
        }
      }

      const { error: ticketError } = await supabase
        .from("ticket_requests")
        .update(ticketUpdates)
        .eq("id", callLog.ticket_request_id);

      if (ticketError) {
        console.error("[Webhook] Failed to update ticket request:", ticketError);
      } else {
        console.log("[Webhook] Updated ticket request:", callLog.ticket_request_id);
      }
    }

    // Also clear active_call_id on failed/no_answer
    if ((updates.status === "failed" || updates.status === "no_answer") && callLog.ticket_request_id) {
      await supabase
        .from("ticket_requests")
        .update({ active_call_id: null })
        .eq("id", callLog.ticket_request_id);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        call_log_id: callLog.id,
        updates_applied: Object.keys(updates),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[Webhook] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Webhook processing failed";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
