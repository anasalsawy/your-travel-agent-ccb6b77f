import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ALASKA AIRLINES AUTONOMOUS BOOKING AGENT
 * Self-executing CDP automation via Browserbase WebSocket.
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
  decline_insurance?: boolean;
  accounts?: Array<{ email: string; password: string }>;
  dry_run?: boolean; // If true, don't actually book - just search
}

class CDPClient {
  private ws: WebSocket;
  private messageId = 0;
  private pendingRequests: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map();
  private logs: string[] = [];

  constructor(ws: WebSocket, logs: string[]) {
    this.ws = ws;
    this.logs = logs;
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id !== undefined) {
          const pending = this.pendingRequests.get(data.id);
          if (pending) {
            this.pendingRequests.delete(data.id);
            if (data.error) {
              pending.reject(new Error(data.error.message));
            } else {
              pending.resolve(data.result);
            }
          }
        }
      } catch (e) {
        // Ignore parse errors for events
      }
    };
  }

  log(msg: string) {
    console.log(`[CDP] ${msg}`);
    this.logs.push(`${new Date().toISOString()} - ${msg}`);
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: (v) => { clearTimeout(timeout); resolve(v); },
        reject: (e) => { clearTimeout(timeout); reject(e); },
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url: string): Promise<void> {
    this.log(`Navigating to: ${url}`);
    await this.send('Page.navigate', { url });
    await this.waitForLoad();
  }

  async waitForLoad(timeout = 15000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const result = await this.send('Runtime.evaluate', {
          expression: 'document.readyState',
          returnByValue: true,
        }) as { result: { value: string } };
        
        if (result?.result?.value === 'complete') {
          await this.wait(500); // Extra buffer
          return;
        }
      } catch (e) {
        // Page not ready
      }
      await this.wait(500);
    }
  }

  async wait(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }) as { result: { value: T } };
    return result?.result?.value;
  }

  async click(selector: string): Promise<boolean> {
    const clicked = await this.evaluate<boolean>(`
      (function() {
        const el = document.querySelector('${selector}');
        if (el) { el.click(); return true; }
        return false;
      })()
    `);
    this.log(`Click ${selector}: ${clicked ? 'success' : 'not found'}`);
    return clicked;
  }

  async clickText(text: string, tag = '*'): Promise<boolean> {
    const clicked = await this.evaluate<boolean>(`
      (function() {
        const els = Array.from(document.querySelectorAll('${tag}'));
        const el = els.find(e => e.textContent && e.textContent.trim().includes('${text}'));
        if (el) { el.click(); return true; }
        return false;
      })()
    `);
    this.log(`Click text "${text}": ${clicked ? 'success' : 'not found'}`);
    return clicked;
  }

  async type(selector: string, text: string): Promise<boolean> {
    // Focus and clear
    await this.evaluate(`
      (function() {
        const el = document.querySelector('${selector}');
        if (el) { el.focus(); el.value = ''; }
      })()
    `);

    // Type character by character with delays
    for (const char of text) {
      await this.send('Input.dispatchKeyEvent', { type: 'keyDown', text: char });
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp', text: char });
      await this.wait(30);
    }

    // Set value directly as backup and trigger events
    await this.evaluate(`
      (function() {
        const el = document.querySelector('${selector}');
        if (el) {
          el.value = '${text}';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);

    this.log(`Type into ${selector}: ${text.substring(0, 3)}***`);
    return true;
  }

  async screenshot(): Promise<string> {
    const result = await this.send('Page.captureScreenshot', {
      format: 'png',
      quality: 80,
    }) as { data: string };
    this.log('Screenshot captured');
    return result?.data || '';
  }

  async getURL(): Promise<string> {
    return this.evaluate<string>('window.location.href');
  }

  async getTitle(): Promise<string> {
    return this.evaluate<string>('document.title');
  }

  async waitForSelector(selector: string, timeout = 10000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = await this.evaluate<boolean>(`!!document.querySelector('${selector}')`);
      if (found) return true;
      await this.wait(500);
    }
    return false;
  }

  async waitForText(text: string, timeout = 10000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = await this.evaluate<boolean>(`document.body.innerText.includes('${text}')`);
      if (found) return true;
      await this.wait(500);
    }
    return false;
  }
}

async function runBookingAutomation(
  cdp: CDPClient,
  request: BookingRequest,
  account: { email: string; password: string }
): Promise<{ success: boolean; step: string; error?: string; screenshot?: string; data?: Record<string, unknown> }> {
  
  try {
    // Step 1: Navigate to Alaska Airlines
    cdp.log('Step 1: Opening Alaska Airlines...');
    await cdp.navigate('https://www.alaskaair.com');
    await cdp.wait(3000);
    
    let screenshot = await cdp.screenshot();
    const title = await cdp.getTitle();
    cdp.log(`Page loaded: ${title}`);

    // Step 2: Click Sign In
    cdp.log('Step 2: Looking for Sign In...');
    
    // Try multiple selectors for sign in
    const signInClicked = 
      await cdp.clickText('Sign in') ||
      await cdp.clickText('Log in') ||
      await cdp.click('[data-testid="sign-in"]') ||
      await cdp.click('button[aria-label*="sign in" i]') ||
      await cdp.click('a[href*="login"]');
    
    if (!signInClicked) {
      screenshot = await cdp.screenshot();
      return { success: false, step: 'sign_in_button', error: 'Could not find Sign In button', screenshot };
    }
    
    await cdp.wait(3000);
    await cdp.waitForLoad();

    // Step 3: Enter credentials
    cdp.log('Step 3: Entering credentials...');
    
    // Wait for login form
    const emailFieldFound = await cdp.waitForSelector('input[type="email"], input[name="email"], input[id*="email" i], input[name="username"]', 5000);
    
    if (!emailFieldFound) {
      screenshot = await cdp.screenshot();
      return { success: false, step: 'login_form', error: 'Login form not found', screenshot };
    }

    // Type email
    await cdp.type('input[type="email"], input[name="email"], input[id*="email" i], input[name="username"]', account.email);
    await cdp.wait(500);

    // Type password
    await cdp.type('input[type="password"], input[name="password"]', account.password);
    await cdp.wait(500);

    // Click submit
    const loginSubmitted = 
      await cdp.click('button[type="submit"]') ||
      await cdp.clickText('Sign in', 'button') ||
      await cdp.clickText('Log in', 'button') ||
      await cdp.clickText('Continue', 'button');

    if (!loginSubmitted) {
      screenshot = await cdp.screenshot();
      return { success: false, step: 'login_submit', error: 'Could not submit login form', screenshot };
    }

    await cdp.wait(5000);
    await cdp.waitForLoad();
    
    // Check for login errors
    const currentUrl = await cdp.getURL();
    cdp.log(`After login URL: ${currentUrl}`);
    
    const hasError = await cdp.evaluate<boolean>(`
      document.body.innerText.toLowerCase().includes('invalid') ||
      document.body.innerText.toLowerCase().includes('incorrect') ||
      document.body.innerText.toLowerCase().includes('error')
    `);
    
    if (hasError) {
      screenshot = await cdp.screenshot();
      return { success: false, step: 'login_verify', error: 'Login failed - invalid credentials?', screenshot };
    }

    // Step 4: Navigate to booking
    cdp.log('Step 4: Going to flight search...');
    
    // Look for booking/search area
    await cdp.clickText('Book') || await cdp.clickText('Search') || await cdp.click('a[href*="book"]');
    await cdp.wait(2000);

    // Step 5: Fill search form
    cdp.log('Step 5: Filling flight search...');
    
    // Origin
    const originFields = 'input[id*="origin" i], input[name*="from" i], input[placeholder*="from" i], input[aria-label*="from" i]';
    await cdp.type(originFields, request.origin);
    await cdp.wait(1000);
    // Select from dropdown
    await cdp.click('li[role="option"], .autocomplete-item, .suggestion');
    await cdp.wait(500);

    // Destination
    const destFields = 'input[id*="destination" i], input[name*="to" i], input[placeholder*="to" i], input[aria-label*="to" i]';
    await cdp.type(destFields, request.destination);
    await cdp.wait(1000);
    await cdp.click('li[role="option"], .autocomplete-item, .suggestion');
    await cdp.wait(500);

    // Departure date - this is tricky as date pickers vary
    cdp.log(`Setting departure date: ${request.departure_date}`);
    await cdp.click('input[id*="depart" i], input[name*="depart" i], button[aria-label*="departure" i]');
    await cdp.wait(1000);
    
    // For date pickers, we often need to type the date directly
    await cdp.evaluate(`
      const dateInputs = document.querySelectorAll('input[type="date"], input[id*="date" i]');
      dateInputs.forEach(el => {
        if (el.id.toLowerCase().includes('depart')) {
          el.value = '${request.departure_date}';
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    `);

    // Step 6: Search flights
    cdp.log('Step 6: Searching flights...');
    
    const searchClicked = 
      await cdp.clickText('Search', 'button') ||
      await cdp.clickText('Find flights', 'button') ||
      await cdp.click('button[type="submit"]');
    
    if (!searchClicked) {
      screenshot = await cdp.screenshot();
      return { success: false, step: 'search_submit', error: 'Could not submit search', screenshot };
    }

    await cdp.wait(8000);
    await cdp.waitForLoad();
    
    screenshot = await cdp.screenshot();
    
    // Check if results loaded
    const hasResults = await cdp.evaluate<boolean>(`
      document.body.innerText.includes('$') ||
      document.body.innerText.includes('Select') ||
      document.querySelectorAll('[class*="flight"]').length > 0
    `);

    if (!hasResults) {
      return { 
        success: false, 
        step: 'search_results', 
        error: 'No flight results found', 
        screenshot,
        data: { url: await cdp.getURL() }
      };
    }

    // If dry run, stop here
    if (request.dry_run) {
      return {
        success: true,
        step: 'search_complete',
        screenshot,
        data: {
          message: 'Dry run - search completed successfully',
          url: await cdp.getURL(),
        }
      };
    }

    // Step 7: Select flight (look for price near target)
    cdp.log(`Step 7: Looking for flight near $${request.target_price}...`);
    
    // This is where we'd parse prices and select the best option
    // For now, click the first "Select" button
    await cdp.clickText('Select', 'button') || await cdp.click('button[class*="select" i]');
    await cdp.wait(3000);

    // Continue through booking flow...
    // This would need to be customized based on Alaska's actual UI

    screenshot = await cdp.screenshot();
    
    return {
      success: true,
      step: 'booking_in_progress',
      screenshot,
      data: {
        url: await cdp.getURL(),
        message: 'Booking flow initiated - manual review recommended',
      }
    };

  } catch (error) {
    const screenshot = await cdp.screenshot().catch(() => '');
    return {
      success: false,
      step: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      screenshot,
    };
  }
}

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

    const account = body.accounts?.[0] || { email: DEFAULT_EMAIL || '', password: DEFAULT_PASSWORD || '' };
    
    if (!account.email || !account.password) {
      return new Response(
        JSON.stringify({ error: 'No account credentials', logs }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // First, close any existing sessions
    log('Checking for existing sessions...');
    try {
      const listResponse = await fetch('https://www.browserbase.com/v1/sessions', {
        headers: { 'X-BB-API-Key': BROWSERBASE_API_KEY },
      });
      
      if (listResponse.ok) {
        const sessions = await listResponse.json();
        for (const s of sessions) {
          if (s.status === 'RUNNING') {
            log(`Closing existing session: ${s.id}`);
            await fetch(`https://www.browserbase.com/v1/sessions/${s.id}`, {
              method: 'PUT',
              headers: {
                'X-BB-API-Key': BROWSERBASE_API_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ status: 'REQUEST_RELEASE' }),
            });
          }
        }
        // Wait for sessions to close
        if (sessions.some((s: { status: string }) => s.status === 'RUNNING')) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    } catch (e) {
      log(`Session cleanup error: ${e}`);
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
      return new Response(
        JSON.stringify({ error: `Session creation failed: ${error}`, logs }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const session = await sessionResponse.json();
    log(`Session created: ${session.id}`);

    // Get WebSocket URL for CDP
    const debugResponse = await fetch(`https://www.browserbase.com/v1/sessions/${session.id}/debug`, {
      headers: { 'X-BB-API-Key': BROWSERBASE_API_KEY },
    });
    
    const debugInfo = await debugResponse.json();
    log(`Debug info: ${JSON.stringify(Object.keys(debugInfo))}`);
    
    // Browserbase provides a WebSocket URL for CDP
    // Format: wss://connect.browserbase.com/...
    const wsUrl = debugInfo.debuggerWsUrl || session.connectUrl?.replace('wss://', 'wss://') || null;
    
    if (!wsUrl) {
      log('No WebSocket URL found, returning session for manual connection');
      return new Response(JSON.stringify({
        success: false,
        error: 'CDP WebSocket URL not available',
        session: {
          id: session.id,
          debug_url: `https://www.browserbase.com/sessions/${session.id}`,
          connect_url: session.connectUrl,
        },
        logs,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Connect via WebSocket
    log(`Connecting to CDP: ${wsUrl.substring(0, 50)}...`);
    
    const ws = new WebSocket(wsUrl);
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
      ws.onopen = () => { clearTimeout(timeout); resolve(); };
      ws.onerror = (e) => { clearTimeout(timeout); reject(new Error('WebSocket error')); };
    });
    
    log('WebSocket connected!');

    // Initialize CDP
    const cdp = new CDPClient(ws, logs);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Input.enable');

    // Run the automation
    const result = await runBookingAutomation(cdp, body, account);
    
    // Close WebSocket
    ws.close();
    
    // Store result
    await supabase.from('booking_queue').insert({
      booking_method: 'browserbase_cdp_auto',
      inventory_type: 'alaska_account',
      status: result.success ? 'completed' : 'failed',
      booking_result: {
        ...result,
        session_id: session.id,
        request: body,
        logs,
      },
      error_message: result.error,
    });

    return new Response(JSON.stringify({
      ...result,
      session: {
        id: session.id,
        debug_url: `https://www.browserbase.com/sessions/${session.id}`,
      },
      logs,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    log(`Fatal error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        logs,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
