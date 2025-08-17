// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://reversus-game.dke42d.easypanel.host", "https://reversus.online"],
    methods: ["GET", "POST"]
  }
});

// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// Serve index.html for the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Game Logic on Server ---
// These would be imported from your game logic files, adapted for Node.js
const VALUE_DECK_CONFIG = [{ value: 2, count: 12 }, { value: 4, count: 10 }, { value: 6, count: 8 }, { value: 8, count: 6 }, { value: 10, count: 4 }];
const EFFECT_DECK_CONFIG = [{ name: 'Mais', count: 4 }, { name: 'Menos', count: 4 }, { name: 'Sobe', count: 4 }, { name: 'Desce', count: 4 }, { name: 'Pula', count: 4 }, { name: 'Reversus', count: 4 }, { name: 'Reversus Total', count: 1 }];
const MASTER_PLAYER_IDS = ['player-1', 'player-2', 'player-3', 'player-4'];
const WINNING_POSITION = 10;
const MAX_VALUE_CARDS_IN_HAND = 3;
const MAX_EFFECT_CARDS_IN_HAND = 2;


const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

const createDeck = (config, cardType) => {
    let idCounter = 0;
    return config.flatMap(item => Array.from({ length: item.count }, () => {
        const cardData = 'value' in item ? { name: item.value, value: item.value } : { name: item.name };
        return { id: Date.now() + Math.random() + idCounter++, type: cardType, ...cardData };
    }));
};

const generateBoardPaths = () => {
    const paths = [];
    for (let i = 0; i < 6; i++) {
        const spaces = Array.from({ length: 9 }, (_, j) => ({
            id: j + 1, color: 'white', effectName: null, isUsed: false
        }));
        paths.push({ id: i, spaces });
    }
    return paths;
};
// --- End Game Logic ---


// In-memory store for game rooms and states
const rooms = {};

function getRoomsList() {
    return Object.values(rooms)
        .filter(r => !r.gameStarted)
        .map(r => ({
            id: r.id,
            name: r.name,
            playerCount: r.players.length,
            mode: r.mode,
        }));
}

function sendStateToPlayers(roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameState) return;

    room.players.forEach(client => {
        const personalizedState = {
            ...room.gameState,
            players: {},
            myPlayerId: client.playerId,
        };

        // Create a personalized view of each player
        for (const pId in room.gameState.players) {
            const player = room.gameState.players[pId];
            const isMe = pId === client.playerId;

            personalizedState.players[pId] = {
                ...player,
                hand: isMe ? player.hand : player.hand.map(card => ({ ...card, isHidden: true })),
            };
        }

        io.to(client.id).emit('gameStateUpdate', personalizedState);
    });
}


