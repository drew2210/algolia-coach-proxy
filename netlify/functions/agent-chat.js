// Netlify function: chat with your AgentStudio agent + handle tool calls server-side
const AGENT_API = "https://9w4ktrx803.algolia.net/agent-studio/1/agents/8a021bef-44f7-4263-8242-d8541900dfee/completions?compatibilityMode=ai-sdk-5";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Messages array: [{role:"user"|"assistant"|"tool", content:"..."}]
  const { messages } = JSON.parse(event.body || "{}") || {};
  if (!Array.isArray(messages)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing messages[]" }) };
  }

  // Helper to call the Agent API
  async function callAgent(payload) {
    const r = await fetch(AGENT_API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-algolia-application-id": process.env.ALGOLIA_APP_ID,
        "x-algolia-api-key": process.env.ALGOLIA_API_KEY, // keep secret on server
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) {
      return { error: true, status: r.status, data };
    }
    return { error: false, data };
  }

  // First call with user/assistant history so far
  let convo = [...messages];

  // We’ll loop: if the agent returns tool calls, we execute them and send back tool results
  // Then we call the agent again, until it returns a normal assistant message.
  for (let safety = 0; safety < 4; safety++) {
    const { error, status, data } = await callAgent({ messages: convo });
    if (error) {
      return { statusCode: status || 500, body: JSON.stringify(data) };
    }

    const last = data?.messages?.[data.messages.length - 1];
    const toolCalls = last?.toolCalls || [];

    // If there are tool calls, fulfill them server-side
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      for (const call of toolCalls) {
        const { id, name, args } = call;

        // Handle your tool(s)
        if (name === "getNoResultSearches") {
          // Call your existing Netlify function to fetch analytics
          const resp = await fetch(
            `${process.env.URL}/.netlify/functions/no-results`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(args || {}),
            }
          );
          const toolData = await resp.json();

          // Push tool result back into the conversation
          convo = [
            ...data.messages,
            {
              role: "tool",
              toolCallId: id,
              name,
              content: JSON.stringify(toolData),
            },
          ];
        } else {
          // Unknown tool: return a graceful empty result
          convo = [
            ...data.messages,
            {
              role: "tool",
              toolCallId: id,
              name,
              content: JSON.stringify({ error: `Unhandled tool: ${name}` }),
            },
          ];
        }
      }
      // Loop again: the agent will now have tool results and should reply normally
      continue;
    }

    // No tool calls: return the agent’s reply to the browser
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: data.messages,
        reply: last?.content || "",
      }),
    };
  }

  return {
    statusCode: 500,
    body: JSON.stringify({ error: "Tool-calling loop exceeded" }),
  };
};
