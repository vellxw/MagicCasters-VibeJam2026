import { createServer } from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { GLOBAL_CHAT_ROOM_NAME, ROOM_NAME } from '../../shared/types.js';
import { handleSplatCollisionDevApi } from './http/splatCollisionDev.js';
import { handleVfxDevApi } from './http/vfxDevApi.js';
import { resolveServerPort, serveClient } from './http/staticClient.js';
import { GlobalChatRoom } from './rooms/GlobalChatRoom.js';
import { MagicDuelRoom } from './rooms/MagicDuelRoom.js';

const port = resolveServerPort(process.env);

const httpServer = createServer((request, response) => {
  if (handleSplatCollisionDevApi(request, response, process.env)) {
    return;
  }

  if (request.url?.startsWith('/api/vfx/')) {
    void (async () => {
      const handled = await handleVfxDevApi(request, response);
      if (!handled) {
        serveClient(request, response);
      }
    })();
    return;
  }

  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, room: ROOM_NAME }));
    return;
  }

  serveClient(request, response);
});

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer
  })
});

gameServer.define(ROOM_NAME, MagicDuelRoom).filterBy(['mode', 'partyCode']);
gameServer.define(GLOBAL_CHAT_ROOM_NAME, GlobalChatRoom);

httpServer.listen(port, () => {
  console.log(`[server] HTTP + Colyseus listening on port ${port}`);
  console.log(`[server] Room: ${ROOM_NAME}`);
  console.log(`[server] Global chat: ${GLOBAL_CHAT_ROOM_NAME}`);
});
