import express from "express";
import {matchRouter} from "./routes/matches.js";
import * as http from "node:http";
import {attachWebSocketServer} from "./ws/server.js";
import {securityMiddleware} from "./arcjet.js";

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';

 const app = express();
 const server = http.createServer(app);

app.use(express.json());

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Express Server</title>
            <style>
                body {
                    background-color: black;
                    color: white;
                    font-family: sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }
            </style>
        </head>
        <body>
            <h1>Hello from Express server</h1>
        </body>
        </html>
    `);
});


app.use(securityMiddleware());

app.use('/matches',matchRouter)

const { broadcastMatchCreated } = attachWebSocketServer(server);
app.locals.broadcastMatchCreated = broadcastMatchCreated;

server.listen(PORT, HOST,()=>{
    const baseUrl = HOST === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;

    console.log("Server is running on port ", baseUrl);
    console.log(`WebSocket Server is running on ${baseUrl.replace('http', 'ws')}/ws`);
});


