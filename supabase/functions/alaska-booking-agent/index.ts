import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ALASKA AIRLINES AUTONOMOUS BOOKING AGENT
 * 
 * Uses Browserbase Sessions API for cloud browser automation + Claude for reasoning.
 * Handles the full booking flow: login → search → select → passenger info → payment
 * 
 * Browserbase operates in "session" mode - we create a session, then use their
 * debug URLs to interact or leverage their Stagehand/Playwright integrations.
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

interface PageAnalysis {
  current_url: string;
  page_title: string;
  visible_elements: string[];
  forms: string[];
  suggested_action: string;
}

// Use Claude to analyze screenshot and decide next action
async function analyzePageWithClaude(
  screenshotBase64: string,
  goal: string,
  history: string[],
  ANTHROPIC_API_KEY: string
): Promise<{ action: string; reasoning: string; details: string }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      temperature: 0.2,
      system: `You are an expert browser automation agent analyzing screenshots of Alaska Airlines website.

Your task: Analyze the screenshot and provide the exact next action to achieve the goal.

Respond with JSON ONLY:
{
  "action": "click|type|select|wait|scroll|done|error",
  "reasoning": "Why this action",
  "details": "Exact element to interact with - describe location, text, or provide CSS selector hint"
}

For Alaska Airlines:
- Login is usually under "Sign in" or profile icon
- Flight search has From/To fields, date pickers
- Look for "Search" or "Find flights" buttons
- Prices appear as dollar amounts with "Select" buttons
- Insurance is often a checkbox to decline
- Payment uses saved cards or card entry forms

Be VERY specific about which element to interact with.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: screenshotBase64,
              },
            },
            {
              type: "text",
              text: `GOAL: ${goal}

PREVIOUS ACTIONS:
${history.slice(-5).join('\n')}

