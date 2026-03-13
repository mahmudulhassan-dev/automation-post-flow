const http = require("http");
const { URL } = require("url");

const port = Number(process.env.PORT || 5050);

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function collectBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve({ raw: Buffer.concat(chunks).toString("utf8") });
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { status: "ok", service: "amanaflow-mock-api", now: new Date().toISOString() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/generate") {
    const body = await collectBody(req);
    sendJson(res, 200, {
      model: body.model || "gemini-2.5-pro",
      output: `Generated content for: ${body.prompt || "(no prompt)"}`,
      delay: body.delay || 5
    });
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/payments/")) {
    const gateway = url.pathname.split("/")[3] || "unknown";
    sendJson(res, 200, {
      gateway,
      status: "session-created",
      payment_url: `https://sandbox.${gateway}.amanaflow.com/session/demo`
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(port, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`Amanaflow mock API running on http://127.0.0.1:${port}`);
});
