// server.js --- SERVIDOR DE JOGO PVP COMPLETO ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Configuração de CORS para permitir conexões do seu domínio de jogo
const io = new Server(server, {
  cors: {
    origin: ["https://reversus.online", "https://reversus-game.dke42d.easypanel.host", "http://localhost:8080"],
    methods: ["GET", "POST"]
  }
});

// --- LÓGICA DE JOGO COMPLETA NO SERVIDOR ---
const VALUE_DECK_CONFIG = [{ value: 2, count: 12 }, { value: 4, count: 10 }, { value: 6, count: 8 }, { value: 8, count: 6 }, { value: 10, count: 4 }];
const EFFECT_DECK_CONFIG = [{ name: 'Mais', count: 4 }, { name: 'Menos', count: 4 }, { name: 'Sobe', count: 4 }, { name: 'Desce', count: 4 }, { name: 'Pula', count: 4 }, { name: 'Reversus', count: 4 }, { name: 'Reversus Total', count: 1 }];
const MAX_VALUE_CARDS_IN_HAND = 3;
const MAX_EFFECT_CARDS_IN_HAND = 2;
const WINNING_POSITION = 10;
const TEAM_A_IDS = ['player-1', 'player-3'];
const TEAM_B_IDS = ['player-2', 'player-4'];
const NUM_PATHS = 6;
const BOARD_SIZE = 9;

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
    for (let i = 0; i < NUM_PATHS; i++) {
        const spaces = Array.from({ length: BOARD_SIZE }, (_, j) => ({
            id: j + 1, color: 'white', effectName: null, isUsed: false
        }));
        paths.push({ id: i, spaces });
    }
    return paths;
};

const dealCard = (gameState, deckType) => {
    if (gameState.decks[deckType].length === 0) {
        if (gameState.discardPiles[deckType].length > 0) {
            gameState.decks[deckType] = shuffle([...gameState.discardPiles[deckType]]);
            gameState.discardPiles[deckType] = [];
        } else {
             const configDeck = deckType === 'value' ? VALUE_DECK_CONFIG : EFFECT_DECK_CONFIG;
             gameState.decks[deckType] = shuffle(createDeck(configDeck, deckType));
        }
    }
    return gameState.decks[deckType].pop();
};

// Armazenamento em memória para as salas de jogo
const rooms = {};

// --- FUNÇÕES HELPER DO SERVIDOR ---
function getLobbyDataForRoom(room) {
    return {
        id: room.id,
        name: room.name,
        hostId: room.hostId,
        players: room.players.map(p => ({ id: p.id, username: p.username, playerId: p.playerId })),
        mode: room.mode,
    };
}

function getPublicRoomsList() {
    return Object.values(rooms)
        .filter(r => !r.gameStarted)
        .map(r => ({
            id: r.id,
            name: r.name,
            playerCount: r.players.length,
            mode: r.mode,
        }));
}

// Envia o estado do jogo para todos na sala, personalizando para cada jogador
function broadcastGameState(roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameState) return;

    room.players.forEach(client => {
        const personalizedState = {
            ...room.gameState,
            myPlayerId: client.playerId,
        };
        io.to(client.id).emit('gameStateUpdate', personalizedState);
    });
}
// --- FIM DAS FUNÇÕES HELPER ---


