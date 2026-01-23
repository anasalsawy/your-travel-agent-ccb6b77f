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
 * CRITICAL: On call end, persists the full conversation to ai_chat_messages
 * so Maya has unified history across voice, web, and WhatsApp channels.
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
      recording_url,
      summary,
      ticket_request_id,
      // Customer identification (from dynamic variables or caller ID)
      phone_number,
      caller_id,
      customer_id: payloadCustomerId,
    } = payload;

    const customerPhone = phone_number || caller_id;

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
      
      // Even without a call log, if we have a completed call with transcript,
      // we should still save it to conversation history
      if ((status === "completed" || event_type === "call.completed") && transcript && customerPhone) {
        await saveConversationToHistory(supabase, {
          phoneNumber: customerPhone,
          transcript,
          summary,
          duration,
          conversationId: conversation_id,
        });
      }
      
      return new Response(
        JSON.stringify({ received: true, matched: false, history_saved: !!transcript }),
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
        "call.completed": "completed",
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
          if (price > 50 && price < 50000) {
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

    // ═══════════════════════════════════════════════════════════════════
    // CRITICAL: Save conversation to Maya's unified history on call end
    // ═══════════════════════════════════════════════════════════════════
    let historySaved = false;
    if (updates.status === "completed" && transcript) {
      const phoneForHistory = customerPhone || callLog.customer_phone;
      if (phoneForHistory) {
        historySaved = await saveConversationToHistory(supabase, {
          phoneNumber: phoneForHistory,
          transcript,
          summary,
          duration: updates.duration_seconds || duration,
          conversationId: conversation_id || callLog.conversation_id,
          callLogId: callLog.id,
        });
      }
    }

    // If call completed and we have a confirmation, update the ticket request
    if (updates.status === "completed" && callLog.ticket_request_id) {
      const ticketUpdates: Record<string, any> = {
        active_call_id: null,
      };

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
        history_saved: historySaved,
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

/**
 * Save the voice call conversation to Maya's unified history (ai_conversations + ai_chat_messages)
 * This ensures Maya remembers voice conversations just like web/WhatsApp
 */
async function saveConversationToHistory(
  supabase: any,
  params: {
    phoneNumber: string;
    transcript: string | object;
    summary?: string;
    duration?: number;
    conversationId?: string;
    callLogId?: string;
  }
): Promise<boolean> {
  const { phoneNumber, transcript, summary, duration, conversationId, callLogId } = params;
  
  console.log("[Webhook] Saving call to Maya's unified history for:", phoneNumber);

  try {
    // 1. Get or create customer by phone
    const { data: customerId } = await supabase.rpc("get_or_create_customer_by_phone", {
      p_phone: phoneNumber
    });

    // 2. Create a session ID for voice calls
    const sessionId = `voice-${phoneNumber.replace(/\D/g, "")}-${Date.now()}`;

    // 3. Find or create conversation for this customer
    let aiConversationId: string;
    
    // Check if there's a recent conversation (within 24 hours) for this customer
    const { data: existingConvo } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("customer_phone", phoneNumber)
      .gte("updated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (existingConvo) {
      aiConversationId = existingConvo.id;
      console.log("[Webhook] Using existing conversation:", aiConversationId);
    } else {
      // Create new conversation
      const { data: newConvo, error: convoError } = await supabase
        .from("ai_conversations")
        .insert({
          session_id: sessionId,
          customer_id: customerId,
          customer_phone: phoneNumber,
          status: "active",
        })
        .select("id")
        .single();

      if (convoError || !newConvo) {
        console.error("[Webhook] Failed to create conversation:", convoError);
        return false;
      }
      
      aiConversationId = newConvo.id;
      console.log("[Webhook] Created new conversation:", aiConversationId);
    }

    // 4. Parse and save transcript messages
    const transcriptText = typeof transcript === "string" 
      ? transcript 
      : JSON.stringify(transcript);
    
    // Parse transcript into individual messages
    const messages = parseTranscript(transcriptText);
    
    if (messages.length === 0) {
      // If we can't parse individual messages, save as a summary
      const summaryContent = summary || `[Voice Call - ${duration ? Math.round(duration / 60) + " min" : "completed"}]\n\n${transcriptText}`;
      
      await supabase
        .from("ai_chat_messages")
        .insert({
          conversation_id: aiConversationId,
          role: "system",
          content: summaryContent,
          metadata: {
            source: "voice_call",
            call_log_id: callLogId,
            elevenlabs_conversation_id: conversationId,
            duration_seconds: duration,
          },
        });
    } else {
      // Insert each message separately
      const messageInserts = messages.map((msg: { role: string; content: string }) => ({
        conversation_id: aiConversationId,
        role: msg.role,
        content: msg.content,
        metadata: {
          source: "voice_call",
          call_log_id: callLogId,
          elevenlabs_conversation_id: conversationId,
        },
      }));

      const { error: insertError } = await supabase
        .from("ai_chat_messages")
        .insert(messageInserts);

      if (insertError) {
        console.error("[Webhook] Failed to insert messages:", insertError);
        return false;
      }
    }

    // 5. Add call summary as a final system note if provided
    if (summary) {
      await supabase
        .from("ai_chat_messages")
        .insert({
          conversation_id: aiConversationId,
          role: "system",
          content: `[Voice Call Summary] ${summary}`,
          metadata: {
            source: "voice_call_summary",
            call_log_id: callLogId,
            duration_seconds: duration,
          },
        });
    }

    // 6. Update conversation timestamp
    await supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", aiConversationId);

    console.log("[Webhook] Successfully saved", messages.length || 1, "messages to conversation:", aiConversationId);
    return true;

  } catch (error) {
    console.error("[Webhook] Error saving to history:", error);
    return false;
  }
}

/**
 * Parse transcript into individual messages
 * Handles various transcript formats from ElevenLabs
 */
function parseTranscript(transcript: string): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  // Try JSON array format first
  try {
    const parsed = JSON.parse(transcript);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.role && item.content) {
          messages.push({
            role: item.role === "agent" ? "assistant" : "user",
            content: item.content,
          });
        } else if (item.text && item.speaker) {
          messages.push({
            role: item.speaker === "agent" ? "assistant" : "user",
            content: item.text,
          });
        }
      }
      return messages;
    }
  } catch {
    // Not JSON, try text parsing
  }

  // Try line-by-line parsing with speaker labels
  // Format: "Agent: Hello how can I help?" or "User: I want to book"
  const lines = transcript.split("\n").filter(l => l.trim());
  
  for (const line of lines) {
    const agentMatch = line.match(/^(?:Agent|Maya|Assistant|AI):\s*(.+)/i);
    const userMatch = line.match(/^(?:User|Customer|Caller|Human):\s*(.+)/i);

    if (agentMatch) {
      messages.push({ role: "assistant", content: agentMatch[1].trim() });
    } else if (userMatch) {
      messages.push({ role: "user", content: userMatch[1].trim() });
    }
  }

  // If no speaker labels, try alternating pattern or return empty
  if (messages.length === 0 && lines.length >= 2) {
    // Fallback: assume alternating user/assistant
    for (let i = 0; i < lines.length; i++) {
      messages.push({
        role: i % 2 === 0 ? "user" : "assistant",
        content: lines[i].trim(),
      });
    }
  }

  return messages;
}
