const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Store active players
// Schema: { [socketId]: { id, name, color, position: {x, y, z}, rotation: {y}, actionState } }
const players = {};

io.on('connection', (socket) => {
  console.log(`[Server] Client connected: ${socket.id}`);

  // Send current players to the new client (un-authenticated until they join)
  socket.emit('currentPlayers', players);

  // Handle player joining
  socket.on('join', (playerData) => {
    console.log(`[Server] Player joined: ${playerData.name} (${socket.id})`);
    
    // Create new player entry
    players[socket.id] = {
      id: socket.id,
      name: playerData.name || 'Anonymous Player',
      color: playerData.color || '#ff0055',
      position: { x: (Math.random() - 0.5) * 15, y: 1.0, z: (Math.random() - 0.5) * 15 },
      rotation: { y: 0 },
      actionState: 'idle'
    };

    // Broadcast the new player to all other players
    socket.broadcast.emit('playerJoined', players[socket.id]);
    
    // Send full players list including self back to the player
    socket.emit('currentPlayers', players);
  });

  // Handle player movement
  socket.on('move', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].position = movementData.position;
      players[socket.id].rotation = movementData.rotation;
      players[socket.id].actionState = movementData.actionState || 'idle';

      // Broadcast position to all other players
      // Using volatile to skip stale messages if connection bottlenecks
      socket.volatile.broadcast.emit('playerMoved', {
        id: socket.id,
        position: players[socket.id].position,
        rotation: players[socket.id].rotation,
        actionState: players[socket.id].actionState
      });
    }
  });

  // Handle chat messages
  socket.on('chat', (message) => {
    if (players[socket.id]) {
      console.log(`[Chat] ${players[socket.id].name}: ${message}`);
      io.emit('chatMessage', {
        id: socket.id,
        name: players[socket.id].name,
        message: message
      });
    }
  });

  // Handle player emotes
  socket.on('emote', (emoteType) => {
    if (players[socket.id]) {
      console.log(`[Emote] ${players[socket.id].name} triggered: ${emoteType}`);
      io.emit('playerEmote', {
        id: socket.id,
        emote: emoteType
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (players[socket.id]) {
      console.log(`[Server] Player left: ${players[socket.id].name} (${socket.id})`);
      delete players[socket.id];
      io.emit('playerLeft', socket.id);
    } else {
      console.log(`[Server] Socket disconnected: ${socket.id}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  3D Multiplayer Game server running locally!      `);
  console.log(`  Access it at: http://localhost:${PORT}           `);
  console.log(`==================================================`);
});
