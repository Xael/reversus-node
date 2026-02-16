# 1. Imagem Base
FROM node:18

# 2. Diretório de trabalho
WORKDIR /app

# 3. Copia apenas os arquivos de dependência primeiro (otimiza o cache)
COPY package*.json ./

# 4. Instala as dependências
RUN npm install

# 5. Copia o restante do código
COPY . .

# 6. Expõe a porta que decidimos usar
EXPOSE 8080

# 7. Comando para iniciar o servidor
CMD ["node", "server.js"]
