// js/ui/ui-handlers.js



import * as dom from '../core/dom.js';
import { getState, updateState } from '../core/state.js';
import { initializeGame, restartLastDuel } from '../game-controller.js';
import { renderAchievementsModal } from './achievements-renderer.js';
import { renderAll, renderHandOverlay, showGameOver } from './ui-renderer.js';
import * as sound from '../core/sound.js';
import { startStoryMode, renderStoryNode, playEndgameSequence } from '../story/story-controller.js';
import * as saveLoad from '../core/save-load.js';
import * as achievements from '../core/achievements.js';
import { updateLog } from '../core/utils.js';
import * as config from '../core/config.js';
import * as network from '../core/network.js';
import { createCosmicGlowOverlay, shatterImage } from './animations.js';
import { announceEffect } from '../core/sound.js';
import { playCard } from '../game-logic/player-actions.js';
import { advanceToNextPlayer } from '../game-logic/turn-manager.js';
import { setLanguage, t } from '../core/i18n.js';
import { showSplashScreen } from './splash-screen.js';
import { renderProfile } from './profile-renderer.js';

let currentEventData = null;

/**
 * Gets the ID of the local human player.
 * In PvP, this is the ID assigned by the server.
 * In single-player, this is the player with the `isHuman` flag.
 * @returns {string | null} The player ID or null if not found.
 */
function getLocalPlayerId() {
    const { gameState, playerId } = getState();
    if (!gameState) return null;
    if (gameState.isPvp) return playerId;
    
    const humanPlayer = Object.values(gameState.players).find(p => p.isHuman);
    return humanPlayer ? humanPlayer.id : null;
}

/**
 * Closes the hand overlay and resets any card selection state.
 */
function closeHandOverlay() {
    const { gameState } = getState();
    if (gameState) gameState.selectedCard = null;
    
    // Add closing class to trigger slide-out animation
    dom.cardFan.classList.add('closing');

    // Wait for the animation to finish before hiding the overlay
    setTimeout(() => {
        dom.handOverlay.classList.add('hidden');
        dom.cardFan.classList.remove('closing'); // Reset for next time
        dom.cardFan.innerHTML = ''; // Clear content to prevent old listeners
    }, 500); // Must match animation duration in CSS
}


/**
 * Resets the game state after a player cancels an action modal.
 */
function cancelPlayerAction() {
    const { gameState } = getState();
    dom.targetModal.classList.add('hidden');
    dom.reversusTargetModal.classList.add('hidden');
    dom.reversusTotalChoiceModal.classList.add('hidden');
    dom.reversusIndividualEffectChoiceModal.classList.add('hidden');
    dom.pulaModal.classList.add('hidden');
    if (gameState) {
        gameState.gamePhase = 'playing';
        gameState.selectedCard = null;
        gameState.reversusTarget = null;
        gameState.pulaTarget = null;
        updateState('reversusTotalIndividualFlow', false);
    }
    renderAll();
}

/**
 * Handles the logic when a "Play" action is triggered (now from the overlay).
 */
async function handlePlayButtonClick() {
    const { gameState } = getState();
    if (!gameState) return;
    
    const myPlayerId = getLocalPlayerId();
    if (!myPlayerId) return;

    const player = gameState.players[myPlayerId];
    const card = gameState.selectedCard;

    if (!player || !card) return;

    gameState.gamePhase = 'paused'; // Prevent other actions while modals are open
    renderAll();

    if (card.type === 'value') {
        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: card.id, targetId: player.id });
        } else {
            await playCard(player, card, player.id);
        }
        gameState.gamePhase = 'playing';
        renderAll();
        return;
    }

    // --- EFFECT CARDS ---
    const targetableCards = ['Mais', 'Menos', 'Sobe', 'Desce', 'Pula', 'Reversus'];

    if (targetableCards.includes(card.name)) {
        const allPlayers = gameState.playerIdsInGame.filter(id => !gameState.players[id].isEliminated);
        if (allPlayers.length === 0) {
            updateLog(`Não há jogadores para usar a carta '${card.name}'.`);
            cancelPlayerAction();
            return;
        }
        dom.targetModalCardName.textContent = card.name;
        dom.targetPlayerButtonsEl.innerHTML = allPlayers.map(id => `<button class="control-button target-player-${id.split('-')[1]}" data-player-id="${id}">${gameState.players[id].name}</button>`).join('');
        dom.targetModal.classList.remove('hidden');
    } else if (card.name === 'Reversus Total') {
        dom.reversusTotalChoiceModal.classList.remove('hidden');
    } else if (card.name === 'Carta da Versatrix') {
        if (gameState.isPvp) {
             network.emitPlayCard({ cardId: card.id, targetId: player.id });
        } else {
             await playCard(player, card, player.id);
        }
        gameState.gamePhase = 'playing';
        renderAll();
    } else {
        // Fallback for any other unhandled effect card
        console.warn(`Unhandled effect card in handlePlayButtonClick: ${card.name}`);
        cancelPlayerAction();
    }
}


