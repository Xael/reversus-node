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

// --- LÓGICA DE JOGO ---
const VALUE_DECK_CONFIG = [{ value: 2, count: 12 }, { value: 4, count: 10 }, { value: 6, count: 8 }, { value: 8, count: 6 }, { value: 10, count: 4 }];
const EFFECT_DECK_CONFIG = [{ name: 'Mais', count: 4 }, { name: 'Menos', count: 4 }, { name: 'Sobe', count: 4 }, { name: 'Desce', count: 4 }, { name: 'Pula', count: 4 }, { name: 'Reversus', count: 4 }, { name: 'Reversus Total', count: 1 }];
const MAX_VALUE_CARDS_IN_HAND = 3;
const MAX_EFFECT_CARDS_IN_HAND = 2;
const WINNING_POSITION = 10;
const TEAM_A_IDS = ['player-1', 'player-3'];
const TEAM_B_IDS = ['player-2', 'player-4'];
const NUM_PATHS = 6;
const BOARD_SIZE = 9;

// --- FUNÇÕES DE LÓGICA DE JOGO ---
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
        const colorableSpaceIds = Array.from({ length: 7 }, (_, j) => j + 2);
        shuffle(colorableSpaceIds);
        const spacesToColor = colorableSpaceIds.slice(0, 2);
        spacesToColor.forEach(spaceId => {
            const space = spaces.find(s => s.id === spaceId);
            if (space) {
                space.color = Math.random() > 0.5 ? 'blue' : 'red';
            }
        });
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

const getInverseEffect = (effect) => {
    const map = { 'Mais': 'Menos', 'Menos': 'Mais', 'Sobe': 'Desce', 'Desce': 'Sobe' };
    return map[effect] || null;
};

const applyEffect = (gameState, card, targetId, casterName, effectTypeToReverse, options = {}) => {
    const target = gameState.players[targetId];
    if (!target) return;

    let effectName = card.isLocked ? card.lockedEffect : card.name;
    const originalCardName = card.name;

    if (gameState.reversusTotalActive && originalCardName !== 'Reversus Total' && !card.isLocked) {
        const inverted = getInverseEffect(effectName);
        if (inverted) {
            gameState.log.unshift({ type: 'system', message: `Reversus Total inverteu ${originalCardName} para ${inverted}!` });
            effectName = inverted;
        }
    }

    switch (effectName) {
        case 'Mais': case 'Menos':
            target.effects.score = effectName;
            break;
        case 'Sobe': case 'Desce': case 'Pula':
            target.effects.movement = effectName;
            break;
        case 'Reversus':
            if (effectTypeToReverse === 'score') {
                target.effects.score = getInverseEffect(target.effects.score);
            } else if (effectTypeToReverse === 'movement') {
                target.effects.movement = getInverseEffect(target.effects.movement);
            }
            break;
        case 'Reversus Total':
            if (options.isGlobal) {
                gameState.reversusTotalActive = true;
                Object.values(gameState.players).forEach(p => {
                    if (p.effects.score && !p.playedCards.effect.some(c => c.isLocked && ['Mais', 'Menos'].includes(c.lockedEffect))) {
                        p.effects.score = getInverseEffect(p.effects.score);
                    }
                    if (p.effects.movement && p.effects.movement !== 'Pula' && !p.playedCards.effect.some(c => c.isLocked && ['Sobe', 'Desce'].includes(c.lockedEffect))) {
                        p.effects.movement = getInverseEffect(p.effects.movement);
                    }
                });
            }
            break;
    }
     gameState.log.unshift({ type: 'system', message: `${casterName} usou ${originalCardName} em ${target.name}.` });
};

const checkGameEnd = (room) => {
    const { gameState } = room;
    const gameWinners = gameState.playerIdsInGame.filter(id => !gameState.players[id].isEliminated && gameState.players[id].position >= WINNING_POSITION);
    
    if (gameWinners.length > 0) {
        gameState.gamePhase = 'game_over';
        const winnerNames = gameWinners.map(id => gameState.players[id].name).join(' e ');
        io.to(room.id).emit('gameOver', { message: `${winnerNames} venceu o jogo!`, winnerId: gameWinners[0] });
        delete rooms[room.id];
        return true;
    }
    return false;
};

