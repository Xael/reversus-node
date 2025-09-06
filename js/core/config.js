// js/core/config.js

// --- CONSTANTS ---
export const WINNING_POSITION = 10;
export const BOARD_SIZE = 9;
export const NUM_PATHS = 6;
export const COLORED_SPACES_PER_PATH = 2;
export const MAX_VALUE_CARDS_IN_HAND = 3;
export const MAX_EFFECT_CARDS_IN_HAND = 2;

export const MASTER_PLAYER_IDS = ['player-1', 'player-2', 'player-3', 'player-4'];

export const PLAYER_CONFIG = {
    'player-1': { nameKey: 'player_names.player-1', color: 'var(--player-1-color)', isHuman: true },
    'player-2': { nameKey: 'player_names.player-2', color: 'var(--player-2-color)', isHuman: false },
    'player-3': { nameKey: 'player_names.player-3', color: 'var(--player-3-color)', isHuman: false },
    'player-4': { nameKey: 'player_names.player-4', color: 'var(--player-4-color)', isHuman: false },
};
export const originalPlayerConfig = structuredClone(PLAYER_CONFIG);

export const TEAM_A = ['player-1', 'player-3'];
export const TEAM_B = ['player-2', 'player-4'];

export const VALUE_DECK_CONFIG = [{ value: 2, count: 12 }, { value: 4, count: 10 }, { value: 6, count: 8 }, { value: 8, count: 6 }, { value: 10, count: 4 }];
export const EFFECT_DECK_CONFIG = [{ name: 'Mais', count: 4 }, { name: 'Menos', count: 4 }, { name: 'Sobe', count: 4 }, { name: 'Desce', count: 4 }, { name: 'Pula', count: 4 }, { name: 'Reversus', count: 4 }, { name: 'Reversus Total', count: 1 }];

export const MUSIC_TRACKS = [
    'jogo.ogg', 'jogo2.ogg', 'jogo3.ogg', 'contravox.ogg', 'versatrix.ogg', 'reversum.ogg', 'necroverso.ogg', 'necroversofinal.ogg', 'inversus.ogg', 'tela.ogg', 'narrador.ogg', 'xaeldesafio.ogg',
    'oprofetasombrio.ogg', 'cupidodocaos.ogg', 'goblindafortuna.ogg', 'dragaodourado.ogg', 'oespectro.ogg', 'salamandra.ogg', 'capitaobarbacurta.ogg', 'astronomoperdido.ogg', 'detetivemisterioso.ogg', 'abruxadoresto.ogg', 'yeti.ogg', 'guardiaodaaurora.ogg'
];

export const BASE_CARD_IMAGES = [
    'verso_valor.png', 'verso_efeito.png', 'frente_2.png', 'frente_4.png',
    'frente_6.png', 'frente_8.png', 'frente_10.png', 'frente_mais.png',
    'frente_menos.png', 'frente_sobe.png', 'frente_desce.png', 'frente_pula.png',
    'frente_reversus.png', 'frente_reversustotal.png'
];

export const BOSS_CARD_IMAGES = [
    'cartacontravox.png', 
    'cartaversatrix.png', 
    'cartanecroverso.png',
    'xael.png',
    'xaeldesafio.png'
];

export const CHARACTER_PORTRAIT_IMAGES = [
    'contravox.png', 'versatrix.png', 'reversum.png',
    'necroverso.png', 'necroverso2.png', 'necroverso3.png', 'necroversorevelado.png',
    'xael.png', 'xaeldesafio.png', 'narrador.png', 'inversum1.png'
];

export const POSITIVE_EFFECTS = {
    'Resto Maior': { descriptionKey: 'field_effect_descriptions.resto_maior' },
    'Carta Menor': { descriptionKey: 'field_effect_descriptions.carta_menor' },
    'Jogo Aberto': { descriptionKey: 'field_effect_descriptions.jogo_aberto_positive' },
    'Imunidade': { descriptionKey: 'field_effect_descriptions.imunidade' },
    'Desafio': { descriptionKey: 'field_effect_descriptions.desafio' },
    'Impulso': { descriptionKey: 'field_effect_descriptions.impulso' },
    'Troca Justa': { descriptionKey: 'field_effect_descriptions.troca_justa' },
    'Reversus Total': { descriptionKey: 'field_effect_descriptions.reversus_total' }
};

