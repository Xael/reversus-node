// server.js --- MODO DE DIAGNÓSTICO ---
// O objetivo deste arquivo é confirmar se a conexão entre o EasyPanel e seu container Node está funcionando.
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);

// Este é o passo mais importante: Descobrir em qual porta o EasyPanel espera que a gente escute.
const PORT = process.env.PORT || 3000;

// Middleware para logar TODAS as requisições que chegam ao servidor.
// Se você não vir esta mensagem nos logs, o EasyPanel não está enviando o tráfego para o lugar certo.
app.use((req, res, next) => {
  console.log(`[LOG DE DIAGNÓSTICO] Tentativa de requisição recebida: ${req.method} ${req.url} do IP ${req.ip}`);
  next();
});

// Rota de teste principal.
app.get('/', (req, res) => {
  // Se você vir esta mensagem no log, a conexão do EasyPanel com o Node está FUNCIONANDO.
  console.log(`[LOG DE DIAGNÓSTICO] SUCESSO! A rota '/' foi acessada.`);
  res.status(200).send(`
    <h1>Servidor de Diagnóstico Reversus está Online!</h1>
    <p>Se você está vendo esta página, a conexão entre o proxy do EasyPanel e o seu servidor Node está funcionando perfeitamente!</p>
    <p>O servidor está escutando na porta interna: <strong>${PORT}</strong></p>
    <p><b>Próximo Passo:</b> Agora você pode restaurar o arquivo 'server.js' original do jogo. O problema de conexão foi resolvido.</p>
  `);
});

// Escuta na porta e no host corretos para ambientes de contêiner.
server.listen(PORT, '0.0.0.0', () => {
  console.log('--- SERVIDOR EM MODO DE DIAGNÓSTICO ---');
  // Este log é crucial para saber a porta interna que o EasyPanel precisa usar.
  console.log(`[LOG DE DIAGNÓSTICO] O servidor está escutando na porta interna: ${PORT}`);
  console.log('Agora, acesse https://reversus-node.dke42d.easypanel.host/ no seu navegador e verifique os logs novamente.');
  console.log('Se nenhuma mensagem nova aparecer, verifique o mapeamento de portas no EasyPanel.');
  console.log('------------------------------------');
});