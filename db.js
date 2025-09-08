// db.js - Adaptador de Banco de Dados PostgreSQL para Reversus
const { Pool } = require('pg');

// A configuração do pool agora usará apenas a connectionString,
// mas adicionamos suporte SSL para ambientes de produção.
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
};

// Adiciona configuração SSL se não estivermos em um ambiente local
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost") && !process.env.DATABASE_URL.includes("127.0.0.1")) {
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
}

const pool = new Pool(poolConfig);

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
    // Títulos de Ranking PvP (Novo sistema)
    'pvp_rank_1': { name: 'DEUS do PVP', line: 'Ranking PvP', unlocks: { rank: 1 } },
    'pvp_rank_2': { name: 'MESTRE do PVP', line: 'Ranking PvP', unlocks: { rank: 2 } },
    'pvp_rank_3': { name: 'LORDE do PVP', line: 'Ranking PvP', unlocks: { rank: 3 } },
    'pvp_rank_4_10': { name: 'ELITE DO PVP', line: 'Ranking PvP', unlocks: { rank: 10 } },
    'pvp_rank_11_20': { name: 'Intocáveis do PVP', line: 'Ranking PvP', unlocks: { rank: 20 } },
    'pvp_rank_21_30': { name: 'Absurdo do PVP', line: 'Ranking PvP', unlocks: { rank: 30 } },
    'pvp_rank_31_40': { name: 'Extraordinário no PVP', line: 'Ranking PvP', unlocks: { rank: 40 } },
    'pvp_rank_41_50': { name: 'Espetacular do PVP', line: 'Ranking PvP', unlocks: { rank: 50 } },
    'pvp_rank_51_60': { name: 'Maravilha do PVP', line: 'Ranking PvP', unlocks: { rank: 60 } },
    'pvp_rank_61_70': { name: 'Incrível do PVP', line: 'Ranking PvP', unlocks: { rank: 70 } },
    'pvp_rank_71_80': { name: 'Entusiasta do PVP', line: 'Ranking PvP', unlocks: { rank: 80 } },
    'pvp_rank_81_90': { name: 'Aspirante do PVP', line: 'Ranking PvP', unlocks: { rank: 90 } },
    'pvp_rank_91_100': { name: 'Entre os 100 melhores no PVP!', line: 'Ranking PvP', unlocks: { rank: 100 } },
    'creator': { name: 'Criador', line: 'Especial' }, // Título especial

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

const AVATAR_CATALOG = {
    'default_1': { name: 'Avatar 1', image_url: 'aleatorio1.png', cost: 1000, unlock: null },
    'default_2': { name: 'Avatar 2', image_url: 'aleatorio2.png', cost: 1000, unlock: null },
    'default_3': { name: 'Avatar 3', image_url: 'aleatorio3.png', cost: 1000, unlock: null },
    'default_4': { name: 'Avatar 4', image_url: 'aleatorio4.png', cost: 1000, unlock: null },
    'graxa': { name: 'Graxa', image_url: 'graxa.png', cost: 2000, unlock: null },
    'jujuba': { name: 'Jujuba', image_url: 'jujuba.png', cost: 2000, unlock: null },
    'frank': { name: 'Frank', image_url: 'frank.png', cost: 2000, unlock: null },
    'lele': { name: 'Lelê', image_url: 'lele.png', cost: 2000, unlock: null },
    'vini': { name: 'Vini', image_url: 'vini.png', cost: 2000, unlock: null },
    'vini2': { name: 'Vini2', image_url: 'vini2.png', cost: 2000, unlock: null },
    'nathan': { name: 'Nathan', image_url: 'nathan.png', cost: 2000, unlock: null },
    'pao': { name: 'Pão', image_url: 'pao.png', cost: 2000, unlock: null },
    'luan': { name: 'Luan', image_url: 'luan.png', cost: 2000, unlock: null },
    'lorenzo': { name: 'Lorenzo', image_url: 'lorenzo.png', cost: 2000, unlock: null },
    'rodrigo': { name: 'Rodrigo', image_url: 'rodrigo.png', cost: 2000, unlock: null },
    'karol': { name: 'Avatar Karol', image_url: 'karol.png', cost: 2000, unlock: null },
    'necroverso': { name: 'Necroverso', image_url: 'necroverso.png', cost: 15000, unlock: 'tutorial_win' },
    'contravox': { name: 'Contravox', image_url: 'contravox.png', cost: 20000, unlock: 'contravox_win' },
    'versatrix': { name: 'Versatrix', image_url: 'versatrix.png', cost: 25000, unlock: 'versatrix_win' },
    'reversum': { name: 'Rei Reversum', image_url: 'reversum.png', cost: 30000, unlock: 'reversum_win' }
};

