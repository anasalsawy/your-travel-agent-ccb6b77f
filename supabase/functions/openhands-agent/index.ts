import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENHANDS_BASE_URL = "https://app.all-hands.dev/api";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const apiKey = Deno.env.get('OPENHANDS_API_KEY');
    if (!apiKey) {
      console.error('OPENHANDS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'OPENHANDS_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { message, conversation_id } = await req.json();

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'message is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`OpenHands request - message: "${message.substring(0, 100)}...", conversation_id: ${conversation_id || 'new'}`);

    let activeConversationId = conversation_id;

    // Step 1: Create new conversation if no conversation_id provided
    if (!activeConversationId) {
      console.log('Creating new OpenHands conversation...');
      
      const createResponse = await fetch(`${OPENHANDS_BASE_URL}/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-API-Key': apiKey,
        },
        body: JSON.stringify({ initial_user_msg: message }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error(`Failed to create conversation: ${createResponse.status} - ${errorText}`);
        return new Response(
          JSON.stringify({ error: `Failed to create conversation: ${errorText}` }),
          { status: createResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const createData = await createResponse.json();
      activeConversationId = createData.conversation_id || createData.id;
      console.log(`Created new conversation: ${activeConversationId}`);
    } else {
      // Step 2: Send message to existing conversation
      console.log(`Sending message to existing conversation: ${activeConversationId}`);
      
      const eventResponse = await fetch(`${OPENHANDS_BASE_URL}/conversations/${activeConversationId}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-API-Key': apiKey,
        },
        body: JSON.stringify({
          role: 'user',
          content: [{ type: 'text', text: message }],
          run: true,
        }),
      });

      if (!eventResponse.ok) {
        const errorText = await eventResponse.text();
        console.error(`Failed to send message: ${eventResponse.status} - ${errorText}`);
        return new Response(
          JSON.stringify({ error: `Failed to send message: ${errorText}` }),
          { status: eventResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Message sent successfully');
    }

    // Step 3: Fetch latest assistant reply
    console.log('Fetching latest events...');
    
    const eventsResponse = await fetch(
      `${OPENHANDS_BASE_URL}/conversations/${activeConversationId}/events?limit=20&reverse=true`,
      {
        method: 'GET',
        headers: {
          'X-Session-API-Key': apiKey,
        },
      }
    );

    if (!eventsResponse.ok) {
      const errorText = await eventsResponse.text();
      console.error(`Failed to fetch events: ${eventsResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Failed to fetch events: ${errorText}` }),
        { status: eventsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const eventsData = await eventsResponse.json();
    console.log('Events response:', JSON.stringify(eventsData).substring(0, 500));
    
    // Handle different response formats - could be array or object with events property
    const events = Array.isArray(eventsData) ? eventsData : (eventsData.events || eventsData.data || []);
    console.log(`Fetched ${Array.isArray(events) ? events.length : 0} events`);

    // Find the latest assistant message
    let reply = null;
    if (Array.isArray(events)) {
      for (const event of events) {
        if (event.role === 'assistant' || event.type === 'assistant' || event.source === 'agent') {
          if (event.content) {
            if (Array.isArray(event.content)) {
              const textContent = event.content.find((c: any) => c.type === 'text');
              if (textContent) {
                reply = textContent.text;
                break;
              }
            } else if (typeof event.content === 'string') {
              reply = event.content;
              break;
            }
          }
          if (event.message) {
            reply = event.message;
            break;
          }
          if (event.args?.thought) {
            reply = event.args.thought;
            break;
          }
        }
      }
    }

    console.log(`Reply found: ${reply ? 'yes' : 'no'}`);

    return new Response(
      JSON.stringify({
        conversation_id: activeConversationId,
        reply: reply || 'No response yet. The agent may still be processing.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('OpenHands agent error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
