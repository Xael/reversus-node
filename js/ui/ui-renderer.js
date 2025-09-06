// js/ui/ui-renderer.js
import * as dom from '../core/dom.js';
import { getState, updateState } from '../core/state.js';
import { updateLiveScoresAndWinningStatus } from '../game-logic/score.js';
import { renderPlayerArea } from './player-area-renderer.js';
import { renderBoard } from './board-renderer.js';
import { grantAchievement } from '../core/achievements.js';
import { showSplashScreen } from './splash-screen.js';
import { updateLog } from '../core/utils.js';
import { t } from '../core/i18n.js';

/**
 * Updates the UI for the chat filter and mute/unmute buttons.
 */
export function updateChatControls() {
    const { isChatMuted, chatFilter } = getState();

    if (!dom.chatContainerEl || !dom.chatToggleBtn || !dom.chatFilterBtn || !dom.chatInput) {
        return;
    }

    // Toggle Mute Button and Area
    dom.chatContainerEl.classList.toggle('chat-muted', isChatMuted);
    dom.chatToggleBtn.classList.toggle('active', isChatMuted);
    
    // Explicitly set text for both buttons to ensure translation is applied
    dom.chatToggleBtn.textContent = t(isChatMuted ? 'chat.toggle_off' : 'chat.toggle_on');
    dom.chatFilterBtn.textContent = t('chat.filter_button_label');

    dom.chatInput.disabled = isChatMuted;
    dom.chatInput.placeholder = t(isChatMuted ? 'chat.chat_muted_message' : 'game.chat_placeholder');
}


/**
 * Updates the UI for Xael's Star Power ability.
 */
export const updateXaelStarPowerUI = () => {
    const { gameState } = getState();
    if (!gameState || !gameState.isStoryMode) {
        dom.xaelStarPowerButton.classList.add('hidden');
        return;
    }

    const player = gameState.players['player-1'];
    if (player && player.hasXaelStarPower) {
        dom.xaelStarPowerButton.classList.remove('hidden');
        const isOnCooldown = player.xaelStarPowerCooldown > 0;
        dom.xaelStarPowerButton.disabled = isOnCooldown;
        dom.xaelStarPowerButton.classList.toggle('cooldown', isOnCooldown);
        dom.xaelStarPowerButton.title = isOnCooldown 
            ? `Poder Estelar (Recarregando por mais ${player.xaelStarPowerCooldown} rodada(s))`
            : 'Poder Estelar do Xael (Revela mãos)';
    } else {
        dom.xaelStarPowerButton.classList.add('hidden');
    }
};

/**
 * Renders the current PvP pot.
 */
function renderPvpPot() {
    const { gameState } = getState();
    const potEl = dom.pvpPotContainer;
    if (!potEl) return;

    if (gameState.isPvp && gameState.pot !== undefined && gameState.betAmount > 0) {
        potEl.classList.remove('hidden');
        potEl.innerHTML = `🏆 <span>${t('game.pot')}: ${gameState.pot}</span>`;
    } else {
        potEl.classList.add('hidden');
    }
}

/**
 * Renders the turn countdown timer for PvP matches.
 */
function renderTurnTimer() {
    const { gameState } = getState();
    const timerEl = dom.turnCountdownTimer;
    if (!timerEl) return;

    if (gameState && gameState.isPvp && gameState.remainingTurnTime !== undefined && gameState.remainingTurnTime <= 10) {
        timerEl.textContent = gameState.remainingTurnTime;
        timerEl.classList.remove('hidden');
    } else {
        timerEl.classList.add('hidden');
    }
}


/**
 * Renders all dynamic UI components of the game.
 */
export const renderAll = () => {
    const { gameState } = getState();
    if (!gameState) return;
    
    // Render each player's area
    gameState.playerIdsInGame.forEach(id => {
        if(gameState.players[id]) {
            renderPlayerArea(gameState.players[id]);
        }
    });

    // Render the game board and pawns
    renderBoard();

    // CRITICAL FIX: Re-render the log from the authoritative game state
    updateLog();

    // Update the action buttons based on the current state
    updateActionButtons();

    // Update live scores and side panel statuses
    updateLiveScoresAndWinningStatus();

    // Render the PvP pot if applicable
    renderPvpPot();

    // Render the turn timer for PvP
    renderTurnTimer();
    
    // Update Xael's Star Power button if in that challenge
    if (gameState.isStoryMode) {
        updateXaelStarPowerUI();
    }

    // Update Chat Controls
    updateChatControls();
};

