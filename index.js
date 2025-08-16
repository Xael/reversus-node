// index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Configura o socket.io com CORS
const io = new Server(server, {
  cors: {
    origin: ["https://reversus-game.dke42d.easypanel.host"], // frontend permitido
    methods: ["GET", "POST"]
  }
});

// Teste simples de rota HTTP
app.get("/", (req, res) => {
  res.send("Servidor Node do Reversus está rodando!");
});

// Eventos do socket
io.on("connection", (socket) => {
  console.log("Novo jogador conectado:", socket.id);

  socket.on("mensagem", (msg) => {
    console.log("Mensagem recebida:", msg);
    io.emit("mensagem", msg); // retransmite para todos
  });

  socket.on("disconnect", () => {
    console.log("Jogador desconectado:", socket.id);
  });
});

// Porta padrão (EasyPanel usa variável PORT)
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor Node ouvindo na porta ${PORT}`);
});
