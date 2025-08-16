# Imagem base oficial Node
FROM node:18

# Criar diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependência
COPY package*.json ./

# Instalar dependências
RUN npm install --production

# Copiar o restante do código
COPY . .

# Expor a porta (vai ser mapeada pelo EasyPanel)
EXPOSE 3000

# Comando de start
CMD ["npm", "start"]
