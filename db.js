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
        id                SERIAL PRIMARY KEY,
        google_id         TEXT UNIQUE NOT NULL,
        username          TEXT NOT NULL,
        avatar_url        TEXT,
        created_at        TIMESTAMPTZ DEFAULT now(),
        xp                INT DEFAULT 0,
        level             INT DEFAULT 1,
        victories         INT DEFAULT 0,
        defeats           INT DEFAULT 0
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_title_code TEXT;

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
      ALTER TABLE users ADD CONSTRAINT fk_selected_title FOREIGN KEY (selected_title_code) REFERENCES titles(code) ON DELETE SET NULL;


      CREATE TABLE IF NOT EXISTS user_titles (
        user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title_id    INT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
        earned_at   TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (user_id, title_id)
      );

      CREATE TABLE IF NOT EXISTS friends (
        user_one_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_two_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (user_one_id, user_two_id),
        CONSTRAINT check_users CHECK (user_one_id < user_two_id)
      );

      CREATE TABLE IF NOT EXISTS private_messages (
        id           SERIAL PRIMARY KEY,
        sender_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content      TEXT NOT NULL,
        sent_at      TIMESTAMPTZ DEFAULT now()
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
    
    // Concede o título "Criador"
    const creatorEmail = 'alexblbn@gmail.com';
    const creatorRes = await client.query('SELECT id FROM users WHERE google_id = (SELECT google_id FROM users WHERE username LIKE \'%Alexandre Lima%\' LIMIT 1)');
    if (creatorRes.rows.length > 0) {
        const creatorId = creatorRes.rows[0].id;
        const creatorTitleCode = 'creator';
        await client.query(`INSERT INTO titles (code, name, line) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`, [creatorTitleCode, 'Criador', 'Especial']);
        const titleRes = await client.query(`SELECT id FROM titles WHERE code = $1`, [creatorTitleCode]);
        if(titleRes.rows.length > 0) {
           await client.query(`INSERT INTO user_titles (user_id, title_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [creatorId, titleRes.rows[0].id]);
        }
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
  const { sub: googleId, name, picture: avatarUrl, email } = googlePayload;
  
  let res = await pool.query(`SELECT * FROM users WHERE google_id = $1`, [googleId]);
  
  if (res.rows.length === 0) {
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

    for (const [code, titleData] of Object.entries(TITLES)) {
        if (!titleData.unlocks) continue;
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
    } else {
        console.error(`Tentativa de conceder um código de título inexistente: ${titleCode}`);
    }
}

async function getTopPlayers(page = 1, limit = 10) {
  const offset = (page - 1) * limit;
  const totalRes = await pool.query('SELECT COUNT(*) FROM users');
  const totalPlayers = parseInt(totalRes.rows[0].count, 10);
  const totalPages = Math.ceil(totalPlayers / limit);

  const playersRes = await pool.query(
    `SELECT u.google_id, u.username, u.avatar_url, u.victories, t.name as title,
     RANK() OVER (ORDER BY u.victories DESC, u.id ASC) as rank
     FROM users u
     LEFT JOIN titles t ON u.selected_title_code = t.code
     ORDER BY rank
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return { players: playersRes.rows, currentPage: page, totalPages };
}

async function searchUsers(query, currentUserId) {
    if (!query) return [];
    const { rows } = await pool.query(
        `SELECT id, google_id, username, avatar_url FROM users
         WHERE username ILIKE $1 AND id != $2
         LIMIT 10`,
        [`%${query}%`, currentUserId]
    );
    return rows;
}

async function getFriendshipStatus(userId1, userId2) {
    const [lowId, highId] = [Math.min(userId1, userId2), Math.max(userId1, userId2)];
    const { rows } = await pool.query(
        `SELECT * FROM friends WHERE user_one_id = $1 AND user_two_id = $2`,
        [lowId, highId]
    );
    if (rows.length > 0) return 'friends';
    return 'none';
}


async function addFriend(userId1, userId2) {
    const [lowId, highId] = [Math.min(userId1, userId2), Math.max(userId1, userId2)];
    await pool.query(
        'INSERT INTO friends (user_one_id, user_two_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [lowId, highId]
    );
}

async function removeFriend(userId1, userId2) {
    const [lowId, highId] = [Math.min(userId1, userId2), Math.max(userId1, userId2)];
    await pool.query(
        'DELETE FROM friends WHERE user_one_id = $1 AND user_two_id = $2',
        [lowId, highId]
    );
}

async function getFriendsList(userId) {
    const { rows } = await pool.query(
        `SELECT u.id, u.google_id, u.username, u.avatar_url, t.name as title
         FROM friends f
         JOIN users u ON u.id = CASE WHEN f.user_one_id = $1 THEN f.user_two_id ELSE f.user_one_id END
         LEFT JOIN titles t ON u.selected_title_code = t.code
         WHERE f.user_one_id = $1 OR f.user_two_id = $1`,
        [userId]
    );
    return rows;
}

async function setSelectedTitle(userId, titleCode) {
    // Verify the user has unlocked this title
    const res = await pool.query(
        `SELECT 1 FROM user_titles ut
         JOIN titles t ON ut.title_id = t.id
         WHERE ut.user_id = $1 AND t.code = $2`,
        [userId, titleCode]
    );
    if (res.rows.length > 0) {
        await pool.query('UPDATE users SET selected_title_code = $1 WHERE id = $2', [titleCode, userId]);
    } else {
        throw new Error('User has not unlocked this title');
    }
}

async function savePrivateMessage(senderId, recipientId, content) {
    await pool.query(
        'INSERT INTO private_messages (sender_id, recipient_id, content) VALUES ($1, $2, $3)',
        [senderId, recipientId, content]
    );
}

async function getPrivateMessageHistory(userId1, userId2) {
    const { rows } = await pool.query(
        `SELECT sender_id, recipient_id, content, sent_at FROM private_messages
         WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
         ORDER BY sent_at ASC
         LIMIT 100`,
        [userId1, userId2]
    );
    return rows;
}


async function getUserProfile(googleId, requesterId = null) {
  const userRes = await pool.query(
      `SELECT u.*, t.name as selected_title
       FROM users u
       LEFT JOIN titles t ON u.selected_title_code = t.code
       WHERE u.google_id = $1`, [googleId]);
  const user = userRes.rows[0];
  if (!user) return null;

  const titlesRes = await pool.query(
    `SELECT t.code, t.name, t.line
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
  
  let friendshipStatus = null;
  if(requesterId && requesterId !== user.id) {
      friendshipStatus = await getFriendshipStatus(requesterId, user.id);
  }

  return {
    ...user,
    titles: titlesRes.rows,
    history: historyRes.rows,
    friendshipStatus
  };
}


module.exports = {
  ensureSchema, findOrCreateUser, addXp, addMatchToHistory, getTopPlayers,
  getUserProfile, checkAndGrantTitles, grantTitleByCode, testConnection,
  searchUsers, addFriend, removeFriend, getFriendsList, getFriendshipStatus,
  setSelectedTitle, savePrivateMessage, getPrivateMessageHistory
};
