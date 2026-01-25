import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ALASKA AIRLINES AUTONOMOUS BOOKING AGENT
 * 
 * Direct CDP-based browser automation via Browserbase.
 * No external AI - pure programmatic control.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookingRequest {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  target_price?: number;
  passenger_email: string;
  decline_insurance: boolean;
  accounts?: Array<{ email: string; password: string }>;
}

// CDP command helper
async function sendCDP(ws: WebSocket, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    
    const timeout = setTimeout(() => {
      reject(new Error(`CDP command ${method} timed out`));
    }, 30000);

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id === id) {
          clearTimeout(timeout);
          ws.removeEventListener('message', handler);
          if (data.error) {
            reject(new Error(data.error.message));
          } else {
            resolve(data.result);
          }
        }
      } catch (e) {
        // Ignore parse errors for events
      }
    };

    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

// Wait for page to be ready
async function waitForLoad(ws: WebSocket, timeout = 15000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = async () => {
      try {
        const result = await sendCDP(ws, 'Runtime.evaluate', {
          expression: 'document.readyState',
          returnByValue: true,
        }) as { result: { value: string } };
        
        if (result?.result?.value === 'complete') {
          resolve();
          return;
        }
      } catch (e) {
        // Page not ready yet
      }
      
      if (Date.now() - start < timeout) {
        setTimeout(check, 500);
      } else {
        resolve(); // Timeout, proceed anyway
      }
    };
    check();
  });
}

// Click element by selector
async function click(ws: WebSocket, selector: string): Promise<boolean> {
  try {
    const result = await sendCDP(ws, 'Runtime.evaluate', {
      expression: `
        (function() {
          const el = document.querySelector('${selector}');
          if (el) {
            el.click();
            return true;
          }
          return false;
        })()
      `,
      returnByValue: true,
    }) as { result: { value: boolean } };
    return result?.result?.value === true;
  } catch (e) {
    console.error('[CDP] Click failed:', e);
    return false;
  }
}

// Click element by text content
async function clickByText(ws: WebSocket, text: string, tag = '*'): Promise<boolean> {
  try {
    const result = await sendCDP(ws, 'Runtime.evaluate', {
      expression: `
        (function() {
          const elements = Array.from(document.querySelectorAll('${tag}'));
          const el = elements.find(e => e.textContent && e.textContent.includes('${text}'));
          if (el) {
            el.click();
            return true;
          }
          return false;
        })()
      `,
      returnByValue: true,
    }) as { result: { value: boolean } };
    return result?.result?.value === true;
  } catch (e) {
    console.error('[CDP] ClickByText failed:', e);
    return false;
  }
}

// Type into input field
async function typeText(ws: WebSocket, selector: string, text: string): Promise<boolean> {
  try {
    // First focus the element
    await sendCDP(ws, 'Runtime.evaluate', {
      expression: `
        (function() {
          const el = document.querySelector('${selector}');
          if (el) {
            el.focus();
            el.value = '';
            return true;
          }
          return false;
        })()
      `,
    });

    // Type each character
    for (const char of text) {
      await sendCDP(ws, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char,
      });
      await sendCDP(ws, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        text: char,
      });
      await new Promise(r => setTimeout(r, 50)); // Human-like delay
    }

    // Set value directly as backup
    await sendCDP(ws, 'Runtime.evaluate', {
      expression: `
        (function() {
          const el = document.querySelector('${selector}');
          if (el) {
            el.value = '${text}';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          return false;
        })()
      `,
      returnByValue: true,
    });

    return true;
  } catch (e) {
    console.error('[CDP] TypeText failed:', e);
    return false;
  }
}

// Take screenshot
async function screenshot(ws: WebSocket): Promise<string> {
  try {
    const result = await sendCDP(ws, 'Page.captureScreenshot', {
      format: 'png',
      quality: 80,
    }) as { data: string };
    return result?.data || '';
  } catch (e) {
    console.error('[CDP] Screenshot failed:', e);
    return '';
  }
}

// Get page URL
async function getURL(ws: WebSocket): Promise<string> {
  try {
    const result = await sendCDP(ws, 'Runtime.evaluate', {
      expression: 'window.location.href',
      returnByValue: true,
    }) as { result: { value: string } };
    return result?.result?.value || '';
  } catch (e) {
    return '';
  }
}

