// server.js --- SERVIDOR DE JOGO PVP COMPLETO COM BANCO DE DADOS ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { OAuth2Client } = require('google-auth-library');
const db = require('./db.js');
// Import game logic for server-side game state creation
const { createDeck } = require('./js/game-logic/deck.js');
const { generateBoardPaths } = require('./js/game-logic/board.js');
const config = require('./js/core/config.js');
const { shuffle } = require('./js/core/utils.js');


const app = express();
const server = http.createServer(app);

const GOOGLE_CLIENT_ID = "2701468714-udbjtea2v5d1vnr8sdsshi3lem60dvkn.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

const io = new Server(server, {
  cors: {
    origin: ["https://reversus.online", "https://reversus-game.dke42d.easypanel.host", "http://localhost:8080"],
    methods: ["GET", "POST"]
  }
});

const rooms = {};

// --- HELPER FUNCTIONS ---
function getLobbyDataForRoom(room) {
    return {
        id: room.id, name: room.name, hostId: room.hostId,
        players: room.players.map(p => ({ id: p.id, username: p.username, playerId: p.playerId })),
        mode: room.mode,
    };
}

function getPublicRoomsList() {
    return Object.values(rooms).filter(r => !r.gameStarted)
        .map(r => ({ id: r.id, name: r.name, playerCount: r.players.length, mode: r.mode }));
}

function broadcastGameState(roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameState) return;
    room.players.forEach(client => {
        const personalizedState = JSON.parse(JSON.stringify(room.gameState));
        Object.keys(personalizedState.players).forEach(pId => {
            if (pId !== client.playerId && !(personalizedState.revealedHands || []).includes(pId)) {
                personalizedState.players[pId].hand = personalizedState.players[pId].hand.map(card => ({...card, isHidden: true}));
            }
        });
        io.to(client.id).emit('gameStateUpdate', personalizedState);
    });
}

function handleLeaveRoom(socket) {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    const disconnectedPlayerInfo = room.players[playerIndex];

    if (!disconnectedPlayerInfo) return; // Player wasn't in the room

    // --- NEW LOGIC FOR IN-GAME DISCONNECTS ---
    if (room.gameStarted && room.gameState) {
        const disconnectedPlayerId = disconnectedPlayerInfo.playerId;
        const gameState = room.gameState;
        
        // Check game mode to decide action
        if (gameState.gameMode === 'solo-2p' || gameState.gameMode === 'duo') {
            // End the game for 1v1 and 2v2 modes
            console.log(`Player disconnected in a ${gameState.gameMode} match. Ending game.`);
            const remainingPlayers = room.players.filter(p => p.id !== socket.id);
            const winnerNames = remainingPlayers.map(p => p.username).join(' e ');
            
            io.to(roomId).emit('gameOver', { message: `${winnerNames} venceu(ram) pois um oponente se desconectou.` });
            delete rooms[roomId]; // Clean up the room

        } else { // For 3p and 4p modes, continue the game
            console.log(`Player ${disconnectedPlayerId} disconnected in a ${gameState.gameMode} match. Game continues.`);
            // Mark player as eliminated
            if (gameState.players[disconnectedPlayerId]) {
                gameState.players[disconnectedPlayerId].isEliminated = true;
                gameState.log.unshift({ type: 'system', message: `Jogador ${disconnectedPlayerInfo.username} se desconectou e foi removido da partida.` });
            }

            // Remove player from the room's active player list
            room.players.splice(playerIndex, 1);
            socket.leave(roomId);
            
            // If it was the disconnected player's turn, advance to the next active player
            if (gameState.currentPlayer === disconnectedPlayerId) {
                let currentIndex = gameState.playerIdsInGame.indexOf(gameState.currentPlayer);
                let nextPlayerFound = false;
                for (let i = 1; i < gameState.playerIdsInGame.length; i++) {
                    const nextIndex = (currentIndex + i) % gameState.playerIdsInGame.length;
                    const nextPlayerId = gameState.playerIdsInGame[nextIndex];
                    if (!gameState.players[nextPlayerId].isEliminated) {
                        gameState.currentPlayer = nextPlayerId;
                        gameState.log.unshift({ type: 'system', message: `É a vez de ${gameState.players[nextPlayerId].name}.` });
                        nextPlayerFound = true;
                        break;
                    }
                }
                 if (!nextPlayerFound) { // Should only happen if only one is left
                    const winner = Object.values(gameState.players).find(p => !p.isEliminated);
                    if (winner) {
                        io.to(roomId).emit('gameOver', { message: `${winner.name} venceu a partida!` });
                        delete rooms[roomId];
                        return;
                    }
                }
            }
            broadcastGameState(roomId);
        }
        return; // End function here for in-game disconnects
    }
    // --- END OF NEW LOGIC ---

    // Original logic for leaving a lobby (game not started)
    room.players.splice(playerIndex, 1)[0];
    console.log(`Player ${socket.id} (${disconnectedPlayerInfo.username}) left room ${roomId}`);
    socket.leave(roomId);
    delete socket.data.roomId;

    if (room.players.length === 0) {
        console.log(`Room ${roomId} is empty, deleting.`);
        delete rooms[roomId];
    } else {
        if (room.hostId === socket.id) {
            room.hostId = room.players[0].id;
            console.log(`New host for room ${roomId} is ${room.hostId}`);
        }
        io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
    }

    io.emit('roomList', getPublicRoomsList());
}


