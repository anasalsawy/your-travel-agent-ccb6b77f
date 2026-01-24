import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MessageContent = string | Array<{
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: object;
  tool_use_id?: string;
  content?: string;
}>;

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: MessageContent;
}

interface ClaudeRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system?: string;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: object;
  }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: object;
  }>;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Built-in tools for Claude agent
const BUILT_IN_TOOLS = [
  {
    name: 'database_query',
    description: 'Query the database to retrieve information. Use for looking up customers, orders, ticket requests, quotes, etc.',
    input_schema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'The table to query (e.g., ticket_requests, orders, profiles, quote_logs)',
        },
        filters: {
          type: 'object',
          description: 'Key-value pairs for filtering (e.g., { "status": "pending", "id": "uuid" })',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
        },
      },
      required: ['table'],
    },
  },
  {
    name: 'browse_web',
    description: 'Use Browserbase to navigate to a URL and take actions. For flight booking, form filling, checkout automation.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['navigate', 'screenshot', 'fill_form', 'click'],
          description: 'The browser action to perform',
        },
        url: {
          type: 'string',
          description: 'URL to navigate to',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for the element',
        },
        value: {
          type: 'string',
          description: 'Value to fill in forms',
        },
        session_id: {
          type: 'string',
          description: 'Existing browser session ID to reuse',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for real-time information using Perplexity. Use for flight prices, availability, current data.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'send_notification',
    description: 'Send email or SMS notification to customer or admin.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['email', 'sms', 'admin_alert'],
          description: 'Type of notification',
        },
        recipient: {
          type: 'string',
          description: 'Email or phone number',
        },
        subject: {
          type: 'string',
          description: 'Email subject (for email type)',
        },
        message: {
          type: 'string',
          description: 'The message content',
        },
      },
      required: ['type', 'message'],
    },
  },
  {
    name: 'github_read_file',
    description: 'Read a file from the GitHub repository. Use for code review, debugging, understanding implementation.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to repo root (e.g., src/pages/Index.tsx)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'github_search',
    description: 'Search for code patterns in the GitHub repository. Use for finding functions, debugging, understanding codebase.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (code pattern, function name, etc.)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'github_list_files',
    description: 'List files in a directory of the GitHub repository.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path relative to repo root (e.g., src/components)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'github_create_issue',
    description: 'Create a GitHub issue with a bug report or fix suggestion.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Issue title',
        },
        body: {
          type: 'string',
          description: 'Issue body with details, analysis, and suggested fix',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to apply (e.g., ["bug", "claude-suggestion"])',
        },
      },
      required: ['title', 'body'],
    },
  },
];