export const NEGATIVE_EFFECTS = {
    'Resto Menor': { descriptionKey: 'field_effect_descriptions.resto_menor' },
    'Carta Maior': { descriptionKey: 'field_effect_descriptions.carta_maior' },
    'Super Exposto': { descriptionKey: 'field_effect_descriptions.super_exposto' },
    'Castigo': { descriptionKey: 'field_effect_descriptions.castigo' },
    'Parada': { descriptionKey: 'field_effect_descriptions.parada' },
    'Troca Injusta': { descriptionKey: 'field_effect_descriptions.troca_injusta' },
    'Total Revesus Nada!': { descriptionKey: 'field_effect_descriptions.total_revesus_nada' }
};

export const ACHIEVEMENTS = {
    'first_win': { nameKey: 'achievement_names.first_win', descriptionKey: 'achievement_descriptions.first_win' },
    'first_defeat': { nameKey: 'achievement_names.first_defeat', descriptionKey: 'achievement_descriptions.first_defeat' },
    'versatrix_loss': { nameKey: 'achievement_names.versatrix_loss', descriptionKey: 'achievement_descriptions.versatrix_loss' },
    'speed_run': { nameKey: 'achievement_names.speed_run', descriptionKey: 'achievement_descriptions.speed_run' },
    'contravox_win': { nameKey: 'achievement_names.contravox_win', descriptionKey: 'achievement_descriptions.contravox_win' },
    'versatrix_win': { nameKey: 'achievement_names.versatrix_win', descriptionKey: 'achievement_descriptions.versatrix_win' },
    'versatrix_card_collected': { nameKey: 'achievement_names.versatrix_card_collected', descriptionKey: 'achievement_descriptions.versatrix_card_collected' },
    'reversum_win': { nameKey: 'achievement_names.reversum_win', descriptionKey: 'achievement_descriptions.reversum_win' },
    'tutorial_win': { nameKey: 'achievement_names.tutorial_win', descriptionKey: 'achievement_descriptions.tutorial_win' },
    'xael_win': { nameKey: 'achievement_names.xael_win', descriptionKey: 'achievement_descriptions.xael_win' },
    'quick_duel_win': { nameKey: 'achievement_names.quick_duel_win', descriptionKey: 'achievement_descriptions.quick_duel_win' },
    'true_end_beta': { nameKey: 'achievement_names.true_end_beta', descriptionKey: 'achievement_descriptions.true_end_beta' },
    'true_end_final': { nameKey: 'achievement_names.true_end_final', descriptionKey: 'achievement_descriptions.true_end_final' },
    'inversus_win': { nameKey: 'achievement_names.inversus_win', descriptionKey: 'achievement_descriptions.inversus_win' },
    '120%_unlocked': { nameKey: 'achievement_names.120%_unlocked', descriptionKey: 'achievement_descriptions.120%_unlocked' }
};

export const ACHIEVEMENT_HINTS = {
    'first_win': 'achievement_hints.first_win',
    'first_defeat': 'achievement_hints.first_defeat',
    'versatrix_loss': 'achievement_hints.versatrix_loss',
    'speed_run': 'achievement_hints.speed_run',
    'contravox_win': 'achievement_hints.contravox_win',
    'versatrix_win': 'achievement_hints.versatrix_win',
    'versatrix_card_collected': 'achievement_hints.versatrix_card_collected',
    'reversum_win': 'achievement_hints.reversum_win',
    'tutorial_win': 'achievement_hints.tutorial_win',
    'xael_win': 'achievement_hints.xael_win',
    'quick_duel_win': 'achievement_hints.quick_duel_win',
    'true_end_beta': 'achievement_hints.true_end_beta',
    'true_end_final': 'achievement_hints.true_end_final',
    'inversus_win': 'achievement_hints.inversus_win',
    '120%_unlocked': 'achievement_hints.120%_unlocked'
};

export const TITLE_CONFIG = {
    'pvp_rank_1': { rank: 1 },
    'pvp_rank_2': { rank: 2 },
    'pvp_rank_3': { rank: 3 },
    'pvp_rank_4_10': { rank: 10 },
    'pvp_rank_11_20': { rank: 20 },
    'pvp_rank_21_30': { rank: 30 },
    'pvp_rank_31_40': { rank: 40 },
    'pvp_rank_41_50': { rank: 50 },
    'pvp_rank_51_60': { rank: 60 },
    'pvp_rank_61_70': { rank: 70 },
    'pvp_rank_71_80': { rank: 80 },
    'pvp_rank_81_90': { rank: 90 },
    'pvp_rank_91_100': { rank: 100 }
};

