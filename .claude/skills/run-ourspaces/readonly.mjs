// Read-only live session: forward the Convex sync socket both ways but drop
// every client→server Mutation/Action frame, so a headless run never writes
// a member, a presence heartbeat, or an auth sign-in into prod.
export async function makeReadOnly(ctx, dropped = []) {
  await ctx.routeWebSocket(/convex\.cloud/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((msg) => {
      try {
        const data = JSON.parse(typeof msg === "string" ? msg : msg.toString());
        if (data.type === "Mutation" || data.type === "Action") {
          dropped.push(`${data.type}:${data.udfPath}`);
          return;
        }
      } catch {}
      server.send(msg);
    });
    server.onMessage((msg) => ws.send(msg));
  });
  return dropped;
}
