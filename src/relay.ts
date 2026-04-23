import { DurableObject, env } from "cloudflare:workers";
import { Event } from "nostr-typedef";
import { createRxNostr, now } from "rx-nostr";

export class Relay extends DurableObject {
  fetch(): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof message !== "string") {
      return;
    }

    try {
      const [type, ...args] = JSON.parse(message);
      switch (type) {
        case "EVENT": {
          const event = args[0] as Event;
          const publishAt = event.created_at;
          const _now = now();
          if (publishAt <= _now) {
            ws.send(
              JSON.stringify([
                "OK",
                event.id,
                false,
                "blocked: this relay accepts only future events",
              ]),
            );
            break;
          } else if (publishAt > _now + 24 * 60 * 60) {
            ws.send(
              JSON.stringify([
                "OK",
                event.id,
                false,
                "blocked: currently accepts events within 24 hours",
              ]),
            );
            break;
          }
          await this.ctx.storage.put([event.id, publishAt].join(":"), event);
          await this.ctx.storage.setAlarm(publishAt * 1000);
          ws.send(JSON.stringify(["OK", event.id, true, ""]));
          break;
        }
        default: {
          ws.send(
            JSON.stringify([
              "NOTICE",
              "unsupported: this relay supports only EVENT",
            ]),
          );
        }
      }
    } catch {
      ws.send(JSON.stringify(["NOTICE", "error: something wrong"]));
    }
  }

  async alarm(): Promise<void> {
    const events = await this.ctx.storage.list<Event>();
    const rxNostr = createRxNostr();
    rxNostr.setDefaultRelays(env.DEFAULT_RELAYS);
    const { promise, resolve } = Promise.withResolvers<void>();
    const _now = now();
    for (const [key, event] of events) {
      const [, publishAt] = key.split(":");
      if (Number(publishAt) > _now) {
        continue;
      }
      console.log({ event });
      await this.ctx.storage.delete(key);
      rxNostr.send(event).subscribe({
        complete: async () => {
          await this.ctx.storage.delete(key);
          resolve();
        },
      });
    }
    await promise;
    rxNostr.dispose();
  }
}
