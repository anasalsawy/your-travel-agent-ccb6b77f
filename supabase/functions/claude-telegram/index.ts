import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Your admin phone/chat ID for authorization
const ADMIN_CHAT_IDS = ['7023792563']; // Add your Telegram chat ID

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    date: number;
  };
}

async function sendTelegramMessage(chatId: number, text: string, parseMode = 'Markdown') {
  const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
  
  // Split long messages
  const maxLength = 4000;
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.slice(i, i + maxLength));
  }
  
  for (const chunk of chunks) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: parseMode,
      }),
    });
  }
}

async function callClaudeAgent(message: string, context?: string): Promise<string> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  const systemPrompt = `You are Claude, a senior developer assistant working for the boss. You have access to:
- Database queries (ticket_requests, orders, profiles, quote_logs, call_logs, etc.)
- Web browsing via Browserbase
- Web search via Perplexity
- GitHub repository access for code reading and debugging
- Notification sending

You are the "intern" who gets things done. Be concise, technical, and action-oriented.
When asked to debug or analyze code, use your tools to investigate thoroughly.
Format responses for Telegram (use markdown sparingly, keep it readable).

${context ? `Context: ${context}` : ''}`;

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/claude-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: message }],
        system: systemPrompt,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Claude Telegram] Agent error:', error);
      return `❌ Error calling Claude: ${error}`;
    }

    const data = await response.json();
    return data.content || 'No response from Claude';
  } catch (error) {
    console.error('[Claude Telegram] Error:', error);
    return `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const update: TelegramUpdate = await req.json();
    console.log('[Claude Telegram] Received update:', JSON.stringify(update));

    if (!update.message?.text) {
      return new Response('OK', { status: 200 });
    }

    const chatId = update.message.chat.id;
    const userId = update.message.from.id.toString();
    const text = update.message.text;
    const username = update.message.from.username || update.message.from.first_name;

    console.log(`[Claude Telegram] Message from ${username} (${userId}): ${text}`);

    // Check authorization
    if (!ADMIN_CHAT_IDS.includes(userId)) {
      await sendTelegramMessage(chatId, '⛔ Unauthorized. This bot is for admin use only.');
      console.log(`[Claude Telegram] Unauthorized access attempt from ${userId}`);
      return new Response('OK', { status: 200 });
    }

    // Handle commands
    if (text.startsWith('/')) {
      const command = text.split(' ')[0].toLowerCase();
      const args = text.slice(command.length).trim();

      switch (command) {
        case '/start':
          await sendTelegramMessage(chatId, 
            `👋 Hey boss! Claude here, ready to work.\n\n` +
            `Commands:\n` +
            `/status - Check system status\n` +
            `/logs - View recent error logs\n` +
            `/search [query] - Search the codebase\n` +
            `/read [file] - Read a file\n` +
            `/debug [issue] - Analyze an issue\n` +
            `/db [query] - Query database\n\n` +
            `Or just send me any task directly.`
          );
          break;

        case '/status':
          const statusResponse = await callClaudeAgent(
            'Give me a quick status report. Check: 1) Recent ticket_requests (last 5), 2) Any pending orders, 3) Recent call_logs. Be brief.'
          );
          await sendTelegramMessage(chatId, `📊 *Status Report*\n\n${statusResponse}`);
          break;

        case '/logs':
          const logsResponse = await callClaudeAgent(
            'Query the notification_log table for recent errors (status = "error"). Show last 10 with timestamps and error messages.'
          );
          await sendTelegramMessage(chatId, `📋 *Recent Logs*\n\n${logsResponse}`);
          break;

        case '/search':
          if (!args) {
            await sendTelegramMessage(chatId, '❓ Usage: /search [pattern]\nExample: /search handlePayment');
          } else {
            await sendTelegramMessage(chatId, `🔍 Searching for: ${args}...`);
            const searchResponse = await callClaudeAgent(
              `Search the codebase for: "${args}". Use the github_search tool to find relevant files and code snippets.`
            );
            await sendTelegramMessage(chatId, searchResponse);
          }
          break;

        case '/read':
          if (!args) {
            await sendTelegramMessage(chatId, '❓ Usage: /read [filepath]\nExample: /read src/pages/Index.tsx');
          } else {
            await sendTelegramMessage(chatId, `📖 Reading: ${args}...`);
            const readResponse = await callClaudeAgent(
              `Read the file: "${args}" from the GitHub repository. Show me the key parts and summarize what it does.`
            );
            await sendTelegramMessage(chatId, readResponse);
          }
          break;

        case '/debug':
          if (!args) {
            await sendTelegramMessage(chatId, '❓ Usage: /debug [issue description]\nExample: /debug Maya not responding to quotes');
          } else {
            await sendTelegramMessage(chatId, `🔧 Debugging: ${args}...`);
            const debugResponse = await callClaudeAgent(
              `Debug this issue: "${args}". 
              1) Check relevant logs in the database
              2) Search for related code
              3) Analyze the flow
              4) Provide your findings and suggested fix`
            );
            await sendTelegramMessage(chatId, `🔧 *Debug Report*\n\n${debugResponse}`);
          }
          break;

        case '/db':
          if (!args) {
            await sendTelegramMessage(chatId, '❓ Usage: /db [natural language query]\nExample: /db show me pending ticket requests');
          } else {
            const dbResponse = await callClaudeAgent(
              `Database query request: "${args}". Use the database_query tool to fetch this data and present it clearly.`
            );
            await sendTelegramMessage(chatId, dbResponse);
          }
          break;

        default:
          await sendTelegramMessage(chatId, `❓ Unknown command: ${command}\nSend /start for help or just tell me what you need.`);
      }
    } else {
      // Free-form message - send to Claude
      await sendTelegramMessage(chatId, '🤔 Working on it...');
      const response = await callClaudeAgent(text);
      await sendTelegramMessage(chatId, response);
    }

    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('[Claude Telegram] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
