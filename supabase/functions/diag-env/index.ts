// Temporary diagnostic: confirm which META_PAGE_ID the runtime sees.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-content",
      },
    });
  }
  const pageId = Deno.env.get("META_PAGE_ID") ?? "unset";
  const tokenPresent = Boolean(Deno.env.get("META_ACCESS_TOKEN"));
  return new Response(
    JSON.stringify({
      page_id_length: pageId.length,
      page_id_prefix: pageId.slice(0, 6),
      page_id_suffix: pageId.slice(-4),
      token_present: tokenPresent,
    }),
    {
      headers: {
        "content-type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
});
