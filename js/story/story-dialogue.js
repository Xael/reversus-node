import { getState } from '../core/state.js';
import { showSplashScreen } from '../ui/splash-screen.js';

export const storyDialogue = {
    'start_necroverso': {
        character: 'Necroverso', image: 'necroverso.png',
        text: 'story_dialogue.start_necroverso_text',
        options: [{ text: 'story_dialogue.start_necroverso_option_1', next: 'pre_tutorial_prompt' }]
    },
    'pre_tutorial_prompt': {
        character: 'Necroverso', image: 'necroverso.png',
        music: 'interlude.ogg',
        text: 'story_dialogue.pre_tutorial_prompt_text',
        options: [
            { text: 'story_dialogue.pre_tutorial_prompt_option_1', next: 'tutorial_explain_1' },
            { text: 'story_dialogue.pre_tutorial_prompt_option_2', next: 'tutorial_skip' }
        ]
    },
    'tutorial_skip': {
        character: 'Necroverso', image: 'necroverso.png',
        music: 'interlude.ogg',
        text: 'story_dialogue.tutorial_skip_text',
        isContinue: true,
        next: 'pre_contravox_intro'
    },
    'tutorial_explain_1': {
        character: 'Necroverso', image: 'necroverso.png',
        music: 'interlude.ogg',
        text: 'story_dialogue.tutorial_explain_1_text',
        next: 'tutorial_explain_2', isContinue: true
    },
    'tutorial_explain_2': {
        character: 'Necroverso', image: 'necroverso.png',
        music: 'interlude.ogg',
        text: 'story_dialogue.tutorial_explain_2_text',
        next: 'tutorial_explain_3', isContinue: true
    },
    'tutorial_explain_3': {
        character: 'Necroverso', image: 'necroverso.png',
        music: 'interlude.ogg',
        text: 'story_dialogue.tutorial_explain_3_text',
        next: 'tutorial_explain_4', isContinue: true
    },
    'tutorial_explain_4': {
        character: 'Necroverso', image: 'necroverso.png',
        music: 'interlude.ogg',
        text: 'story_dialogue.tutorial_explain_4_text',
        next: 'tutorial_explain_5', isContinue: true
    },
    'tutorial_explain_5': {
        character: 'Necroverso', image: 'necroverso.png',
        music: 'interlude.ogg',
        text: 'story_dialogue.tutorial_explain_5_text',
        isEndStory: true,
        startGame: { battle: 'tutorial_necroverso' }
    },
    'tutorial_loss': {
        character: 'Necroverso', image: 'necroverso.png',
        text: 'story_dialogue.tutorial_loss_text',
        next: 'tutorial_explain_5', isContinue: true
    },
    'post_tutorial': {
        character: 'Necroverso', image: 'necroverso.png',
        text: 'story_dialogue.post_tutorial_text',
        options: [{ text: "story_dialogue.post_tutorial_option_1", next: 'pre_contravox_intro' }]
    },
    'pre_contravox_intro': {
        character: 'Necroverso', image: 'necroverso3.png',
        text: 'story_dialogue.pre_contravox_intro_text',
        options: [{ text: 'story_dialogue.pre_contravox_intro_option_1', next: 'pre_contravox_hint' }, { text: 'story_dialogue.pre_contravox_intro_option_2', next: 'pre_contravox_hint' }]
    },
    'pre_contravox_hint': {
        character: 'Necroverso', image: 'necroverso3.png',
        text: 'story_dialogue.pre_contravox_hint_text',
        options: [{ text: 'story_dialogue.pre_contravox_hint_option_1', next: 'start_contravox' }, { text: 'story_dialogue.pre_contravox_hint_option_2', next: 'start_contravox' }]
    },
    'start_contravox': {
        character: 'Contravox', image: 'contravox.png',
        text: 'story_dialogue.start_contravox_text',
        options: [{ text: 'story_dialogue.start_contravox_option_1', next: 'contravox_end' }, { text: 'story_dialogue.start_contravox_option_2', next: 'contravox_end' }, { text: 'story_dialogue.start_contravox_option_3', next: 'contravox_end' }]
    },
    'contravox_end': {
        isEndStory: true,
        startGame: { battle: 'contravox' }
    },
    'post_contravox_victory': {
        character: 'Necroverso', image: 'necroverso.png',
        text: "story_dialogue.post_contravox_victory_text",
        next: 'pre_versatrix_intro', isContinue: true
    },
    'pre_versatrix_intro': {
        character: 'Necroverso', image: 'necroverso3.png',
        text: 'story_dialogue.pre_versatrix_intro_text',
        options: [{ text: 'story_dialogue.pre_versatrix_intro_option_1', next: 'start_versatrix_dialogue' }, { text: 'story_dialogue.pre_versatrix_intro_option_2', next: 'start_versatrix_dialogue' }]
    },
    'start_versatrix_dialogue': {
        character: 'Versatrix', image: 'versatrix.png',
        text: "story_dialogue.start_versatrix_dialogue_text_2",
        options: [
            { text: "story_dialogue.start_versatrix_dialogue_option_2", next: 'versatrix_sinto_muito' }, 
            { text: "story_dialogue.start_versatrix_dialogue_option_3", next: 'versatrix_solteira' }
        ]
    },
    'versatrix_end_game': {
         isEndStory: true, startGame: { battle: 'versatrix' }
    },
    'versatrix_sinto_muito': {
        character: 'Versatrix', image: 'versatrix.png',
        text: "story_dialogue.versatrix_sinto_muito_text",
        isEndStory: true, startGame: { battle: 'versatrix' }
    },
    'versatrix_solteira': {
        character: 'Versatrix', image: 'versatrix.png',
        text: "story_dialogue.versatrix_solteira_text",
        isEndStory: true, startGame: { battle: 'versatrix' }
    },
    'post_versatrix_victory': {
        character: 'Necroverso', image: 'necroverso.png',
        text: "story_dialogue.post_versatrix_victory_text",
        options: [{ text: "story_dialogue.post_versatrix_victory_option_1", next: 'post_versatrix_ask_return' }]
    },
    'post_versatrix_defeat': {
        character: 'Versatrix', image: 'versatrix.png',
        text: "story_dialogue.post_versatrix_defeat_text",
        options: [{ text: "story_dialogue.post_versatrix_defeat_option_1", next: 'post_versatrix_victory' }, { text: "story_dialogue.post_versatrix_defeat_option_2", next: 'post_versatrix_victory' }, { text: "story_dialogue.post_versatrix_defeat_option_3", next: 'post_versatrix_victory' }]
    },
    'post_versatrix_ask_return': {
        character: 'Necroverso', image: 'necroverso.png',
        text: "story_dialogue.post_versatrix_ask_return_text",
        next: 'pre_reversum_intro', isContinue: true
    },
    'pre_reversum_intro': {
        character: 'Necroverso', image: 'necroverso3.png',
        text: 'story_dialogue.pre_reversum_intro_text',
        options: [{ text: 'story_dialogue.pre_reversum_intro_option_1', next: 'start_reversum' }, { text: 'story_dialogue.pre_reversum_intro_option_2', next: 'start_reversum' }]
    },
    'start_reversum': {
        character: 'Reversum', image: 'reversum.png',
        text: "story_dialogue.start_reversum_text",
        options: [{ text: "story_dialogue.start_reversum_option_1", next: 'reversum_end' }, { text: "story_dialogue.start_reversum_option_2", next: 'reversum_end' }, { text: "story_dialogue.start_reversum_option_3", next: 'reversum_end' }]
    },
    'reversum_end': {
        isEndStory: true,
        startGame: { battle: 'reversum' }
    },
    'post_reversum_victory': {
        character: 'Necroverso', image: 'necroversorevelado.png',
        text: "story_dialogue.post_reversum_victory_text",
        options: [{ text: "story_dialogue.post_reversum_victory_option_1", next: 'final_confrontation_1' }]
    },
    'final_confrontation_1': {
        character: 'Necroverso', image: 'necroversorevelado.png',
        text: "story_dialogue.final_confrontation_1_text",
        options: [{ 
            text: "story_dialogue.final_confrontation_1_option_1", 
            next: () => getState().storyState.lostToVersatrix ? 'versatrix_warning_1' : 'necroverso_king_battle_intro' 
        }]
    },
    'necroverso_king_battle_intro': {
        character: 'Necroverso', image: 'necroversorevelado.png',
        text: "story_dialogue.necroverso_king_battle_intro_text",
        options: [{ text: "story_dialogue.necroverso_king_battle_intro_option_1", next: 'necroverso_king_battle' }]
    },
    'necroverso_king_battle': {
        isEndStory: true,
        startGame: { battle: 'necroverso_king' }
    },
    'post_necroverso_king_victory': {
        character: 'Necroverso', image: 'necroverso2.png',
        text: "story_dialogue.post_necroverso_king_victory_text",
        isContinue: true,
        next: 'return_to_menu_from_kings'
    },
    'return_to_menu_from_kings': {
        isEndStory: true,
        startGame: { battle: 'return_to_menu' }
    },
    'versatrix_warning_1': {
        character: 'Versatrix', image: 'versatrix.png',
        text: "story_dialogue.versatrix_warning_1_text",
        options: [{ text: "story_dialogue.versatrix_warning_1_option_1", next: 'versatrix_warning_2' }, { text: "story_dialogue.versatrix_warning_1_option_2", next: 'versatrix_warning_2' }]
    },
    'versatrix_warning_2': {
        character: 'Versatrix', image: 'versatrix.png',
        text: "story_dialogue.versatrix_warning_2_text",
        options: [{ text: "story_dialogue.versatrix_warning_2_option_1", next: 'pre_final_battle' }]
    },
    'pre_final_battle': {
        character: 'Necroverso', image: 'necroverso3.png',
        text: 'story_dialogue.pre_final_battle_text',
        options: [{ text: 'story_dialogue.pre_final_battle_option_1', next: 'final_battle_final' }, { text: 'story_dialogue.pre_final_battle_option_2', next: 'final_battle_final' }]
    },
    'final_battle_final': {
        isEndStory: true,
        startGame: { battle: 'necroverso_final' }
    },
    'xael_challenge_intro': {
        character: 'Xael',
        image: 'xaeldesafio.png',
        text: 'story_dialogue.xael_challenge_intro_text',
        next: 'start_xael_challenge',
        isContinue: true
    },
    'start_xael_challenge': {
        isEndStory: true,
        startGame: { battle: 'xael_challenge' }
    }
};