export const AI_CHAT_PERSONALITIES = { 'contravox': {}, 'versatrix': {}, 'reversum': {}, 'necroverso_tutorial': {}, 'necroverso_king': {}, 'necroverso_final': {}, 'narrador': {}, 'xael': {}, 'inversus': {}, 'oprofetasombrio': {}, 'cupidodocaos': {}, 'goblindafortuna': {}, 'dragaodourado': {}, 'oespectro': {}, 'salamandra': {}, 'capitaobarbacurta': {}, 'astronomoperdido': {}, 'detetivemisterioso': {}, 'abruxadoresto': {}, 'yeti': {}, 'guardiaodaaurora': {} };

export const AI_DIALOGUE = {
    'necroverso_tutorial': {
        winning: ['ai_dialogue.necroverso_tutorial_winning_1', 'ai_dialogue.necroverso_tutorial_winning_2'],
        losing: ['ai_dialogue.necroverso_tutorial_losing_1', 'ai_dialogue.necroverso_tutorial_losing_2']
    },
    'contravox': {
        winning: ['ai_dialogue.contravox_winning_1', 'ai_dialogue.contravox_winning_2'],
        losing: ['ai_dialogue.contravox_losing_1', 'ai_dialogue.contravox_losing_2']
    },
    'versatrix': {
        winning: ['ai_dialogue.versatrix_winning_1', 'ai_dialogue.versatrix_winning_2'],
        losing: ['ai_dialogue.versatrix_losing_1', 'ai_dialogue.versatrix_losing_2']
    },
    'reversum': {
        winning: ['ai_dialogue.reversum_winning_1', 'ai_dialogue.reversum_winning_2'],
        losing: ['ai_dialogue.reversum_losing_1', 'ai_dialogue.reversum_losing_2']
    },
    'narrador': {
        winning: ['ai_dialogue.narrador_winning_1', 'ai_dialogue.narrador_winning_2', 'ai_dialogue.narrador_winning_3'],
        losing: ['ai_dialogue.narrador_losing_1', 'ai_dialogue.narrador_losing_2']
    },
    'xael': {
        winning: ['ai_dialogue.xael_winning_1', 'ai_dialogue.xael_winning_2'],
        losing: ['ai_dialogue.xael_losing_1', 'ai_dialogue.xael_losing_2']
    },
    'detetivemisterioso': {
        winning: ['ai_dialogue.detetive_winning_1', 'ai_dialogue.detetive_winning_2'],
        losing: ['ai_dialogue.detetive_losing_1', 'ai_dialogue.detetive_losing_2']
    }
};

export const MONTHLY_EVENTS = [
    { month: 0, nameKey: 'event_names.january', characterNameKey: 'event_chars.dark_prophet', ai: 'oprofetasombrio', image: 'oprofetasombrio.png', rewardTitleKey: 'event_rewards.visionary', abilityKey: 'event_abilities.january_new' },
    { month: 1, nameKey: 'event_names.february', characterNameKey: 'event_chars.chaos_cupid', ai: 'cupidodocaos', image: 'cupidodocaos.png', rewardTitleKey: 'event_rewards.uniter_of_rests', abilityKey: 'event_abilities.february_new' },
    { month: 2, nameKey: 'event_names.march', characterNameKey: 'event_chars.fortune_goblin', ai: 'goblindafortuna', image: 'goblindafortuna.png', rewardTitleKey: 'event_rewards.blessed_by_rest', abilityKey: 'event_abilities.march_new' },
    { month: 3, nameKey: 'event_names.april', characterNameKey: 'event_chars.golden_dragon', ai: 'dragaodourado', image: 'dragaodourado.png', rewardTitleKey: 'event_rewards.guardian_of_runes', abilityKey: 'event_abilities.april_new' },
    { month: 4, nameKey: 'event_names.may', characterNameKey: 'event_chars.the_specter', ai: 'oespectro', image: 'oespectro.png', rewardTitleKey: 'event_rewards.shadows_on_board', abilityKey: 'event_abilities.may_new' },
    { month: 5, nameKey: 'event_names.june', characterNameKey: 'event_chars.salamander', ai: 'salamandra', image: 'salamandra.png', rewardTitleKey: 'event_rewards.the_ardent', abilityKey: 'event_abilities.june_new' },
    { month: 6, nameKey: 'event_names.july', characterNameKey: 'event_chars.captain_shortbeard', ai: 'capitaobarbacurta', image: 'capitaobarbacurta.png', rewardTitleKey: 'event_rewards.thief_of_rests', abilityKey: 'event_abilities.july_new' },
    { month: 7, nameKey: 'event_names.august', characterNameKey: 'event_chars.lost_astronomer', ai: 'astronomoperdido', image: 'astronomoperdido.png', rewardTitleKey: 'event_rewards.the_eternal', abilityKey: 'event_abilities.august_new' },
    { month: 8, nameKey: 'event_names.september', characterNameKey: 'event_chars.mysterious_detective', ai: 'detetivemisterioso', image: 'detetivemisterioso.png', rewardTitleKey: 'event_rewards.secret_hunter', abilityKey: 'event_abilities.september_new' },
    { month: 9, nameKey: 'event_names.october', characterNameKey: 'event_chars.witch_of_rest', ai: 'abruxadoresto', image: 'abruxadoresto.png', rewardTitleKey: 'event_rewards.board_sorcerer', abilityKey: 'event_abilities.october_new' },
    { month: 10, nameKey: 'event_names.november', characterNameKey: 'event_chars.yeti', ai: 'yeti', image: 'yeti.png', rewardTitleKey: 'event_rewards.freezer_of_fates', abilityKey: 'event_abilities.november_new' },
    { month: 11, nameKey: 'event_names.december', characterNameKey: 'event_chars.guardian_of_dawn', ai: 'guardiaodaaurora', image: 'guardiaodaaurora.png', rewardTitleKey: 'event_rewards.year_end_light', abilityKey: 'event_abilities.december_new' }
];

