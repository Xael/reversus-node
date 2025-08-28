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

const quickPvpQueues = {
    '1v1': [],
    '2v2': [],
    '4p': []
};
const playerQueueMap = new Map(); // socket.id -> mode

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

const checkGameEnd = async (room) => {
    const { gameState } = room;
    const gameWinners = gameState.playerIdsInGame.filter(id => !gameState.players[id].isEliminated && gameState.players[id].position >= WINNING_POSITION);
    
    if (gameWinners.length > 0) {
        gameState.gamePhase = 'game_over';
        const winnerNames = gameWinners.map(id => gameState.players[id].name).join(' e ');

        let message = `${winnerNames} venceu o jogo!`;
        // Award pot to winner(s) only if it's a betting match
        if (gameState.isBettingMatch && gameState.pot > 0) {
            const potPerWinner = Math.floor(gameState.pot / gameWinners.length);
            for (const winnerId of gameWinners) {
                const winnerClient = room.players.find(p => p.playerId === winnerId);
                if (winnerClient) {
                    await db.updateCoinVersus(winnerClient.userProfile.id, potPerWinner);
                }
            }
            message = `${winnerNames} venceu o jogo e ganhou ${gameState.pot} CoinVersus!`;
        }
        
        io.to(room.id).emit('gameOver', { message, winnerId: gameWinners[0] });
        delete rooms[room.id];
        return true;
    }
    return false;
};

