// Network layer using Socket.io client

export class Network {
  constructor() {
    this.socket = null;
    
    // Callbacks registered by app.js
    this.onCurrentPlayersCallback = null;
    this.onPlayerJoinedCallback = null;
    this.onPlayerMovedCallback = null;
    this.onPlayerLeftCallback = null;
    this.onChatMessageCallback = null;
    this.onPlayerEmoteCallback = null;
    this.onConnectionStatusCallback = null;
    
    this.init();
  }

  init() {
    // Connect to the socket server hosted on same origin
    this.socket = io();

    // Connection lifecycle events
    this.socket.on('connect', () => {
      console.log(`[Network] Connected to server. Socket ID: ${this.socket.id}`);
      if (this.onConnectionStatusCallback) {
        this.onConnectionStatusCallback('CONNECTED');
      }
    });

    this.socket.on('disconnect', () => {
      console.log('[Network] Disconnected from server');
      if (this.onConnectionStatusCallback) {
        this.onConnectionStatusCallback('DISCONNECTED');
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Network] Connection Error:', error);
      if (this.onConnectionStatusCallback) {
        this.onConnectionStatusCallback('RECONNECTING...');
      }
    });

    // Game synchronization events
    this.socket.on('currentPlayers', (players) => {
      if (this.onCurrentPlayersCallback) {
        this.onCurrentPlayersCallback(players);
      }
    });

    this.socket.on('playerJoined', (playerData) => {
      if (this.onPlayerJoinedCallback) {
        this.onPlayerJoinedCallback(playerData);
      }
    });

    this.socket.on('playerMoved', (movementData) => {
      if (this.onPlayerMovedCallback) {
        this.onPlayerMovedCallback(movementData);
      }
    });

    this.socket.on('chatMessage', (chatData) => {
      if (this.onChatMessageCallback) {
        this.onChatMessageCallback(chatData);
      }
    });

    this.socket.on('playerEmote', (emoteData) => {
      if (this.onPlayerEmoteCallback) {
        this.onPlayerEmoteCallback(emoteData);
      }
    });

    this.socket.on('playerLeft', (socketId) => {
      if (this.onPlayerLeftCallback) {
        this.onPlayerLeftCallback(socketId);
      }
    });
  }

  // Emitters
  join(name, color) {
    this.socket.emit('join', { name, color });
  }

  sendMove(movementData) {
    // Send movement payload: { position: {x,y,z}, rotation: {y}, actionState }
    this.socket.emit('move', movementData);
  }

  sendChat(message) {
    this.socket.emit('chat', message);
  }

  sendEmote(emoteType) {
    this.socket.emit('emote', emoteType);
  }

  getSocketId() {
    return this.socket ? this.socket.id : null;
  }
}