export const AVATAR_CATALOG = {
    'default_1': { nameKey: 'avatars.default_1', image_url: 'aleatorio1.png', cost: 1000, unlock_achievement_code: null },
    'default_2': { nameKey: 'avatars.default_2', image_url: 'aleatorio2.png', cost: 1000, unlock_achievement_code: null },
    'default_3': { nameKey: 'avatars.default_3', image_url: 'aleatorio3.png', cost: 1000, unlock_achievement_code: null },
    'default_4': { nameKey: 'avatars.default_4', image_url: 'aleatorio4.png', cost: 1000, unlock_achievement_code: null },
    'graxa': { nameKey: 'avatars.graxa', image_url: 'graxa.png', cost: 2000, unlock_achievement_code: null },
    'jujuba': { nameKey: 'avatars.jujuba', image_url: 'jujuba.png', cost: 2000, unlock_achievement_code: null },
    'frank': { nameKey: 'avatars.frank', image_url: 'frank.png', cost: 2000, unlock_achievement_code: null },
    'lele': { nameKey: 'avatars.lele', image_url: 'lele.png', cost: 2000, unlock_achievement_code: null },
    'vini': { nameKey: 'avatars.vini', image_url: 'vini.png', cost: 2000, unlock_achievement_code: null },
    'vini2': { nameKey: 'avatars.vini2', image_url: 'vini2.png', cost: 2000, unlock_achievement_code: null },
    'nathan': { nameKey: 'avatars.nathan', image_url: 'nathan.png', cost: 2000, unlock_achievement_code: null },
    'pao': { nameKey: 'avatars.pao', image_url: 'pao.png', cost: 2000, unlock_achievement_code: null },
    'luan': { nameKey: 'avatars.luan', image_url: 'luan.png', cost: 2000, unlock_achievement_code: null },
    'lorenzo': { nameKey: 'avatars.lorenzo', image_url: 'lorenzo.png', cost: 2000, unlock_achievement_code: null },
    'rodrigo': { nameKey: 'avatars.rodrigo', image_url: 'rodrigo.png', cost: 2000, unlock_achievement_code: null },
    'necroverso': { nameKey: 'avatars.necroverso', image_url: 'necroverso.png', cost: 15000, unlock_achievement_code: 'tutorial_win' },
    'contravox': { nameKey: 'avatars.contravox', image_url: 'contravox.png', cost: 20000, unlock_achievement_code: 'contravox_win' },
    'versatrix': { nameKey: 'avatars.versatrix', image_url: 'versatrix.png', cost: 25000, unlock_achievement_code: 'versatrix_win' },
    'reversum': { nameKey: 'avatars.reversum', image_url: 'reversum.png', cost: 30000, unlock_achievement_code: 'reversum_win' }
};