/**
 * Enables/disables action buttons based on game state. The turn message is handled by overlays.
 */
export const updateActionButtons = () => {
    const { gameState, playerId } = getState();
    if (!gameState) return;
    
    const currentPlayer = gameState.players[gameState.currentPlayer];
    // FIX: Use the correct player ID for PvP perspective and add a defensive guard
    const myPlayer = gameState.isPvp ? gameState.players[playerId] : gameState.players['player-1'];
    if (!myPlayer || !currentPlayer) return; 

    const isMyTurn = currentPlayer.id === myPlayer.id && gameState.gamePhase === 'playing';
    const hasSelectedCard = !!gameState.selectedCard;

    dom.playButton.disabled = !isMyTurn || !hasSelectedCard;
    dom.endTurnButton.disabled = !isMyTurn;
};

/**
 * Displays and then hides the "Sua Vez" indicator.
 */
export async function showTurnIndicator() {
    return new Promise(resolve => {
        dom.turnAnnounceModal.classList.remove('hidden');
        setTimeout(() => {
            dom.turnAnnounceModal.classList.add('hidden');
            resolve();
        }, 3000); // Increased duration to 3 seconds
    });
}

/**
 * Shows the round summary modal with scores and winner information.
 * @param {object} summaryData - The data for the summary, including winners, scores, and pot won.
 */
export async function showRoundSummaryModal(summaryData) {
    const { gameState } = getState();
    const { winners, finalScores, potWon } = summaryData;

    dom.roundSummaryTitle.textContent = t('round_summary.title', { turn: gameState.turn });
    
    const winnerNames = winners.map(id => gameState.players[id].name).join(' e ');
    dom.roundSummaryWinnerText.textContent = winners.length > 0 ? t('round_summary.winner_text', { winnerNames }) : t('round_summary.tie_text');
    
    const potTextEl = document.getElementById('round-summary-pot-text');
    if (potTextEl && potWon > 0) {
        potTextEl.textContent = t('round_summary.pot_winnings', { potWon });
        potTextEl.classList.remove('hidden');
    } else if (potTextEl) {
        potTextEl.classList.add('hidden');
    }

    dom.roundSummaryScoresEl.innerHTML = gameState.playerIdsInGame.map(id => {
        const player = gameState.players[id];
        if (!player) return '';
        return `
            <div class="summary-player-score ${winners.includes(id) ? 'is-winner' : ''}">
                <span class="summary-player-name">${player.name}</span>
                <span class="summary-player-final-score">${finalScores[id] || 0}</span>
            </div>
        `;
    }).join('');

    dom.roundSummaryModal.classList.remove('hidden');
    return new Promise(resolve => {
        const button = dom.nextRoundButton;
        const clickHandler = () => {
            dom.roundSummaryModal.classList.add('hidden');
            button.removeEventListener('click', clickHandler);
            clearTimeout(timeoutId);
            resolve();
        };
        const timeoutId = setTimeout(clickHandler, 5000); // Auto-advance after 5s
        button.addEventListener('click', clickHandler);
    });
}

/**
 * Shows the game over screen with a custom message and button.
 * @param {string} message - The message to display (e.g., who won).
 * @param {string} [title="Fim de Jogo!"] - The title for the modal.
 * @param {object} [buttonOptions={}] - Options for the button.
 * @param {string} [buttonOptions.text='Jogar Novamente'] - The text for the button.
 * @param {string} [buttonOptions.action='restart'] - The action for the button ('restart' or 'menu').
 */
export const showGameOver = (message, title = "Fim de Jogo!", buttonOptions = {}) => {
    const { text = t('game_over.play_again'), action = 'restart' } = buttonOptions;
    
    dom.gameOverTitle.textContent = title;
    dom.gameOverMessage.textContent = message;
    dom.restartButton.textContent = text;
    dom.restartButton.dataset.action = action;
    dom.gameOverModal.classList.remove('hidden');

    const { gameState } = getState();
    if (gameState && gameState.isStoryMode && !message.toLowerCase().includes('derrotado')) {
        // Only grant achievement on non-story defeats
    } else if (gameState && !gameState.isStoryMode && !message.toLowerCase().includes('derrotado')) {
        grantAchievement('first_win');
    } else {
        grantAchievement('first_defeat');
    }
};