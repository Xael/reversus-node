// db.js - Adaptador de Banco de Dados PostgreSQL para Reversus
const { Pool } = require('pg');

// A configuração do pool agora usará apenas a connectionString.
// O modo SSL será determinado pelo parâmetro `sslmode` na própria URL.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// --- FUNÇÃO DE TESTE DE CONEXÃO ---
async function testConnection() {
  let client;
  try {
    client = await pool.connect();
    console.log("Conexão com o banco de dados bem-sucedida!");
  } catch (err) {
    console.error("ERRO DE CONEXÃO COM O BANCO DE DADOS:", err.stack);
  } finally {
    if (client) {
      client.release();
    }
  }
}

// --- ESTRUTURA DE DADOS ---

const TITLES = {
    // Linha "Cartas e Estratégia"
    'aprendiz_resto': { name: 'Aprendiz do Resto', line: 'Cartas', unlocks: { level: 2, victories: 1 } },
    'jogador_invertido': { name: 'Jogador Invertido', line: 'Cartas', unlocks: { level: 5, victories: 5 } },
    'cartomante_sorte': { name: 'Cartomante da Sorte', line: 'Cartas', unlocks: { level: 8, victories: 10 } },
    'tatico_reverso': { name: 'Tático do Reverso', line: 'Cartas', unlocks: { level: 10, victories: 20 } },
    'estrategista_tabuleiro': { name: 'Estrategista do Tabuleiro', line: 'Cartas', unlocks: { level: 15, victories: 30 } },
    'mestre_resto': { name: 'Mestre do Resto', line: 'Cartas', unlocks: { level: 20, victories: 50 } },
    'lorde_reversus': { name: 'Lorde Reversus', line: 'Cartas', unlocks: { level: 30, victories: 75, achievement: 'reversum_win' } },
    'arquiteto_caos': { name: 'Arquiteto do Caos', line: 'Cartas', unlocks: { level: 40, victories: 100, achievement: 'true_end_beta' } },
    'soberano_tabuleiro': { name: 'Soberano do Tabuleiro', line: 'Cartas', unlocks: { level: 50, victories: 150, achievement: 'true_end_final' } },
    'eterno_reversus': { name: 'Eterno Reversus', line: 'Cartas', unlocks: { level: 75, victories: 200, achievement: 'inversus_win' } },

    // Linha "Tabuleiro e Caminhos" - Desbloqueio por nível
    'peao_errante': { name: 'Peão Errante', line: 'Tabuleiro', unlocks: { level: 3 } },
    'viajante_casas': { name: 'Viajante das Casas', line: 'Tabuleiro', unlocks: { level: 7 } },
    'explorador_caminhos': { name: 'Explorador de Caminhos', line: 'Tabuleiro', unlocks: { level: 12 } },
    'guardiao_cores': { name: 'Guardião das Cores', line: 'Tabuleiro', unlocks: { level: 18 } },
    'portador_destino': { name: 'Portador do Destino', line: 'Tabuleiro', unlocks: { level: 25 } },
    'domador_efeitos': { name: 'Domador de Efeitos', line: 'Tabuleiro', unlocks: { level: 35 } },
    'senhor_espacos': { name: 'Senhor dos Espaços', line: 'Tabuleiro', unlocks: { level: 45 } },
    'comandante_caminhos': { name: 'Comandante dos Caminhos', line: 'Tabuleiro', unlocks: { level: 55 } },
    'arquimago_rotas': { name: 'Arquimago das Rotas', line: 'Tabuleiro', unlocks: { level: 65 } },
    'deus_tabuleiro': { name: 'Deus do Tabuleiro', line: 'Tabuleiro', unlocks: { level: 80 } },

    // Linha "Competitiva / PvP" - Desbloqueio por vitórias
    'recruta': { name: 'Recruta', line: 'PvP', unlocks: { victories: 1 } },
    'desafiante': { name: 'Desafiante', line: 'PvP', unlocks: { victories: 10 } },
    'combatente': { name: 'Combatente', line: 'PvP', unlocks: { victories: 25 } },
    'veterano': { name: 'Veterano', line: 'PvP', unlocks: { victories: 50 } },
    'campeao': { name: 'Campeão', line: 'PvP', unlocks: { victories: 75 } },
    'lenda': { name: 'Lenda', line: 'PvP', unlocks: { victories: 100 } },
    'ascendente': { name: 'Ascendente', line: 'PvP', unlocks: { victories: 125 } },
    'imortal': { name: 'Imortal', line: 'PvP', unlocks: { victories: 150 } },
    'tita': { name: 'Titã', line: 'PvP', unlocks: { victories: 175 } },
    'supremo_reversus': { name: 'Supremo Reversus', line: 'PvP', unlocks: { victories: 250 } },

    // Títulos de Evento
    'event_jan': { name: 'O Visionário', line: 'Evento' },
    'event_feb': { name: 'Unidor de Restos', line: 'Evento' },
    'event_mar': { name: 'Abençoado pelo Resto', line: 'Evento' },
    'event_apr': { name: 'Guardião das Runas', line: 'Evento' },
    'event_may': { name: 'Sombras no Tabuleiro', line: 'Evento' },
    'event_jun': { name: 'O Ardente', line: 'Evento' },
    'event_jul': { name: 'Ladrão de Restos', line: 'Evento' },
    'event_aug': { name: 'O Eterno', line: 'Evento' },
    'event_sep': { name: 'Caçador de Segredos', line: 'Evento' },
    'event_oct': { name: 'Feiticeiro do Tabuleiro', line: 'Evento' },
    'event_nov': { name: 'Congelador de Destinos', line: 'Evento' },
    'event_dec': { name: 'Luz do Fim de Ano', line: 'Evento' },
};