// --- HELPERS ---
function levelFromXp(xp) {
  if (!xp || xp < 100) return 1;
  return Math.floor(1 + Math.sqrt(xp / 100));
}

// Helper function to grant titles, used by updateUserRankAndTitles
async function grantTitleByCode(userId, code, client = pool) {
    const titleRes = await client.query('SELECT id FROM titles WHERE code = $1', [code]);
    if (titleRes.rows.length > 0) {
        await client.query(
            'INSERT INTO user_titles (user_id, title_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, titleRes.rows[0].id]
        );
    }
}

// --- CRIAÇÃO DO ESQUEMA DO BANCO ---
async function ensureSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sql = `
      CREATE TABLE IF NOT EXISTS avatars (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        image_url TEXT NOT NULL,
        cost INT NOT NULL,
        unlock_achievement_code TEXT
      );
    
      CREATE TABLE IF NOT EXISTS users (
        id                SERIAL PRIMARY KEY,
        google_id         TEXT UNIQUE NOT NULL,
        username          TEXT NOT NULL,
        avatar_url        TEXT,
        created_at        TIMESTAMPTZ DEFAULT now(),
        xp                INT DEFAULT 0,
        level             INT DEFAULT 1,
        victories         INT DEFAULT 0,
        defeats           INT DEFAULT 0,
        coinversus        INT DEFAULT 0,
        last_daily_reward_claimed_at TIMESTAMPTZ
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_title_code TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS highest_rank_achieved INT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_avatar_code TEXT REFERENCES avatars(code) ON DELETE SET NULL DEFAULT NULL;
      
      CREATE TABLE IF NOT EXISTS banned_users (
        id SERIAL PRIMARY KEY,
        user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        banned_by_id INT REFERENCES users(id) ON DELETE SET NULL,
        reason TEXT,
        banned_at TIMESTAMPTZ DEFAULT now()
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
      
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_selected_title') THEN
          ALTER TABLE users ADD CONSTRAINT fk_selected_title FOREIGN KEY (selected_title_code) REFERENCES titles(code) ON DELETE SET NULL;
        END IF;
      END;
      $$;

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

      CREATE TABLE IF NOT EXISTS friend_requests (
          id SERIAL PRIMARY KEY,
          sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          receiver_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ DEFAULT now(),
          UNIQUE(sender_id, receiver_id)
      );
      CREATE INDEX IF NOT EXISTS idx_receiver_id ON friend_requests (receiver_id);


      CREATE TABLE IF NOT EXISTS private_messages (
        id           SERIAL PRIMARY KEY,
        sender_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content      TEXT NOT NULL,
        sent_at      TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS player_reports (
        id SERIAL PRIMARY KEY,
        reporter_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reported_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
        created_at TIMESTAMPTZ DEFAULT now(),
        resolved_by_id INT REFERENCES users(id) ON DELETE SET NULL,
        resolved_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_player_reports_status ON player_reports (status);
      
      CREATE TABLE IF NOT EXISTS user_challenge_rewards (
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        challenge_id TEXT NOT NULL,
        claimed_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (user_id, challenge_id)
      );

      CREATE TABLE IF NOT EXISTS user_achievements (
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        achievement_code TEXT NOT NULL,
        earned_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (user_id, achievement_code)
      );

      CREATE TABLE IF NOT EXISTS user_avatars (
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        avatar_code TEXT NOT NULL REFERENCES avatars(code) ON DELETE CASCADE,
        purchased_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (user_id, avatar_code)
      );

      CREATE TABLE IF NOT EXISTS daily_unique_visitors (
        access_date DATE NOT NULL,
        ip_hash TEXT NOT NULL,
        PRIMARY KEY (access_date, ip_hash)
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

    // Semeia a tabela de avatares
    for (const [code, data] of Object.entries(AVATAR_CATALOG)) {
        await client.query(
            `INSERT INTO avatars (code, name, image_url, cost, unlock_achievement_code) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (code) DO NOTHING`,
            [code, data.name, data.image_url, data.cost, data.unlock]
        );
    }
    
    // Concede o título "Criador"
    const creatorEmail = 'alexblbn@gmail.com';
    const creatorRes = await client.query('SELECT id FROM users WHERE google_id = (SELECT google_id FROM users WHERE username LIKE \'%Alexandre Lima%\' LIMIT 1)');
    if (creatorRes.rows.length > 0) {
        const creatorId = creatorRes.rows[0].id;
        const creatorTitleCode = 'creator';
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
async function logUniqueVisitor(ipHash) {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    await pool.query(
        'INSERT INTO daily_unique_visitors (access_date, ip_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [today, ipHash]
    );
}

async function getDailyAccessStats() {
    const { rows } = await pool.query(`
        SELECT access_date, COUNT(ip_hash) as unique_users
        FROM daily_unique_visitors
        WHERE access_date >= current_date - interval '30' day
        GROUP BY access_date
        ORDER BY access_date DESC
    `);
    return rows;
}

async function isUserBanned(userId) {
    const { rows } = await pool.query('SELECT 1 FROM banned_users WHERE user_id = $1', [userId]);
    return rows.length > 0;
}

async function banUser({ userId, adminId }) {
    await pool.query('INSERT INTO banned_users (user_id, banned_by_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [userId, adminId]);
}

async function unbanUser(userId) {
    await pool.query('DELETE FROM banned_users WHERE user_id = $1', [userId]);
}

async function getBannedUsers() {
    const { rows } = await pool.query(`
        SELECT u.id, u.username, u.avatar_url
        FROM banned_users bu
        JOIN users u ON bu.user_id = u.id
        ORDER BY bu.banned_at DESC
    `);
    return rows;
}

async function findOrCreateUser(googlePayload) {
  const { sub: googleId, name, picture: avatarUrl, email } = googlePayload;
  
  let res = await pool.query(`SELECT * FROM users WHERE google_id = $1`, [googleId]);
  
  if (res.rows.length === 0) {
    res = await pool.query(
      `INSERT INTO users (google_id, username, avatar_url, coinversus, equipped_avatar_code) VALUES ($1, $2, $3, 100, NULL)
       RETURNING *`,
      [googleId, name, avatarUrl]
    );
  }
  
  const user = res.rows[0];
  const isBanned = await isUserBanned(user.id);
  if (isBanned) {
      throw new Error("This account is banned.");
  }

  return user;
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

async function updateUserRankAndTitles(userId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Etapa 1: Encontrar o novo rank do usuário
        const rankRes = await client.query(
            `SELECT rank FROM (
                SELECT id, RANK() OVER (ORDER BY victories DESC, id ASC) as rank
                FROM users
            ) as ranked_users WHERE id = $1`,
            [userId]
        );

        if (rankRes.rows.length === 0) throw new Error("Usuário não encontrado para atualização de rank.");
        const newRank = parseInt(rankRes.rows[0].rank, 10);

        // Etapa 2: Atualizar o melhor rank do usuário, se necessário
        const userRes = await client.query('SELECT highest_rank_achieved FROM users WHERE id = $1', [userId]);
        const currentHighest = userRes.rows[0].highest_rank_achieved;

        if (currentHighest === null || newRank < currentHighest) {
            await client.query('UPDATE users SET highest_rank_achieved = $1 WHERE id = $2', [newRank, userId]);
        }
        
        const bestRank = Math.min(newRank, currentHighest || Infinity);

        // Etapa 3: Conceder títulos com base no melhor rank alcançado
        for (const [code, titleData] of Object.entries(TITLES)) {
            if (titleData.line === 'Ranking PvP' && titleData.unlocks && titleData.unlocks.rank) {
                if (bestRank <= titleData.unlocks.rank) {
                    await grantTitleByCode(userId, code, client);
                }
            }
        }

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Erro na transação de atualização de rank e títulos:", e);
        throw e;
    } finally {
        client.release();
    }
}


async function getTopPlayers(page = 1, limit = 10) {
  const totalRes = await pool.query('SELECT COUNT(*) FROM users');
  const totalPlayers = parseInt(totalRes.rows[0].count, 10);
  const totalPages = Math.ceil(totalPlayers / limit);

  const playersRes = await pool.query(
    `SELECT u.google_id, u.username, u.victories, u.coinversus, u.selected_title_code,
     COALESCE(a.image_url, u.avatar_url) as avatar_url,
     RANK() OVER (ORDER BY u.victories DESC, u.id ASC) as rank
     FROM users u
     LEFT JOIN avatars a ON u.equipped_avatar_code = a.code
     ORDER BY rank
     LIMIT $1 OFFSET $2`,
    [limit, (page - 1) * limit]
  );
  
  playersRes.rows.forEach(p => {
      if (p.avatar_url && !p.avatar_url.startsWith('http')) {
          p.avatar_url = `./${p.avatar_url}`;
      }
  });

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
    const friendsRes = await pool.query(
        `SELECT 1 FROM friends WHERE user_one_id = $1 AND user_two_id = $2`,
        [lowId, highId]
    );
    if (friendsRes.rows.length > 0) return 'friends';

    const requestRes = await pool.query(
        `SELECT 1 FROM friend_requests 
         WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)`,
        [userId1, userId2]
    );
    if (requestRes.rows.length > 0) return 'pending';
    
    return 'none';
}

async function sendFriendRequest(senderId, receiverId) {
    if (senderId === receiverId) throw new Error("Cannot send friend request to self.");
    const friendshipStatus = await getFriendshipStatus(senderId, receiverId);
    if (friendshipStatus !== 'none') throw new Error("Friendship already exists or request is pending.");

    const { rows } = await pool.query(
        'INSERT INTO friend_requests (sender_id, receiver_id) VALUES ($1, $2) RETURNING id',
        [senderId, receiverId]
    );
    return rows[0];
}

async function getPendingFriendRequests(userId) {
    const { rows } = await pool.query(
        `SELECT fr.id, fr.sender_id, u.username, u.avatar_url
         FROM friend_requests fr
         JOIN users u ON fr.sender_id = u.id
         WHERE fr.receiver_id = $1 AND fr.status = 'pending'`,
        [userId]
    );
    return rows;
}

async function respondToFriendRequest(requestId, respondingUserId, action) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            "SELECT sender_id, receiver_id FROM friend_requests WHERE id = $1 AND status = 'pending'",
            [requestId]
        );
        if (rows.length === 0 || rows[0].receiver_id !== respondingUserId) {
            throw new Error("Request not found or user not authorized to respond.");
        }
        
        const { sender_id, receiver_id } = rows[0];

        if (action === 'accept') {
            const [lowId, highId] = [Math.min(sender_id, receiver_id), Math.max(sender_id, receiver_id)];
            await client.query('INSERT INTO friends (user_one_id, user_two_id) VALUES ($1, $2)', [lowId, highId]);
        }
        
        await client.query('DELETE FROM friend_requests WHERE id = $1', [requestId]);
        
        await client.query('COMMIT');
        return sender_id; // Return sender ID for notification
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
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
        `SELECT u.id, u.google_id, u.username, u.selected_title_code, COALESCE(a.image_url, u.avatar_url) as avatar_url
         FROM friends f
         JOIN users u ON u.id = CASE WHEN f.user_one_id = $1 THEN f.user_two_id ELSE f.user_one_id END
         LEFT JOIN avatars a ON u.equipped_avatar_code = a.code
         WHERE f.user_one_id = $1 OR f.user_two_id = $1`,
        [userId]
    );
     rows.forEach(p => {
      if (p.avatar_url && !p.avatar_url.startsWith('http')) {
          p.avatar_url = `./${p.avatar_url}`;
      }
    });
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

async function setSelectedAvatar(userId, avatarCode) {
    if (avatarCode === 'default') {
        await pool.query('UPDATE users SET equipped_avatar_code = NULL WHERE id = $1', [userId]);
    } else {
        const ownedRes = await pool.query('SELECT 1 FROM user_avatars WHERE user_id = $1 AND avatar_code = $2', [userId, avatarCode]);
        if (ownedRes.rows.length > 0) {
            await pool.query('UPDATE users SET equipped_avatar_code = $1 WHERE id = $2', [avatarCode, userId]);
        } else {
            throw new Error('User does not own this avatar');
        }
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
      `SELECT u.*, a.image_url as equipped_avatar_url
       FROM users u
       LEFT JOIN avatars a ON u.equipped_avatar_code = a.code
       WHERE u.google_id = $1`, [googleId]);
  const user = userRes.rows[0];
  if (!user) return null;

  // Prioritize equipped avatar, fallback to Google avatar
  if (user.equipped_avatar_url) {
      user.avatar_url = `./${user.equipped_avatar_url}`;
  } // Otherwise, user.avatar_url (from Google picture) is used

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

  const ownedAvatarsRes = await pool.query(
    `SELECT avatar_code FROM user_avatars WHERE user_id = $1`,
    [user.id]
  );

  return {
    ...user,
    titles: titlesRes.rows,
    history: historyRes.rows,
    friendshipStatus,
    owned_avatars: ownedAvatarsRes.rows.map(r => r.avatar_code)
  };
}

async function claimDailyReward(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT last_daily_reward_claimed_at FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'User not found' };
    }

    const lastClaimed = rows[0].last_daily_reward_claimed_at;
    const now = new Date();
    
    // Check if a reward has been claimed today based on UTC date
    if (lastClaimed) {
        const lastClaimDate = new Date(lastClaimed);
        if (lastClaimDate.getUTCFullYear() === now.getUTCFullYear() &&
            lastClaimDate.getUTCMonth() === now.getUTCMonth() &&
            lastClaimDate.getUTCDate() === now.getUTCDate()) {
            await client.query('ROLLBACK');
            return { success: false, reason: 'Already claimed today' };
        }
    }

    const rewardAmount = 100;
    await client.query(
      `UPDATE users 
       SET coinversus = coinversus + $1, last_daily_reward_claimed_at = NOW() AT TIME ZONE 'UTC'
       WHERE id = $2`,
      [rewardAmount, userId]
    );

    await client.query('COMMIT');
    return { success: true, amount: rewardAmount };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in claimDailyReward:", error);
    throw error;
  } finally {
    client.release();
  }
}

async function createPlayerReport(reporterId, reportedGoogleId, message) {
    const { rows } = await pool.query('SELECT id FROM users WHERE google_id = $1', [reportedGoogleId]);
    if (rows.length === 0) {
        throw new Error("Reported user not found.");
    }
    const reportedId = rows[0].id;

    if (reporterId === reportedId) {
        throw new Error("Cannot report yourself.");
    }
    await pool.query(
        `INSERT INTO player_reports (reporter_id, reported_id, message) VALUES ($1, $2, $3)`,
        [reporterId, reportedId, message]
    );
}

async function getPendingReports() {
    const { rows } = await pool.query(`
        SELECT pr.id, pr.message, pr.created_at,
               reporter.username as reporter_username,
               reported.id as reported_user_id,
               reported.username as reported_username,
               reported.avatar_url as reported_avatar_url
        FROM player_reports pr
        JOIN users reporter ON pr.reporter_id = reporter.id
        JOIN users reported ON pr.reported_id = reported.id
        WHERE pr.status = 'pending'
        ORDER BY pr.created_at ASC
    `);
    return rows;
}

async function resolveReport(reportId, adminId) {
    await pool.query(
        `UPDATE player_reports SET status = 'resolved', resolved_by_id = $1, resolved_at = now() WHERE id = $2`,
        [adminId, reportId]
    );
}

async function resolveReportsForUser(userId, adminId) {
    await pool.query(
        `UPDATE player_reports SET status = 'resolved', resolved_by_id = $1, resolved_at = now() WHERE reported_id = $2 AND status = 'pending'`,
        [adminId, userId]
    );
}

async function hasClaimedChallengeReward(userId, challengeId) {
    const { rows } = await pool.query(
        `SELECT 1 FROM user_challenge_rewards WHERE user_id = $1 AND challenge_id = $2`,
        [userId, challengeId]
    );
    return rows.length > 0;
}

async function claimChallengeReward(userId, challengeId) {
    await pool.query(
        `INSERT INTO user_challenge_rewards (user_id, challenge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, challengeId]
    );
}

