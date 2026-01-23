import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * MAYA COACH - AI-Powered Conversation Analysis & Learning System
 * 
 * This function reviews Maya's conversations and provides feedback to improve
 * her performance over time. It:
 * 
 * 1. Analyzes transcripts for quality (rapport, objection handling, closing)
 * 2. Identifies what worked and what didn't
 * 3. Updates customer memory with learned preferences
 * 4. Extracts global learnings to improve Maya's prompt
 * 5. Creates dynamic prompt adaptations
 * 
 * Called after each conversation ends (from elevenlabs-call-webhook or ai-chat)
 */

const COACH_SYSTEM_PROMPT = `You are Maya's AI Coach - an expert sales trainer and conversation analyst for a travel agency.

Your job is to review Maya's customer conversations and provide actionable feedback to help her improve.

## ANALYSIS FRAMEWORK

### 1. OUTCOME DETECTION
Determine the conversation outcome:
- booking_completed: Customer committed to booking
- payment_received: Payment was made
- quote_given: Quote provided but no commitment yet
- lost_deal: Customer declined or went elsewhere
- follow_up_needed: Interested but needs follow-up
- just_browsing: Not a serious inquiry
- unclear: Can't determine outcome

### 2. SCORING (1-10 scale)
Score each dimension:
- **rapport**: Did Maya build connection? Use customer's name? Match their energy?
- **objection_handling**: Did she address concerns effectively? Turn negatives into positives?
- **closing**: Did she ask for the sale? Create urgency? Guide toward next steps?
- **product_knowledge**: Did she demonstrate expertise? Provide accurate info?

### 3. KEY MOMENTS
Identify:
- **best_moment**: The single best thing Maya said or did
- **worst_moment**: The biggest mistake or missed opportunity
- **missed_opportunity**: What she could have done differently

### 4. PATTERNS & TAGS
Tag the conversation with relevant patterns:
- price_objection, timing_objection, trust_objection
- urgency_worked, personalization_worked
- lost_to_competitor, customer_not_ready
- excellent_rapport, weak_close
- upsell_opportunity, cross_sell_opportunity

### 5. CUSTOMER LEARNINGS
What did we learn about THIS customer that Maya should remember?
- Communication preferences (formal/casual, detailed/brief)
- Travel preferences (airlines, destinations, class)
- Decision style (quick/slow, price-focused/experience-focused)
- Key facts (family, business traveler, anniversary trip, etc.)
- What worked with them / what to avoid

### 6. GLOBAL LEARNINGS
What tactics/phrases should Maya use more (or avoid) with ALL customers?
- Successful phrases or approaches
- Failed tactics to avoid
- New objection responses that worked

## OUTPUT FORMAT
Return a JSON object with this structure:
{
  "outcome": "quote_given",
  "outcome_value": 1500,
  "overall_score": 7,
  "rapport_score": 8,
  "objection_handling_score": 6,
  "closing_score": 5,
  "product_knowledge_score": 8,
  "strengths": ["Great personalization using customer name", "Good product knowledge"],
  "weaknesses": ["Didn't create urgency", "Missed opportunity to ask for the sale"],
  "suggestions": ["After giving quote, immediately ask 'Want me to lock that in?'", "Mention price volatility to create urgency"],
  "best_moment": "When customer hesitated on price, Maya said 'That's 40% below what you'd pay on Google Flights' - perfect value framing",
  "worst_moment": "Ended with 'Let me know if you have questions' instead of a clear call to action",
  "missed_opportunity": "Customer mentioned it was their anniversary trip - could have upsold to business class",
  "tags": ["price_objection", "weak_close", "upsell_opportunity"],
  "customer_learnings": {
    "preferred_tone": "casual",
    "response_style": "needs_time",
    "key_facts": ["Anniversary trip", "Usually flies Delta", "Budget around $2000"],
    "what_works": ["Value comparison to market price"],
    "what_failed": []
  },
  "global_learnings": [
    {
      "type": "phrase",
      "title": "Anniversary upsell opportunity",
      "description": "When customer mentions special occasion, suggest premium cabin as 'making it memorable'",
      "applies_to": ["special_occasion", "anniversary", "honeymoon"]
    }
  ]
}

## RULES
1. Be specific - quote exact phrases from the transcript
2. Be actionable - every suggestion should be something Maya can do differently
3. Be balanced - find both positives and negatives
4. Focus on sales outcomes - the goal is converting more inquiries to bookings
5. Consider the channel (voice vs chat) - voice needs shorter responses`;

interface ReviewRequest {
  conversation_id?: string;
  call_log_id?: string;
  transcript: string;
  customer_id?: string;
  customer_phone?: string;
  channel: 'web' | 'whatsapp' | 'voice';
  outcome_known?: string; // If we already know the outcome
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body: ReviewRequest = await req.json();
    console.log("[Maya Coach] Reviewing conversation:", {
      conversation_id: body.conversation_id,
      call_log_id: body.call_log_id,
      channel: body.channel,
      transcript_length: body.transcript?.length,
    });

