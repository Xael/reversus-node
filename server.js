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
            title: p.title
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
            socket.emit('loginSuccess', await db.getUserProfile(userProfile.google_id));

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
        if (!socket.data.userProfile) return;
        try {
            const profileData = await db.getUserProfile(googleId, socket.data.userProfile.id);
            socket.emit('viewProfileData', profileData);
        } catch (error) {
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

    socket.on('addFriend', async ({ targetUserId }) => {
        if (!socket.data.userProfile) return;
        try {
            await db.addFriend(socket.data.userProfile.id, targetUserId);
            // Atualiza a lista de amigos para ambos
            const friendSocketId = onlineUsers.get(targetUserId);
            if (friendSocketId) io.to(friendSocketId).emit('friendsList', await db.getFriendsList(targetUserId));
            socket.emit('friendsList', await db.getFriendsList(socket.data.userProfile.id));
        } catch(error) { console.error("Add Friend Error:", error); }
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
        try {
            await db.savePrivateMessage(senderId, recipientId, content);
            const recipientSocketId = onlineUsers.get(recipientId);
            const messageData = { senderId, content, timestamp: new Date() };
            // Envia para o destinatário se estiver online
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('privateMessage', messageData);
            }
            // Confirmação de envio para o remetente
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
            const friends = await db.getFriendsList(userId);
            friends.forEach(friend => {
                const friendSocketId = onlineUsers.get(friend.id);
                if (friendSocketId) {
                    io.to(friendSocketId).emit('friendStatusUpdate', { userId, isOnline: false });
                }
            });
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