io.on('connection', (socket) => {
    console.log(`Jogador conectado: ${socket.id}`);

    socket.on('listRooms', () => {
        socket.emit('roomList', getPublicRoomsList());
    });

    socket.on('createRoom', ({ username }) => {
        const roomId = `room-${Date.now()}`;
        const roomName = `Sala de ${username || 'Anônimo'}`;
        rooms[roomId] = {
            id: roomId,
            name: roomName,
            hostId: socket.id,
            players: [],
            gameStarted: false,
            mode: 'solo-4p',
            gameState: null
        };
        console.log(`Sala criada: ${roomId} por ${username}`);
        socket.emit('roomCreated', roomId);
        io.emit('roomList', getPublicRoomsList());
    });

    socket.on('joinRoom', ({ roomId, username }) => {
        const room = rooms[roomId];
        if (room && !room.gameStarted && room.players.length < 4) {
            socket.data.roomId = roomId;
            socket.join(roomId);

            const newPlayer = { id: socket.id, username, playerId: `player-${room.players.length + 1}` };
            room.players.push(newPlayer);
            
            console.log(`${username} entrou na sala ${roomId}`);
            
            io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
            io.emit('roomList', getPublicRoomsList());
        } else {
            socket.emit('error', 'A sala está cheia, já começou ou não existe.');
        }
    });
    
    socket.on('changeMode', (newMode) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (room && room.hostId === socket.id) {
            room.mode = newMode;
            console.log(`Sala ${roomId} mudou para o modo ${newMode}`);
            io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
        }
    });

    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.hostId !== socket.id || room.gameStarted) return;
        
        const playerCount = room.players.length;
        let isValidStart = false;
        switch (room.mode) {
            case 'solo-2p': isValidStart = playerCount === 2; break;
            case 'solo-3p': isValidStart = playerCount === 3; break;
            case 'solo-4p': isValidStart = playerCount === 4; break;
            case 'duo': isValidStart = playerCount === 4; break;
        }

        if (!isValidStart) {
            socket.emit('error', 'O número de jogadores é incorreto para o modo de jogo selecionado.');
            return;
        }

        room.gameStarted = true;
        io.emit('roomList', getPublicRoomsList());

        const playerClients = room.players;
        const playerIdsInGame = playerClients.map(p => p.playerId);
        
        const valueDeck = shuffle(createDeck(VALUE_DECK_CONFIG, 'value'));
        const effectDeck = shuffle(createDeck(EFFECT_DECK_CONFIG, 'effect'));

        const drawnCards = {};
        playerIdsInGame.forEach(id => { drawnCards[id] = valueDeck.pop(); });
        const sortedPlayers = [...playerIdsInGame].sort((a, b) => (drawnCards[b]?.value || 0) - (drawnCards[a]?.value || 0));
        let startingPlayer = sortedPlayers[0];
        
        if (sortedPlayers.length > 1 && drawnCards[sortedPlayers[0]]?.value === drawnCards[sortedPlayers[1]]?.value) {
            startingPlayer = sortedPlayers[Math.floor(Math.random() * sortedPlayers.length)];
        }

        const playersState = {};
        playerClients.forEach((clientPlayer, index) => {
            const pId = clientPlayer.playerId;
            playersState[pId] = {
                id: pId, name: clientPlayer.username, isHuman: true,
                hand: [], pathId: index, position: 1,
                resto: drawnCards[pId], 
                nextResto: null, effects: { score: null, movement: null },
                playedCards: { value: [], effect: [] }, playedValueCardThisTurn: false,
                liveScore: 0, status: 'neutral', isEliminated: false,
            };
            for (let i = 0; i < MAX_VALUE_CARDS_IN_HAND; i++) playersState[pId].hand.push(valueDeck.pop());
            for (let i = 0; i < MAX_EFFECT_CARDS_IN_HAND; i++) playersState[pId].hand.push(effectDeck.pop());
        });

        const initialGameState = {
            playerIdsInGame,
            players: playersState,
            decks: { value: valueDeck, effect: effectDeck },
            discardPiles: { value: Object.values(drawnCards), effect: [] },
            boardPaths: generateBoardPaths(),
            gamePhase: 'playing', gameMode: room.mode, 
            currentPlayer: startingPlayer,
            turn: 1, 
            log: [`O jogo começou na ${room.name}!`, `${playersState[startingPlayer].name} começa jogando.`],
            reversusTotalActive: false, consecutivePasses: 0,
            activeFieldEffects: [], 
            revealedHands: [],
        };
        
        if (room.mode === 'duo') {
            initialGameState.teamA = TEAM_A_IDS.filter(id => playerIdsInGame.includes(id));
            initialGameState.teamB = TEAM_B_IDS.filter(id => playerIdsInGame.includes(id));
        }

        room.gameState = initialGameState;

        playerClients.forEach(client => {
            const personalizedState = {
                ...initialGameState,
                myPlayerId: client.playerId,
            };
            io.to(client.id).emit('gameStarted', personalizedState);
        });
        console.log(`Jogo iniciado na sala ${roomId} no modo ${room.mode}`);
    });
    
    // Placeholder for playCard logic
    socket.on('playCard', (data) => {
        // TODO: Implement authoritative server logic for playing a card
        // This would involve validating the move, updating room.gameState, and broadcasting.
        // For now, we are letting the client handle this to get it working.
    });

    // Placeholder for endTurn logic
    socket.on('endTurn', (data) => {
         // TODO: Implement authoritative server logic for ending a turn
    });

    socket.on('lobbyChatMessage', (message) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const player = room?.players.find(p => p.id === socket.id);
        if (player) {
            io.to(roomId).emit('lobbyChatMessage', { speaker: player.username, message });
        }
    });

    socket.on('chatMessage', (message) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const player = room?.players.find(p => p.id === socket.id);
        if (player) {
            // Sanitize message on server
            const sanitizedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            io.to(roomId).emit('chatMessage', { speaker: player.username, message: sanitizedMessage });
        }
    });

    const handleDisconnect = () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            const disconnectedPlayer = room.players.find(p => p.id === socket.id);
            if (!disconnectedPlayer) return;

            if (room.gameStarted) {
                // If the game mode is solo (1v1, 1v2, 1v3), eliminate the player but continue the game.
                if (room.mode.startsWith('solo')) {
                     const playerState = room.gameState?.players[disconnectedPlayer.playerId];
                    if (playerState && !playerState.isEliminated) {
                         playerState.isEliminated = true; // Update the authoritative state
                         room.gameState.log.push(`${disconnectedPlayer.username} se desconectou e foi eliminado.`);
                         
                         const activePlayers = room.gameState.playerIdsInGame.filter(id => !room.gameState.players[id].isEliminated);
                         
                         // Check for game over condition
                         if (activePlayers.length <= 1) {
                             const winnerName = activePlayers.length === 1 ? room.gameState.players[activePlayers[0]].name : "Ninguém";
                             io.to(roomId).emit('gameOver', `${winnerName} venceu por W.O.!`);
                             delete rooms[roomId]; // Clean up the room
                         } else {
                            // If it was the disconnected player's turn, advance it
                            if (room.gameState.currentPlayer === disconnectedPlayer.playerId) {
                                let currentIndex = room.gameState.playerIdsInGame.indexOf(room.gameState.currentPlayer);
                                let nextIndex = currentIndex;
                                do {
                                    nextIndex = (nextIndex + 1) % room.gameState.playerIdsInGame.length;
                                } while (room.gameState.players[room.gameState.playerIdsInGame[nextIndex]].isEliminated);
                                room.gameState.currentPlayer = room.gameState.playerIdsInGame[nextIndex];
                            }
                            broadcastGameState(roomId); // Broadcast the updated state
                         }
                         console.log(`Jogador ${disconnectedPlayer.username} eliminado da partida na sala ${roomId}. O jogo continua.`);
                    }
                } else { // For Duo mode, abort the game
                    io.to(roomId).emit('gameAborted', { 
                        message: `O jogador ${disconnectedPlayer.username} se desconectou. A partida em dupla foi encerrada.`
                    });
                    delete rooms[roomId];
                    console.log(`Partida (Dupla) na sala ${roomId} encerrada devido a desconexão.`);
                }
                io.emit('roomList', getPublicRoomsList());
                return;
            }

            // If game hasn't started, just remove from lobby
            room.players = room.players.filter(p => p.id !== socket.id);
            
            if (room.players.length === 0) {
                delete rooms[roomId];
                console.log(`Sala vazia e deletada: ${roomId}`);
            } else {
                if (room.hostId === socket.id) {
                    room.hostId = room.players[0].id;
                }
                io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
            }
            io.emit('roomList', getPublicRoomsList());
        }
    };

    socket.on('leaveRoom', handleDisconnect);
    socket.on('disconnect', handleDisconnect);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`--- SERVIDOR DE JOGO REVERSUS ONLINE ---`);
    console.log(`O servidor está rodando e escutando na porta: ${PORT}`);
    console.log(`Aguardando conexões de jogadores...`);
    console.log('------------------------------------');
});