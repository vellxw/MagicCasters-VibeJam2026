import { createServer } from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '../../shared/types.js';
import { MagicDuelRoom } from './rooms/MagicDuelRoom.js';

const port = Number(process.env.SERVER_PORT ?? 3001);

const httpServer = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, room: ROOM_NAME }));
    return;
  }

  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('VibeJam Magic Duel Colyseus server');
});

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer
  })
});

gameServer.define(ROOM_NAME, MagicDuelRoom);

httpServer.listen(port, () => {
  console.log(`[server] Colyseus listening on ws://localhost:${port}`);
  console.log(`[server] Room: ${ROOM_NAME}`);
});
