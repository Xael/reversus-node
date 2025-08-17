const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.json');

// Garante que o arquivo de banco de dados exista na inicialização
function initializeDatabase() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({}), 'utf8');
    }
}

// Lê o banco de dados do arquivo
function readDb() {
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao ler o banco de dados, retornando um objeto vazio.", error);
        return {};
    }
}

// Escreve no banco de dados
function writeDb(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error("Erro ao escrever no banco de dados.", error);
    }
}

// Função para encontrar um usuário ou criar um novo se ele não existir
async function findOrCreateUser(googleProfile) {
    const db = readDb();
    const googleId = googleProfile.sub;

    if (db[googleId]) {
        // Atualiza nome e foto caso tenham mudado no Google
        db[googleId].name = googleProfile.name;
        db[googleId].picture = googleProfile.picture;
        writeDb(db);
        return db[googleId];
    }

    // Cria um novo usuário com estatísticas padrão
    const newUser = {
        googleId: googleId,
        name: googleProfile.name,
        email: googleProfile.email,
        picture: googleProfile.picture,
        stats: {
            wins: 0,
            losses: 0,
            xp: 0,
            level: 1
        },
        titles: ["Novato"],
        masteries: {
            reversusPlayed: 0,
            totalGames: 0,
        },
        matchHistory: []
    };

    db[googleId] = newUser;
    writeDb(db);
    return newUser;
}

// Adiciona XP e verifica se o jogador subiu de nível
function addXp(googleId, amount) {
    const db = readDb();
    const user = db[googleId];
    if (user) {
        user.stats.xp = (user.stats.xp || 0) + amount;
        
        let xpForNextLevel = 150 * user.stats.level;
        while (user.stats.xp >= xpForNextLevel) {
            user.stats.level++;
            user.stats.xp -= xpForNextLevel;
            xpForNextLevel = 150 * user.stats.level;
            console.log(`${user.name} subiu para o nível ${user.stats.level}!`);
            
            // Concede título por nível
            if (user.stats.level === 10 && !user.titles.includes("Veterano do Reversus")) {
                user.titles.push("Veterano do Reversus");
            }
        }
        writeDb(db);
    }
}

// Incrementa uma maestria específica e verifica se um título foi ganho
function incrementMastery(googleId, masteryKey) {
    const db = readDb();
    const user = db[googleId];
    if (user) {
        if (!user.masteries) user.masteries = {};
        user.masteries[masteryKey] = (user.masteries[masteryKey] || 0) + 1;

        // Verifica se ganhou o título de "Mestre do Reversus"
        if (masteryKey === 'reversusPlayed' && user.masteries.reversusPlayed >= 100 && !user.titles.includes("Mestre do Reversus")) {
            user.titles.push("Mestre do Reversus");
            console.log(`${user.name} ganhou o título "Mestre do Reversus"!`);
        }
        writeDb(db);
    }
}

// Adiciona uma partida ao histórico do jogador
function addMatchToHistory(googleId, matchData) {
    const db = readDb();
    const user = db[googleId];
    if (user) {
        if (!user.matchHistory) user.matchHistory = [];
        user.matchHistory.unshift(matchData); // Adiciona no início
        // Mantém o histórico com um tamanho máximo de 20 partidas
        if (user.matchHistory.length > 20) {
            user.matchHistory.pop();
        }
        // Incrementa o total de jogos
        user.masteries.totalGames = (user.masteries.totalGames || 0) + 1;
        writeDb(db);
    }
}


// Retorna os 10 melhores jogadores ordenados por vitórias
async function getTopTenPlayers() {
    const db = readDb();
    const players = Object.values(db);

    // Ordena os jogadores pelo número de vitórias (em ordem decrescente)
    players.sort((a, b) => (b.stats.wins || 0) - (a.stats.wins || 0));

    // Retorna apenas o top 10
    return players.slice(0, 10).map(p => ({
        name: p.name,
        wins: p.stats.wins,
    }));
}

// Retorna o perfil completo de um usuário
async function getUserProfile(googleId) {
    const db = readDb();
    return db[googleId] || null;
}

// Inicializa o banco de dados na primeira vez que o módulo é carregado
initializeDatabase();

module.exports = {
    findOrCreateUser,
    getTopTenPlayers,
    getUserProfile,
    addXp,
    incrementMastery,
    addMatchToHistory
};