Analyze this screenshot and tell me the exact next action to take.`
            }
          ],
        }
      ]
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '{}';
  
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('[AlaskaAgent] Failed to parse Claude response:', content);
  }
  
  return { action: 'error', reasoning: 'Failed to parse response', details: content };
}

// Generate Playwright script based on Claude's analysis
function generatePlaywrightStep(action: string, details: string): string {
  switch (action) {
    case 'click':
      return `await page.click('text=${details}').catch(() => page.locator('${details}').click());`;
    case 'type':
      const [selector, value] = details.split('::');
      return `await page.fill('${selector}', '${value}');`;
    case 'select':
      const [selSelector, selValue] = details.split('::');
      return `await page.selectOption('${selSelector}', '${selValue}');`;
    case 'scroll':
      return `await page.evaluate(() => window.scrollBy(0, 500));`;
    case 'wait':
      return `await page.waitForTimeout(3000);`;
    default:
      return `// ${action}: ${details}`;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const BROWSERBASE_API_KEY = Deno.env.get('BROWSERBASE_API_KEY');
  const BROWSERBASE_PROJECT_ID = Deno.env.get('BROWSERBASE_PROJECT_ID');
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
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

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Anthropic API key not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body: BookingRequest = await req.json();
    console.log('[AlaskaAgent] Booking request:', body);

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

    const accountsToTry = accounts.length > 0 ? accounts : [
      { email: DEFAULT_EMAIL || '', password: DEFAULT_PASSWORD || '' }
    ];

    let bookingResult: any = null;
    let lastError: string | null = null;
    let sessionDetails: any = null;

    for (const account of accountsToTry) {
      if (!account.email || !account.password) {
        console.log('[AlaskaAgent] Skipping empty account');
        continue;
      }

      console.log(`[AlaskaAgent] Attempting with account: ${account.email}`);

      try {
        // First, check for existing sessions and close them
        const listResponse = await fetch('https://www.browserbase.com/v1/sessions', {
          headers: {
            'X-BB-API-Key': BROWSERBASE_API_KEY,
          },
        });
        
        if (listResponse.ok) {
          const sessions = await listResponse.json();
          // Close any running sessions
          for (const session of sessions) {
            if (session.status === 'RUNNING') {
              console.log(`[AlaskaAgent] Closing existing session: ${session.id}`);
              await fetch(`https://www.browserbase.com/v1/sessions/${session.id}`, {
                method: 'PUT',
                headers: {
                  'X-BB-API-Key': BROWSERBASE_API_KEY,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: 'REQUEST_RELEASE' }),
              });
            }
          }
        }

        // Wait a moment for sessions to close
        await new Promise(r => setTimeout(r, 2000));

        // Create new Browserbase session
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
              fingerprint: {
                devices: ['desktop'],
                operatingSystems: ['macos'],
              },
            },
            keepAlive: true,
          }),
        });

        if (!sessionResponse.ok) {
          const errorText = await sessionResponse.text();
          throw new Error(`Failed to create session: ${errorText}`);
        }

        const session = await sessionResponse.json();
        console.log(`[AlaskaAgent] Session created: ${session.id}`);
        
        sessionDetails = {
          sessionId: session.id,
          debugUrl: `https://www.browserbase.com/sessions/${session.id}`,
          connectUrl: session.connectUrl,
          account: account.email,
        };

        // Build the automation instructions for the booking
        const bookingInstructions = `
ALASKA AIRLINES BOOKING AUTOMATION
===================================
Session ID: ${session.id}
Connect URL: ${session.connectUrl}

TARGET BOOKING:
- Route: ${origin} → ${destination}
- Departure: ${departure_date}
- Return: ${return_date || 'One-way'}
- Target Price: ~$${target_price}
- Passenger Email: ${passenger_email}
- Decline Insurance: ${decline_insurance}

LOGIN CREDENTIALS:
- Email: ${account.email}
- Password: ${account.password}

AUTOMATION STEPS:
1. Navigate to https://www.alaskaair.com
2. Click "Sign In" in the header
3. Enter email and password, submit
4. Navigate to flight booking
5. Enter From: ${origin}, To: ${destination}
6. Select departure date: ${departure_date}
7. ${return_date ? `Select return date: ${return_date}` : 'Select one-way'}
8. Search for flights
9. Select flight option closest to $${target_price}
10. Update passenger email to: ${passenger_email}
11. ${decline_insurance ? 'Decline' : 'Accept'} travel protection
12. Select saved payment card
13. Complete booking
14. Capture confirmation number

CONNECT TO SESSION:
Use Playwright with: browserbase.connect(${session.id})
`;

        // Store the automation job
        const { data: queueEntry, error: queueError } = await supabase
          .from('booking_queue')
          .insert({
            booking_method: 'browserbase_alaska',
            inventory_type: 'alaska_account',
            status: 'pending',
            booking_result: {
              session: sessionDetails,
              instructions: bookingInstructions,
              request: body,
            },
          })
          .select()
          .single();

        if (queueError) {
          console.error('[AlaskaAgent] Queue insert error:', queueError);
        }

        // For now, return the session info - the actual automation needs 
        // to be run via a Playwright-enabled environment
        bookingResult = {
          success: true,
          status: 'session_created',
          message: 'Browser session created. Connect via Playwright to complete automation.',
          session: sessionDetails,
          queue_id: queueEntry?.id,
          instructions: bookingInstructions,
          next_step: `Connect to session using Playwright: const browser = await chromium.connectOverCDP('${session.connectUrl}')`,
        };

        // Log for the admin
        console.log('[AlaskaAgent] Session ready:', sessionDetails);
        console.log('[AlaskaAgent] Instructions:', bookingInstructions);

        break; // Success - exit loop

      } catch (accountError) {
        lastError = accountError instanceof Error ? accountError.message : 'Unknown error';
        console.error(`[AlaskaAgent] Account ${account.email} failed:`, lastError);
        
        if (lastError.includes('Payment declined') || lastError.includes('card was declined')) {
          console.log('[AlaskaAgent] Payment failed, trying next account...');
          continue;
        }
      }
    }

    if (bookingResult) {
      return new Response(JSON.stringify(bookingResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: lastError || 'All accounts failed',
        tried_accounts: accountsToTry.map(a => a.email),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AlaskaAgent] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
