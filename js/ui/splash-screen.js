import * as dom from '../core/dom.js';
import { getState, updateState } from '../core/state.js';
import { playStoryMusic, stopStoryMusic, updateMusic } from '../core/sound.js';
import { checkForSavedGame } from '../core/save-load.js';
import { checkAndShowSpecialFeatures } from '../core/achievements.js';
import { initializeFloatingItemsAnimation } from './animations.js';

export const showSplashScreen = () => {
    // Stop any ongoing game logic
    const { gameTimerInterval, isLoggedIn } = getState();
    if (gameTimerInterval) {
        clearInterval(gameTimerInterval);
        updateState('gameTimerInterval', null);
    }
    
    // Reset core game and PvP states
    updateState('gameState', null);
    updateState('playerId', null);
    updateState('currentRoomId', null);

    // Play menu music
    playStoryMusic('tela.ogg');
    
    // Hide all game elements
    dom.appContainerEl.classList.add('hidden');
    dom.debugButton.classList.add('hidden');
    dom.xaelStarPowerButton.classList.add('hidden');

    // Hide all modals
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => modal.classList.add('hidden'));

    // Show splash screen
    dom.splashScreenEl.classList.remove('hidden');
    initializeFloatingItemsAnimation(dom.splashAnimationContainerEl);
    
    // Show/hide event button based on login status
    dom.eventButton.classList.toggle('hidden', !isLoggedIn);
    
    checkAndShowSpecialFeatures();
};