const startNewRound = (room) => {
    const { gameState } = room;
    gameState.turn++;
    gameState.log.unshift({ type: 'system', message: `--- Iniciando Rodada ${gameState.turn} ---`});

    gameState.playerIdsInGame.forEach(id => {
        const player = gameState.players[id];
        if (player.isEliminated) return;
        
        gameState.discardPiles.value.push(...player.playedCards.value);
        gameState.discardPiles.effect.push(...player.playedCards.effect);
        player.playedCards = { value: [], effect: [] };
        if (player.nextResto) player.resto = player.nextResto;
        player.nextResto = null;
        player.effects = { score: null, movement: null };
        player.playedValueCardThisTurn = false;
    });

    gameState.reversusTotalActive = false;
    gameState.consecutivePasses = 0;
    
    gameState.playerIdsInGame.forEach(id => {
        const player = gameState.players[id];
        if (player.isEliminated) return;
        while (player.hand.filter(c => c.type === 'value').length < MAX_VALUE_CARDS_IN_HAND) {
            const newCard = dealCard(gameState, 'value');
            if (newCard) player.hand.push(newCard); else break;
        }
        while (player.hand.filter(c => c.type === 'effect').length < MAX_EFFECT_CARDS_IN_HAND) {
            const newCard = dealCard(gameState, 'effect');
            if (newCard) player.hand.push(newCard); else break;
        }
    });

    gameState.gamePhase = 'playing';
    broadcastGameState(room.id);
};

const calculateScoresAndEndRound = (room) => {
    const { gameState } = room;
    gameState.gamePhase = 'resolution';
    
    const finalScores = {};
    gameState.playerIdsInGame.forEach(id => {
        const p = gameState.players[id];
        if (p.isEliminated) return;
        let score = p.playedCards.value.reduce((sum, card) => sum + card.value, 0);
        let restoValue = p.resto?.value || 0;
        
        if (p.effects.score === 'Mais') score += restoValue;
        if (p.effects.score === 'Menos') score -= restoValue;
        finalScores[id] = score;
    });

    let winners = [];
    if (gameState.playerIdsInGame.filter(pId => !gameState.players[pId].isEliminated).length > 0) {
        let highestScore = -Infinity;
        gameState.playerIdsInGame.forEach(id => {
            const p = gameState.players[id];
            if (p.isEliminated) return;
            if (finalScores[id] > highestScore) {
                highestScore = finalScores[id]; winners = [id];
            } else if (finalScores[id] === highestScore) {
                winners.push(id);
            }
        });
    }

    if (winners.length > 1) {
        if (gameState.gameMode === 'duo') {
            const firstWinnerTeam = TEAM_A_IDS.includes(winners[0]) ? 'A' : 'B';
            const allOnSameTeam = winners.every(id => (firstWinnerTeam === 'A' && TEAM_A_IDS.includes(id)) || (firstWinnerTeam === 'B' && TEAM_B_IDS.includes(id)));
            if (!allOnSameTeam) winners = [];
        } else {
            winners = [];
        }
    }
    
    const winnerNames = winners.map(id => gameState.players[id].name).join(' e ');
    gameState.log.unshift({ type: 'system', message: winners.length > 0 ? `Vencedor(es) da rodada: ${winnerNames}.` : "A rodada terminou em empate." });

    gameState.playerIdsInGame.forEach(id => {
        const p = gameState.players[id];
        if (p.isEliminated) return;
        let movement = 0;
        const isWinner = winners.includes(id);

        if (isWinner) movement++;
        if (p.effects.movement === 'Sobe') movement++;
        if (p.effects.movement === 'Desce') movement--;
        if (p.effects.movement === 'Pula' && p.targetPathForPula !== null) p.pathId = p.targetPathForPula;
        if (movement !== 0) p.position = Math.min(WINNING_POSITION, Math.max(1, p.position + movement));
    });

    if (checkGameEnd(room)) return;

    if (winners.length > 0) {
        const winnerTurnOrder = gameState.playerIdsInGame.filter(pId => winners.includes(pId));
        gameState.currentPlayer = winnerTurnOrder[0];
    }
    
    startNewRound(room);
};

