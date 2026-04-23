import { Hono } from "hono";
import { Nip11 } from "nostr-typedef";
export { Relay } from "./relay";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.options("/", (c) => {
  console.log("options");
  c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  return new Response(null, { status: 204 });
});

app.get("/", (c) => {
  console.log("get");
  if (c.req.header("Upgrade") === "websocket") {
    const stub = c.env.RELAY.getByName("relay");
    return stub.fetch(c.req.raw);
  } else if (c.req.header("Accept") === "application/nostr+json") {
    c.header("Access-Control-Allow-Origin", "*");
    return c.json({
      name: "Timecapsule",
      software: "https://github.com/SnowCait/timecapsule",
    } satisfies Nip11.RelayInfo);
  } else {
    return c.notFound();
  }
});

export default app;
