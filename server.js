// server.js --- SERVIDOR DE JOGO PVP COMPLETO ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

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

const rooms = {};

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

const applyEffect = (gameState, card, targetId, casterName, effectTypeToReverse, options) => {
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
        io.to(room.id).emit('gameOver', `${winnerNames} venceu o jogo!`);
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

    if (winners.length > 1) { // Tie logic
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
        if (winners.includes(id)) movement++;
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
        const personalizedState = JSON.parse(JSON.stringify(room.gameState)); // Deep copy
        Object.keys(personalizedState.players).forEach(pId => {
            if (pId !== client.playerId && !(personalizedState.revealedHands || []).includes(pId)) {
                personalizedState.players[pId].hand = personalizedState.players[pId].hand.map(card => ({...card, isHidden: true}));
            }
        });
        personalizedState.myPlayerId = client.playerId;
        io.to(client.id).emit('gameStateUpdate', personalizedState);
    });
}
// --- FIM DAS FUNÇÕES HELPER ---


io.on('connection', (socket) => {
    console.log(`Jogador conectado: ${socket.id}`);

    socket.on('listRooms', () => { socket.emit('roomList', getPublicRoomsList()); });

    socket.on('createRoom', ({ username }) => {
        const roomId = `room-${Date.now()}`;
        const roomName = `Sala de ${username || 'Anônimo'}`;
        rooms[roomId] = {
            id: roomId, name: roomName, hostId: socket.id, players: [],
            gameStarted: false, mode: 'solo-4p', gameState: null
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

        const playerIdsInGame = room.players.map(p => p.playerId);
        const valueDeck = shuffle(createDeck(VALUE_DECK_CONFIG, 'value'));
        const effectDeck = shuffle(createDeck(EFFECT_DECK_CONFIG, 'effect'));
        const drawnCards = {};
        playerIdsInGame.forEach(id => { drawnCards[id] = valueDeck.pop(); });
        const sortedPlayers = [...playerIdsInGame].sort((a, b) => (drawnCards[b]?.value || 0) - (drawnCards[a]?.value || 0));
        let startingPlayer = sortedPlayers[0];
        
        const playersState = {};
        room.players.forEach((clientPlayer, index) => {
            const pId = clientPlayer.playerId;
            playersState[pId] = {
                id: pId, name: clientPlayer.username, isHuman: true,
                hand: [], pathId: index, position: 1, resto: drawnCards[pId], 
                nextResto: null, effects: { score: null, movement: null },
                playedCards: { value: [], effect: [] }, playedValueCardThisTurn: false,
                liveScore: 0, status: 'neutral', isEliminated: false,
            };
            for (let i = 0; i < MAX_VALUE_CARDS_IN_HAND; i++) playersState[pId].hand.push(valueDeck.pop());
            for (let i = 0; i < MAX_EFFECT_CARDS_IN_HAND; i++) playersState[pId].hand.push(effectDeck.pop());
        });
        
        const initialLog = [{ type: 'system', message: `${playersState[startingPlayer].name} tirou a carta mais alta e começa!` }];
        
        room.gameState = {
            playerIdsInGame, players: playersState,
            decks: { value: valueDeck, effect: effectDeck },
            discardPiles: { value: Object.values(drawnCards), effect: [] },
            boardPaths: generateBoardPaths(), gamePhase: 'playing', gameMode: room.mode, 
            currentPlayer: startingPlayer, turn: 1, log: initialLog, reversusTotalActive: false,
            consecutivePasses: 0, activeFieldEffects: [], revealedHands: [],
        };
        
        io.to(roomId).emit('gameStarted');
        broadcastGameState(roomId);
        console.log(`Jogo iniciado na sala ${roomId} no modo ${room.mode}`);
    });

    socket.on('playCard', ({ cardId, targetId, options = {} }) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const player = room?.players.find(p => p.id === socket.id);
        if (!room || !room.gameState || !player || room.gameState.currentPlayer !== player.playerId) return;

        const playerState = room.gameState.players[player.playerId];
        const cardIndex = playerState.hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return;

        const [card] = playerState.hand.splice(cardIndex, 1);
        room.gameState.consecutivePasses = 0;
        
        let cardDestinationPlayer = room.gameState.players[targetId];

        if (card.type === 'value') {
            playerState.playedCards.value.push(card);
            playerState.playedValueCardThisTurn = true;
            playerState.nextResto = card;
            room.gameState.log.unshift({ type: 'system', message: `${playerState.name} jogou a carta de valor ${card.name}.` });
        } else {
            if (options.isIndividualLock) {
                card.isLocked = true;
                card.lockedEffect = options.effectNameToApply;
            }
            if (card.name === 'Pula' && options.targetPath !== undefined) {
                cardDestinationPlayer.targetPathForPula = options.targetPath;
            }
            if (card.name === 'Reversus') {
                card.reversedEffectType = options.type;
            }
            
            cardDestinationPlayer.playedCards.effect.push(card);
            applyEffect(room.gameState, card, targetId, playerState.name, options.type, options);
        }
        
        broadcastGameState(roomId);
    });
    
    socket.on('endTurn', () => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const player = room?.players.find(p => p.id === socket.id);
        if (!room || !room.gameState || !player || room.gameState.currentPlayer !== player.playerId) return;

        room.gameState.consecutivePasses++;
        
        const activePlayers = room.gameState.playerIdsInGame.filter(id => !room.gameState.players[id].isEliminated);
        if (activePlayers.length > 0 && room.gameState.consecutivePasses >= activePlayers.length) {
            calculateScoresAndEndRound(room);
        } else {
            let currentIndex = room.gameState.playerIdsInGame.indexOf(room.gameState.currentPlayer);
            let nextIndex = currentIndex;
            do {
                nextIndex = (nextIndex + 1) % room.gameState.playerIdsInGame.length;
            } while (room.gameState.players[room.gameState.playerIdsInGame[nextIndex]].isEliminated);
            room.gameState.currentPlayer = room.gameState.playerIdsInGame[nextIndex];
            room.gameState.players[room.gameState.currentPlayer].playedValueCardThisTurn = false;
            
            broadcastGameState(roomId);
        }
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
        if (player && room.gameState) {
            const sanitizedMessage = String(message).substring(0, 150);
            room.gameState.log.unshift({ type: 'dialogue', speaker: player.username, message: sanitizedMessage });
            io.to(roomId).emit('chatMessage', { speaker: player.username, message: sanitizedMessage });
        }
    });

    const handleDisconnect = () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;
        const room = rooms[roomId];
        const disconnectedPlayer = room.players.find(p => p.id === socket.id);
        if (!disconnectedPlayer) return;

        if (room.gameStarted && room.gameState) {
            if (room.mode === 'duo') {
                io.to(roomId).emit('gameAborted', { message: `O jogador ${disconnectedPlayer.username} se desconectou. A partida em dupla foi encerrada.` });
                delete rooms[roomId];
            } else {
                const playerState = room.gameState.players[disconnectedPlayer.playerId];
                if (playerState && !playerState.isEliminated) {
                    playerState.isEliminated = true;
                    room.gameState.log.unshift({type: 'system', message: `${disconnectedPlayer.username} se desconectou e foi eliminado.`});
                    const activePlayers = room.gameState.playerIdsInGame.filter(id => !room.gameState.players[id].isEliminated);
                    if (activePlayers.length <= 1) {
                        const winnerName = activePlayers.length === 1 ? room.gameState.players[activePlayers[0]].name : "Ninguém";
                        io.to(roomId).emit('gameOver', `${winnerName} venceu por W.O.!`);
                        delete rooms[roomId];
                    } else {
                       if (room.gameState.currentPlayer === disconnectedPlayer.playerId) {
                           let currentIndex = room.gameState.playerIdsInGame.indexOf(room.gameState.currentPlayer);
                           let nextIndex = currentIndex;
                           do {
                               nextIndex = (nextIndex + 1) % room.gameState.playerIdsInGame.length;
                           } while (room.gameState.players[room.gameState.playerIdsInGame[nextIndex]].isEliminated);
                           room.gameState.currentPlayer = room.gameState.playerIdsInGame[nextIndex];
                       }
                       broadcastGameState(roomId);
                    }
                }
            }
        } else {
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                delete rooms[roomId];
            } else {
                if (room.hostId === socket.id) room.hostId = room.players[0].id;
                io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
            }
        }
        io.emit('roomList', getPublicRoomsList());
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