const startNewRound = async (room) => {
    const { gameState } = room;
    gameState.turn++;
    gameState.log.unshift({ type: 'system', message: `--- Iniciando Rodada ${gameState.turn} ---`});

    // Betting logic for the new round, only if it's a betting match
    if (gameState.isBettingMatch) {
        const betIncrease = gameState.turn;
        gameState.log.unshift({ type: 'system', message: `Aposta da rodada aumentada em ${betIncrease} CoinVersus por jogador.` });

        for (const p of room.players) {
            const playerState = gameState.players[p.playerId];
            if (playerState && !playerState.isEliminated) {
                try {
                    const user = await db.getUserProfile(p.userProfile.google_id);
                    if (user.coinversus >= betIncrease) {
                        await db.updateCoinVersus(p.userProfile.id, -betIncrease);
                        gameState.pot += betIncrease;
                        gameState.playerContributions[p.playerId] += betIncrease;
                    } else {
                        gameState.log.unshift({ type: 'system', message: `${p.username} não tem CoinVersus suficientes para a aposta.` });
                    }
                } catch (error) {
                    console.error(`Error handling bet for player ${p.username}:`, error);
                }
            }
        }
    }


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

const calculateScoresAndEndRound = async (room) => {
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

    if (await checkGameEnd(room)) return;

    if (winners.length > 0) {
        const winnerTurnOrder = gameState.playerIdsInGame.filter(pId => winners.includes(pId));
        gameState.currentPlayer = winnerTurnOrder[0];
    }
    
    await startNewRound(room);
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

function removePlayerFromQueue(socketId) {
    const mode = playerQueueMap.get(socketId);
    if (mode && quickPvpQueues[mode]) {
        const index = quickPvpQueues[mode].findIndex(p => p.id === socketId);
        if (index > -1) {
            quickPvpQueues[mode].splice(index, 1);
            playerQueueMap.delete(socketId);
            return { mode, remainingPlayers: quickPvpQueues[mode] };
        }
    }
    return null;
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
            socket.data.userId = userProfile.id;
            socket.emit('loginSuccess', await db.getUserProfile(userProfile.google_id, userProfile.id));

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
        } catch(error) { console.error("Get Friends List Error:", error); }
    });

    socket.on('sendPrivateMessage', async ({ recipientId, content }) => {
        if (!socket.data.userProfile) return;
        const senderId = socket.data.userProfile.id;
        try {
            await db.savePrivateMessage(senderId, recipientId, content);
            const recipientSocketId = onlineUsers.get(recipientId);
            const messageData = {
                senderId,
                senderUsername: socket.data.userProfile.username,
                recipientId,
                content,
                timestamp: new Date()
            };
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('privateMessage', messageData);
            }
            socket.emit('privateMessage', messageData);
        } catch (error) { console.error('Send Private Message Error:', error); }
    });

    // --- Lógica de Salas e Jogo ---
    socket.on('listRooms', () => {
        socket.emit('roomList', getPublicRoomsList());
    });
    
    socket.on('createRoom', () => {
        if (!socket.data.userProfile) return;
        const roomId = `room-${Date.now()}`;
        const room = {
            id: roomId,
            name: `${socket.data.userProfile.username}'s Room`,
            players: [],
            hostId: socket.id,
            mode: 'solo-4p',
            gameStarted: false,
            gameState: null
        };
        rooms[roomId] = room;
        io.emit('roomList', getPublicRoomsList());
        socket.emit('roomCreated', roomId);
    });

    socket.on('joinRoom', ({ roomId }) => {
        if (!socket.data.userProfile) return;
        const room = rooms[roomId];
        if (room && !room.gameStarted && room.players.length < 4) {
            socket.join(roomId);
            socket.data.roomId = roomId;

            const playerIds = ['player-1', 'player-2', 'player-3', 'player-4'];
            const usedPlayerIds = room.players.map(p => p.playerId);
            const availablePlayerId = playerIds.find(id => !usedPlayerIds.includes(id));

            if (availablePlayerId) {
                const clientData = {
                    id: socket.id,
                    username: socket.data.userProfile.username,
                    googleId: socket.data.userProfile.google_id,
                    title_code: socket.data.userProfile.selected_title_code,
                    userProfile: socket.data.userProfile,
                    playerId: availablePlayerId
                };
                room.players.push(clientData);

                socket.emit('joinedRoom', getLobbyDataForRoom(room));
                io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
                io.emit('roomList', getPublicRoomsList());
            } else {
                socket.emit('error', 'Não foi possível encontrar um slot de jogador disponível.');
            }
        } else {
            socket.emit('error', 'A sala está cheia ou o jogo já começou.');
        }
    });

    socket.on('leaveRoom', () => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;
        
        const room = rooms[roomId];
        socket.leave(roomId);
        room.players = room.players.filter(p => p.id !== socket.id);
        socket.data.roomId = null;

        if (room.players.length === 0) {
            delete rooms[roomId];
        } else {
            if (socket.id === room.hostId) {
                room.hostId = room.players[0].id;
            }
            io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
        }
        
        io.emit('roomList', getPublicRoomsList());
        socket.emit('leftRoom');
    });

    socket.on('changeMode', ({ mode }) => {
        const room = rooms[socket.data.roomId];
        if (room && room.hostId === socket.id) {
            room.mode = mode;
            io.to(room.id).emit('lobbyUpdate', getLobbyDataForRoom(room));
        }
    });
    
    // Quick PVP Handlers
    socket.on('joinQuickPvpQueue', ({ mode }) => {
        if (!socket.data.userProfile || !quickPvpQueues[mode]) return;
        if (playerQueueMap.has(socket.id)) return; // Already in a queue

        const playerInfo = { id: socket.id, userProfile: socket.data.userProfile };
        quickPvpQueues[mode].push(playerInfo);
        playerQueueMap.set(socket.id, mode);
        
        const required = mode === '1v1' ? 2 : 4;
        const current = quickPvpQueues[mode].length;
        
        quickPvpQueues[mode].forEach(player => {
            io.to(player.id).emit('queueUpdate', { inQueue: true, mode, current, required });
        });

        if (current === required) {
            const playersForMatch = quickPvpQueues[mode].splice(0, required);
            playersForMatch.forEach(p => playerQueueMap.delete(p.id));
            
            const roomId = `quick-pvp-${Date.now()}`;
            const room = {
                id: roomId,
                name: `Quick PVP Match`,
                players: [],
                hostId: playersForMatch[0].id,
                mode: mode === '1v1' ? 'solo-2p' : (mode === '2v2' ? 'duo' : 'solo-4p'),
                gameStarted: true,
                gameState: null
            };
            rooms[roomId] = room;

            const playerIds = ['player-1', 'player-2', 'player-3', 'player-4'].slice(0, required);
            
            playersForMatch.forEach((p, index) => {
                const playerSocket = io.sockets.sockets.get(p.id);
                if (playerSocket) {
                    playerSocket.join(roomId);
                    playerSocket.data.roomId = roomId;
                    const clientData = {
                        id: p.id,
                        username: p.userProfile.username,
                        googleId: p.userProfile.google_id,
                        title_code: p.userProfile.selected_title_code,
                        userProfile: p.userProfile,
                        playerId: playerIds[index]
                    };
                    room.players.push(clientData);
                    io.to(p.id).emit('queueUpdate', { inQueue: false });
                }
            });

            const valueDeck = shuffle(createDeck(VALUE_DECK_CONFIG, 'value'));
            const effectDeck = shuffle(createDeck(EFFECT_DECK_CONFIG, 'effect'));
            const playerStates = {};
            room.players.forEach(p => {
                playerStates[p.playerId] = { id: p.playerId, name: p.username, pathId: room.players.indexOf(p), position: 1, hand: [], resto: null, nextResto: null, effects: { score: null, movement: null }, playedCards: { value: [], effect: [] }, playedValueCardThisTurn: false, liveScore: 0, status: 'neutral', isEliminated: false };
            });
            
            room.gameState = { players: playerStates, playerIdsInGame: playerIds, decks: { value: valueDeck, effect: effectDeck }, discardPiles: { value: [], effect: [] }, boardPaths: generateBoardPaths(), gamePhase: 'initial_draw', isPvp: true, isBettingMatch: false, pot: 0, playerContributions: {}, gameMode: room.mode, turn: 1, currentPlayer: 'player-1', log: [{ type: 'system', message: 'Partida Rápida encontrada! Sorteando quem começa...' }] };
            
            const drawnCards = {};
            for (const id of playerIds) { drawnCards[id] = dealCard(room.gameState, 'value'); }
            const sortedPlayers = [...playerIds].sort((a, b) => (drawnCards[b]?.value || 0) - (drawnCards[a]?.value || 0));
            room.gameState.currentPlayer = sortedPlayers[0];
            room.gameState.drawResults = drawnCards;

            playerIds.forEach(id => {
                const player = room.gameState.players[id];
                player.resto = drawnCards[id];
                while (player.hand.filter(c => c.type === 'value').length < MAX_VALUE_CARDS_IN_HAND) { const c = dealCard(room.gameState, 'value'); if(c) player.hand.push(c); else break; }
                while (player.hand.filter(c => c.type === 'effect').length < MAX_EFFECT_CARDS_IN_HAND) { const c = dealCard(room.gameState, 'effect'); if(c) player.hand.push(c); else break; }
            });
            room.gameState.gamePhase = 'playing';

            io.to(roomId).emit('gameStarted', room.gameState);
        }
    });

    socket.on('leaveQuickPvpQueue', () => {
        const queueResult = removePlayerFromQueue(socket.id);
        if (queueResult) {
            const { mode, remainingPlayers } = queueResult;
            const required = mode === '1v1' ? 2 : 4;
            remainingPlayers.forEach(player => { io.to(player.id).emit('queueUpdate', { inQueue: true, mode, current: remainingPlayers.length, required }); });
        }
        socket.emit('queueUpdate', { inQueue: false });
    });

    socket.on('disconnect', async () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        const userId = userSockets.get(socket.id);
        if (userId) {
            onlineUsers.delete(userId);
            userSockets.delete(socket.id);
            const friends = await db.getFriendsList(userId);
            friends.forEach(friend => {
                const friendSocketId = onlineUsers.get(friend.id);
                if (friendSocketId) {
                    io.to(friendSocketId).emit('friendStatusUpdate', { userId, isOnline: false });
                }
            });
        }
        
        const queueResult = removePlayerFromQueue(socket.id);
        if (queueResult) {
            const { mode, remainingPlayers } = queueResult;
            const required = mode === '1v1' ? 2 : 4;
            remainingPlayers.forEach(player => { io.to(player.id).emit('queueUpdate', { inQueue: true, mode, current: remainingPlayers.length, required }); });
        }

        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            const disconnectedPlayer = room.players.find(p => p.id === socket.id);
            room.players = room.players.filter(p => p.id !== socket.id);

            if (room.players.length === 0) {
                delete rooms[roomId];
                io.emit('roomList', getPublicRoomsList());
            } else {
                if (room.gameStarted && room.gameState) {
                    const playerState = room.gameState.players[disconnectedPlayer.playerId];
                    if (playerState) {
                        playerState.isEliminated = true;
                        room.gameState.log.unshift({ type: 'system', message: `${disconnectedPlayer.username} se desconectou.` });
                        const activePlayers = room.gameState.playerIdsInGame.filter(id => !room.gameState.players[id].isEliminated);
                        if (activePlayers.length <= 1) {
                            if (activePlayers.length === 1) {
                                const winnerId = activePlayers[0];
                                const winnerName = room.gameState.players[winnerId].name;
                                let message = `${winnerName} venceu por desistência do oponente!`;
                                if (room.gameState.isBettingMatch && room.gameState.pot > 0) {
                                    const winnerClient = room.players.find(p => p.playerId === winnerId);
                                    if (winnerClient) {
                                        const totalWinnings = room.gameState.pot;
                                        db.updateCoinVersus(winnerClient.userProfile.id, totalWinnings);
                                        message = `${winnerName} venceu e ganhou ${totalWinnings} CoinVersus!`;
                                    }
                                }
                                io.to(room.id).emit('gameOver', { message, winnerId });
                            }
                            delete rooms[roomId];
                        } else {
                           broadcastGameState(room.id);
                        }
                    }
                } else {
                    if (socket.id === room.hostId) {
                        room.hostId = room.players[0].id;
                    }
                    io.to(room.id).emit('lobbyUpdate', getLobbyDataForRoom(room));
                    io.emit('roomList', getPublicRoomsList());
                }
            }
        }
    });
});

// Chame testConnection ao iniciar o servidor
db.testConnection();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});