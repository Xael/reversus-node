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

function getRoomsList() {
    return Object.values(rooms)
        .filter(r => !r.gameStarted)
        .map(r => ({
            id: r.id,
            name: r.name,
            playerCount: r.players.length,
            mode: 'solo-4p', // Modo padrão por enquanto
        }));
}

io.on('connection', (socket) => {
    console.log(`Jogador conectado: ${socket.id}`);

    socket.on('listRooms', () => {
        socket.emit('roomList', getRoomsList());
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
        };
        console.log(`Sala criada: ${roomId} por ${username}`);
        socket.emit('roomCreated', roomId);
        io.emit('roomList', getRoomsList()); // Atualiza a lista para todos
    });

    socket.on('joinRoom', ({ roomId, username }) => {
        const room = rooms[roomId];
        if (room && room.players.length < 4) {
            socket.data.roomId = roomId; // Armazena o ID da sala no socket para referência futura
            socket.join(roomId);

            const newPlayer = { id: socket.id, username, playerId: `player-${room.players.length + 1}` };
            room.players.push(newPlayer);
            
            console.log(`${username} entrou na sala ${roomId}`);
            
            const roomData = {
                id: room.id,
                name: room.name,
                hostId: room.hostId,
                players: room.players.map(p => ({ id: p.id, username: p.username })),
                mode: room.mode,
            };
            
            io.to(roomId).emit('lobbyUpdate', roomData); // Atualiza o lobby para todos na sala
            io.emit('roomList', getRoomsList()); // Atualiza a contagem de jogadores na lista de salas
        } else {
            socket.emit('error', 'A sala está cheia ou não existe.');
        }
    });

    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (room && room.hostId === socket.id && !room.gameStarted) {
            room.gameStarted = true;
            io.emit('roomList', getRoomsList()); // Remove a sala da lista pública

            // --- O SERVIDOR AGORA CRIA O ESTADO INICIAL DO JOGO ---
            const playerIdsInGame = room.players.map(p => p.playerId);
            const valueDeck = shuffle(createDeck(VALUE_DECK_CONFIG, 'value'));
            const effectDeck = shuffle(createDeck(EFFECT_DECK_CONFIG, 'effect'));

            const playersState = {};
            room.players.forEach(clientPlayer => {
                const pId = clientPlayer.playerId;
                playersState[pId] = {
                    id: pId,
                    name: clientPlayer.username,
                    isHuman: true, // Todos os jogadores no PvP são humanos
                    hand: [],
                    pathId: playerIdsInGame.indexOf(pId),
                    position: 1,
                    resto: null,
                    nextResto: null,
                    effects: { score: null, movement: null },
                    playedCards: { value: [], effect: [] },
                    playedValueCardThisTurn: false,
                    liveScore: 0,
                };
                // Distribuir cartas
                for (let i = 0; i < MAX_VALUE_CARDS_IN_HAND; i++) playersState[pId].hand.push(valueDeck.pop());
                for (let i = 0; i < MAX_EFFECT_CARDS_IN_HAND; i++) playersState[pId].hand.push(effectDeck.pop());
            });

            const initialGameState = {
                players: playersState,
                playerIdsInGame,
                decks: { value: valueDeck, effect: effectDeck },
                discardPiles: { value: [], effect: [] },
                // A lógica do tabuleiro (boardPaths) é complexa e será mantida no cliente por enquanto
                // O servidor apenas gerencia jogadores, cartas e turnos.
                boardPaths: [], // O cliente irá gerar isso
                gamePhase: 'playing',
                gameMode: room.mode,
                currentPlayer: 'player-1',
                turn: 1,
                log: [`O jogo começou na ${room.name}!`],
            };
            
            // Envia o estado inicial para todos na sala
            io.to(roomId).emit('gameStarted', initialGameState);
            console.log(`Jogo iniciado na sala ${roomId}`);
        }
    });
    
    // --- Retransmissores de Ações (Action Relays) ---
    socket.on('playCard', (data) => {
        const roomId = socket.data.roomId;
        if(roomId) {
            // Retransmite a ação para TODOS os outros clientes na sala
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
            // Remove o jogador da sala
            room.players = room.players.filter(p => p.id !== socket.id);
            
            if (room.players.length === 0) {
                delete rooms[roomId];
                console.log(`Sala vazia e deletada: ${roomId}`);
            } else {
                 // Se o líder saiu, elege um novo
                if (room.hostId === socket.id) {
                    room.hostId = room.players[0].id;
                }
                 const roomData = {
                    id: room.id, name: room.name, hostId: room.hostId,
                    players: room.players.map(p => ({ id: p.id, username: p.username })),
                    mode: room.mode,
                };
                io.to(roomId).emit('lobbyUpdate', roomData);
            }
            io.emit('roomList', getRoomsList());
        }
    };

    socket.on('leaveRoom', handleDisconnect);
    socket.on('disconnect', handleDisconnect);
});

// Usa a porta do ambiente ou 3000 como padrão
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`--- SERVIDOR DE JOGO REVERSUS ONLINE ---`);
    console.log(`O servidor está rodando e escutando na porta: ${PORT}`);
    console.log(`Aguardando conexões de jogadores...`);
    console.log('------------------------------------');
});