    if (!body.transcript || body.transcript.length < 50) {
      console.log("[Maya Coach] Transcript too short, skipping review");
      return new Response(
        JSON.stringify({ skipped: true, reason: "Transcript too short" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get customer context if available
    let customerContext = "";
    if (body.customer_id) {
      const { data: customer } = await supabase
        .from("profiles")
        .select("full_name, email, phone")
        .eq("id", body.customer_id)
        .single();
      
      if (customer) {
        customerContext = `\nCustomer: ${customer.full_name || 'Unknown'} (${customer.email || customer.phone || 'No contact'})`;
      }

      // Get existing memory
      const { data: memory } = await supabase
        .from("maya_customer_memory")
        .select("*")
        .eq("customer_id", body.customer_id)
        .single();
      
      if (memory) {
        customerContext += `\nExisting customer memory: ${JSON.stringify(memory)}`;
      }
    }

    // Call AI to analyze the conversation
    const analysisResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: COACH_SYSTEM_PROMPT },
          { 
            role: "user", 
            content: `Analyze this ${body.channel} conversation:${customerContext}\n\n---TRANSCRIPT---\n${body.transcript}\n---END TRANSCRIPT---\n\n${body.outcome_known ? `Known outcome: ${body.outcome_known}` : ''}\n\nProvide your analysis as JSON.`
          }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!analysisResponse.ok) {
      throw new Error(`AI analysis failed: ${await analysisResponse.text()}`);
    }

    const analysisData = await analysisResponse.json();
    const analysis = JSON.parse(analysisData.choices[0].message.content);
    
    console.log("[Maya Coach] Analysis complete:", {
      outcome: analysis.outcome,
      overall_score: analysis.overall_score,
      tags: analysis.tags,
    });

    // 1. Save the conversation review
    const { data: review, error: reviewError } = await supabase
      .from("maya_conversation_reviews")
      .insert({
        conversation_id: body.conversation_id,
        call_log_id: body.call_log_id,
        customer_id: body.customer_id,
        channel: body.channel,
        outcome: analysis.outcome,
        outcome_value: analysis.outcome_value,
        overall_score: analysis.overall_score,
        rapport_score: analysis.rapport_score,
        objection_handling_score: analysis.objection_handling_score,
        closing_score: analysis.closing_score,
        product_knowledge_score: analysis.product_knowledge_score,
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses,
        suggestions: analysis.suggestions,
        best_moment: analysis.best_moment,
        worst_moment: analysis.worst_moment,
        missed_opportunity: analysis.missed_opportunity,
        tags: analysis.tags,
        customer_preferences_learned: analysis.customer_learnings,
        transcript_snippet: body.transcript.substring(0, 2000),
      })
      .select("id")
      .single();

    if (reviewError) {
      console.error("[Maya Coach] Failed to save review:", reviewError);
    } else {
      console.log("[Maya Coach] Review saved:", review.id);
    }

    // 2. Update customer memory if we have customer learnings
    if (body.customer_id && analysis.customer_learnings) {
      const learnings = analysis.customer_learnings;
      
      // Upsert customer memory
      const { error: memoryError } = await supabase
        .from("maya_customer_memory")
        .upsert({
          customer_id: body.customer_id,
          preferred_tone: learnings.preferred_tone,
          response_style: learnings.response_style,
          key_facts: learnings.key_facts ? JSON.stringify(learnings.key_facts) : '[]',
          what_works: learnings.what_works || [],
          what_failed: learnings.what_failed || [],
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'customer_id',
          ignoreDuplicates: false,
        });

      if (memoryError) {
        console.error("[Maya Coach] Failed to update customer memory:", memoryError);
      } else {
        console.log("[Maya Coach] Customer memory updated for:", body.customer_id);
      }
    }

    // 3. Save global learnings
    if (analysis.global_learnings && Array.isArray(analysis.global_learnings)) {
      for (const learning of analysis.global_learnings) {
        const { error: learningError } = await supabase
          .from("maya_global_learnings")
          .insert({
            learning_type: learning.type || 'pattern',
            title: learning.title,
            description: learning.description,
            example: learning.example,
            applies_to: learning.applies_to || [],
            confidence_score: 5, // Start with medium confidence
            source: body.conversation_id || body.call_log_id,
          });

        if (learningError) {
          console.error("[Maya Coach] Failed to save learning:", learningError);
        }
      }
      console.log("[Maya Coach] Saved", analysis.global_learnings.length, "global learnings");
    }

    // 4. Create prompt adaptations for very good or very bad patterns
    if (analysis.overall_score >= 9) {
      // Very successful conversation - capture what worked
      if (analysis.best_moment) {
        await supabase
          .from("maya_prompt_adaptations")
          .insert({
            scope: "global",
            adaptation_type: "add_example",
            content: `SUCCESS EXAMPLE: ${analysis.best_moment}`,
            priority: 1,
          });
      }
    } else if (analysis.overall_score <= 3) {
      // Very poor conversation - add warning
      if (analysis.worst_moment) {
        await supabase
          .from("maya_prompt_adaptations")
          .insert({
            scope: "global",
            adaptation_type: "add_warning",
            content: `AVOID: ${analysis.worst_moment}`,
            priority: 2,
          });
      }
    }

    // 5. Update outcome tracking if we can determine booking/payment
    // Note: We'll track outcomes through the review tags for now
    // A separate batch process can aggregate these later
    if (analysis.outcome === "booking_completed" || analysis.outcome === "payment_received") {
      console.log("[Maya Coach] Successful outcome detected, tags:", analysis.tags);
    } else if (analysis.outcome === "lost_deal") {
      console.log("[Maya Coach] Lost deal detected, analyzing failure patterns:", analysis.tags);
    }

    return new Response(
      JSON.stringify({
        success: true,
        review_id: review?.id,
        analysis: {
          outcome: analysis.outcome,
          overall_score: analysis.overall_score,
          tags: analysis.tags,
          suggestions_count: analysis.suggestions?.length || 0,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Maya Coach] Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});