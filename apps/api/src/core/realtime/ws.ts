import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { verifyAccessToken } from "../utils/jwt.js";

interface ClientMeta {
    userId: string | null;
}

const clients = new Map<WebSocket, ClientMeta>();

/**
 * Browsers cannot set headers on a WebSocket handshake, so authentication happens in the
 * first message: the client sends `{type:"join", token:"<access token>"}` and the identity is
 * derived from the token — never from anything else the client claims.
 *
 * State is in-memory, which assumes a SINGLE API instance. Scaling out means putting
 * Redis pub/sub behind broadcast() before adding a second one.
 */
export function initWebSocketServer(server: HttpServer) {
    const wss = new WebSocketServer({ server, path: "/ws" });

    wss.on("connection", (socket) => {
        clients.set(socket, { userId: null });

        socket.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg?.type === "join" && typeof msg.token === "string") {
                    const payload = verifyAccessToken(msg.token);
                    clients.set(socket, { userId: payload.sub });
                    socket.send(JSON.stringify({ type: "joined" }));
                }
            } catch {
                socket.send(JSON.stringify({ type: "join_failed" }));
            }
        });

        socket.on("close", () => {
            clients.delete(socket);
        });
    });

    return wss;
}

/** Sends an event to every open socket of one user (all their tabs and devices). */
export function broadcastToUser(userId: string, type: string, data: unknown) {
    const payload = JSON.stringify({ type, data });
    for (const [socket, meta] of clients) {
        if (meta.userId === userId && socket.readyState === WebSocket.OPEN) {
            socket.send(payload);
        }
    }
}
