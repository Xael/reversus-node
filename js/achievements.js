// js/core/achievements.js



import * as dom from './dom.js';
import * as config from './config.js';
import { getState, updateState } from './state.js';
import { playSoundEffect } from './sound.js';
import { showAchievementNotification } from '../ui/toast-renderer.js';
import * as network from '../core/network.js';

const ACHIEVEMENTS_KEY = 'reversus-achievements';

/**
 * Checks for special features to unlock based on achievements.
 * This function now handles the multi-stage unlock process.
 */
export function checkAndShowSpecialFeatures() {
    const { achievements } = getState();

    // Unlock INVERSUS mode after beating the true final boss
    dom.inversusModeButton.classList.toggle('hidden', !achievements.has('true_end_final'));

    const { glitchInterval } = getState();
    if (glitchInterval) clearInterval(glitchInterval);

    // Unlock Narrador secret battle (glitching logo) after beating Inversus (100%)
    if (achievements.has('inversus_win')) {
        dom.splashLogo.classList.add('effect-glitch');
    } else {
        dom.splashLogo.classList.remove('effect-glitch');
    }
}


/**
 * Loads unlocked achievements from localStorage into the application state.
 * This is a critical path and includes robust error handling to prevent game crashes.
 */
export function loadAchievements() {
    try {
        const saved = localStorage.getItem(ACHIEVEMENTS_KEY);
        if (saved) {
            const unlockedData = JSON.parse(saved);
            // Ensure the parsed data is an array before creating a Set.
            // This prevents crashes if local storage data is corrupted.
            if (!Array.isArray(unlockedData)) {
                throw new Error('Saved achievements data is not an array.');
            }
            
            const unlockedIds = new Set(unlockedData);
            updateState('achievements', unlockedIds);

            checkAndShowSpecialFeatures();
        } else {
            // If no data, initialize with an empty set. This is the normal case for a new player.
            updateState('achievements', new Set());
        }
    } catch (e) {
        console.error("Failed to load or parse achievements, resetting them to prevent a crash.", e);
        // If there's any error during loading or parsing, clear the corrupted
        // data from local storage and start fresh. This makes the app self-healing.
        localStorage.removeItem(ACHIEVEMENTS_KEY);
        updateState('achievements', new Set());
    }
}

/**
 * Saves the current set of unlocked achievements to localStorage.
 */
function saveAchievements() {
    const { achievements } = getState();
    try {
        localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(Array.from(achievements)));
    } catch (e) {
        console.error("Failed to save achievements", e);
    }
}

/**
 * Checks if all achievements have been unlocked.
 * @returns {boolean} True if all achievements are unlocked.
 */
function checkAllAchievementsUnlocked() {
    const { achievements } = getState();
    const achievementKeys = Object.keys(config.ACHIEVEMENTS);
    // Check if the player has every single achievement defined in the config
    return achievementKeys.every(id => achievements.has(id));
}

/**
 * Grants an achievement to the player.
 * @param {string} id - The ID of the achievement to grant.
 */
export function grantAchievement(id) {
    const { achievements, gameState } = getState();

    // Prevent 'Speed Run' achievement during the tutorial match.
    if (id === 'speed_run' && gameState?.currentStoryBattle === 'tutorial_necroverso') {
        return;
    }

    if (!achievements.has(id) && config.ACHIEVEMENTS[id]) {
        achievements.add(id);
        const achievementData = config.ACHIEVEMENTS[id];
        console.log(`Achievement Unlocked: ${achievementData.name}`);
        
        playSoundEffect('conquista');
        showAchievementNotification(achievementData);
        
        // Concede CoinVersus para desafios especiais de história
        if (['xael_win', 'inversus_win', '120%_unlocked'].includes(id)) {
            let amount = 1000;
            if (id === 'inversus_win') amount = 2500;
            if (id === '120%_unlocked') amount = 5000;
            network.emitClaimChallengeReward({ challengeId: id, amount: amount });
        }

        saveAchievements();
        checkAndShowSpecialFeatures(); // Check features after every new achievement
    }
}