/**
 * Handles the logic for ending a player's turn.
 */
function handleEndTurnButtonClick() {
    const { gameState } = getState();
    const myPlayerId = getLocalPlayerId();
    if (!myPlayerId) return;

    const player = gameState.players[myPlayerId];

    if (!player || gameState.currentPlayer !== myPlayerId) return;

    const valueCardsInHandCount = player.hand.filter(c => c.type === 'value').length;
    if (valueCardsInHandCount > 1 && !player.playedValueCardThisTurn) {
        updateLog("Você deve jogar uma carta de valor antes de passar o turno.");
        return;
    }
    
    if (gameState.isPvp) {
        network.emitEndTurn();
    } else {
        updateLog(`${player.name} passou o turno.`);
        gameState.consecutivePasses++;
        advanceToNextPlayer(); // Call directly to fix the game getting stuck
    }
}

/**
 * Shows an info modal for a field effect when its indicator is clicked.
 * @param {Event} e The click event from the indicator.
 */
function handleFieldEffectIndicatorClick(e) {
    const indicator = e.target.closest('.field-effect-indicator');
    if (!indicator) return;

    const playerId = indicator.dataset.playerId;
    const { gameState } = getState();
    const activeEffect = gameState.activeFieldEffects.find(fe => fe.appliesTo === playerId);
    
    if (activeEffect) {
        dom.fieldEffectInfoTitle.textContent = "Efeito de Campo Ativo";
        const isPositive = activeEffect.type === 'positive';
        dom.fieldEffectInfoModal.querySelector('.field-effect-card').className = `field-effect-card ${isPositive ? 'positive' : 'negative'}`;
        dom.fieldEffectInfoName.textContent = activeEffect.name;
        dom.fieldEffectInfoDescription.textContent = isPositive ? config.POSITIVE_EFFECTS[activeEffect.name] : config.NEGATIVE_EFFECTS[activeEffect.name];
        dom.fieldEffectInfoModal.classList.remove('hidden');
    }
}