// Wait helper
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const BROWSERBASE_API_KEY = Deno.env.get('BROWSERBASE_API_KEY');
  const BROWSERBASE_PROJECT_ID = Deno.env.get('BROWSERBASE_PROJECT_ID');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const DEFAULT_EMAIL = Deno.env.get('ALASKA_LOGIN_EMAIL');
  const DEFAULT_PASSWORD = Deno.env.get('ALASKA_LOGIN_PASSWORD');

  if (!BROWSERBASE_API_KEY || !BROWSERBASE_PROJECT_ID) {
    return new Response(
      JSON.stringify({ error: 'Browserbase not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[AlaskaAgent] ${msg}`);
    logs.push(`${new Date().toISOString()} - ${msg}`);
  };

  try {
    const body: BookingRequest = await req.json();
    log(`Request: ${body.origin} → ${body.destination} on ${body.departure_date}`);

    const {
      origin,
      destination,
      departure_date,
      return_date,
      target_price = 700,
      passenger_email,
      decline_insurance = true,
      accounts = []
    } = body;

    const account = accounts[0] || { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD };
    
    if (!account.email || !account.password) {
      return new Response(
        JSON.stringify({ error: 'No account credentials provided', logs }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Browserbase session
    log('Creating browser session...');
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
          fingerprint: { devices: ['desktop'], operatingSystems: ['macos'] },
        },
        keepAlive: true,
      }),
    });

    if (!sessionResponse.ok) {
      const error = await sessionResponse.text();
      log(`Session creation failed: ${error}`);
      return new Response(
        JSON.stringify({ error: `Failed to create session: ${error}`, logs }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const session = await sessionResponse.json();
    log(`Session created: ${session.id}`);

    // Get debug connection info
    const debugResponse = await fetch(`https://www.browserbase.com/v1/sessions/${session.id}/debug`, {
      headers: { 'X-BB-API-Key': BROWSERBASE_API_KEY },
    });
    
    if (!debugResponse.ok) {
      throw new Error('Failed to get debug connection');
    }
    
    const debugInfo = await debugResponse.json();
    const wsUrl = debugInfo.debuggerFullscreenUrl?.replace('https://', 'wss://').replace('/devtools/inspector.html', '') 
               || debugInfo.wsUrl;
    
    log(`Connecting to CDP: ${wsUrl ? 'found' : 'not found'}`);

    // For now, we'll use the simpler approach of returning session info
    // Full CDP automation requires WebSocket support in Deno which has limitations
    
    // Alternative: Use Browserbase's REST API for basic actions
    const connectUrl = session.connectUrl;
    
    // Store job for external processing
    const { data: queueEntry, error: queueError } = await supabase
      .from('booking_queue')
      .insert({
        booking_method: 'browserbase_cdp',
        inventory_type: 'alaska_account',
        status: 'pending',
        booking_result: {
          session_id: session.id,
          connect_url: connectUrl,
          debug_url: `https://www.browserbase.com/sessions/${session.id}`,
          ws_url: wsUrl,
          request: body,
          account_email: account.email,
          automation_steps: [
            { step: 1, action: 'navigate', url: 'https://www.alaskaair.com' },
            { step: 2, action: 'click', target: 'Sign In button' },
            { step: 3, action: 'type', target: 'email field', value: account.email },
            { step: 4, action: 'type', target: 'password field', value: '***' },
            { step: 5, action: 'click', target: 'submit button' },
            { step: 6, action: 'navigate', target: 'booking page' },
            { step: 7, action: 'fill_search', origin, destination, departure_date, return_date },
            { step: 8, action: 'search_flights' },
            { step: 9, action: 'select_flight', target_price },
            { step: 10, action: 'fill_passenger', email: passenger_email },
            { step: 11, action: 'decline_insurance', value: decline_insurance },
            { step: 12, action: 'complete_booking' },
          ],
          logs,
        },
      })
      .select()
      .single();

    if (queueError) {
      log(`Queue insert error: ${queueError.message}`);
    } else {
      log(`Queued job: ${queueEntry?.id}`);
    }

    // Return session info - the actual automation needs a persistent runtime
    // Option 1: Use a separate worker/server that connects via Playwright
    // Option 2: Use Browserbase's upcoming automation API
    // Option 3: Build a hybrid with shorter-running CDP commands

    return new Response(JSON.stringify({
      success: true,
      status: 'session_ready',
      message: 'Browser session created. Connect via CDP to automate.',
      session: {
        id: session.id,
        debug_url: `https://www.browserbase.com/sessions/${session.id}`,
        connect_url: connectUrl,
      },
      queue_id: queueEntry?.id,
      next_steps: [
        'Open debug_url to watch the browser',
        'Use Playwright with connect_url for full automation',
        `const browser = await chromium.connectOverCDP('${connectUrl}')`,
      ],
      logs,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    log(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        logs,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