io.on('connection', (socket) => {
    console.log(`Jogador conectado: ${socket.id}`);
    
    // Garante que o esquema do banco de dados exista ao iniciar
    db.ensureSchema().catch(console.error);

    socket.on('google-login', async ({ token }) => {
        try {
            const ticket = await client.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
            const payload = ticket.getPayload();
            
            const userProfile = await db.findOrCreateUser(payload);
            socket.data.userProfile = userProfile;

            socket.emit('loginSuccess', userProfile);
            console.log(`Login/Registro bem-sucedido para: ${userProfile.username}`);
        } catch (error) {
            console.error('Falha na verificação ou na operação de banco de dados:', error);
            socket.emit('loginError', 'Falha na autenticação ou ao buscar dados do jogador.');
        }
    });

    socket.on('getRanking', async () => {
        try {
            const ranking = await db.getTopTenPlayers();
            socket.emit('rankingData', ranking);
        } catch (error) {
            console.error('Erro ao buscar ranking:', error);
            socket.emit('error', 'Não foi possível carregar o ranking.');
        }
    });

    socket.on('getProfile', async () => {
        if (!socket.data.userProfile) {
            return socket.emit('error', 'Você precisa estar logado para ver o perfil.');
        }
        try {
            const profileData = await db.getUserProfile(socket.data.userProfile.googleId);
            socket.emit('profileData', profileData);
        } catch (error) {
            console.error('Erro ao buscar perfil:', error);
            socket.emit('error', 'Não foi possível carregar seu perfil.');
        }
    });

    socket.on('claimEventReward', async ({ titleCode }) => {
        if (!socket.data.userProfile || !socket.data.userProfile.id) {
            return socket.emit('error', 'Autenticação necessária para resgatar recompensa.');
        }
        try {
            await db.grantTitleByCode(socket.data.userProfile.id, titleCode);
            socket.emit('rewardClaimed', { titleCode }); // Acknowledge the claim
            // Envia o perfil atualizado para o cliente para que a UI reflita o novo título imediatamente
            const updatedProfile = await db.getUserProfile(socket.data.userProfile.googleId);
            socket.emit('profileData', updatedProfile);
        } catch (error) {
            console.error(`Erro ao conceder o título ${titleCode} ao usuário ${socket.data.userProfile.id}:`, error);
            socket.emit('error', 'Ocorreu um erro ao resgatar sua recompensa.');
        }
    });
    
    socket.on('gameFinished', async ({ winnerId, loserIds, mode }) => {
        if (!socket.data.userProfile) return; // Só jogadores logados registram partidas
        
        try {
            const googleId = socket.data.userProfile.googleId;
            const isWinner = socket.data.userProfile.playerId === winnerId;
            const xpGained = isWinner ? 100 : 25;

            await db.addMatchToHistory(googleId, {
                outcome: isWinner ? 'Vitória' : 'Derrota',
                mode: mode || 'Desconhecido',
                opponents: 'N/A' // Simples por enquanto
            });

            await db.addXp(googleId, xpGained);
            
            // Verifica se títulos foram desbloqueados
            await db.checkAndGrantTitles(googleId);

            // Envia o perfil atualizado para o cliente
            const updatedProfile = await db.getUserProfile(googleId);
            socket.emit('profileData', updatedProfile); // Envia o perfil atualizado

        } catch(error) {
            console.error('Erro ao registrar final da partida:', error);
        }
    });


    // --- Lógica de Salas e Jogo (semelhante ao anterior) ---
    socket.on('listRooms', () => { socket.emit('roomList', getPublicRoomsList()); });

    socket.on('createRoom', () => {
        if (!socket.data.userProfile) {
            return socket.emit('error', 'Você precisa estar logado para criar uma sala.');
        }
        const username = socket.data.userProfile.username;
        const roomId = `room-${Date.now()}`;
        const roomName = `Sala de ${username}`;
        rooms[roomId] = {
            id: roomId, name: roomName, hostId: socket.id, players: [],
            gameStarted: false, mode: 'solo-4p', gameState: null
        };
        console.log(`Sala criada: ${roomId} por ${username}`);
        socket.emit('roomCreated', roomId);
        io.emit('roomList', getPublicRoomsList());
    });

    socket.on('joinRoom', ({ roomId }) => {
        if (!socket.data.userProfile) {
            return socket.emit('error', 'Você precisa estar logado para entrar em uma sala.');
        }
        const room = rooms[roomId];
        if (room && !room.gameStarted && room.players.length < 4) {
            socket.data.roomId = roomId;
            socket.join(roomId);
            
            const assignedPlayerIds = new Set(room.players.map(p => p.playerId));
            let newPlayerId = null;
            for (let i = 1; i <= 4; i++) {
                const potentialId = `player-${i}`;
                if (!assignedPlayerIds.has(potentialId)) {
                    newPlayerId = potentialId;
                    break;
                }
            }
            
            if (!newPlayerId) {
                return socket.emit('error', 'A sala está cheia ou ocorreu um erro ao atribuir jogador.');
            }

            const newPlayer = {
                id: socket.id,
                username: socket.data.userProfile.username,
                googleId: socket.data.userProfile.googleId,
                playerId: newPlayerId
            };

            socket.data.userProfile.playerId = newPlayer.playerId;
            
            room.players.push(newPlayer);
            io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
            io.emit('roomList', getPublicRoomsList());
        } else {
            socket.emit('error', 'A sala está cheia, já começou ou não existe.');
        }
    });

    socket.on('leaveRoom', () => {
        handleLeaveRoom(socket);
    });
    
    socket.on('changeMode', (newMode) => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;
        const room = rooms[roomId];
        // Only host can change mode
        if (socket.id !== room.hostId) return;

        room.mode = newMode;
        console.log(`Room ${roomId} mode changed to ${newMode}`);
        io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
    });

    socket.on('startGame', () => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;
        const room = rooms[roomId];
        if (socket.id !== room.hostId) return;

        // Create initial game state here... (simplified version)
        // This should mirror the logic from initializeGame in game-controller.js
        console.log(`Starting game in room ${roomId} with mode ${room.mode}`);
        room.gameStarted = true;
        // Logic to create gameState based on room.mode and room.players
        // This is a simplified example; a full implementation would be needed.
        const playerIdsInGame = room.players.map(p => p.playerId);
        const players = Object.fromEntries(
            room.players.map(p => {
                 const playerConfig = config.PLAYER_CONFIG[p.playerId];
                 const playerObject = {
                    ...playerConfig,
                    id: p.playerId,
                    name: p.username,
                    isHuman: true,
                    pathId: playerIdsInGame.indexOf(p.playerId),
                    position: 1,
                    hand: [],
                    resto: null,
                    nextResto: null,
                    effects: { score: null, movement: null },
                    playedCards: { value: [], effect: [] },
                    playedValueCardThisTurn: false,
                    isEliminated: false,
                 };
                 return [p.playerId, playerObject];
            })
        );
        
        const gameState = {
            players,
            playerIdsInGame,
            decks: { value: shuffle(createDeck(config.VALUE_DECK_CONFIG, 'value')), effect: shuffle(createDeck(config.EFFECT_DECK_CONFIG, 'effect')) },
            discardPiles: { value: [], effect: [] },
            boardPaths: generateBoardPaths(),
            gamePhase: 'setup',
            gameMode: room.mode,
            isPvp: true,
            currentPlayer: 'player-1',
            turn: 1,
            log: [],
            // ... other initial state properties
        };
        room.gameState = gameState;
        
        io.to(roomId).emit('gameStarted', gameState);
        io.emit('roomList', getPublicRoomsList()); // Room is no longer public
        // TODO: Need to implement the full game logic loop on the server
    });

    socket.on('disconnect', () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        handleLeaveRoom(socket);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`--- SERVIDOR DE JOGO REVERSUS ONLINE ---`);
    console.log(`O servidor está rodando na porta: ${PORT}`);
    // A conexão com o banco será testada na primeira interação do usuário.
});