// --- HELPERS ---
function levelFromXp(xp) {
  if (!xp || xp < 100) return 1;
  return Math.floor(1 + Math.sqrt(xp / 100));
}

// --- CRIAÇÃO DO ESQUEMA DO BANCO ---
async function ensureSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sql = `
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        google_id     TEXT UNIQUE NOT NULL,
        username      TEXT NOT NULL,
        avatar_url    TEXT,
        created_at    TIMESTAMPTZ DEFAULT now(),
        xp            INT DEFAULT 0,
        level         INT DEFAULT 1,
        victories     INT DEFAULT 0,
        defeats       INT DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS user_match_history (
        id         SERIAL PRIMARY KEY,
        user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        outcome    TEXT NOT NULL CHECK (outcome IN ('Vitória','Derrota')),
        mode       TEXT NOT NULL,
        opponents  TEXT NOT NULL,
        date       TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS titles (
        id          SERIAL PRIMARY KEY,
        code        TEXT UNIQUE NOT NULL,
        name        TEXT NOT NULL,
        line        TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_titles (
        user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title_id    INT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
        earned_at   TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (user_id, title_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_users_victories ON users (victories DESC);
    `;
    await client.query(sql);

    // Semeia a tabela de títulos
    for (const [code, data] of Object.entries(TITLES)) {
        await client.query(
            `INSERT INTO titles (code, name, line) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
            [code, data.name, data.line]
        );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// --- API DO BANCO DE DADOS ---

async function findOrCreateUser(googlePayload) {
  const { sub: googleId, name, picture: avatarUrl } = googlePayload;
  
  // Primeiro, tenta encontrar o usuário
  let res = await pool.query(`SELECT * FROM users WHERE google_id = $1`, [googleId]);
  
  if (res.rows.length === 0) {
    // Se não encontrar, cria um novo
    res = await pool.query(
      `INSERT INTO users (google_id, username, avatar_url) VALUES ($1, $2, $3)
       RETURNING *`,
      [googleId, name, avatarUrl]
    );
  }
  
  return res.rows[0];
}

async function addXp(googleId, amount) {
  const { rows } = await pool.query(`SELECT id, xp FROM users WHERE google_id = $1`, [googleId]);
  if (!rows[0]) return;

  const newXp = (rows[0].xp || 0) + Number(amount || 0);
  const newLevel = levelFromXp(newXp);

  await pool.query(
    `UPDATE users SET xp = $1, level = $2 WHERE id = $3`,
    [newXp, newLevel, rows[0].id]
  );
}

async function addMatchToHistory(googleId, matchData) {
  const { rows } = await pool.query(`SELECT id FROM users WHERE google_id = $1`, [googleId]);
  if (!rows[0]) return;
  const userId = rows[0].id;

  const { outcome, mode, opponents } = matchData;
  await pool.query(
    `INSERT INTO user_match_history (user_id, outcome, mode, opponents) VALUES ($1, $2, $3, $4)`,
    [userId, outcome, mode, opponents || 'N/A']
  );

  // Atualiza contadores de vitórias/derrotas
  if (outcome === 'Vitória') {
    await pool.query(`UPDATE users SET victories = victories + 1 WHERE id = $1`, [userId]);
  } else if (outcome === 'Derrota') {
    await pool.query(`UPDATE users SET defeats = defeats + 1 WHERE id = $1`, [userId]);
  }
}

async function checkAndGrantTitles(googleId) {
    const userRes = await pool.query(`SELECT * FROM users WHERE google_id = $1`, [googleId]);
    if (!userRes.rows[0]) return;
    const user = userRes.rows[0];

    // NOTA: A verificação de conquistas foi removida. O servidor não pode verificar
    // conquistas que são armazenadas apenas no lado do cliente (localStorage).
    // A concessão de títulos agora se baseia apenas em critérios do lado do servidor (nível, vitórias).

    for (const [code, titleData] of Object.entries(TITLES)) {
        if (!titleData.unlocks) continue; // Pula títulos de evento
        const { level, victories } = titleData.unlocks;
        let meetsCriteria = true;
        if (level && user.level < level) meetsCriteria = false;
        if (victories && user.victories < victories) meetsCriteria = false;

        if (meetsCriteria) {
            await grantTitleByCode(user.id, code);
        }
    }
}

async function grantTitleByCode(userId, titleCode) {
    const titleRes = await pool.query(`SELECT id FROM titles WHERE code = $1`, [titleCode]);
    if (titleRes.rows[0]) {
        const titleId = titleRes.rows[0].id;
        await pool.query(
            `INSERT INTO user_titles (user_id, title_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [userId, titleId]
        );
        console.log(`Título ${titleCode} concedido ao usuário ${userId}`);
    } else {
        console.error(`Tentativa de conceder um código de título inexistente: ${titleCode}`);
    }
}


async function getTopTenPlayers() {
  const { rows } = await pool.query(
    `SELECT username, avatar_url, victories
     FROM users
     ORDER BY victories DESC, id ASC
     LIMIT 10`
  );
  return rows;
}

async function getUserProfile(googleId) {
  const userRes = await pool.query(`SELECT * FROM users WHERE google_id = $1`, [googleId]);
  const user = userRes.rows[0];
  if (!user) return null;

  const titlesRes = await pool.query(
    `SELECT t.name, t.line
     FROM user_titles ut
     JOIN titles t ON t.id = ut.title_id
     WHERE ut.user_id = $1
     ORDER BY t.line, t.id`,
    [user.id]
  );

  const historyRes = await pool.query(
    `SELECT outcome, mode, opponents, date
     FROM user_match_history
     WHERE user_id = $1
     ORDER BY date DESC
     LIMIT 15`,
    [user.id]
  );

  return {
    ...user,
    titles: titlesRes.rows,
    history: historyRes.rows
  };
}


module.exports = {
  ensureSchema,
  findOrCreateUser,
  addXp,
  addMatchToHistory,
  getTopTenPlayers,
  getUserProfile,
  checkAndGrantTitles,
  grantTitleByCode,
  testConnection
};