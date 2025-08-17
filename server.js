// server.js --- SERVIDOR DE JOGO PVP COMPLETO ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Configuração de CORS para permitir conexões do seu domínio de jogo
const io = new Server(server, {
  cors: {
    origin: ["https://reversus.online", "https://reversus-game.dke42d.easypanel.host"],
    methods: ["GET", "POST"]
  }
});

// --- Lógica de Jogo Reutilizada no Servidor ---
const VALUE_DECK_CONFIG = [{ value: 2, count: 12 }, { value: 4, count: 10 }, { value: 6, count: 8 }, { value: 8, count: 6 }, { value: 10, count: 4 }];
const EFFECT_DECK_CONFIG = [{ name: 'Mais', count: 4 }, { name: 'Menos', count: 4 }, { name: 'Sobe', count: 4 }, { name: 'Desce', count: 4 }, { name: 'Pula', count: 4 }, { name: 'Reversus', count: 4 }, { name: 'Reversus Total', count: 1 }];
const MAX_VALUE_CARDS_IN_HAND = 3;
const MAX_EFFECT_CARDS_IN_HAND = 2;
const TEAM_A_IDS = ['player-1', 'player-3'];
const TEAM_B_IDS = ['player-2', 'player-4'];


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
// --- Fim da Lógica de Jogo Reutilizada ---

// Armazenamento em memória para as salas de jogo
const rooms = {};

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

io.on('connection', (socket) => {
    console.log(`Jogador conectado: ${socket.id}`);
    socket.emit('connected', { clientId: socket.id });

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
            mode: 'solo-4p', // Modo Padrão
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
        
        // Validação do lado do servidor para garantir que o número de jogadores é correto para o modo
        const playerCount = room.players.length;
        let isValidStart = false;
        switch (room.mode) {
            case 'solo-2p': isValidStart = playerCount === 2; break;
            case 'solo-3p': isValidStart = playerCount === 3; break;
            case 'solo-4p': isValidStart = playerCount === 4; break;
            case 'duo': isValidStart = playerCount === 4; break;
        }

        if (!isValidStart) {
            console.log(`Tentativa de iniciar o jogo na sala ${roomId} com configuração inválida.`);
            socket.emit('error', 'Não é possível iniciar a partida. O número de jogadores é incorreto para o modo de jogo selecionado.');
            return;
        }

        room.gameStarted = true;
        io.emit('roomList', getPublicRoomsList());

        const playerClients = room.players;
        const playerIdsInGame = playerClients.map(p => p.playerId);
        const valueDeck = shuffle(createDeck(VALUE_DECK_CONFIG, 'value'));
        const effectDeck = shuffle(createDeck(EFFECT_DECK_CONFIG, 'effect'));

        const playersState = {};
        playerClients.forEach(clientPlayer => {
            const pId = clientPlayer.playerId;
            playersState[pId] = {
                id: pId, name: clientPlayer.username, isHuman: true,
                hand: [], pathId: playerIdsInGame.indexOf(pId), position: 1,
                resto: null, nextResto: null, effects: { score: null, movement: null },
                playedCards: { value: [], effect: [] }, playedValueCardThisTurn: false,
                liveScore: 0, status: 'neutral', isEliminated: false,
            };
            for (let i = 0; i < MAX_VALUE_CARDS_IN_HAND; i++) playersState[pId].hand.push(valueDeck.pop());
            for (let i = 0; i < MAX_EFFECT_CARDS_IN_HAND; i++) playersState[pId].hand.push(effectDeck.pop());
        });

        const initialGameState = {
            players: playersState, playerIdsInGame,
            decks: { value: valueDeck, effect: effectDeck },
            discardPiles: { value: [], effect: [] },
            gamePhase: 'playing', gameMode: room.mode, currentPlayer: 'player-1',
            turn: 1, log: [`O jogo começou na ${room.name}!`],
            reversusTotalActive: false, consecutivePasses: 0,
            activeFieldEffects: [],
            revealedHands: [], // CORREÇÃO CRÍTICA: Adiciona a propriedade que faltava.
        };
        
        // Lógica de Times para o modo Duplas
        if (room.mode === 'duo') {
            initialGameState.teamA = TEAM_A_IDS.filter(id => playerIdsInGame.includes(id));
            initialGameState.teamB = TEAM_B_IDS.filter(id => playerIdsInGame.includes(id));
        }

        // Envia um estado de jogo personalizado para cada jogador
        playerClients.forEach(client => {
            const personalizedState = {
                ...initialGameState,
                myPlayerId: client.playerId, // Informa ao cliente qual jogador ele é
            };
            io.to(client.id).emit('gameStarted', personalizedState);
        });
        console.log(`Jogo iniciado na sala ${roomId} no modo ${room.mode}`);
    });
    
    // Retransmissores de Ações (Action Relays)
    socket.on('playCard', (data) => {
        const roomId = socket.data.roomId;
        if(roomId) {
            socket.to(roomId).emit('action:playCard', data);
        }
    });

    socket.on('endTurn', (data) => {
        const roomId = socket.data.roomId;
        if(roomId) {
            socket.to(roomId).emit('action:endTurn', data);
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

    const handleDisconnect = () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            const disconnectedPlayer = room.players.find(p => p.id === socket.id);
            if (!disconnectedPlayer) return;

            // Se o jogo já começou, avisa a todos e encerra a sala.
            if (room.gameStarted) {
                io.to(roomId).emit('gameAborted', { 
                    message: `O jogador ${disconnectedPlayer.username} se desconectou. A partida foi encerrada.`
                });
                delete rooms[roomId];
                console.log(`Partida na sala ${roomId} encerrada devido a desconexão.`);
                io.emit('roomList', getPublicRoomsList());
                return;
            }

            // Se o jogo não começou, apenas remove o jogador do lobby.
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