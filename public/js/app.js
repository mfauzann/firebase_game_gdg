import { Game } from './game.js';
import { Network } from './network.js';

class App {
  constructor() {
    this.game = null;
    this.network = null;
    
    // UI elements
    this.lobbyOverlay = document.getElementById('lobby-overlay');
    this.hud = document.getElementById('hud');
    this.usernameInput = document.getElementById('username-input');
    this.joinBtn = document.getElementById('join-btn');
    this.colorGrid = document.getElementById('color-grid');
    this.connectionStatus = document.getElementById('connection-status');
    this.onlineCount = document.getElementById('online-count');
    this.chatLog = document.getElementById('chat-log');
    this.chatInput = document.getElementById('chat-input');
    this.sendChatBtn = document.getElementById('send-chat-btn');
    
    this.selectedColor = '#ff0055'; // Default color matching active CSS button
    this.joined = false;

    this.setupLobby();
  }

  // Set up lobby color selection and validation
  setupLobby() {
    // 1. Color Picker selection handler
    this.colorGrid.addEventListener('click', (e) => {
      const option = e.target.closest('.color-option');
      if (!option) return;

      // Deactivate other options
      this.colorGrid.querySelectorAll('.color-option').forEach(btn => {
        btn.classList.remove('active');
      });

      // Activate selected
      option.classList.add('active');
      this.selectedColor = option.getAttribute('data-color');
    });

    // 2. Nickname input focus or keydown validation
    this.usernameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.joinGame();
      }
    });

    // Set focus on load
    this.usernameInput.focus();

    // 3. Click Join button handler
    this.joinBtn.addEventListener('click', () => {
      this.joinGame();
    });
  }

  joinGame() {
    const rawName = this.usernameInput.value.trim();
    const name = rawName || `Roamer_${Math.floor(100 + Math.random() * 900)}`;
    
    // Create Game engine & Network instances
    this.game = new Game();
    this.network = new Network();

    // Setup network callbacks
    this.setupNetworkCallbacks();
    this.setupHUDActions();

    // Emit Join to server
    this.network.join(name, this.selectedColor);
    
    // Create local player in 3D Engine using current Socket ID (temp assignment, updated on event)
    const tempSocketId = this.network.getSocketId() || 'local';
    this.game.addLocalPlayer(tempSocketId, name, this.selectedColor);

    // Throttle movement network transmissions to 60fps max to save bandwidth
    let lastSendTime = 0;
    this.game.onMoveCallback = (movementData) => {
      const now = performance.now();
      if (now - lastSendTime > 16.67) { // ~60fps throttle limit
        this.network.sendMove(movementData);
        lastSendTime = now;
      }
    };

    // Transition UI Screens
    this.lobbyOverlay.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.joined = true;
    
    // Add welcome log message
    this.addSystemMessage(`You joined the arena as "${name}"!`);
  }

  setupNetworkCallbacks() {
    // A. Connection status update on HUD
    this.network.onConnectionStatusCallback = (status) => {
      this.connectionStatus.innerText = status;
      const statusContainer = this.connectionStatus.parentElement;
      
      if (status === 'CONNECTED') {
        statusContainer.style.color = '#00ffcc';
        // Re-join if reconnected after a loss
        if (this.joined) {
          const name = this.game.localPlayer ? this.game.localPlayer.name : 'Anonymous';
          this.network.join(name, this.selectedColor);
        }
      } else if (status === 'DISCONNECTED') {
        statusContainer.style.color = '#ff0055';
        this.addSystemMessage('Connection lost. Trying to reconnect...');
      } else {
        statusContainer.style.color = '#ffdd00';
      }
    };

    // B. Sync active player positions on connection start
    this.network.onCurrentPlayersCallback = (players) => {
      const myId = this.network.getSocketId();
      
      // Update local player ID to match real socket ID
      if (this.game.localPlayer && myId) {
        this.game.localPlayerId = myId;
        this.game.localPlayer.id = myId;
        // Rename element label mapping ID
        const oldLabel = document.getElementById('label-local');
        if (oldLabel) oldLabel.id = `label-${myId}`;
      }

      // Add remote players
      for (const id in players) {
        if (id !== myId) {
          this.game.addRemotePlayer(id, players[id]);
        }
      }
      this.updateOnlineCount();
    };

    // C. Handle new player entry
    this.network.onPlayerJoinedCallback = (playerData) => {
      this.game.addRemotePlayer(playerData.id, playerData);
      this.addSystemMessage(`${playerData.name} joined the arena.`);
      this.updateOnlineCount();
    };

    // D. Interpolate positions for moving players
    this.network.onPlayerMovedCallback = (movementData) => {
      this.game.updateRemotePlayerTarget(
        movementData.id, 
        movementData.position, 
        movementData.rotation,
        movementData.actionState
      );
    };

    // E. Relaying incoming chats
    this.network.onChatMessageCallback = (chatData) => {
      // Add message to logging HUD
      this.addChatMessage(chatData.name, chatData.message, chatData.id === this.network.getSocketId());
      
      // Create speech bubble floating on top of player's 3D mesh
      this.game.showChatBubble(chatData.id, chatData.message);
    };

    // F. Relaying actions and particle triggers
    this.network.onPlayerEmoteCallback = (emoteData) => {
      this.game.triggerEmote(emoteData.id, emoteData.emote);
    };

    // G. Handling disconnects
    this.network.onPlayerLeftCallback = (socketId) => {
      const rp = this.game.remotePlayers[socketId];
      if (rp) {
        this.addSystemMessage(`${rp.name} left the arena.`);
        this.game.removeRemotePlayer(socketId);
        this.updateOnlineCount();
      }
    };
  }

  // Setup hud controllers (chat clicks, input, emotes buttons)
  setupHUDActions() {
    // 1. Chat input focus and transmit
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (document.activeElement === this.chatInput) {
          // If already typing, transmit and unfocus
          this.sendChat();
        } else {
          // If not typing, focus input box
          this.chatInput.focus();
          e.preventDefault();
        }
      }
    });

    this.sendChatBtn.addEventListener('click', () => {
      this.sendChat();
    });

    // 2. Emote panel click triggers
    document.querySelectorAll('.emote-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoteType = btn.getAttribute('data-emote');
        // Trigger locally
        this.game.triggerEmote(this.network.getSocketId(), emoteType);
        // Transmit to server
        this.network.sendEmote(emoteType);
      });
    });
  }

  sendChat() {
    const text = this.chatInput.value.trim();
    if (text) {
      this.network.sendChat(text);
    }
    this.chatInput.value = '';
    this.chatInput.blur();
  }

  // Log panels modifiers
  addChatMessage(sender, message, isSelf) {
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message';
    if (isSelf) msgEl.style.opacity = '0.9';

    const senderSpan = document.createElement('span');
    senderSpan.className = 'sender';
    senderSpan.innerText = sender + ':';
    senderSpan.style.color = isSelf ? '#ffffff' : 'var(--glow-blue)';

    const textSpan = document.createElement('span');
    textSpan.innerText = message;

    msgEl.appendChild(senderSpan);
    msgEl.appendChild(textSpan);
    this.chatLog.appendChild(msgEl);

    // Scroll to bottom
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  addSystemMessage(message) {
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message system';
    msgEl.innerText = `[System] ${message}`;
    this.chatLog.appendChild(msgEl);
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  updateOnlineCount() {
    // Total players = remote players count + 1 (local)
    const count = Object.keys(this.game.remotePlayers).length + 1;
    this.onlineCount.innerText = count;
  }
}

// Instantiate on load
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
