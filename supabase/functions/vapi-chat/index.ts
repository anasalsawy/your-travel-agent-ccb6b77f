import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const VAPI_ASSISTANT_ID = "b9b4545c-c322-4175-95ed-deda3f216c6c";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('VAPI_PRIVATE_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'VAPI_PRIVATE_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { input, sessionId, previousChatId } = await req.json();
    if (!input) {
      return new Response(JSON.stringify({ error: 'input is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Vapi rejects sessionId when combined with assistantId. For memory, we
    // pass previousChatId on follow-up turns (client persists it).
    const body: Record<string, unknown> = {
      assistantId: VAPI_ASSISTANT_ID,
      input,
    };
    if (previousChatId) body.previousChatId = previousChatId;


    const vapiRes = await fetch('https://api.vapi.ai/chat', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await vapiRes.json();
    if (!vapiRes.ok) {
      console.error('Vapi error:', data);
      return new Response(JSON.stringify({ error: 'Vapi request failed', details: data }), {
        status: vapiRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract assistant text from Vapi response
    let text = '';
    if (Array.isArray(data?.output)) {
      text = data.output
        .map((o: { role?: string; content?: string }) =>
          o?.role === 'assistant' ? (o.content || '') : ''
        )
        .filter(Boolean)
        .join('\n');
    }
    if (!text && typeof data?.output === 'string') text = data.output;
    if (!text) text = "Sorry, I couldn't generate a response.";

    return new Response(JSON.stringify({ text, chatId: data?.id ?? null, raw: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('vapi-chat error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