export function initializeUiHandlers() {
    // This listener connects the AI's turn completion signal to the function
    // that advances the game to the next player. It's crucial for the game flow.
    document.addEventListener('aiTurnEnded', advanceToNextPlayer);
    
    // Game Action Handlers
    document.body.addEventListener('click', (e) => {
        // Card Zoom handler (for any card on screen)
        if (e.target.classList.contains('card-maximize-button')) {
            const cardEl = e.target.closest('.card');
            if (cardEl) {
                // Prevent zoom on face-down cards
                if (cardEl.style.backgroundImage.includes('verso_')) return;
                
                dom.cardViewerImageEl.src = cardEl.style.backgroundImage.slice(5, -2);
                dom.cardViewerModalEl.classList.remove('hidden');
            }
            return; // Stop further processing
        }
        
        // Field effect info handler
        if (e.target.closest('.field-effect-indicator')) {
            handleFieldEffectIndicatorClick(e);
        }
    });

    dom.endTurnButton.addEventListener('click', handleEndTurnButtonClick);
    dom.cardViewerCloseButton.addEventListener('click', () => dom.cardViewerModalEl.classList.add('hidden'));
    
    // Splash Screen Handlers
    dom.quickStartButton.addEventListener('click', () => {
        sound.initializeMusic();
        dom.splashScreenEl.classList.add('hidden');
        dom.gameSetupModal.classList.remove('hidden');
    });
    
    dom.storyModeButton.addEventListener('click', () => {
        sound.initializeMusic();
        // Check for saved game and update the continue button
        const hasSave = localStorage.getItem('reversus-story-save');
        dom.storyContinueGameButton.disabled = !hasSave;
        dom.storyStartOptionsModal.classList.remove('hidden');
    });

    dom.pvpModeButton.addEventListener('click', () => {
        const { isLoggedIn } = getState();
        if (!isLoggedIn) {
            alert("É necessário fazer login com o Google para jogar no modo PVP.");
            return;
        }
        network.emitListRooms();
        dom.splashScreenEl.classList.add('hidden');
        dom.pvpRoomListModal.classList.remove('hidden');
    });

    // --- EVENT MODAL: REFACTORED LOGIC ---
    // This handler opens the modal and sets its content.
    dom.eventButton.addEventListener('click', () => {
        const currentMonth = new Date().getMonth();
        currentEventData = config.MONTHLY_EVENTS[currentMonth]; // Store current event data

        if (currentEventData) {
            sound.playStoryMusic(`${currentEventData.ai}.ogg`); // Play event music
            // Populate the modal with the current month's event data, using translations
            dom.eventCharacterImage.src = `./${currentEventData.image}`;
            dom.eventCharacterName.textContent = t(currentEventData.characterNameKey);
            dom.eventAbilityDescription.textContent = t(currentEventData.abilityKey);
            dom.eventRewardText.textContent = t('event.reward_text_placeholder', { rewardName: t(currentEventData.rewardTitleKey) });

            // Check if the player has already attempted the challenge today
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
            const lastAttemptDate = localStorage.getItem('reversus-event-attempt-date');
            const hasAttemptedToday = lastAttemptDate === today;

            dom.challengeEventButton.disabled = hasAttemptedToday;
            dom.eventStatusText.textContent = hasAttemptedToday ? t('event.status_wait') : '';
        } else {
            sound.playStoryMusic('tela.ogg'); // Revert to menu music if no event
            // Fallback if no event is configured for the current month
            dom.eventCharacterImage.src = '';
            dom.eventCharacterName.textContent = 'Nenhum Evento Ativo';
            dom.eventAbilityDescription.textContent = 'Volte mais tarde para novos desafios.';
            dom.challengeEventButton.disabled = true;
            dom.eventStatusText.textContent = '';
            currentEventData = null;
        }
        dom.eventModal.classList.remove('hidden');
    });

    // This is the single, persistent listener for the challenge button.
    dom.challengeEventButton.addEventListener('click', () => {
        if (dom.challengeEventButton.disabled || !currentEventData) return;

        // Set the local storage flag to lock the event for today
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem('reversus-event-attempt-date', today);

        const gameOptions = {
            story: { // Use story mode infrastructure for events
                battle: `event_${currentEventData.ai}`,
                eventData: {
                    name: t(currentEventData.nameKey),
                    ai: currentEventData.ai
                },
                playerIds: ['player-1', 'player-2'],
                overrides: {
                    'player-2': {
                        name: t(currentEventData.characterNameKey),
                        aiType: currentEventData.ai
                    }
                }
            }
        };
        initializeGame('solo', gameOptions);
    });
    
    dom.rankingButton.addEventListener('click', () => {
        network.emitGetRanking();
        dom.rankingModal.classList.remove('hidden');
    });

    // Story Start Options Modal Handlers
    dom.storyNewGameButton.addEventListener('click', () => {
        dom.storyStartOptionsModal.classList.add('hidden');
        startStoryMode();
    });

    dom.storyContinueGameButton.addEventListener('click', () => {
        dom.storyStartOptionsModal.classList.add('hidden');
        saveLoad.loadGameState();
    });

    dom.storyOptionsCloseButton.addEventListener('click', () => {
        dom.storyStartOptionsModal.classList.add('hidden');
    });
    
    dom.inversusModeButton.addEventListener('click', () => {
        initializeGame('inversus', {});
    });

    // Profile & Achievements via User Display
    dom.userProfileDisplay.addEventListener('click', () => {
        network.emitGetProfile(); // This will trigger profile rendering
        renderAchievementsModal(); // Also render achievements
        dom.profileModal.classList.remove('hidden');
    });

    // Ranking, Profile, and Event Modal Close Buttons
    dom.closeRankingButton.addEventListener('click', () => dom.rankingModal.classList.add('hidden'));
    dom.closeProfileButton.addEventListener('click', () => dom.profileModal.classList.add('hidden'));
    dom.closeEventButton.addEventListener('click', () => {
        dom.eventModal.classList.add('hidden');
        sound.playStoryMusic('tela.ogg'); // Revert to menu music
    });

    // Tab handlers for Profile/Achievements Modal
    dom.profileModal.querySelectorAll('.profile-tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            dom.profileModal.querySelectorAll('.profile-tab-button').forEach(btn => btn.classList.remove('active'));
            dom.profileModal.querySelectorAll('.info-tab-content').forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(`${tabId}-tab-content`).classList.add('active');
        });
    });

    // Info Modal Handlers
    dom.infoButton.addEventListener('click', () => dom.infoModal.classList.remove('hidden'));
    dom.closeInfoButton.addEventListener('click', () => dom.infoModal.classList.add('hidden'));
    dom.infoModal.querySelectorAll('.info-tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            dom.infoModal.querySelectorAll('.info-tab-button').forEach(btn => btn.classList.remove('active'));
            dom.infoModal.querySelectorAll('.info-tab-content').forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(`${tabId}-tab-content`).classList.add('active');
        });
    });
    
    // Game Setup Modal Handlers
    dom.closeSetupButton.addEventListener('click', () => {
        dom.gameSetupModal.classList.add('hidden');
        dom.splashScreenEl.classList.remove('hidden');
    });
    
    dom.solo2pButton.addEventListener('click', () => {
        dom.gameSetupModal.classList.add('hidden');
        dom.oneVOneSetupModal.classList.remove('hidden');
    });
    
    dom.solo3pButton.addEventListener('click', () => initializeGame('solo', { numPlayers: 3 }));
    dom.solo4pButton.addEventListener('click', () => initializeGame('solo', { numPlayers: 4 }));
    dom.duoModeButton.addEventListener('click', () => initializeGame('duo', { numPlayers: 4 }));

    // 1v1 Setup Handlers
    dom.oneVOneBackButton.addEventListener('click', () => {
        dom.oneVOneSetupModal.classList.add('hidden');
        dom.gameSetupModal.classList.remove('hidden');
    });
    
    dom.oneVOneDefaultButton.addEventListener('click', () => {
        dom.oneVOneSetupModal.classList.add('hidden');
        initializeGame('solo', { numPlayers: 2 });
    });

    dom.oneVOneRandomButton.addEventListener('click', async () => {
        dom.oneVOneSetupModal.classList.add('hidden');
        dom.randomOpponentSpinnerModal.classList.remove('hidden');

        const opponents = [
            { name: 'Contravox', aiType: 'contravox', image: './contravox.png' },
            { name: 'Versatrix', aiType: 'versatrix', image: './versatrix.png' },
            { name: 'Rei Reversum', aiType: 'reversum', image: './reversum.png' },
            { name: 'Inversus', aiType: 'inversus', image: './INVERSUM1.png' },
            { name: 'Xael', aiType: 'xael', image: './xaeldesafio.png' },
            { name: 'Narrador', aiType: 'narrador', image: './narrador.png' },
            { name: 'Necroverso Final', aiType: 'necroverso_final', image: './necroverso2.png' }
        ];

        let spinnerInterval;
        let selectedOpponent;
        const spinPromise = new Promise(resolve => {
            let currentIndex = 0;
            spinnerInterval = setInterval(() => {
                dom.opponentSpinnerImage.src = opponents[currentIndex].image;
                dom.opponentSpinnerName.textContent = opponents[currentIndex].name;
                currentIndex = (currentIndex + 1) % opponents.length;
            }, 100);

            setTimeout(() => {
                clearInterval(spinnerInterval);
                selectedOpponent = opponents[Math.floor(Math.random() * opponents.length)];
                dom.opponentSpinnerImage.src = selectedOpponent.image;
                dom.opponentSpinnerName.textContent = selectedOpponent.name;
                sound.playSoundEffect('escolhido');
                resolve();
            }, 3000);
        });
        
        await spinPromise;
        await new Promise(res => setTimeout(res, 1500));
        dom.randomOpponentSpinnerModal.classList.add('hidden');
        
        const overrides = { 'player-2': { name: selectedOpponent.name, aiType: selectedOpponent.aiType } };
        initializeGame('solo', { numPlayers: 2, overrides });
    });

    // Game Over Modal Handler
    dom.restartButton.addEventListener('click', (e) => {
        dom.gameOverModal.classList.add('hidden');
        const action = e.target.dataset.action;
        
        if (action === 'restart') {
            const { gameState } = getState();
            if (gameState && gameState.isStoryMode) {
                restartLastDuel();
            } else if (gameState) {
                initializeGame(gameState.gameMode, gameState.gameOptions);
            } else {
                 showSplashScreen();
            }
        } else { // 'menu' or default
            showSplashScreen();
        }
    });
    
    // Targeting Modals Handlers
    dom.targetPlayerButtonsEl.addEventListener('click', async (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        
        const targetId = e.target.dataset.playerId;
        const { gameState, reversusTotalIndividualFlow } = getState();
        const card = gameState.selectedCard;
        const myPlayerId = getLocalPlayerId();
        const player = gameState.players[myPlayerId];
        
        dom.targetModal.classList.add('hidden');

        if (!card || !player) {
            cancelPlayerAction();
            return;
        }

        // Handle the specific, multi-step cards first
        if (reversusTotalIndividualFlow && card.name === 'Reversus Total') {
            gameState.reversusTarget = targetId;
            dom.reversusIndividualEffectChoiceModal.classList.remove('hidden');
        } else if (card.name === 'Reversus') {
            gameState.reversusTarget = targetId;
            dom.reversusTargetModal.classList.remove('hidden');
        } else if (card.name === 'Pula') {
            gameState.pulaTarget = targetId;
            const targetPlayer = gameState.players[targetId];
            const availablePaths = gameState.boardPaths.filter(p => !Object.values(gameState.players).some(pl => pl.pathId === p.id));
            
            if (availablePaths.length > 0) {
                dom.pulaModalTitle.textContent = t('pula.title_with_target', { targetName: targetPlayer.name });
                dom.pulaModalText.textContent = t('pula.description_with_target', { targetName: targetPlayer.name });
                dom.pulaPathButtonsEl.innerHTML = availablePaths.map(p => `<button class="control-button" data-path-id="${p.id}">${t('pula.path_button', { pathNumber: p.id + 1 })}</button>`).join('');
                dom.pulaModal.classList.remove('hidden');
            } else {
                 updateLog(`Não há caminhos vazios para usar 'Pula'.`);
                 cancelPlayerAction();
            }
        } else { // CATCH-ALL for simple targetable cards like 'Mais', 'Menos', 'Sobe', 'Desce'
            if (gameState.isPvp) {
                network.emitPlayCard({ cardId: card.id, targetId: targetId });
            } else {
                await playCard(player, card, targetId);
            }
            gameState.gamePhase = 'playing';
            renderAll();
        }
    });

    dom.targetCancelButton.addEventListener('click', cancelPlayerAction);
    
    dom.pulaPathButtonsEl.addEventListener('click', async (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        const pathId = parseInt(e.target.dataset.pathId);
        const { gameState } = getState();
        const myPlayerId = getLocalPlayerId();
        const player = gameState.players[myPlayerId];
        const card = gameState.selectedCard;
        const targetId = gameState.pulaTarget;
        
        const targetPlayer = gameState.players[targetId];
        targetPlayer.targetPathForPula = pathId;
        
        dom.pulaModal.classList.add('hidden');
        
        updateLog(`${player.name} usou 'Pula' em ${targetPlayer.name}, forçando-o a pular para o caminho ${pathId + 1}.`);
        
        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: card.id, targetId, options: { pulaPath: pathId } });
        } else {
            await playCard(player, card, targetId);
        }
        
        gameState.gamePhase = 'playing';
        gameState.pulaTarget = null;
        renderAll();
    });

    dom.pulaCancelButton.addEventListener('click', cancelPlayerAction);

    dom.reversusTargetScoreButton.addEventListener('click', async () => {
        const { gameState } = getState();
        const myPlayerId = getLocalPlayerId();
        const player = gameState.players[myPlayerId];
        const card = gameState.selectedCard;
        const targetId = gameState.reversusTarget;
        dom.reversusTargetModal.classList.add('hidden');

        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: card.id, targetId, options: { effectType: 'score' } });
        } else {
            await playCard(player, card, targetId, 'score');
        }
        gameState.gamePhase = 'playing';
        renderAll();
    });

    dom.reversusTargetMovementButton.addEventListener('click', async () => {
        const { gameState } = getState();
        const myPlayerId = getLocalPlayerId();
        const player = gameState.players[myPlayerId];
        const card = gameState.selectedCard;
        const targetId = gameState.reversusTarget;
        dom.reversusTargetModal.classList.add('hidden');

        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: card.id, targetId, options: { effectType: 'movement' } });
        } else {
            await playCard(player, card, targetId, 'movement');
        }
        gameState.gamePhase = 'playing';
        renderAll();
    });

    dom.reversusTargetCancelButton.addEventListener('click', cancelPlayerAction);
    
    dom.reversusTotalGlobalButton.addEventListener('click', async () => {
        const { gameState } = getState();
        const myPlayerId = getLocalPlayerId();
        const player = gameState.players[myPlayerId];
        const card = gameState.selectedCard;
        dom.reversusTotalChoiceModal.classList.add('hidden');
        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: card.id, targetId: player.id, options: { isGlobal: true } });
        } else {
            await playCard(player, card, player.id);
        }
        gameState.gamePhase = 'playing';
        renderAll();
    });
    
    dom.reversusTotalIndividualButton.addEventListener('click', () => {
        updateState('reversusTotalIndividualFlow', true);
        dom.reversusTotalChoiceModal.classList.add('hidden');
        
        const { gameState } = getState();
        const allPlayers = gameState.playerIdsInGame.filter(id => !gameState.players[id].isEliminated);
        
        dom.targetModalCardName.textContent = 'Reversus Individual';
        dom.targetPlayerButtonsEl.innerHTML = allPlayers.map(id => `<button class="control-button target-player-${id.split('-')[1]}" data-player-id="${id}">${gameState.players[id].name}</button>`).join('');
        dom.targetModal.classList.remove('hidden');
    });

    dom.reversusTotalChoiceCancel.addEventListener('click', cancelPlayerAction);
    
    dom.reversusIndividualEffectButtons.addEventListener('click', async (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        const effect = e.target.dataset.effect;
        dom.reversusIndividualEffectChoiceModal.classList.add('hidden');
        
        const { gameState } = getState();
        const myPlayerId = getLocalPlayerId();
        const player = gameState.players[myPlayerId];
        const card = gameState.selectedCard;
        const targetId = gameState.reversusTarget;
        
        const options = { isIndividualLock: true, effectNameToApply: effect };
        if (effect === 'Pula') {
            const targetPlayer = gameState.players[targetId];
            const availablePaths = gameState.boardPaths.filter(p => !Object.values(gameState.players).some(pl => pl.pathId === p.id));
            if(availablePaths.length > 0) {
                targetPlayer.targetPathForPula = availablePaths[0].id; // Human chooses first available for now
                options.pulaPath = availablePaths[0].id;
            } else {
                 updateLog(`Não há caminhos vazios para usar 'Pula' Individual.`);
                 cancelPlayerAction();
                 return;
            }
        }
        
        if (gameState.isPvp) {
             network.emitPlayCard({ cardId: card.id, targetId, options });
        } else {
            await playCard(player, card, targetId, null, options);
        }
        
        updateState('reversusTotalIndividualFlow', false);
        gameState.gamePhase = 'playing';
        renderAll();
    });
    
    dom.reversusIndividualCancelButton.addEventListener('click', cancelPlayerAction);

    dom.pathSelectionButtonsEl.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        const pathId = parseInt(e.target.dataset.pathId, 10);
        const { pathSelectionResolver } = getState();
        if (pathSelectionResolver) {
            pathSelectionResolver(pathId);
            updateState('pathSelectionResolver', null);
            dom.pathSelectionModal.classList.add('hidden');
        }
    });

    // Sound and System Controls
    dom.muteButton.addEventListener('click', sound.toggleMute);
    dom.nextTrackButton.addEventListener('click', sound.changeTrack);
    dom.volumeSlider.addEventListener('input', (e) => sound.setVolume(parseFloat(e.target.value)));
    dom.fullscreenButton.addEventListener('click', () => {
        const enterIcon = document.getElementById('fullscreen-icon-enter');
        const exitIcon = document.getElementById('fullscreen-icon-exit');
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            enterIcon.classList.add('hidden');
            exitIcon.classList.remove('hidden');
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                enterIcon.classList.remove('hidden');
                exitIcon.classList.add('hidden');
            }
        }
    });

    // Language Switcher
    const langPtBrButton = document.getElementById('lang-pt-BR');
    const langEnUsButton = document.getElementById('lang-en-US');

    const handleLanguageChange = async (lang) => {
        await setLanguage(lang);
        const { userProfile } = getState();
        // If profile modal is open, re-render it with the new language
        if (!dom.profileModal.classList.contains('hidden') && userProfile) {
            renderProfile(userProfile);
            // Also re-render achievements if that tab is active
            renderAchievementsModal();
        }
    };

    if (langPtBrButton) {
        langPtBrButton.addEventListener('click', () => handleLanguageChange('pt-BR'));
    }
    if (langEnUsButton) {
        langEnUsButton.addEventListener('click', () => handleLanguageChange('en-US'));
    }


    // In-Game Menu Handlers
    dom.debugButton.addEventListener('click', () => dom.gameMenuModal.classList.remove('hidden'));
    dom.gameMenuCloseButton.addEventListener('click', () => dom.gameMenuModal.classList.add('hidden'));
    dom.menuSaveGameButton.addEventListener('click', () => {
        dom.gameMenuModal.classList.add('hidden');
        dom.saveGameConfirmModal.classList.remove('hidden');
    });
    dom.menuExitGameButton.addEventListener('click', () => {
        dom.gameMenuModal.classList.add('hidden');
        dom.exitGameConfirmModal.classList.remove('hidden');
    });
    
    // Save/Exit Confirmation Handlers
    dom.saveGameYesButton.addEventListener('click', saveLoad.saveGameState);
    dom.saveGameNoButton.addEventListener('click', () => dom.saveGameConfirmModal.classList.add('hidden'));
    dom.exitGameYesButton.addEventListener('click', () => {
        dom.exitGameConfirmModal.classList.add('hidden');
        const { gameState } = getState();
        if (gameState && gameState.isPvp) {
            network.emitLeaveRoom();
        } else {
            showSplashScreen();
        }
    });
    dom.exitGameNoButton.addEventListener('click', () => dom.exitGameConfirmModal.classList.add('hidden'));
    
    // Story Event Listeners (dispatched from other modules)
    document.addEventListener('startStoryGame', (e) => initializeGame(e.detail.mode, e.detail.options));
    document.addEventListener('showSplashScreen', showSplashScreen);
    
    document.addEventListener('storyWinLoss', async (e) => {
        const { battle, won, reason } = e.detail;
        const { gameState, storyState } = getState();
        updateState('lastStoryGameOptions', { mode: gameState.gameMode, options: gameState.gameOptions });
        
        let title = won ? 'Vitória!' : 'Derrota...';
        let message;
        let buttonAction = 'restart';

        switch (battle) {
            case 'tutorial_necroverso':
                if (won) {
                    achievements.grantAchievement('tutorial_win');
                    setTimeout(() => renderStoryNode('post_tutorial'), 1000);
                    return; // Skip standard game over modal
                } else {
                    message = "Você foi derrotado, mas aprendeu o básico. Vamos tentar de novo.";
                }
                break;
            case 'contravox':
                 if (won) {
                    achievements.grantAchievement('contravox_win');
                    setTimeout(() => renderStoryNode('post_contravox_victory'), 1000);
                     return;
                } else {
                    message = "O Contravox te venceu. Quer tentar de novo?";
                }
                break;
            case 'versatrix':
                if (won) {
                    achievements.grantAchievement('versatrix_win');
                    setTimeout(() => renderStoryNode('post_versatrix_victory'), 1000);
                } else {
                    storyState.lostToVersatrix = true;
                    achievements.grantAchievement('versatrix_loss');
                    setTimeout(() => renderStoryNode('post_versatrix_defeat'), 1000);
                }
                return;
            case 'reversum':
                if (won) {
                    achievements.grantAchievement('reversum_win');
                    setTimeout(() => renderStoryNode('post_reversum_victory'), 1000);
                } else {
                     message = "O Rei Reversum é muito poderoso. Tentar novamente?";
                }
                break;
            case 'necroverso_king':
                if (won) {
                    achievements.grantAchievement('true_end_beta');
                    setTimeout(() => renderStoryNode('post_necroverso_king_victory'), 1000);
                } else {
                    message = "O poder combinado dos reis é demais. Deseja tentar novamente?";
                }
                break;
            case 'necroverso_final':
                 if (won) {
                    achievements.grantAchievement('true_end_final');
                    playEndgameSequence();
                 } else {
                     message = reason === 'time' 
                        ? "O tempo acabou! O Inversus foi consumido..."
                        : "O Necroverso venceu. A escuridão consome tudo. Tentar novamente?";
                 }
                 break;
             case 'xael_challenge':
                if (won) {
                    achievements.grantAchievement('xael_win');
                    message = "Você venceu o criador! Habilidade 'Revelação Estelar' desbloqueada no Modo História.";
                    buttonAction = 'menu';
                } else {
                    message = "O criador conhece todos os truques. Tentar novamente?";
                }
                break;
            case 'narrador':
                 if (won) {
                     achievements.grantAchievement('120%_unlocked');
                     message = "Você derrotou o Narrador! O que acontece agora...?";
                     buttonAction = 'menu';
                 } else {
                     message = "O Narrador reescreveu a história para te derrotar. Tentar de novo?";
                 }
                 break;
            default:
                 message = won ? 'Você venceu o duelo!' : 'Você foi derrotado.';
        }
        showGameOver(message, title, { action: buttonAction });
    });

    // Secret Battle Trigger (Splash Logo)
    dom.splashLogo.addEventListener('click', (e) => {
        const { achievements } = getState();
        if (!achievements.has('inversus_win')) return;

        // Prevent click if another modal is open
        if(document.querySelector('.modal-overlay:not(.hidden)')) return;

        e.preventDefault();
        
        sound.playSoundEffect('x');
        document.body.classList.add('screen-shaking');
        setTimeout(() => document.body.classList.remove('screen-shaking'), 500);

        setTimeout(() => {
            const gameOptions = { story: { battle: 'narrador', playerIds: ['player-1', 'player-2'], overrides: { 'player-2': { name: 'Narrador', aiType: 'narrador' } } } };
            initializeGame('solo', gameOptions);
        }, 800);
    });

    // Secret Card Collection
    dom.splashAnimationContainerEl.addEventListener('click', (e) => {
        if (e.target.id === 'secret-versatrix-card') {
            const { achievements } = getState();
            if (achievements.has('versatrix_win') && !achievements.has('versatrix_card_collected')) {
                sound.playSoundEffect('conquista');
                achievements.grantAchievement('versatrix_card_collected');
                const { versatrixCardInterval } = getState();
                if (versatrixCardInterval) clearInterval(versatrixCardInterval);
                e.target.remove();
            }
        }
    });
    
    // Xael Challenge Popup
    dom.xaelPopup.addEventListener('click', async () => {
        dom.xaelPopup.classList.add('hidden');
        await shatterImage(dom.xaelPopup.querySelector('img'));
        renderStoryNode('xael_challenge_intro');
        dom.splashScreenEl.classList.add('hidden');
        dom.storyModeModalEl.classList.remove('hidden');
    });

    dom.xaelStarPowerButton.addEventListener('click', () => {
        dom.xaelPowerConfirmModal.classList.remove('hidden');
    });

    dom.xaelPowerConfirmNo.addEventListener('click', () => dom.xaelPowerConfirmModal.classList.add('hidden'));

    dom.xaelPowerConfirmYes.addEventListener('click', () => {
        dom.xaelPowerConfirmModal.classList.add('hidden');
        const { gameState } = getState();
        const player1 = gameState.players['player-1'];
        if (player1 && player1.hasXaelStarPower && player1.xaelStarPowerCooldown === 0) {
            announceEffect('Revelação Estelar!', 'reversus');
            sound.playSoundEffect('conquista');
            player1.xaelStarPowerCooldown = 5;
            gameState.revealedHands = gameState.playerIdsInGame.filter(id => id !== 'player-1' && !gameState.players[id].isEliminated);
            updateLog("Poder Estelar ativado! As mãos dos oponentes foram reveladas por esta rodada.");
            renderAll();
        }
    });

    // Chat Handlers
    const sendChatMessage = () => {
        const message = dom.chatInput.value.trim();
        if (message) {
            const { gameState, userProfile } = getState();
            if (gameState.isPvp) {
                 network.emitChatMessage(message);
            } else {
                updateLog({ type: 'dialogue', speaker: userProfile?.username || 'Você', message });
            }
            dom.chatInput.value = '';
        }
    };
    dom.chatSendButton.addEventListener('click', sendChatMessage);
    dom.chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });

    // Lobby Handlers
    dom.lobbyChatSendButton.addEventListener('click', () => {
        const message = dom.lobbyChatInput.value.trim();
        if(message) {
            network.emitLobbyChat(message);
            dom.lobbyChatInput.value = '';
        }
    });
    
    dom.lobbyChatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const message = dom.lobbyChatInput.value.trim();
            if(message) {
                network.emitLobbyChat(message);
                dom.lobbyChatInput.value = '';
            }
        }
    });

    dom.pvpCreateRoomButton.addEventListener('click', () => {
        network.emitCreateRoom();
    });

    dom.pvpRoomGridEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('join-room-button')) {
            const roomId = e.target.dataset.roomId;
            if (roomId) {
                network.emitJoinRoom(roomId);
            }
        }
    });

    dom.pvpRoomListCloseButton.addEventListener('click', () => {
        dom.pvpRoomListModal.classList.add('hidden');
        showSplashScreen();
    });
    
    dom.pvpLobbyCloseButton.addEventListener('click', () => {
        network.emitLeaveRoom();
    });

    dom.lobbyGameModeEl.addEventListener('change', (e) => {
        network.emitChangeMode(e.target.value);
    });
    
    dom.lobbyStartGameButton.addEventListener('click', () => {
        network.emitStartGame();
    });
    
    // Field Effect Target Modal Handler (FIX for freeze)
    dom.fieldEffectTargetModal.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        
        const { fieldEffectTargetResolver } = getState();
        if (fieldEffectTargetResolver) {
            const playerId = button.dataset.playerId;
            fieldEffectTargetResolver(playerId); // Resolve the promise in story-abilities.js
            updateState('fieldEffectTargetResolver', null);
            dom.fieldEffectTargetModal.classList.add('hidden');
        }
    });

    // --- NEW HAND OVERLAY HANDLERS ---
    dom.showHandButton.addEventListener('click', () => {
        const { gameState } = getState();
        const myPlayerId = getLocalPlayerId();
        if (!myPlayerId) return;
        const player = gameState.players[myPlayerId];
        if (player) {
            renderHandOverlay(player);
            dom.handOverlay.classList.remove('hidden');
        }
    });

    dom.handOverlay.addEventListener('click', (e) => {
        // Close if the background overlay is clicked directly
        if (e.target.id === 'hand-overlay') {
            closeHandOverlay();
        }
    });

    dom.cardFan.addEventListener('click', (e) => {
        const { gameState } = getState();
        const myPlayerId = getLocalPlayerId();
        const player = gameState.players[myPlayerId];
        if (!player) return;

        // Handle action button clicks inside a card
        const actionButton = e.target.closest('button');
        if (actionButton) {
            const action = actionButton.dataset.action;
            if (action === 'play') {
                // The handlePlayButtonClick function uses gameState.selectedCard, which is already set
                handlePlayButtonClick(); 
                closeHandOverlay();
            } else if (action === 'back') {
                closeHandOverlay();
            }
            e.stopPropagation(); // Prevent card selection logic from running
            return;
        }
        
        const cardEl = e.target.closest('.card');
        if (!cardEl) return;

        const cardId = cardEl.dataset.cardId;
        const card = player.hand.find(c => String(c.id) === cardId);

        if (!card || cardEl.classList.contains('disabled')) return;
        
        // Toggle selection: if clicking the same card, deselect; otherwise, select the new one.
        gameState.selectedCard = (gameState.selectedCard?.id === card.id) ? null : card;

        // Re-render the overlay to show selection and buttons
        renderHandOverlay(player);
    });
}