async function updateUserCoins(userId, amountChange) {
    await pool.query(
        `UPDATE users SET coinversus = coinversus + $1 WHERE id = $2`,
        [amountChange, userId]
    );
}

async function grantUserAchievement(userId, achievementCode) {
    if (!userId || !achievementCode) return;
    try {
        await pool.query(
            `INSERT INTO user_achievements (user_id, achievement_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [userId, achievementCode]
        );
    } catch (error) {
        console.error(`Error granting achievement ${achievementCode} to user ${userId}:`, error);
    }
}

async function checkUserAchievement(userId, achievementCode, client = pool) {
    const { rows } = await client.query(
        `SELECT 1 FROM user_achievements WHERE user_id = $1 AND achievement_code = $2`,
        [userId, achievementCode]
    );
    return rows.length > 0;
}

async function purchaseAvatar(userId, avatarCode) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const avatarRes = await client.query('SELECT cost, unlock_achievement_code FROM avatars WHERE code = $1', [avatarCode]);
        if (avatarRes.rows.length === 0) throw new Error("Avatar não encontrado.");
        const { cost, unlock_achievement_code } = avatarRes.rows[0];

        const userRes = await client.query('SELECT coinversus FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const userCoins = userRes.rows[0].coinversus;

        const ownedRes = await client.query('SELECT 1 FROM user_avatars WHERE user_id = $1 AND avatar_code = $2', [userId, avatarCode]);
        if (ownedRes.rows.length > 0) throw new Error("Você já possui este avatar.");

        if (userCoins < cost) throw new Error("CoinVersus insuficientes.");

        if (unlock_achievement_code) {
            const hasAchievement = await checkUserAchievement(userId, unlock_achievement_code, client);
            if (!hasAchievement) throw new Error("Você precisa desbloquear a conquista correspondente primeiro.");
        }

        await client.query('UPDATE users SET coinversus = coinversus - $1 WHERE id = $2', [cost, userId]);
        await client.query('INSERT INTO user_avatars (user_id, avatar_code) VALUES ($1, $2)', [userId, avatarCode]);

        await client.query('COMMIT');
        return { success: true };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error purchasing avatar ${avatarCode} for user ${userId}:`, error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}

module.exports = {
  testConnection, ensureSchema, findOrCreateUser, addXp, addMatchToHistory, updateUserRankAndTitles,
  getTopPlayers, searchUsers, getFriendshipStatus, sendFriendRequest, getPendingFriendRequests,
  respondToFriendRequest, removeFriend, getFriendsList, setSelectedTitle, savePrivateMessage,
  getPrivateMessageHistory, getUserProfile, claimDailyReward, createPlayerReport, getPendingReports,
  resolveReport, banUser, unbanUser, getBannedUsers, isUserBanned, resolveReportsForUser,
  hasClaimedChallengeReward, claimChallengeReward, updateUserCoins, grantUserAchievement, purchaseAvatar,
  checkUserAchievement, setSelectedAvatar, logUniqueVisitor, getDailyAccessStats
};