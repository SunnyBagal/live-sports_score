import {WebSocket, WebSocketServer} from 'ws';
import {wsArcjet} from "../arcjet.js";

const matchSubscribers = new Map();

function subscribe(matchId, socket) {
    if(!matchSubscribers.has(matchId)){
        matchSubscribers.set(matchId, new Set());
    }
    matchSubscribers.get(matchId).add(socket);
}

function unsubscribe(matchId, socket) {
    const subscribers = matchSubscribers.get(matchId);
    if(!subscribers) return null;
    subscribers.delete(socket);
    if(subscribers.size === 0) {
        matchSubscribers.delete(matchId);
    }
}

function cleanupSubscriptions(socket){
    for(const matchId of socket.subscriptions){
        unsubscribe(matchId, socket);
    }
}


function sendJson(socket, payload) {
    if(socket.readyState !== WebSocket.OPEN) return;

    socket.send(JSON.stringify(payload));
}


function broadcastToAll(wss, payload) {
    for(const client of wss.clients) {
        if(client.readyState !== WebSocket.OPEN) continue;
        client.send(JSON.stringify(payload));
    }
}

function broadcastToMatch(matchId, payload){
     const subscribers = matchSubscribers.get(matchId);
     if(!subscribers || subscribers.size === 0) return null;
     const message = JSON.stringify(payload);

     for(const client of subscribers){
         if(client.readyState === WebSocket.OPEN){
             client.send(message);
         }
     }
}

function handleMessage(socket, data){
    let message;
    try {
        message = JSON.parse(data.toString());
    } catch(e){
        sendJson(socket, {type: 'ERROR', message: 'Invalid JSON'});
    }

    if(message ?.type === "subscribe" && Number.isInteger(message.matchId)) {
        subscribe(message.matchId, socket);
        socket.subscriptions.add(message.matchId);
        sendJson(socket, { type: 'subscribed', matchId:  message.matchId });
        return;
    }

    if(message?.type === "unsubscribe" && Number.isInteger(message.matchId)) {
        unsubscribe(message.matchId, socket);
        socket.subscriptions.delete(message.matchId);
        sendJson(socket, { type: 'unsubscribed', matchId:  message.matchId });
    }
}

export function attachWebSocketServer(server){

    const wss = new WebSocketServer({
        noServer: true,
    });
    server.wss = wss;
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

        socket.subscriptions = new Set();

        sendJson(socket,  {type:'welcome'} );

        socket.on('message',(data)=>{
            handleMessage(socket, data);
        });
        socket.on('error',()=>{
            socket.terminate();
        });
        socket.on('close',()=>{
            cleanupSubscriptions(socket);
        });

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
        broadcastToAll(wss, {type: 'match_created', data: match})
    }

    function broadcastCommentary(matchId, comment){
        broadcastToMatch(matchId, { type: 'commentary', data: comment});
    }

    return { broadcastMatchCreated, broadcastCommentary };

}