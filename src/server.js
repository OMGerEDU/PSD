import http from "node:http";
import { renderRoute } from "./routes/render.js";

class SimpleReply {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.body = null;
    this.rawPayload = null;
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  header(name, value) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  send(payload) {
    if (payload === undefined || payload === null) {
      this.body = "";
      this.rawPayload = Buffer.alloc(0);
      return;
    }
    if (Buffer.isBuffer(payload)) {
      this.rawPayload = payload;
      this.body = payload.toString("binary");
      return;
    }
    if (typeof payload === "object") {
      const json = JSON.stringify(payload);
      if (!this.headers["content-type"]) {
        this.headers["content-type"] = "application/json";
      }
      this.rawPayload = Buffer.from(json);
      this.body = json;
      return;
    }
    const text = String(payload);
    this.rawPayload = Buffer.from(text);
    this.body = text;
  }
}

class SimpleServer {
  constructor() {
    this.routes = new Map();
    this.server = null;
  }

  routeKey(method, path) {
    return `${method.toUpperCase()} ${path}`;
  }

  registerRoute(method, path, handler) {
    this.routes.set(this.routeKey(method, path), handler);
  }

  get(path, handler) {
    this.registerRoute("GET", path, handler);
  }

  post(path, handler) {
    this.registerRoute("POST", path, handler);
  }

  async ready() {
    return;
  }

  async close() {
    if (!this.server) return;
    await new Promise((resolve, reject) => {
      this.server.close(err => (err ? reject(err) : resolve()));
    });
    this.server = null;
  }

  async inject({ method, url, payload, headers }) {
    const handler = this.routes.get(this.routeKey(method, url));
    if (!handler) {
      return { statusCode: 404, headers: {}, body: "", rawPayload: Buffer.alloc(0) };
    }
    const reply = new SimpleReply();
    const req = { body: payload, headers: headers ?? {}, method: method.toUpperCase(), url };
    await handler(req, reply);
    return {
      statusCode: reply.statusCode,
      headers: reply.headers,
      body: reply.body,
      rawPayload: reply.rawPayload
    };
  }

  listen(options) {
    return new Promise((resolve, reject) => {
      const { host, port } = options;
      this.server = http.createServer(async (req, res) => {
        const chunks = [];
        req.on("data", chunk => chunks.push(chunk));
        req.on("end", async () => {
          const bodyBuffer = Buffer.concat(chunks);
          let body = null;
          if (bodyBuffer.length > 0) {
            const contentType = req.headers["content-type"] ?? "";
            if (typeof contentType === "string" && contentType.includes("application/json")) {
              try {
                body = JSON.parse(bodyBuffer.toString("utf-8"));
              } catch {
                res.statusCode = 400;
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify({ error: "invalid_json" }));
                return;
              }
            } else {
              body = bodyBuffer;
            }
          }

          const handler = this.routes.get(this.routeKey(req.method ?? "GET", req.url ?? "/"));
          if (!handler) {
            res.statusCode = 404;
            res.end();
            return;
          }

          const reply = new SimpleReply();
          try {
            await handler({ body, headers: req.headers, method: req.method, url: req.url }, reply);
            res.statusCode = reply.statusCode;
            for (const [key, value] of Object.entries(reply.headers)) {
              res.setHeader(key, value);
            }
            if (reply.rawPayload) {
              res.end(reply.rawPayload);
            } else if (typeof reply.body === "string") {
              res.end(reply.body);
            } else {
              res.end();
            }
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: "internal_error", message: error?.message ?? "unknown error" }));
          }
        });
      });

      this.server.once("error", reject);
      this.server.listen(port, host, () => {
        resolve(`http://${host}:${port}`);
      });
    });
  }
}

export function buildServer() {
  const app = new SimpleServer();
  app.get("/healthz", async (_req, res) => {
    res = res ?? new SimpleReply();
    res.send({ ok: true });
    return res;
  });
  renderRoute(app);
  return app;
}
