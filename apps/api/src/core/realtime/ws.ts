import type { Server as HttpServer, IncomingMessage } from "node:http";
import { ACCESS_TOKEN_COOKIE } from "shared";
import { WebSocket, WebSocketServer } from "ws";
import { parseCookies } from "../http/cookies.js";
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
 * A browser on the web surface has no token to send — it is in an httpOnly cookie it cannot
 * read — but the browser DOES attach that cookie to the upgrade request by itself. So the
 * cookie is checked first and such a socket is authenticated before its first message.
 *
 * State is in-memory, which assumes a SINGLE API instance. Scaling out means putting
 * Redis pub/sub behind broadcast() before adding a second one.
 */
export function initWebSocketServer(server: HttpServer) {
    const wss = new WebSocketServer({ server, path: "/ws" });

    wss.on("connection", (socket, request: IncomingMessage) => {
        const userId = fromAccessCookie(request);
        clients.set(socket, { userId });
        // A cookie-authenticated browser is already in; telling it so keeps it from waiting
        // for a join it has no token to send.
        if (userId) socket.send(JSON.stringify({ type: "joined" }));

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

/** The web surface's handshake: the access cookie rides along on the upgrade request. */
function fromAccessCookie(request: IncomingMessage): string | null {
    const token = parseCookies(request.headers.cookie)[ACCESS_TOKEN_COOKIE];
    if (!token) return null;
    try {
        return verifyAccessToken(token).sub;
    } catch {
        // Expired or forged: fall back to the join message rather than closing the socket.
        return null;
    }
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
