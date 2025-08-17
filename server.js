// server.js - Versão Simplificada e Estável
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["https://reversus-game.dke42d.easypanel.host", "https://reversus.online"],
    methods: ["GET", "POST"]
  }
});

// Rota de verificação de saúde para garantir que o servidor está rodando.
app.get('/', (req, res) => {
  res.status(200).send('Reversus PvP Server is running and healthy!');
});

// Armazenamento em memória para salas.
const rooms = {};

function getRoomsList() {
    return Object.values(rooms)
        .filter(r => !r.gameStarted) // Apenas salas que não começaram
        .map(r => ({
            id: r.id,
            name: r.name,
            playerCount: r.players.length,
            mode: r.mode || '4 Jogadores',
        }));
}

io.on('connection', (socket) => {
    console.log(`Usuário conectado: ${socket.id}`);
    
    socket.emit('connected', { clientId: socket.id });

    // --- Gerenciamento de Lobby ---
    socket.on('listRooms', () => {
        socket.emit('roomList', getRoomsList());
    });

    socket.on('createRoom', () => {
        const username = socket.data.username || 'Anônimo';
        const roomId = `room-${Date.now()}`;
        rooms[roomId] = {
            id: roomId,
            name: `Sala de ${username}`,
            hostId: socket.id,
            players: [],
            gameStarted: false,
            mode: 'solo-4p',
        };
        console.log(`Sala criada: ${roomId} por ${username}`);
        io.emit('roomList', getRoomsList());
        socket.emit('roomCreated', roomId);
    });

    socket.on('joinRoom', (roomId) => {
        const room = rooms[roomId];
        const username = socket.data.username;

        if (room && room.players.length < 4) {
            socket.join(roomId);
            socket.data.roomId = roomId;

            const newPlayer = {
                id: socket.id,
                username: username,
                playerId: `player-${room.players.length + 1}`
            };
            room.players.push(newPlayer);

            console.log(`${username} entrou na sala ${roomId} como ${newPlayer.playerId}`);
            
            const roomDataForLobby = {
                id: room.id,
                name: room.name,
                hostId: room.hostId,
                players: room.players.map(p => ({ id: p.id, username: p.username })),
                mode: room.mode
            };

            io.to(roomId).emit('lobbyUpdate', roomDataForLobby);
            io.emit('roomList', getRoomsList());
        } else {
            socket.emit('error', 'Sala cheia ou não existe.');
        }
    });
    
    socket.on('leaveRoom', () => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;

        // Remove o jogador da sala
        rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
        socket.leave(roomId);
        console.log(`${socket.data.username} saiu da sala ${roomId}`);

        if (rooms[roomId].players.length === 0) {
            // Se a sala estiver vazia, delete-a
            delete rooms[roomId];
            console.log(`Sala ${roomId} deletada.`);
        } else {
            // Se o host saiu, elege um novo host
            if (rooms[roomId].hostId === socket.id) {
                rooms[roomId].hostId = rooms[roomId].players[0].id;
                 console.log(`Novo host para a sala ${roomId}: ${rooms[roomId].players[0].username}`);
            }
            // Atualiza o lobby para os jogadores restantes
             const roomDataForLobby = {
                id: rooms[roomId].id,
                name: rooms[roomId].name,
                hostId: rooms[roomId].hostId,
                players: rooms[roomId].players.map(p => ({ id: p.id, username: p.username })),
                mode: rooms[roomId].mode
            };
            io.to(roomId).emit('lobbyUpdate', roomDataForLobby);
        }
        io.emit('roomList', getRoomsList());
    });

    socket.on('lobbyChatMessage', (message) => {
        const roomId = socket.data.roomId;
        const username = socket.data.username;
        if (roomId && username && rooms[roomId]) {
            io.to(roomId).emit('lobbyChatMessage', { speaker: username, message });
        }
    });

    // --- Ações do Jogo ---
    // O servidor agora apenas retransmite as ações para os outros clientes.
    // O cliente que envia a ação já executa a lógica localmente.
    
    socket.on('playCard', (data) => {
        const roomId = socket.data.roomId;
        // Retransmite a ação para todos os OUTROS jogadores na sala
        if (roomId) {
            socket.to(roomId).emit('action:playCard', data);
        }
    });

    socket.on('endTurn', (data) => {
        const roomId = socket.data.roomId;
        if (roomId) {
            socket.to(roomId).emit('action:endTurn', data);
        }
    });

    // --- Desconexão ---
    socket.on('disconnect', () => {
        console.log(`Usuário desconectado: ${socket.id}`);
        // A lógica de 'leaveRoom' já lida com a limpeza
        const event = {
            target: {
                id: 'pvp-lobby-close-button'
            }
        };
        socket.emit('leaveRoom', event);
    });
});

// CORREÇÃO: Usar a porta fornecida pelo ambiente (EasyPanel) ou 3000 como padrão.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor PvP está rodando na porta ${PORT}`);
});