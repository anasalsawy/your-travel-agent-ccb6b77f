import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a powerful AI assistant for "Your Travel Agent" (your-travel-agent.net), a premium travel agency business. You have FULL access to the business database and can execute real actions.

You are NOT a generic chatbot. You are the business owner's personal AI with direct database access. You CAN and SHOULD take action when asked.

CAPABILITIES YOU HAVE:
- Query and modify the database (vouchers, orders, ticket requests, car rentals, users, etc.)
- Look up customer information, order history, conversation logs
- Create, update, or delete vouchers and inventory
- Manage ticket requests and quotes
- View call logs, booking queue, and all business data
- Generate reports and analytics from real data

When the user asks you to do something, DO IT using the execute_sql tool. Don't just describe steps — take action.

IMPORTANT: You have a tool called "execute_sql" that runs read-only SQL queries against the database. For write operations, describe the exact SQL and confirm before executing.

Always be direct, confident, and action-oriented. You work FOR the business owner.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  try {
    const { messages, max_tokens, temperature } = await req.json();
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build messages with system prompt
    const allMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    // Define the SQL tool
    const tools = [
      {
        type: "function",
        function: {
          name: "execute_sql",
          description: "Execute a SQL query against the business database. Use SELECT for reads. For INSERT/UPDATE/DELETE, confirm with the user first.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The SQL query to execute",
              },
              is_write: {
                type: "boolean",
                description: "Whether this is a write operation (INSERT/UPDATE/DELETE)",
              },
            },
            required: ["query"],
          },
        },
      },
    ];

    // First call - let the model decide if it needs to use tools
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: allMessages,
        max_completion_tokens: max_tokens || 16384,
        temperature: temperature ?? 0.7,
        tools,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`OpenAI error: ${response.status}`);
    }

    let data = await response.json();
    let assistantMessage = data.choices?.[0]?.message;

    // Handle tool calls iteratively (up to 5 rounds)
    let rounds = 0;
    while (assistantMessage?.tool_calls && rounds < 5) {
      rounds++;
      const toolResults: any[] = [];

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === "execute_sql") {
          const args = JSON.parse(toolCall.function.arguments);
          console.log(`[dev-agent] Executing SQL: ${args.query.substring(0, 200)}`);

          try {
            const { data: queryData, error: queryError } = await supabase.rpc(
              "execute_sql_query" as any,
              { query_text: args.query }
            ).maybeSingle();

            if (queryError) {
              // Fallback: try direct fetch for simple queries
              const pgResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_sql_query`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  "apikey": SUPABASE_SERVICE_ROLE_KEY,
                },
                body: JSON.stringify({ query_text: args.query }),
              });

              if (!pgResponse.ok) {
                // Last resort: parse table name and use REST API for SELECT queries
                const selectMatch = args.query.match(/SELECT\s+.+?\s+FROM\s+(\w+)/i);
                if (selectMatch) {
                  const tableName = selectMatch[1];
                  const restResponse = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?limit=50`, {
                    headers: {
                      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                      "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    },
                  });
                  const restData = await restResponse.json();
                  toolResults.push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    content: JSON.stringify({ success: true, data: restData, note: "Used REST API fallback" }),
                  });
                  continue;
                }
                throw new Error(`SQL execution failed: ${await pgResponse.text()}`);
              }
              const result = await pgResponse.json();
              toolResults.push({
                tool_call_id: toolCall.id,
                role: "tool",
                content: JSON.stringify({ success: true, data: result }),
              });
            } else {
              toolResults.push({
                tool_call_id: toolCall.id,
                role: "tool",
                content: JSON.stringify({ success: true, data: queryData }),
              });
            }
          } catch (sqlError: any) {
            console.error("[dev-agent] SQL error:", sqlError.message);
            toolResults.push({
              tool_call_id: toolCall.id,
              role: "tool",
              content: JSON.stringify({ success: false, error: sqlError.message }),
            });
          }
        }
      }

      // Continue conversation with tool results
      const continueMessages = [
        ...allMessages,
        assistantMessage,
        ...toolResults,
      ];

      const continueResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5.2",
          messages: continueMessages,
          max_completion_tokens: max_tokens || 16384,
          temperature: temperature ?? 0.7,
          tools,
          tool_choice: "auto",
        }),
      });

      if (!continueResponse.ok) {
        const errorText = await continueResponse.text();
        console.error("OpenAI continue error:", continueResponse.status, errorText);
        break;
      }

      data = await continueResponse.json();
      assistantMessage = data.choices?.[0]?.message;
      
      // Update allMessages for next round
      allMessages.push(...[assistantMessage, ...toolResults].filter(Boolean));
    }

    const content = assistantMessage?.content || "Done. Check the results.";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("dev-agent error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
