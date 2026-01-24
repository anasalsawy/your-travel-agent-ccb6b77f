import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BrowseRequest {
  action: 'navigate' | 'screenshot' | 'fill_form' | 'click' | 'get_text' | 'execute_script';
  url?: string;
  selector?: string;
  value?: string;
  script?: string;
  session_id?: string;
}

interface SessionResponse {
  id: string;
  connectUrl: string;
  status: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BROWSERBASE_API_KEY = Deno.env.get('BROWSERBASE_API_KEY');
    const BROWSERBASE_PROJECT_ID = Deno.env.get('BROWSERBASE_PROJECT_ID');

    if (!BROWSERBASE_API_KEY || !BROWSERBASE_PROJECT_ID) {
      throw new Error('Browserbase credentials not configured');
    }

    const body: BrowseRequest = await req.json();
    const { action, url, selector, value, script, session_id } = body;

    console.log(`[Browserbase] Action: ${action}, URL: ${url || 'N/A'}`);

    // Create or reuse session
    let sessionId = session_id;
    let connectUrl: string;

    if (!sessionId) {
      // Create new session
      const sessionResponse = await fetch('https://www.browserbase.com/v1/sessions', {
        method: 'POST',
        headers: {
          'X-BB-API-Key': BROWSERBASE_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: BROWSERBASE_PROJECT_ID,
          browserSettings: {
            viewport: { width: 1920, height: 1080 },
          },
        }),
      });

      if (!sessionResponse.ok) {
        const error = await sessionResponse.text();
        console.error('[Browserbase] Session creation failed:', error);
        throw new Error(`Failed to create session: ${error}`);
      }

      const session: SessionResponse = await sessionResponse.json();
      sessionId = session.id;
      connectUrl = session.connectUrl;
      console.log(`[Browserbase] Created session: ${sessionId}`);
    } else {
      // Get existing session
      const sessionResponse = await fetch(`https://www.browserbase.com/v1/sessions/${sessionId}`, {
        headers: {
          'X-BB-API-Key': BROWSERBASE_API_KEY,
        },
      });

      if (!sessionResponse.ok) {
        throw new Error('Session not found or expired');
      }

      const session: SessionResponse = await sessionResponse.json();
      connectUrl = session.connectUrl;
    }

    // Execute action via CDP (Chrome DevTools Protocol)
    // For now, we'll use the Browserbase API endpoints
    let result: any = { session_id: sessionId };

    switch (action) {
      case 'navigate':
        if (!url) throw new Error('URL required for navigate action');
        
        // Use the session debug URL to send commands
        const navigateCmd = {
          method: 'Page.navigate',
          params: { url },
        };
        
        // For Browserbase, we need to use their specific API or connect via WebSocket
        // Simplified: return session info for client to connect
        result = {
          session_id: sessionId,
          connect_url: connectUrl,
          action: 'navigate',
          target_url: url,
          message: 'Session created. Use connect_url with Playwright to automate.',
        };
        break;

      case 'screenshot':
        // Get screenshot via Browserbase API
        const screenshotResponse = await fetch(
          `https://www.browserbase.com/v1/sessions/${sessionId}/screenshot`,
          {
            headers: {
              'X-BB-API-Key': BROWSERBASE_API_KEY,
            },
          }
        );

        if (screenshotResponse.ok) {
          const screenshotData = await screenshotResponse.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(screenshotData)));
          result = {
            session_id: sessionId,
            screenshot: `data:image/png;base64,${base64}`,
          };
        } else {
          result = {
            session_id: sessionId,
            error: 'Screenshot not available',
          };
        }
        break;

      case 'fill_form':
      case 'click':
      case 'get_text':
      case 'execute_script':
        // These require WebSocket connection to CDP
        // Return session info for advanced automation
        result = {
          session_id: sessionId,
          connect_url: connectUrl,
          action,
          selector,
          value,
          script,
          message: 'Use Playwright with connect_url for advanced actions',
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Browserbase] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
