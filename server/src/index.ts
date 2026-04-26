import { createServer } from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '../../shared/types.js';
import { resolveServerPort, serveClient } from './http/staticClient.js';
import { MagicDuelRoom } from './rooms/MagicDuelRoom.js';

const port = resolveServerPort(process.env);

const httpServer = createServer((request, response) => {
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

gameServer.define(ROOM_NAME, MagicDuelRoom);

httpServer.listen(port, () => {
  console.log(`[server] HTTP + Colyseus listening on port ${port}`);
  console.log(`[server] Room: ${ROOM_NAME}`);
});
