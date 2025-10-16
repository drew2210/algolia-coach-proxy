// Netlify serverless function: POST/GET -> proxies Algolia Analytics API
export async function handler(event) {
  const isPost = event.httpMethod === "POST";
  const args = isPost ? JSON.parse(event.body || "{}") : (event.queryStringParameters || {});
  const {
    index,
    startDate,
    endDate,
    limit = 10,
    offset = 0,
    region = "us",
  } = args;

  if (!index) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing index" }) };
  }

  const qs = new URLSearchParams({
    index,
    limit: String(limit),
    offset: String(offset),
  });
  if (startDate) qs.set("startDate", startDate);
  if (endDate) qs.set("endDate", endDate);

  const url = `https://analytics.${region}.algolia.com/2/searches/noResults?${qs.toString()}`;

  const r = await fetch(url, {
    headers: {
      "x-algolia-application-id": process.env.ALGOLIA_APP_ID,
      "x-algolia-api-key": process.env.ALGOLIA_API_KEY, // analytics/admin key
    },
  });

  const text = await r.text();
  return {
    statusCode: r.status,
    headers: { "content-type": "application/json" },
    body: text,
  };
}