io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    socket.emit('connected', { clientId: socket.id });

    socket.on('listRooms', () => {
        socket.emit('roomList', getRoomsList());
    });

    socket.on('createRoom', (username) => {
        const roomId = `room-${Date.now()}`;
        const roomName = `Sala de ${username}`;
        rooms[roomId] = {
            id: roomId,
            name: roomName,
            hostId: socket.id,
            players: [],
            gameState: null,
            gameStarted: false,
            mode: 'solo-4p', // Default mode
        };
        console.log(`Room created: ${roomId}`);
        io.emit('roomList', getRoomsList());
        socket.emit('roomCreated', roomId);
    });

    socket.on('joinRoom', ({ roomId, username }) => {
        const room = rooms[roomId];
        if (room && room.players.length < 4) {
            const newPlayer = { id: socket.id, username, playerId: `player-${room.players.length + 1}` };
            room.players.push(newPlayer);
            socket.join(roomId);
            socket.data.roomId = roomId;

            console.log(`${username} joined ${roomId}`);
            
            const roomData = {
                id: room.id,
                name: room.name,
                hostId: room.hostId,
                players: room.players.map(p => ({ id: p.id, username: p.username, playerId: p.playerId })),
                mode: room.mode,
            };

            io.to(roomId).emit('lobbyUpdate', roomData);
            io.emit('roomList', getRoomsList());
        } else {
            socket.emit('error', 'Sala cheia ou não existe.');
        }
    });

    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (room && room.hostId === socket.id && !room.gameStarted) {
             room.gameStarted = true;
             io.emit('roomList', getRoomsList());

             // --- Initialize Game State on Server ---
             const playerIdsInGame = room.players.map(p => p.playerId);
             const players = {};
             room.players.forEach(p_client => {
                 players[p_client.playerId] = {
                     id: p_client.playerId,
                     name: p_client.username,
                     isHuman: true,
                     hand: [],
                     // ... other initial player properties
                     pathId: playerIdsInGame.indexOf(p_client.playerId),
                     position: 1,
                     resto: null,
                     nextResto: null,
                     effects: { score: null, movement: null },
                     playedCards: { value: [], effect: [] },
                     playedValueCardThisTurn: false,
                     liveScore: 0,
                 }
             });

             const valueDeck = shuffle(createDeck(VALUE_DECK_CONFIG, 'value'));
             const effectDeck = shuffle(createDeck(EFFECT_DECK_CONFIG, 'effect'));

             // Deal cards
             Object.values(players).forEach(p => {
                 for(let i=0; i < MAX_VALUE_CARDS_IN_HAND; i++) p.hand.push(valueDeck.pop());
                 for(let i=0; i < MAX_EFFECT_CARDS_IN_HAND; i++) p.hand.push(effectDeck.pop());
             });
             
             room.gameState = {
                players,
                playerIdsInGame,
                decks: { value: valueDeck, effect: effectDeck },
                discardPiles: { value: [], effect: [] },
                boardPaths: generateBoardPaths(),
                gamePhase: 'playing',
                currentPlayer: 'player-1',
                turn: 1,
                log: [`O jogo começou na ${room.name}!`],
                // ... other initial game state properties
             };
             
             io.to(roomId).emit('gameStarted');
             sendStateToPlayers(roomId);
        }
    });
    
     socket.on('playCard', (data) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const state = room.gameState;
        const player = state.players[data.playerId];
        const card = player.hand.find(c => c.id === data.cardId);

        // TODO: Add robust validation here (is it their turn? is the move legal?)

        // Simple logic for now: move card from hand to played
        const cardIndex = player.hand.findIndex(c => c.id === data.cardId);
        if (cardIndex > -1) {
            player.hand.splice(cardIndex, 1);
            if(card.type === 'value') {
                player.playedCards.value.push(card);
            } else {
                 state.players[data.targetId].playedCards.effect.push(card);
            }
             state.log.unshift(`${player.name} jogou a carta ${card.name}.`);
        }
        
        sendStateToPlayers(roomId);
    });

    socket.on('endTurn', (playerId) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const state = room.gameState;
        
        // TODO: Add validation (is it their turn?)

        const currentIndex = state.playerIdsInGame.indexOf(playerId);
        const nextIndex = (currentIndex + 1) % state.playerIdsInGame.length;
        state.currentPlayer = state.playerIdsInGame[nextIndex];
        
        state.log.unshift(`${state.players[playerId].name} passou o turno.`);

        sendStateToPlayers(roomId);
    });
    
    socket.on('chatMessage', (message) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const player = room.players.find(p => p.id === socket.id);
        if(player) {
            io.to(roomId).emit('chatMessage', { speaker: player.username, message });
        }
    });


    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const roomId = socket.data.roomId;
        if(roomId && rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
                console.log(`Room deleted: ${roomId}`);
            } else {
                // If the host disconnects, assign a new host
                if (rooms[roomId].hostId === socket.id) {
                    rooms[roomId].hostId = rooms[roomId].players[0].id;
                }
                const roomData = {
                    id: rooms[roomId].id,
                    name: rooms[roomId].name,
                    hostId: rooms[roomId].hostId,
                    players: rooms[roomId].players.map(p => ({ id: p.id, username: p.username, playerId: p.playerId })),
                    mode: rooms[roomId].mode,
                };
                 io.to(roomId).emit('lobbyUpdate', roomData);
            }
             io.emit('roomList', getRoomsList());
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});