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
const onlineUsers = new Map(); // Key: userId (DB id), Value: socket.id
const userSockets = new Map(); // Key: socket.id, Value: userId (DB id)

// --- LÓGICA DE JOGO (igual à anterior) ---
// ... (as funções de lógica de jogo como createDeck, shuffle, etc. permanecem aqui) ...
// ... (Para economizar espaço, elas foram omitidas, mas são as mesmas da sua versão anterior) ...

// --- FUNÇÕES HELPER DO SERVIDOR ---
function getLobbyDataForRoom(room) {
    return {
        id: room.id, name: room.name, hostId: room.hostId,
        players: room.players.map(p => ({ 
            id: p.id, 
            username: p.username, 
            playerId: p.playerId,
            googleId: p.googleId,
            title_code: p.title_code // Enviar o código do título
        })),
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
// --- FIM DAS FUNÇÕES HELPER ---

io.on('connection', (socket) => {
    console.log(`Jogador conectado: ${socket.id}`);
    db.ensureSchema().catch(console.error);

    socket.on('google-login', async ({ token }) => {
        try {
            const ticket = await client.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
            const payload = ticket.getPayload();
            const userProfile = await db.findOrCreateUser(payload);
            
            // Lógica de Desconexão Forçada
            if (onlineUsers.has(userProfile.id)) {
                const oldSocketId = onlineUsers.get(userProfile.id);
                const oldSocket = io.sockets.sockets.get(oldSocketId);
                if (oldSocket) {
                    oldSocket.emit('forceDisconnect', 'Você se conectou em um novo local. Esta sessão foi desconectada.');
                    oldSocket.disconnect();
                }
            }
            
            onlineUsers.set(userProfile.id, socket.id);
            userSockets.set(socket.id, userProfile.id);
            
            socket.data.userProfile = userProfile;
            socket.emit('loginSuccess', await db.getUserProfile(userProfile.google_id, userProfile.id));

            // Notifica amigos que o usuário ficou online
            const friends = await db.getFriendsList(userProfile.id);
            friends.forEach(friend => {
                const friendSocketId = onlineUsers.get(friend.id);
                if (friendSocketId) {
                    io.to(friendSocketId).emit('friendStatusUpdate', { userId: userProfile.id, isOnline: true });
                }
            });

        } catch (error) {
            console.error("Login Error:", error);
            socket.emit('loginError', 'Falha na autenticação.');
        }
    });
    
    // --- EVENTOS DE RANKING, PERFIL E TÍTULOS ---
    socket.on('getRanking', async ({ page = 1 } = {}) => {
        try {
            const rankingData = await db.getTopPlayers(page, 10);
            socket.emit('rankingData', rankingData);
        } catch (error) {
            socket.emit('error', 'Não foi possível carregar o ranking.');
        }
    });
    
    socket.on('getProfile', async () => {
        if (!socket.data.userProfile) return;
        try {
            const profileData = await db.getUserProfile(socket.data.userProfile.google_id, socket.data.userProfile.id);
            socket.emit('profileData', profileData);
        } catch (error) {
            socket.emit('error', 'Não foi possível carregar seu perfil.');
        }
    });

    socket.on('viewProfile', async ({ googleId }) => {
        if (!socket.data.userProfile || !googleId) return;
        try {
            // FIX: Use the provided googleId to get the correct profile
            const profileData = await db.getUserProfile(googleId, socket.data.userProfile.id);
            socket.emit('viewProfileData', profileData);
        } catch (error) {
            console.error("View Profile Error:", error);
            socket.emit('error', 'Não foi possível carregar o perfil do jogador.');
        }
    });

    socket.on('setSelectedTitle', async ({ titleCode }) => {
        if (!socket.data.userProfile) return;
        try {
            await db.setSelectedTitle(socket.data.userProfile.id, titleCode);
            // Re-envia o perfil atualizado
            const profileData = await db.getUserProfile(socket.data.userProfile.google_id, socket.data.userProfile.id);
            socket.emit('profileData', profileData);
        } catch (error) {
             socket.emit('error', 'Não foi possível selecionar o título.');
        }
    });
    
    socket.on('gameFinished', async ({ winnerId, roomId, mode }) => {
        if (!socket.data.userProfile) return;
        const room = rooms[roomId];
        if (!room) return;
    
        const winnerClient = room.players.find(p => p.playerId === winnerId);
        // Only process if the winner is a real player with a profile
        if (!winnerClient || !winnerClient.userProfile) return;
    
        try {
            const winnerUserId = winnerClient.userProfile.id;
            const winnerGoogleId = winnerClient.userProfile.google_id;
    
            // 1. Conceder XP, registrar vitória
            await db.addXp(winnerGoogleId, 100);
            await db.addMatchToHistory(winnerGoogleId, {
                outcome: 'Vitória',
                mode: `PVP ${mode}`,
                opponents: 'Jogadores Online'
            });
    
            // 2. Atualizar o rank e conceder títulos de ranking
            await db.updateUserRankAndTitles(winnerUserId);
    
        } catch (error) {
            console.error('Erro ao processar o fim do jogo:', error);
            socket.emit('error', 'Ocorreu um erro ao registrar sua vitória.');
        }
    });

    // --- EVENTOS SOCIAIS (AMIGOS E CHAT) ---

    socket.on('searchUsers', async ({ query }) => {
        if (!socket.data.userProfile) return;
        try {
            const results = await db.searchUsers(query, socket.data.userProfile.id);
            socket.emit('searchResults', results);
        } catch (error) {
            console.error("Search Error:", error);
        }
    });

    socket.on('sendFriendRequest', async ({ targetUserId }) => {
        if (!socket.data.userProfile) return;
        try {
            const senderProfile = socket.data.userProfile;
            const request = await db.sendFriendRequest(senderProfile.id, targetUserId);
            if (request) {
                const targetSocketId = onlineUsers.get(targetUserId);
                if (targetSocketId) {
                    io.to(targetSocketId).emit('newFriendRequest', {
                        id: request.id,
                        sender_id: senderProfile.id,
                        username: senderProfile.username,
                        avatar_url: senderProfile.avatar_url
                    });
                }
            }
            // FIX: Send a success confirmation back to the sender
            socket.emit('requestSent');
        } catch (error) {
            console.error("Send Friend Request Error:", error);
            socket.emit('error', 'Não foi possível enviar o pedido de amizade.');
        }
    });

    socket.on('getPendingRequests', async () => {
        if (!socket.data.userProfile) return;
        try {
            const requests = await db.getPendingFriendRequests(socket.data.userProfile.id);
            socket.emit('pendingRequestsData', requests);
        } catch (error) {
            console.error("Get Pending Requests Error:", error);
        }
    });

    socket.on('respondToRequest', async ({ requestId, action }) => {
        if (!socket.data.userProfile || !['accept', 'decline'].includes(action)) return;
        try {
            const userId = socket.data.userProfile.id;
            const senderId = await db.respondToFriendRequest(requestId, userId, action);
            
            if (senderId) {
                // Notificar o remetente da resposta
                const senderSocketId = onlineUsers.get(senderId);
                if (senderSocketId) {
                    io.to(senderSocketId).emit('friendRequestResponded', { username: socket.data.userProfile.username, action });
                    // Atualizar a lista de amigos de ambos
                    io.to(senderSocketId).emit('friendsList', await db.getFriendsList(senderId));
                }
                socket.emit('friendsList', await db.getFriendsList(userId));
            }
            // Atualizar a lista de pedidos pendentes para o usuário que respondeu
            const requests = await db.getPendingFriendRequests(userId);
            socket.emit('pendingRequestsData', requests);

        } catch (error) {
            console.error("Respond to Request Error:", error);
            socket.emit('error', 'Não foi possível responder ao pedido.');
        }
    });

    socket.on('removeFriend', async ({ targetUserId }) => {
        if (!socket.data.userProfile) return;
        try {
            await db.removeFriend(socket.data.userProfile.id, targetUserId);
             // Atualiza a lista de amigos para ambos
            const friendSocketId = onlineUsers.get(targetUserId);
            if (friendSocketId) io.to(friendSocketId).emit('friendsList', await db.getFriendsList(targetUserId));
            socket.emit('friendsList', await db.getFriendsList(socket.data.userProfile.id));
        } catch(error) { console.error("Remove Friend Error:", error); }
    });

    socket.on('getFriendsList', async () => {
        if (!socket.data.userProfile) return;
        try {
            const friends = await db.getFriendsList(socket.data.userProfile.id);
            const friendsWithStatus = friends.map(f => ({ ...f, isOnline: onlineUsers.has(f.id) }));
            socket.emit('friendsList', friendsWithStatus);
        } catch(error) { console.error("Get Friends Error:", error); }
    });
    
    socket.on('sendPrivateMessage', async ({ recipientId, content }) => {
        if (!socket.data.userProfile) return;
        const senderId = socket.data.userProfile.id;
        const senderUsername = socket.data.userProfile.username;
        try {
            await db.savePrivateMessage(senderId, recipientId, content);
            const recipientSocketId = onlineUsers.get(recipientId);
            const messageData = { senderId, senderUsername, content, timestamp: new Date() };
            
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('privateMessage', { ...messageData, recipientId });
            }

            // FIX: Send the message back to the sender so they can see it too
            socket.emit('privateMessage', { ...messageData, recipientId });
        } catch (error) {
            console.error("Send Message Error:", error);
        }
    });
    
    // --- LÓGICA DE SALAS E JOGO PVP (mesma da sua versão anterior) ---
    // ... (o código de 'listRooms', 'createRoom', 'joinRoom', 'startGame', etc. permanece aqui) ...
    // ... (Para economizar espaço, elas foram omitidas, mas são as mesmas da sua versão anterior) ...

    const handleDisconnect = async () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        const userId = userSockets.get(socket.id);
        if (userId) {
            onlineUsers.delete(userId);
            userSockets.delete(socket.id);

            // Notifica amigos que o usuário ficou offline
            try {
                const friends = await db.getFriendsList(userId);
                friends.forEach(friend => {
                    const friendSocketId = onlineUsers.get(friend.id);
                    if (friendSocketId) {
                        io.to(friendSocketId).emit('friendStatusUpdate', { userId, isOnline: false });
                    }
                });
            } catch (error) {
                console.error("Error notifying friends on disconnect:", error);
            }
        }
        
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;
        // ... (resto da lógica de desconexão da sala) ...
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
    db.testConnection();
});