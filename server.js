// server.js --- SERVIDOR DE JOGO PVP COMPLETO COM BANCO DE DADOS ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { OAuth2Client } = require('google-auth-library');
const db = require('./db.js');

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

    if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        console.log(`Player ${socket.id} left room ${roomId}`);
    }

    socket.leave(roomId);
    delete socket.data.roomId;

    if (room.players.length === 0) {
        console.log(`Room ${roomId} is empty, deleting.`);
        delete rooms[roomId];
    } else {
        // If the host left, assign a new host
        if (room.hostId === socket.id) {
            room.hostId = room.players[0].id;
            console.log(`New host for room ${roomId} is ${room.hostId}`);
        }
        // Update remaining players in the lobby
        io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
    }

    // Update everyone's room list
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
            
            const newPlayer = {
                id: socket.id,
                username: socket.data.userProfile.username,
                googleId: socket.data.userProfile.googleId, // importante para o futuro
                playerId: `player-${room.players.length + 1}`
            };
            socket.data.userProfile.playerId = newPlayer.playerId; // Associa playerId ao perfil
            
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

    // ... (restante da lógica de jogo PvP como 'startGame', 'playCard', 'endTurn', etc.)
    // A lógica de final de jogo no PvP precisará ser adaptada para chamar a função de registro de partida.
    
    socket.on('disconnect', () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        handleLeaveRoom(socket);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`--- SERVIDOR DE JOGO REVERSUS ONLINE ---`);
    console.log(`O servidor está rodando na porta: ${PORT}`);
    // Testa a conexão com o banco de dados na inicialização
    db.testConnection();
});