import {WebSocket, WebSocketServer} from 'ws';
import {wsArcjet} from "../arcjet.js";

function sendJson(socket, payload) {
    if(socket.readyState !== WebSocket.OPEN) return;

    socket.send(JSON.stringify(payload));
}


function broadcast(wss, payload) {
    for(const client of wss.clients) {
        if(client.readyState !== WebSocket.OPEN) continue;

        client.send(JSON.stringify(payload));
    }
}


export function attachWebSocketServer(server){

    const wss = new WebSocketServer({
        noServer: true,
    });

    server.on('upgrade', async (req, socket, head) => {
        if (!req.url || !req.url.startsWith('/ws')) {
            return; // not our path; let other handlers manage
        }

        if (wsArcjet) {
            try {
                const decision = await wsArcjet.protect(req);

                if (decision.isDenied()) {
                    const isRateLimit = decision.reason?.isRateLimit?.() === true;
                    const statusLine = isRateLimit ? 'HTTP/1.1 429 Too Many Requests\r\n' : 'HTTP/1.1 403 Forbidden\r\n';
                    const body = isRateLimit ? 'Rate limit exceeded' : 'Access denied';
                    const headers =
                        'Connection: close\r\n' +
                        'Content-Type: text/plain; charset=utf-8\r\n' +
                        'Content-Length: ' + Buffer.byteLength(body) + '\r\n\r\n';

                    try { socket.write(statusLine + headers + body); } catch {}
                    socket.destroy();
                    return;
                }

                if (typeof decision.isChallenged === 'function' && decision.isChallenged()) {
                    const statusLine = 'HTTP/1.1 403 Forbidden\r\n';
                    const body = 'Verification required';
                    const headers =
                        'Connection: close\r\n' +
                        'Content-Type: text/plain; charset=utf-8\r\n' +
                        'Content-Length: ' + Buffer.byteLength(body) + '\r\n\r\n';

                    try { socket.write(statusLine + headers + body); } catch {}
                    socket.destroy();
                    return;
                }
            } catch (e) {
                console.error('WS upgrade protection error', e);
                try { socket.destroy(); } catch {}
                return;
            }
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    });

    wss.on('connection', async (socket, req) => {

        socket.isAlive = true;
        socket.on('pong', ()=>{ socket.isAlive = true });

        sendJson(socket,  {type:'welcome'} );
        socket.on('error', console.error);
    });

    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    },30000);

    wss.on('close', () => clearInterval(interval) );

    function broadcastMatchCreated(match){
        broadcast(wss, {type: 'match_created', data: match})
    }

    return { broadcastMatchCreated }

}