// Execute tool calls
async function executeToolCall(
  toolName: string,
  toolInput: object,
  supabase: any,
  supabaseUrl: string
): Promise<string> {
  console.log(`[Claude Agent] Executing tool: ${toolName}`, toolInput);

  switch (toolName) {
    case 'database_query': {
      const { table, filters, limit } = toolInput as { table: string; filters?: object; limit?: number };
      
      let query = supabase.from(table).select('*');
      
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          query = query.eq(key, value);
        }
      }
      
      if (limit) {
        query = query.limit(limit);
      } else {
        query = query.limit(10);
      }
      
      const { data, error } = await query;
      
      if (error) {
        return JSON.stringify({ error: error.message });
      }
      
      return JSON.stringify(data);
    }

    case 'browse_web': {
      const response = await fetch(`${supabaseUrl}/functions/v1/browserbase-browse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify(toolInput),
      });
      
      const result = await response.json();
      return JSON.stringify(result);
    }

    case 'web_search': {
      const { query } = toolInput as { query: string };
      const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
      
      if (!PERPLEXITY_API_KEY) {
        return JSON.stringify({ error: 'Perplexity API not configured' });
      }
      
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            { role: 'user', content: query },
          ],
        }),
      });
      
      const data = await response.json();
      return JSON.stringify({
        answer: data.choices?.[0]?.message?.content || 'No results',
        citations: data.citations || [],
      });
    }

    case 'send_notification': {
      const { type, recipient, subject, message } = toolInput as {
        type: string;
        recipient?: string;
        subject?: string;
        message: string;
      };
      
      // Call send-notification edge function
      const response = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({
          type: type === 'email' ? 'custom_email' : type,
          customerEmail: recipient,
          data: { subject, message },
        }),
      });
      
      const result = await response.json();
      return JSON.stringify(result);
    }

    case 'github_read_file': {
      const { path } = toolInput as { path: string };
      const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN');
      
      if (!GITHUB_TOKEN) {
        return JSON.stringify({ error: 'GitHub token not configured' });
      }
      
      // Get repo info from environment or use default
      const repo = 'user/repo'; // Will be determined from git config
      
      try {
        const response = await fetch(
          `https://api.github.com/repos/${repo}/contents/${path}`,
          {
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Claude-Agent',
            },
          }
        );
        
        if (!response.ok) {
          const error = await response.text();
          return JSON.stringify({ error: `Failed to read file: ${error}` });
        }
        
        const data = await response.json();
        const content = atob(data.content);
        
        return JSON.stringify({
          path,
          content: content.length > 10000 ? content.slice(0, 10000) + '\n... (truncated)' : content,
          size: data.size,
          sha: data.sha,
        });
      } catch (error) {
        return JSON.stringify({ error: `GitHub API error: ${error}` });
      }
    }

    case 'github_search': {
      const { query } = toolInput as { query: string };
      const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN');
      
      if (!GITHUB_TOKEN) {
        return JSON.stringify({ error: 'GitHub token not configured' });
      }
      
      const repo = 'user/repo';
      
      try {
        const response = await fetch(
          `https://api.github.com/search/code?q=${encodeURIComponent(query)}+repo:${repo}`,
          {
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Claude-Agent',
            },
          }
        );
        
        if (!response.ok) {
          const error = await response.text();
          return JSON.stringify({ error: `Search failed: ${error}` });
        }
        
        const data = await response.json();
        
        return JSON.stringify({
          total_count: data.total_count,
          items: data.items?.slice(0, 10).map((item: any) => ({
            path: item.path,
            name: item.name,
            html_url: item.html_url,
          })),
        });
      } catch (error) {
        return JSON.stringify({ error: `GitHub API error: ${error}` });
      }
    }

    case 'github_list_files': {
      const { path } = toolInput as { path: string };
      const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN');
      
      if (!GITHUB_TOKEN) {
        return JSON.stringify({ error: 'GitHub token not configured' });
      }
      
      const repo = 'user/repo';
      
      try {
        const response = await fetch(
          `https://api.github.com/repos/${repo}/contents/${path || ''}`,
          {
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Claude-Agent',
            },
          }
        );
        
        if (!response.ok) {
          const error = await response.text();
          return JSON.stringify({ error: `Failed to list files: ${error}` });
        }
        
        const data = await response.json();
        
        return JSON.stringify({
          path,
          files: Array.isArray(data) ? data.map((item: any) => ({
            name: item.name,
            type: item.type,
            path: item.path,
            size: item.size,
          })) : [{ name: data.name, type: data.type, path: data.path }],
        });
      } catch (error) {
        return JSON.stringify({ error: `GitHub API error: ${error}` });
      }
    }

    case 'github_create_issue': {
      const { title, body, labels } = toolInput as { title: string; body: string; labels?: string[] };
      const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN');
      
      if (!GITHUB_TOKEN) {
        return JSON.stringify({ error: 'GitHub token not configured' });
      }
      
      const repo = 'user/repo';
      
      try {
        const response = await fetch(
          `https://api.github.com/repos/${repo}/issues`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Claude-Agent',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title,
              body: `## Claude Agent Analysis\n\n${body}\n\n---\n*This issue was created by Claude Agent*`,
              labels: labels || ['claude-suggestion'],
            }),
          }
        );
        
        if (!response.ok) {
          const error = await response.text();
          return JSON.stringify({ error: `Failed to create issue: ${error}` });
        }
        
        const data = await response.json();
        
        return JSON.stringify({
          success: true,
          issue_number: data.number,
          html_url: data.html_url,
        });
      } catch (error) {
        return JSON.stringify({ error: `GitHub API error: ${error}` });
      }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body: ClaudeRequest = await req.json();

    const {
      messages,
      system = 'You are Claude, a helpful AI assistant with access to tools for database queries, web browsing, web search, and sending notifications. Use these tools to help accomplish tasks.',
      tools = [],
      max_tokens = 4096,
      temperature = 0.7,
      stream = false,
    } = body;

    // Merge built-in tools with any custom tools
    const allTools = [...BUILT_IN_TOOLS, ...tools];

    console.log(`[Claude Agent] Processing ${messages.length} messages with ${allTools.length} tools`);

    // Initial Claude API call - use any type for messages since Claude API accepts various content types
    let claudeMessages: any[] = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    let finalResponse: ClaudeResponse | null = null;
    let iterations = 0;
    const maxIterations = 10; // Prevent infinite loops

    while (iterations < maxIterations) {
      iterations++;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens,
          temperature,
          system,
          messages: claudeMessages,
          tools: allTools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[Claude Agent] API error:', error);
        throw new Error(`Claude API error: ${error}`);
      }

      const claudeResponse: ClaudeResponse = await response.json();
      console.log(`[Claude Agent] Response stop_reason: ${claudeResponse.stop_reason}`);

      // Check if Claude wants to use tools
      if (claudeResponse.stop_reason === 'tool_use') {
        const toolUseBlocks = claudeResponse.content.filter(c => c.type === 'tool_use');
        
        // Execute all tool calls
        const toolResults = await Promise.all(
          toolUseBlocks.map(async (toolBlock) => {
            const result = await executeToolCall(
              toolBlock.name!,
              toolBlock.input!,
              supabase,
              SUPABASE_URL
            );
            return {
              type: 'tool_result' as const,
              tool_use_id: toolBlock.id!,
              content: result,
            };
          })
        );

        // Add assistant message and tool results
        claudeMessages = [
          ...claudeMessages,
          { role: 'assistant', content: claudeResponse.content },
          { role: 'user', content: toolResults },
        ];

        // Continue the loop to get Claude's response after tool use
        continue;
      }

      // Claude finished without needing more tools
      finalResponse = claudeResponse;
      break;
    }

    if (!finalResponse) {
      throw new Error('Max iterations reached without final response');
    }

    // Extract text content from response
    const textContent = finalResponse.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');

    return new Response(
      JSON.stringify({
        content: textContent,
        usage: finalResponse.usage,
        stop_reason: finalResponse.stop_reason,
        iterations,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Claude Agent] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
