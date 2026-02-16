# 1. Imagem Base (Node 18 é estável e compatível)
FROM node:18

# 2. Diretório de trabalho dentro do container
WORKDIR /app

# 3. Copia os arquivos de configuração primeiro
COPY package*.json ./

# 4. Instala TODAS as dependências (inclusive as de dev para fazer o build)
# IMPORTANTE: Removemos o '--production' para que o comando 'build' funcione
RUN npm install

# 5. Copia todo o código do projeto para dentro do container
COPY . .

# 6. O PASSO MÁGICO: Constrói o frontend
# Isso transforma seus arquivos .tsx em .html e .js na pasta 'dist' (ou 'build')
RUN npm run build

# 7. Expõe a porta 3000 (para o Easypanel mapear)
EXPOSE 8080

# 8. Inicia o servidor Node direto (mais estável que npm start)
CMD ["node", "server.js"]