// --- FUNÇÕES HELPER DO SERVIDOR ---
function getLobbyDataForRoom(room) {
    return {
        id: room.id, name: room.name, hostId: room.hostId,
        players: room.players.map(p => ({ 
            id: p.id, 
            username: p.username, 
            playerId: p.playerId,
            googleId: p.googleId,
            title_code: p.title_code
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
            let userProfile = await db.findOrCreateUser(payload);

            if (userProfile.is_banned) {
                return socket.emit('loginError', 'Esta conta foi permanentemente banida.');
            }

            // Flag de admin é verificada no servidor, nunca confiando no cliente.
            if (payload.email === 'alexblbn@gmail.com') {
                userProfile.isAdmin = true;
            } else {
                userProfile.isAdmin = false;
            }
            
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
            const fullProfile = await db.getUserProfile(userProfile.google_id, userProfile.id);
            fullProfile.isAdmin = userProfile.isAdmin; // Adiciona a flag de admin ao perfil enviado
            socket.emit('loginSuccess', fullProfile);

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

    // --- ADMIN HANDLERS ---
    socket.on('admin:getReports', async () => {
        if (!socket.data.userProfile?.isAdmin) return;
        try {
            const reports = await db.getChatReports();
            socket.emit('admin:reportsData', reports);
        } catch (error) {
            console.error('Admin Get Reports Error:', error);
            socket.emit('error', 'Falha ao buscar denúncias.');
        }
    });

    socket.on('admin:updateReportStatus', async ({ reportId, status }) => {
        if (!socket.data.userProfile?.isAdmin) return;
        try {
            await db.updateChatReportStatus(reportId, status);
            const reports = await db.getChatReports(); // Re-fetch para atualizar a UI do admin
            socket.emit('admin:reportsData', reports);
        } catch (error) {
            console.error('Admin Update Report Status Error:', error);
            socket.emit('error', 'Falha ao atualizar status da denúncia.');
        }
    });

    socket.on('admin:banUser', async ({ googleId }) => {
        if (!socket.data.userProfile?.isAdmin) return;
        try {
            const bannedUserId = await db.banUserByGoogleId(googleId);
            if (bannedUserId) {
                const targetSocketId = onlineUsers.get(bannedUserId);
                if (targetSocketId) {
                    const targetSocket = io.sockets.sockets.get(targetSocketId);
                    if (targetSocket) {
                        targetSocket.emit('forceDisconnect', 'Sua conta foi permanentemente banida por violar os termos de conduta.');
                        targetSocket.disconnect();
                    }
                }
            }
            const reports = await db.getChatReports(); // Re-fetch para atualizar a UI do admin
            socket.emit('admin:reportsData', reports);
        } catch (error) {
            console.error('Admin Ban User Error:', error);
            socket.emit('error', 'Falha ao banir usuário.');
        }
    });

    socket.on('admin:searchUsers', async ({ query }) => {
        if (!socket.data.userProfile?.isAdmin) return;
        try {
            const users = await db.searchUsers(query, socket.data.userProfile.id);
            socket.emit('admin:userSearchResults', users);
        } catch (error) {
            console.error('Admin Search User Error:', error);
            socket.emit('error', 'Falha ao buscar usuário.');
        }
    });

    
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
            profileData.isAdmin = socket.data.userProfile.isAdmin;
            socket.emit('profileData', profileData);
        } catch (error) {
            socket.emit('error', 'Não foi possível carregar seu perfil.');
        }
    });

    socket.on('viewProfile', async ({ googleId }) => {
        if (!socket.data.userProfile || !googleId) return;
        try {
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
            const profileData = await db.getUserProfile(socket.data.userProfile.google_id, socket.data.userProfile.id);
            profileData.isAdmin = socket.data.userProfile.isAdmin;
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
        if (!winnerClient || !winnerClient.userProfile) return;
    
        try {
            const winnerUserId = winnerClient.userProfile.id;
            const winnerGoogleId = winnerClient.userProfile.google_id;
    
            await db.addXp(winnerGoogleId, 100);
            await db.addMatchToHistory(winnerGoogleId, {
                outcome: 'Vitória',
                mode: `PVP ${mode}`,
                opponents: 'Jogadores Online'
            });
    
            await db.updateUserRankAndTitles(winnerUserId);
    
        } catch (error) {
            console.error('Erro ao processar o fim do jogo:', error);
            socket.emit('error', 'Ocorreu um erro ao registrar sua vitória.');
        }
    });

    socket.on('searchUsers', async ({ query }) => {
        if (!socket.data.userProfile) return;
        try {
            const results = await db.searchUsers(query, socket.data.userProfile.id);
            socket.emit('searchResults', results);
        } catch (error) { console.error("Search Error:", error); }
    });

    socket.on('sendFriendRequest', async ({ targetUserId }, callback) => {
        if (!socket.data.userProfile) {
            return callback({ success: false, error: 'Usuário não autenticado.' });
        }
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
            callback({ success: true });
        } catch (error) {
            console.error("Send Friend Request Error:", error);
            callback({ success: false, error: 'Não foi possível enviar o pedido de amizade. O usuário já pode ser seu amigo ou ter um pedido pendente.' });
        }
    });

    socket.on('getPendingRequests', async () => {
        if (!socket.data.userProfile) return;
        try {
            const requests = await db.getPendingFriendRequests(socket.data.userProfile.id);
            socket.emit('pendingRequestsData', requests);
        } catch (error) { console.error("Get Pending Requests Error:", error); }
    });

    socket.on('respondToRequest', async ({ requestId, action }) => {
        if (!socket.data.userProfile || !['accept', 'decline'].includes(action)) return;
        try {
            const userId = socket.data.userProfile.id;
            const senderId = await db.respondToFriendRequest(requestId, userId, action);
            
            if (senderId) {
                const senderSocketId = onlineUsers.get(senderId);
                if (senderSocketId) {
                    io.to(senderSocketId).emit('friendRequestResponded', { username: socket.data.userProfile.username, action });
                }
            }
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
            const friendSocketId = onlineUsers.get(targetUserId);
            if (friendSocketId) {
                io.to(friendSocketId).emit('friendRequestResponded', { action: 'removed' });
            }
            socket.emit('friendRequestResponded', { action: 'removed' });
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
            socket.emit('privateMessage', { ...messageData, recipientId });
        } catch (error) { console.error("Send Message Error:", error); }
    });
    
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
            gameStarted: false, mode: 'solo-4p', gameState: null,
            chatHistory: [] // Adiciona histórico de chat para o lobby
        };
        console.log(`Sala criada: ${roomId} por ${username}`);
        socket.emit('roomCreated', roomId);
        io.emit('roomList', getPublicRoomsList());
    });

    socket.on('joinRoom', async ({ roomId }) => {
        if (!socket.data.userProfile) {
            return socket.emit('error', 'Você precisa estar logado para entrar em uma sala.');
        }
        const room = rooms[roomId];
        if (room && !room.gameStarted && room.players.length < 4) {
            socket.data.roomId = roomId;
            socket.join(roomId);
            
            const userFullProfile = await db.getUserProfile(socket.data.userProfile.google_id, socket.data.userProfile.id);

            const newPlayer = {
                id: socket.id,
                username: userFullProfile.username,
                googleId: userFullProfile.google_id,
                title_code: userFullProfile.selected_title_code,
                playerId: `player-${room.players.length + 1}`,
                userProfile: socket.data.userProfile
            };
            socket.data.userProfile.playerId = newPlayer.playerId;
            
            room.players.push(newPlayer);
            io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
            io.emit('roomList', getPublicRoomsList());
        } else {
            socket.emit('error', 'A sala está cheia, já começou ou não existe.');
        }
    });

    socket.on('lobbyChatMessage', (message) => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId] && socket.data.userProfile) {
            const chatEntry = {
                speaker: socket.data.userProfile.username,
                message,
                speakerId: socket.data.userProfile.id,
                timestamp: new Date()
            };
            if (!rooms[roomId].chatHistory) rooms[roomId].chatHistory = [];
            rooms[roomId].chatHistory.push(chatEntry);
            if (rooms[roomId].chatHistory.length > 50) rooms[roomId].chatHistory.shift();
            
            io.to(roomId).emit('lobbyChatMessage', chatEntry);
        }
    });

    socket.on('chatMessage', (message) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const userProfile = socket.data.userProfile;
        if (room && room.gameState && userProfile) {
            const chatEntry = {
                type: 'dialogue',
                speaker: userProfile.username,
                message,
                speakerId: userProfile.id
            };
            room.gameState.log.unshift(chatEntry);
            if (room.gameState.log.length > 50) room.gameState.log.pop();
            
            io.to(roomId).emit('chatMessage', chatEntry);
        }
    });

    socket.on('reportChat', async ({ reportedUserId }) => {
        const roomId = socket.data.roomId;
        const reporterProfile = socket.data.userProfile;
        if (!roomId || !rooms[roomId] || !reporterProfile || !reportedUserId) {
            return socket.emit('reportConfirmation', { success: false, message: 'Não foi possível enviar a denúncia (dados incompletos).' });
        }
    
        const room = rooms[roomId];
        const chatHistory = room.gameState ? room.gameState.log : room.chatHistory;
    
        if (!chatHistory || chatHistory.length === 0) {
            return socket.emit('reportConfirmation', { success: false, message: 'Não foi possível encontrar o histórico de chat para a denúncia.' });
        }
    
        try {
            await db.createChatReport(reporterProfile.id, reportedUserId, roomId, chatHistory.slice(0, 20)); // Pega as últimas 20 mensagens
            socket.emit('reportConfirmation', { success: true, message: 'Denúncia enviada com sucesso. Agradecemos sua colaboração.' });
        } catch (error) {
            console.error("Report Chat DB Error:", error);
            socket.emit('reportConfirmation', { success: false, message: 'Ocorreu um erro ao enviar sua denúncia.' });
        }
    });

    socket.on('changeMode', (mode) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (room && room.hostId === socket.id) {
            room.mode = mode;
            io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
        }
    });

    socket.on('startGame', () => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (!room || room.hostId !== socket.id || room.gameStarted) return;
    
        room.gameStarted = true;
        io.emit('roomList', getPublicRoomsList());
    
        const valueDeck = createDeck(VALUE_DECK_CONFIG, 'value');
        const effectDeck = createDeck(EFFECT_DECK_CONFIG, 'effect');
    
        let startingPlayerId;
        let drawResults = {};
        let tie = true;
    
        while (tie) {
            const drawnCards = {};
            const tempDeck = shuffle([...valueDeck]);
            room.players.forEach(p => { drawnCards[p.playerId] = tempDeck.pop(); });
            drawResults = drawnCards;
    
            const sortedPlayers = [...room.players].sort((a, b) => drawnCards[b.playerId].value - drawnCards[a.playerId].value);
    
            if (sortedPlayers.length < 2 || drawnCards[sortedPlayers[0].playerId].value > drawnCards[sortedPlayers[1].playerId].value) {
                tie = false;
                startingPlayerId = sortedPlayers[0].playerId;
            } else {
                 Object.values(drawnCards).forEach(card => valueDeck.push(card)); // Return cards to deck
                 shuffle(valueDeck);
            }
        }
    
        shuffle(valueDeck);
        shuffle(effectDeck);
    
        const playerIdsInGame = room.players.map(p => p.playerId);
        
        const players = Object.fromEntries(
            room.players.map((p, index) => [
                p.playerId,
                {
                    id: p.playerId, name: p.username, pathId: index, position: 1,
                    hand: [], 
                    resto: drawResults[p.playerId],
                    nextResto: null,
                    effects: { score: null, movement: null },
                    playedCards: { value: [], effect: [] },
                    playedValueCardThisTurn: false, liveScore: 0,
                    status: 'neutral', isEliminated: false
                }
            ])
        );
    
        Object.values(players).forEach(player => {
            for(let i=0; i < 3; i++) if(valueDeck.length > 0) player.hand.push(valueDeck.pop());
            for(let i=0; i < 2; i++) if(effectDeck.length > 0) player.hand.push(effectDeck.pop());
        });
    
        const boardPaths = generateBoardPaths();
        playerIdsInGame.forEach((id, index) => { 
            if(boardPaths[index]) boardPaths[index].playerId = id; 
        });
    
        const gameState = {
            players, playerIdsInGame,
            decks: { value: valueDeck, effect: effectDeck },
            discardPiles: { value: [], effect: [] },
            boardPaths: boardPaths, 
            gamePhase: 'initial_draw', // Start with draw phase
            gameMode: room.mode,
            isPvp: true, currentPlayer: startingPlayerId, turn: 1,
            log: [{ type: 'system', message: `Partida PvP iniciada! Modo: ${room.mode}` }],
            consecutivePasses: 0,
            drawResults: drawResults
        };
    
        room.gameState = gameState;
        io.to(roomId).emit('gameStarted', gameState);
        
        // After sending the initial state, transition to playing phase
        setTimeout(() => {
            if (rooms[roomId] && rooms[roomId].gameState) {
                rooms[roomId].gameState.gamePhase = 'playing';
                broadcastGameState(roomId);
            }
        }, 5000); // Delay to allow client-side draw animation
    });

    socket.on('playCard', ({ cardId, targetId, options = {} }) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const player = room?.players.find(p => p.id === socket.id);
        if (!room || !player || !room.gameState || room.gameState.currentPlayer !== player.playerId) return;
    
        const pState = room.gameState.players[player.playerId];
        const cardIndex = pState.hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return;
    
        const card = pState.hand[cardIndex]; // This is a reference to the card in the state
    
        // CORRECT: Modify the card object in the state BEFORE doing anything else
        if (options.isIndividualLock && card.name === 'Reversus Total' && options.effectNameToApply) {
            card.isLocked = true;
            card.lockedEffect = options.effectNameToApply;
        }
    
        // CORRECT: Robustly determine the target slot for animation
        let targetSlotLabel;
        if (card.type === 'value') {
            targetSlotLabel = pState.playedCards.value.length === 0 ? 'Valor 1' : 'Valor 2';
        } else {
            const effectNameToApply = card.isLocked ? card.lockedEffect : card.name;
            const effectTypeToReverse = options.effectType || null;
            
            if (['Mais', 'Menos'].includes(effectNameToApply) || (card.name === 'Reversus' && effectTypeToReverse === 'score')) {
                targetSlotLabel = 'Pontuação';
            } else if (['Sobe', 'Desce', 'Pula'].includes(effectNameToApply) || (card.name === 'Reversus' && effectTypeToReverse === 'movement')) {
                targetSlotLabel = 'Movimento';
            } else {
                targetSlotLabel = 'Reversus T.';
            }
        }
    
        io.to(roomId).emit('cardPlayedAnimation', { casterId: pState.id, targetId, card, targetSlotLabel });
    
        // Update state
        pState.hand.splice(cardIndex, 1);
        room.gameState.consecutivePasses = 0;
    
        if (card.type === 'value') {
            pState.playedCards.value.push(card);
            pState.playedValueCardThisTurn = true;
            pState.nextResto = card;
        } else {
            const destinationPlayer = room.gameState.players[targetId];
            if(destinationPlayer) destinationPlayer.playedCards.effect.push(card);
            applyEffect(room.gameState, card, targetId, player.username, options.effectType, options);
        }
    
        broadcastGameState(roomId);
    });

    socket.on('endTurn', () => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const player = room?.players.find(p => p.id === socket.id);
        if (!room || !player || !room.gameState || room.gameState.currentPlayer !== player.playerId) return;

        room.gameState.consecutivePasses++;

        const activePlayers = room.gameState.playerIdsInGame.filter(id => !room.gameState.players[id].isEliminated);
        if(activePlayers.length > 0 && room.gameState.consecutivePasses >= activePlayers.length){
            calculateScoresAndEndRound(room);
        } else {
            let currentIndex = room.gameState.playerIdsInGame.indexOf(room.gameState.currentPlayer);
            let nextIndex;
            do {
                nextIndex = (currentIndex + 1) % room.gameState.playerIdsInGame.length;
                currentIndex = nextIndex;
            } while (room.gameState.players[room.gameState.playerIdsInGame[nextIndex]].isEliminated);
            room.gameState.currentPlayer = room.gameState.playerIdsInGame[nextIndex];
            broadcastGameState(roomId);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        const userId = userSockets.get(socket.id);
        if (userId) {
            onlineUsers.delete(userId);
            userSockets.delete(socket.id);

            db.getFriendsList(userId).then(friends => {
                 friends.forEach(friend => {
                    const friendSocketId = onlineUsers.get(friend.id);
                    if (friendSocketId) {
                        io.to(friendSocketId).emit('friendStatusUpdate', { userId, isOnline: false });
                    }
                });
            }).catch(console.error);
        }

        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (room) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex > -1) {
                room.players.splice(playerIndex, 1);
                if (room.gameStarted) {
                     // Handle disconnect during a match (e.g., end game, declare winner)
                     io.to(roomId).emit('playerDisconnected', { message: 'Um jogador se desconectou. A partida foi encerrada.' });
                     delete rooms[roomId];
                } else if (room.players.length === 0) {
                    delete rooms[roomId]; // Delete empty rooms
                } else {
                    if (room.hostId === socket.id) {
                        room.hostId = room.players[0].id; // New host
                    }
                    io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
                }
            }
             io.emit('roomList', getPublicRoomsList());
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  testConnection();
});