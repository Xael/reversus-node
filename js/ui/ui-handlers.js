// js/ui/ui-handlers.js
import * as dom from '../core/dom.js';
import { getState, updateState } from '../core/state.js';
import { initializeGame, restartLastDuel } from '../game-controller.js';
import { renderAchievementsModal } from './achievements-renderer.js';
import { renderAll, showGameOver, updateChatControls } from './ui-renderer.js';
import * as sound from '../core/sound.js';
import { startStoryMode, renderStoryNode, playEndgameSequence } from '../story/story-controller.js';
import * as saveLoad from '../core/save-load.js';
import * as achievements from '../core/achievements.js';
import { updateLog } from '../core/utils.js';
import * as config from '../core/config.js';
import { AVATAR_CATALOG } from '../core/config.js';
import * as network from '../core/network.js';
import { shatterImage } from './animations.js';
import { announceEffect } from '../core/sound.js';
import { playCard } from '../game-logic/player-actions.js';
import { advanceToNextPlayer } from '../game-logic/turn-manager.js';
import { setLanguage, t } from '../core/i18n.js';
import { showSplashScreen } from './splash-screen.js';
import { renderProfile, renderFriendsList, renderSearchResults, addPrivateChatMessage, updateFriendStatusIndicator, renderFriendRequests, renderAdminPanel, renderOnlineFriendsForInvite } from './profile-renderer.js';
import { openChatWindow, initializeChatHandlers } from './chat-handler.js';
import { renderShopAvatars } from './shop-renderer.js';

let currentEventData = null;

/**
 * Hides the game UI, shows the story modal, and renders the next story node.
 * @param {string} nodeId - The ID of the story node to render.
 */
function continueStory(nodeId) {
    setTimeout(() => {
        dom.appContainerEl.classList.add('hidden');
        dom.storyModeModalEl.classList.remove('hidden');
        renderStoryNode(nodeId);
    }, 1000);
}

/**
 * Gets the ID of the local human player.
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
 * Handles clicks on cards, either selecting them or showing a viewer.
 * @param {Event} e - The click event.
 */
function handleCardClick(e) {
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;
    
    const cardId = cardEl.dataset.cardId;
    const { gameState } = getState();
    if (!gameState) return;
    
    const myPlayerId = getLocalPlayerId();
    if (!myPlayerId) return;

    const player = gameState.players[myPlayerId];
    if (!player) return;

    const card = player.hand.find(c => String(c.id) === cardId);
    if (!card) return;

    if (e.target.classList.contains('card-maximize-button')) {
        const isHidden = cardEl.style.backgroundImage.includes('verso');
        if (isHidden) return;
        dom.cardViewerImageEl.src = cardEl.style.backgroundImage.slice(5, -2);
        dom.cardViewerModalEl.classList.remove('hidden');
        return;
    }

    if (gameState.currentPlayer !== myPlayerId || cardEl.classList.contains('disabled')) {
        return;
    }

    if (gameState.selectedCard?.id === card.id) {
        gameState.selectedCard = null;
    } else {
        gameState.selectedCard = card;
    }
    
    renderAll();
}

/**
 * Handles the logic when the "Jogar Carta" button is clicked.
 */
async function handlePlayButtonClick() {
    const { gameState } = getState();
    if (!gameState) return;
    
    const myPlayerId = getLocalPlayerId();
    if (!myPlayerId) return;

    const player = gameState.players[myPlayerId];
    const card = gameState.selectedCard;

    if (!player || !card) return;

    // Immediately disable buttons for better UX
    dom.playButton.disabled = true;
    dom.endTurnButton.disabled = true;

    if (gameState.isPvp) {
        // In PvP, we just send the event and wait for the server's gameStateUpdate
        // The modal logic for complex cards is handled below before sending the event
    } else {
        gameState.gamePhase = 'paused';
    }
    
    if (card.type === 'value') {
        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: card.id, targetId: player.id });
        } else {
            await playCard(player, card, player.id);
            gameState.gamePhase = 'playing';
            renderAll();
        }
        return;
    }

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
             gameState.gamePhase = 'playing';
             renderAll();
        }
    } else {
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
    
    // Immediately disable buttons for better UX
    dom.playButton.disabled = true;
    dom.endTurnButton.disabled = true;

    if (gameState.isPvp) {
        network.emitEndTurn();
    } else {
        updateLog(`${player.name} passou o turno.`);
        gameState.consecutivePasses++;
        advanceToNextPlayer();
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
        dom.fieldEffectInfoTitle.textContent = t('field_effect.info_title');
        const isPositive = activeEffect.type === 'positive';
        dom.fieldEffectInfoModal.querySelector('.field-effect-card').className = `field-effect-card ${isPositive ? 'positive' : 'negative'}`;
        dom.fieldEffectInfoName.textContent = activeEffect.name;
        
        // Correctly get and translate the description
        const effectConfig = isPositive ? config.POSITIVE_EFFECTS[activeEffect.name] : config.NEGATIVE_EFFECTS[activeEffect.name];
        dom.fieldEffectInfoDescription.textContent = effectConfig ? t(effectConfig.descriptionKey) : 'Descrição não encontrada.';
        
        dom.fieldEffectInfoModal.classList.remove('hidden');
    }
}


export function initializeUiHandlers() {
    document.addEventListener('aiTurnEnded', advanceToNextPlayer);
    
    initializeChatHandlers();

    document.body.addEventListener('click', (e) => {
        if (e.target.closest('.player-hand')) handleCardClick(e);
        if (e.target.closest('.field-effect-indicator')) handleFieldEffectIndicatorClick(e);
        if (e.target.matches('.report-button')) {
            const button = e.target;
            const googleId = button.dataset.googleId;
            const username = button.dataset.username;
            const message = button.dataset.message;
            if (confirm(t('confirm.report_player', { username }))) {
                network.emitReportPlayer(googleId, message);
            }
        }
    });

    dom.playButton.addEventListener('click', handlePlayButtonClick);
    dom.endTurnButton.addEventListener('click', handleEndTurnButtonClick);
    dom.cardViewerCloseButton.addEventListener('click', () => dom.cardViewerModalEl.classList.add('hidden'));
    
    // --- NEW LOGIN & QUICK START FLOW ---
    dom.loginButton.addEventListener('click', () => {
        sound.initializeMusic();
        if (typeof google !== 'undefined' && google.accounts) {
            google.accounts.id.prompt();
        } else {
            console.error("Google Auth not ready.");
            alert("Serviço de login não está pronto. Tente novamente em um momento.");
        }
    });

    dom.quickStartButton.addEventListener('click', () => {
        sound.initializeMusic();
        dom.splashScreenEl.classList.add('hidden');
        dom.quickStartModal.classList.remove('hidden');
    });

    dom.quickStartAiButton.addEventListener('click', () => {
        dom.quickStartModal.classList.add('hidden');
        dom.gameSetupModal.classList.remove('hidden');
    });

    dom.quickStartPvpButton.addEventListener('click', () => {
        const { isLoggedIn } = getState();
        if (!isLoggedIn) {
            alert(t('common.login_required', { feature: 'PVP Matchmaking' }));
            return;
        }
        dom.quickStartModal.classList.add('hidden');
        dom.pvpMatchmakingModal.classList.remove('hidden');
    });

    dom.quickStartCloseButton.addEventListener('click', () => {
        dom.quickStartModal.classList.add('hidden');
        showSplashScreen();
    });

    dom.pvpMatchmakingButtons.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-mode]');
        if (!button) return;

        const mode = button.dataset.mode;
        network.emitJoinMatchmaking({ mode });
        dom.pvpMatchmakingModal.classList.add('hidden');
        dom.matchmakingStatusModal.classList.remove('hidden');
        dom.matchmakingStatusText.textContent = t('matchmaking.searching_text');
    });

    dom.pvpMatchmakingCloseButton.addEventListener('click', () => {
        dom.pvpMatchmakingModal.classList.add('hidden');
        dom.quickStartModal.classList.remove('hidden');
    });

    dom.matchmakingCancelButton.addEventListener('click', () => {
        network.emitCancelMatchmaking();
    });

    // --- END NEW QUICK START FLOW ---
    
    dom.storyModeButton.addEventListener('click', () => {
        sound.initializeMusic();
        const hasSave = saveLoad.checkForSavedGame();
        dom.storyContinueGameButton.disabled = !hasSave;
        dom.storyStartOptionsModal.classList.remove('hidden');
    });

    dom.pvpModeButton.addEventListener('click', () => {
        const { isLoggedIn } = getState();
        if (!isLoggedIn) {
            alert(t('common.login_required', { feature: 'PVP Online' }));
            return;
        }
        network.emitListRooms();
        dom.splashScreenEl.classList.add('hidden');
        dom.pvpRoomListModal.classList.remove('hidden');
    });

    dom.eventButton.addEventListener('click', () => {
        const currentMonth = new Date().getMonth();
        currentEventData = config.MONTHLY_EVENTS[currentMonth];
    
        if (currentEventData) {
            sound.playStoryMusic(`${currentEventData.ai}.ogg`);
            dom.eventCharacterImage.src = `./${currentEventData.image}`;
            dom.eventCharacterName.textContent = t(currentEventData.characterNameKey);
            dom.eventAbilityDescription.textContent = t(currentEventData.abilityKey);
            dom.eventRewardText.textContent = t('event.reward_text_placeholder', { rewardName: t(currentEventData.rewardTitleKey) });
    
            const progressKey = `reversus-event-progress-${currentMonth}`;
            const wins = parseInt(localStorage.getItem(progressKey) || '0', 10);
    
            const today = new Date().toISOString().split('T')[0];
            const lastAttemptDate = localStorage.getItem('reversus-event-attempt-date');
            const hasAttemptedToday = lastAttemptDate === today;
    
            if (wins >= 3) {
                dom.challengeEventButton.disabled = false; // Can re-challenge for fun
                dom.eventStatusText.textContent = t('event.status_completed');
            } else {
                dom.challengeEventButton.disabled = hasAttemptedToday;
                dom.eventStatusText.textContent = hasAttemptedToday ? t('event.status_wait') : '';
            }
    
            // Render progress markers
            dom.eventProgressMarkers.innerHTML = ''; // Clear previous markers
            for (let i = 0; i < 3; i++) {
                const marker = document.createElement('div');
                marker.className = 'progress-marker';
                if (i < wins) {
                    marker.classList.add('completed');
                }
                dom.eventProgressMarkers.appendChild(marker);
            }
    
        } else {
            sound.playStoryMusic('tela.ogg');
            dom.eventCharacterImage.src = '';
            dom.eventCharacterName.textContent = 'Nenhum Evento Ativo';
            dom.eventAbilityDescription.textContent = 'Volte mais tarde para novos desafios.';
            dom.challengeEventButton.disabled = true;
            dom.eventStatusText.textContent = '';
            currentEventData = null;
        }
        dom.eventModal.classList.remove('hidden');
    });

    dom.challengeEventButton.addEventListener('click', () => {
        if (dom.challengeEventButton.disabled || !currentEventData) return;

        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem('reversus-event-attempt-date', today);

        const gameOptions = {
            story: {
                battle: `event_${currentEventData.ai}`,
                eventData: { name: t(currentEventData.nameKey), ai: currentEventData.ai },
                playerIds: ['player-1', 'player-2'],
                overrides: { 'player-2': { name: t(currentEventData.characterNameKey), aiType: currentEventData.ai } }
            }
        };
        initializeGame('solo', gameOptions);
    });
    
    dom.rankingButton.addEventListener('click', () => {
        network.emitGetRanking();
        dom.rankingModal.classList.remove('hidden');
    });

    if (dom.rankingContainer) {
        dom.rankingContainer.addEventListener('click', (e) => {
            const target = e.target.closest('.rank-name.clickable');
            if (target) {
                const googleId = target.dataset.googleId;
                if (googleId) {
                    network.emitViewProfile({ googleId });
                }
            }
        });
    }

    if (dom.pvpLobbyModal) {
        dom.pvpLobbyModal.addEventListener('click', (e) => {
            const target = e.target.closest('.lobby-player-grid .clickable');
            if(target) {
                const googleId = target.dataset.googleId;
                if (googleId) {
                    network.emitViewProfile({ googleId });
                }
            }
        });
    }

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
        sound.initializeMusic();
        initializeGame('inversus', {});
    });

    dom.userProfileDisplay.addEventListener('click', () => {
        network.emitGetProfile();
        network.emitGetFriendsList();
        network.emitGetPendingRequests();
        renderAchievementsModal();
        dom.profileModal.classList.remove('hidden');
    });

    dom.closeRankingButton.addEventListener('click', () => dom.rankingModal.classList.add('hidden'));
    
    dom.closeProfileButton.addEventListener('click', () => {
        dom.profileModal.classList.add('hidden');
        const { isChatMuted } = getState();
        dom.chatInput.placeholder = t(isChatMuted ? 'chat.chat_muted_message' : 'game.chat_placeholder');
        dom.chatInput.disabled = isChatMuted;
    });

    dom.closeEventButton.addEventListener('click', () => {
        dom.eventModal.classList.add('hidden');
        sound.playStoryMusic('tela.ogg');
    });

    dom.profileModal.addEventListener('click', (e) => {
        const button = e.target.closest('.profile-tab-button');
        if (button) {
            const tabId = button.dataset.tab;
            if (tabId === 'profile-admin') {
                network.emitAdminGetData();
            }
            dom.profileModal.querySelectorAll('.profile-tab-button').forEach(btn => btn.classList.remove('active'));
            dom.profileModal.querySelectorAll('.info-tab-content').forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(`${tabId}-tab-content`).classList.add('active');
        }
    });

    dom.infoButton.addEventListener('click', () => dom.infoModal.classList.remove('hidden'));
    dom.closeInfoButton.addEventListener('click', () => dom.infoModal.classList.add('hidden'));
    dom.fieldEffectInfoCloseButton.addEventListener('click', () => dom.fieldEffectInfoModal.classList.add('hidden'));

    dom.infoModal.querySelectorAll('.info-tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            dom.infoModal.querySelectorAll('.info-tab-button').forEach(btn => btn.classList.remove('active'));
            dom.infoModal.querySelectorAll('.info-tab-content').forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(`${tabId}-tab-content`).classList.add('active');
        });
    });
    
    dom.closeSetupButton.addEventListener('click', () => {
        dom.gameSetupModal.classList.add('hidden');
        dom.quickStartModal.classList.remove('hidden');
    });
    
    dom.solo2pButton.addEventListener('click', () => {
        dom.gameSetupModal.classList.add('hidden');
        dom.oneVOneSetupModal.classList.remove('hidden');
    });
    
    dom.solo3pButton.addEventListener('click', () => initializeGame('solo', { numPlayers: 3 }));
    dom.solo4pButton.addEventListener('click', () => initializeGame('solo', { numPlayers: 4 }));
    dom.duoModeButton.addEventListener('click', () => initializeGame('duo', { numPlayers: 4 }));

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

        const storyOpponents = [
            { name: 'Contravox', aiType: 'contravox', image: './contravox.png' },
            { name: 'Versatrix', aiType: 'versatrix', image: './versatrix.png' },
            { name: 'Rei Reversum', aiType: 'reversum', image: './reversum.png' },
            { name: 'Inversus', aiType: 'inversus', image: './INVERSUM1.png' },
            { name: 'Xael', aiType: 'xael', image: './xaeldesafio.png' },
            { name: 'Narrador', aiType: 'narrador', image: './narrador.png' },
            { name: 'Necroverso Final', aiType: 'necroverso_final', image: './necroverso2.png' }
        ];

        const excludedAvatarKeys = new Set([
            'default_1', 'default_2', 'default_3', 'default_4',
            'necroverso', 'contravox', 'versatrix', 'reversum'
        ]);

        const avatarOpponents = Object.entries(AVATAR_CATALOG)
            .filter(([key]) => !excludedAvatarKeys.has(key))
            .map(([key, avatar]) => ({
                name: t(avatar.nameKey),
                aiType: 'default',
                image: `./${avatar.image_url}`
            }));

        const opponents = [...storyOpponents, ...avatarOpponents];

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
        } else {
            showSplashScreen();
        }
    });
    
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
        } else {
            if (gameState.isPvp) {
                network.emitPlayCard({ cardId: card.id, targetId: targetId });
            } else {
                await playCard(player, card, targetId);
                gameState.gamePhase = 'playing';
                renderAll();
            }
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
            gameState.gamePhase = 'playing';
            gameState.pulaTarget = null;
            renderAll();
        }
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
            gameState.gamePhase = 'playing';
            renderAll();
        }
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
            gameState.gamePhase = 'playing';
            renderAll();
        }
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
            gameState.gamePhase = 'playing';
            renderAll();
        }
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
                targetPlayer.targetPathForPula = availablePaths[0].id;
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
            updateState('reversusTotalIndividualFlow', false);
            gameState.gamePhase = 'playing';
            renderAll();
        }
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

    const langPtBrButton = document.getElementById('lang-pt-BR');
    const langEnUsButton = document.getElementById('lang-en-US');

    const handleLanguageChange = async (lang) => {
        await setLanguage(lang);
        const { userProfile } = getState();
        if (!dom.profileModal.classList.contains('hidden') && userProfile) {
            renderProfile(userProfile);
            renderAchievementsModal();
        }
    };

    if (langPtBrButton) langPtBrButton.addEventListener('click', () => handleLanguageChange('pt-BR'));
    if (langEnUsButton) langEnUsButton.addEventListener('click', () => handleLanguageChange('en-US'));

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
    
    document.addEventListener('startStoryGame', (e) => initializeGame(e.detail.mode, e.detail.options));
    document.addEventListener('showSplashScreen', showSplashScreen);
    
    document.addEventListener('storyWinLoss', async (e) => {
        const { battle, won, reason } = e.detail;
        const { gameState } = getState();
        
        if(gameState) {
             updateState('lastStoryGameOptions', { mode: gameState.gameMode, options: gameState.gameOptions });
        }
        
        if (battle.startsWith('event_')) {
            const currentMonth = new Date().getMonth();
            const eventConfig = config.MONTHLY_EVENTS.find(evt => evt.month === currentMonth);
            
            let title = won ? t('game_over.story_victory_title') : t('game_over.story_defeat_title');
            let message;
    
            if (won) {
                const progressKey = `reversus-event-progress-${currentMonth}`;
                let wins = parseInt(localStorage.getItem(progressKey) || '0', 10);
                
                if (wins < 3) {
                    wins++;
                    localStorage.setItem(progressKey, wins);
                }
    
                if (wins >= 3) {
                    const rewardName = eventConfig ? t(eventConfig.rewardTitleKey) : "";
                    message = t('event.victory_completed_message', { rewardName });
                    
                    const year = new Date().getFullYear();
                    const challengeId = `event_${currentMonth}_${year}`;
                    network.emitClaimChallengeReward({ challengeId, amount: 1000 });

                } else {
                    message = t('event.victory_progress_message', { wins });
                }
            } else {
                message = t('event.defeat_message');
            }
            
            showGameOver(message, title, { action: 'menu', text: t('game_over.back_to_menu') });
            return;
        }

        let title = won ? t('game_over.story_victory_title') : t('game_over.story_defeat_title');
        let message;
        let buttonAction = 'restart';

        switch (battle) {
            case 'tutorial_necroverso':
                if (won) {
                    achievements.grantAchievement('tutorial_win');
                    continueStory('post_tutorial');
                    return;
                } else {
                    message = "Você foi derrotado, mas aprendeu o básico. Vamos tentar de novo.";
                }
                break;
            case 'contravox':
                if (won) {
                    achievements.grantAchievement('contravox_win');
                    continueStory('post_contravox_victory');
                    return;
                } else {
                    message = "O Contravox te venceu. Quer tentar de novo?";
                }
                break;
            case 'versatrix':
                if (won) {
                    achievements.grantAchievement('versatrix_win');
                    continueStory('post_versatrix_victory');
                } else {
                    const { storyState } = getState();
                    storyState.lostToVersatrix = true;
                    achievements.grantAchievement('versatrix_loss');
                    continueStory('post_versatrix_defeat');
                }
                return;
            case 'reversum':
                if (won) {
                    achievements.grantAchievement('reversum_win');
                    continueStory('post_reversum_victory');
                    return;
                } else {
                    message = "O Rei Reversum é muito poderoso. Tentar novamente?";
                }
                break;
            case 'necroverso_king':
                if (won) {
                    achievements.grantAchievement('true_end_beta');
                    continueStory('post_necroverso_king_victory');
                    return;
                } else {
                    message = "O poder combinado dos reis é demais. Deseja tentar novamente?";
                }
                break;
            case 'necroverso_final':
                if (won) {
                    achievements.grantAchievement('true_end_final');
                    playEndgameSequence();
                    return;
                } else {
                    message = reason === 'time' ? "O tempo acabou! O Inversus foi consumido..." : "O Necroverso venceu. A escuridão consome tudo. Tentar novamente?";
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
            case 'inversus':
                if (won) {
                    achievements.grantAchievement('inversus_win');
                    message = "Você derrotou o Inversus! 100% do jogo completo. Um segredo foi revelado...";
                    buttonAction = 'menu';
                } else {
                    message = "O reflexo sombrio do Reversus te derrotou. Tentar novamente?";
                }
                break;
            default:
                message = won ? 'Você venceu o duelo!' : 'Você foi derrotado.';
        }
        showGameOver(message, title, { action: buttonAction });
    });

    dom.splashLogo.addEventListener('click', (e) => {
        const { achievements } = getState();
        if (!achievements.has('inversus_win')) return;
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

    const sendChatMessage = () => {
        const { isChatMuted } = getState();
        if (isChatMuted) return;

        const message = dom.chatInput.value.trim();
        if (message) {
            const { gameState, userProfile } = getState();
            if (gameState && gameState.isPvp) {
                 network.emitChatMessage(message);
            } else {
                updateLog({ type: 'dialogue', speaker: userProfile?.username || t('game.you'), message, googleId: userProfile?.google_id });
            }
            dom.chatInput.value = '';
        }
    };
    
    // This button does not exist in the in-game chat, but is used in the lobby. No need to remove.
    if(dom.chatSendButton) dom.chatSendButton.addEventListener('click', sendChatMessage);
    
    dom.chatInput.addEventListener('keypress', (e) => { 
        if (e.key === 'Enter') {
            e.preventDefault();
            sendChatMessage();
        }
    });
    
    dom.chatToggleBtn.addEventListener('click', () => {
        const state = getState();
        updateState('isChatMuted', !state.isChatMuted);
        updateChatControls();
    });

    dom.chatFilterBtn.addEventListener('click', () => {
        const state = getState();
        const currentFilter = state.chatFilter;
        const filterCycle = {
            'all': 'log',
            'log': 'chat',
            'chat': 'all'
        };
        const nextFilter = filterCycle[currentFilter] || 'all';
        updateState('chatFilter', nextFilter);
        updateLog(); // Re-render the log with the new filter
        updateChatControls(); // Update button text
    });


    // --- Lobby and Invite Handlers ---
    if (dom.pvpLobbyModal) {
        dom.pvpLobbyModal.addEventListener('click', (e) => {
            const inviteButton = e.target.closest('.invite-friend-slot-btn');
            if (inviteButton) {
                network.emitGetOnlineFriends(); // Server responds by opening the modal
            }

            const kickButton = e.target.closest('.kick-player-button');
            if (kickButton) {
                const kickId = kickButton.dataset.kickId;
                const username = kickButton.title.match(/Expulsar (.*) da sala/)?.[1] || 'este jogador';
                if (confirm(t('confirm.kick_player', { username }))) {
                    network.emitKickPlayer(kickId);
                }
            }
        });
    }
    
    if (dom.inviteFriendsModal) {
        dom.inviteFriendsModal.addEventListener('click', (e) => {
            const inviteButton = e.target.closest('.invite-friend-btn');
            if (inviteButton) {
                const targetUserId = inviteButton.dataset.userId;
                network.emitInviteFriendToLobby(parseInt(targetUserId, 10));
                inviteButton.textContent = t('pvp.invite_sent_button') || 'Sent';
                inviteButton.disabled = true;
            }
        });
    }

    if (dom.inviteFriendsCloseButton) {
        dom.inviteFriendsCloseButton.addEventListener('click', () => {
            dom.inviteFriendsModal.classList.add('hidden');
        });
    }

    if (dom.lobbyInviteAcceptButton) {
        dom.lobbyInviteAcceptButton.addEventListener('click', (e) => {
            const roomId = e.target.dataset.roomId;
            if (roomId) {
                network.emitAcceptInvite(roomId);
            }
            dom.lobbyInviteNotificationModal.classList.add('hidden');
        });
    }

    if (dom.lobbyInviteDeclineButton) {
        dom.lobbyInviteDeclineButton.addEventListener('click', (e) => {
            const roomId = dom.lobbyInviteAcceptButton.dataset.roomId; // Get room from accept button
            if (roomId) {
                 network.emitDeclineInvite(roomId);
            }
            dom.lobbyInviteNotificationModal.classList.add('hidden');
        });
    }

    dom.lobbyChatSendButton.addEventListener('click', () => {
        const message = dom.lobbyChatInput.value.trim();
        if(message) {
            network.emitLobbyChat(message);
            dom.lobbyChatInput.value = '';
        }
    });
    
    dom.lobbyChatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const message = dom.lobbyChatInput.value.trim();
            if(message) {
                network.emitLobbyChat(message);
                dom.lobbyChatInput.value = '';
            }
        }
    });

    dom.pvpShowCreateRoomButton.addEventListener('click', () => {
        dom.pvpCreateRoomModal.classList.remove('hidden');
    });

    dom.pvpCreateRoomCancelButton.addEventListener('click', () => {
        dom.pvpCreateRoomModal.classList.add('hidden');
    });

    dom.pvpCreateRoomConfirmButton.addEventListener('click', () => {
        const name = dom.roomNameInput.value.trim();
        const password = dom.roomPasswordInput.value.trim();
        const betAmountRadio = document.querySelector('input[name="bet-amount"]:checked');
        const betAmount = betAmountRadio ? parseInt(betAmountRadio.value, 10) : 0;

        if (!name) {
            alert(t('pvp.room_name_required'));
            return;
        }

        network.emitCreateRoom({ name, password, betAmount });
        dom.pvpCreateRoomModal.classList.add('hidden');
        dom.roomNameInput.value = '';
        dom.roomPasswordInput.value = '';
        const defaultBetRadio = document.querySelector('input[name="bet-amount"][value="0"]');
        if (defaultBetRadio) {
            defaultBetRadio.checked = true;
        }
    });
    
    let selectedRoomIdForPassword = null;
    dom.pvpRoomGridEl.addEventListener('click', (e) => {
        const button = e.target.closest('.join-room-button');
        if (button) {
            const roomId = button.dataset.roomId;
            const hasPassword = button.dataset.hasPassword === 'true';

            if (hasPassword) {
                selectedRoomIdForPassword = roomId;
                dom.pvpPasswordInput.value = '';
                dom.pvpPasswordModal.classList.remove('hidden');
            } else {
                if (roomId) network.emitJoinRoom({ roomId });
            }
        }
    });

    dom.pvpPasswordSubmit.addEventListener('click', () => {
        if (selectedRoomIdForPassword) {
            const password = dom.pvpPasswordInput.value;
            network.emitJoinRoom({ roomId: selectedRoomIdForPassword, password });
            dom.pvpPasswordModal.classList.add('hidden');
            selectedRoomIdForPassword = null;
        }
    });

    dom.pvpPasswordCancel.addEventListener('click', () => {
        dom.pvpPasswordModal.classList.add('hidden');
        selectedRoomIdForPassword = null;
    });

    dom.pvpRoomListCloseButton.addEventListener('click', () => {
        dom.pvpRoomListModal.classList.add('hidden');
        showSplashScreen();
    });
    
    dom.pvpLobbyCloseButton.addEventListener('click', () => network.emitLeaveRoom());
    dom.lobbyGameModeEl.addEventListener('change', (e) => network.emitChangeMode(e.target.value));
    dom.lobbyStartGameButton.addEventListener('click', () => network.emitStartGame());
    
    dom.fieldEffectTargetModal.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        const { fieldEffectTargetResolver } = getState();
        if (fieldEffectTargetResolver) {
            let targetId = null;
            if (button.id !== 'field-effect-target-cancel-button') {
                targetId = button.dataset.playerId;
            }
            fieldEffectTargetResolver(targetId); // Resolve with null on cancel
            updateState('fieldEffectTargetResolver', null);
            dom.fieldEffectTargetModal.classList.add('hidden');
        }
    });
    
    if (dom.profileFriendsTabContent) {
        dom.profileFriendsTabContent.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
    
            if (button.matches('.add-friend-btn')) {
                const userId = button.dataset.userId;
                button.disabled = true;
                network.emitSendFriendRequest(userId, (response) => {
                    if (response.success) {
                        button.textContent = t('profile.request_sent');
                    } else {
                        alert(response.error || 'Falha ao enviar pedido.');
                        button.disabled = false;
                    }
                });
                return;
            }
    
            if (button.matches('.remove-friend-btn')) {
                const userId = button.dataset.userId;
                const username = button.closest('.friend-item')?.querySelector('.friend-name')?.textContent.trim() || 'este amigo';
                if (confirm(t('confirm.remove_friend', { username }))) {
                     network.emitRemoveFriend({ targetUserId: userId });
                }
                return;
            }
    
            if (button.matches('.view-profile-btn')) {
                const googleId = button.dataset.googleId;
                if (googleId) {
                    network.emitViewProfile({ googleId });
                }
                return;
            }
    
            if (button.matches('.send-message-btn')) {
                const userId = button.dataset.userId;
                const username = button.dataset.username;
                if (userId && username) {
                    openChatWindow(userId, username);
                }
                return;
            }
    
            if (button.matches('.accept-request-btn') || button.matches('.decline-request-btn')) {
                const requestId = button.dataset.requestId;
                if (requestId) {
                    const action = button.matches('.accept-request-btn') ? 'accept' : 'decline';
                    network.emitRespondToRequest(requestId, action);
                }
                return;
            }
        });
    }

    if (dom.friendsSearchButton) {
        dom.friendsSearchButton.addEventListener('click', () => {
            const query = dom.friendsSearchInput ? dom.friendsSearchInput.value.trim() : '';
            if (query) network.emitSearchUsers(query);
        });
    }

    if (dom.profileModal) {
        dom.profileModal.addEventListener('click', (e) => {
             const actionButton = e.target.closest('button.add-friend-btn, button.remove-friend-btn, button#toggle-chat-mute-button, button.equip-avatar-btn');
             if (!actionButton) return;

             if (actionButton.matches('.add-friend-btn')) {
                const userId = actionButton.dataset.userId;
                actionButton.disabled = true;
                network.emitSendFriendRequest(userId, (response) => {
                    if (response.success) {
                        actionButton.textContent = t('profile.request_sent');
                    } else {
                        alert(response.error || 'Falha ao enviar pedido.');
                        actionButton.disabled = false;
                    }
                });
            } else if (actionButton.matches('.remove-friend-btn')) {
                const userId = actionButton.dataset.userId;
                network.emitRemoveFriend({ targetUserId: userId });
            } else if (actionButton.matches('#toggle-chat-mute-button')) {
                const state = getState();
                const newMuteState = !state.isChatMuted;
                updateState('isChatMuted', newMuteState);
                localStorage.setItem('reversus-chat-muted', JSON.stringify(newMuteState));
                
                actionButton.textContent = t(newMuteState ? 'profile.unmute_chat' : 'profile.mute_chat');
            } else if (actionButton.matches('.equip-avatar-btn')) {
                const avatarCode = actionButton.dataset.avatarCode;
                network.emitSetSelectedAvatar({ avatarCode });
            }
        });
    }

    // Delegated event listener for all admin actions
    if (dom.profileAdminTabContent) {
        dom.profileAdminTabContent.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
    
            if (button.matches('.admin-ban-btn')) {
                const userId = button.dataset.userId;
                const username = button.dataset.username;
                if (confirm(t('confirm.ban_player', { username }))) {
                    network.emitAdminBanUser({ userId });
                }
            } else if (button.matches('.admin-unban-btn')) {
                const userId = button.dataset.userId;
                const username = button.dataset.username;
                if (confirm(t('confirm.unban_player', { username }))) {
                    network.emitAdminUnbanUser({ userId });
                }
            } else if (button.matches('.admin-rollback-btn')) {
                const userId = button.dataset.userId;
                const username = button.dataset.username;
                if (confirm(t('confirm.rollback_player', { username }))) {
                    network.emitAdminRollbackUser({ userId });
                }
            } else if (button.matches('.admin-dismiss-report-btn')) {
                const reportId = button.dataset.reportId;
                network.emitAdminResolveReport({ reportId });
            } else if (button.matches('#admin-add-coins-btn')) {
                const input = document.getElementById('admin-add-coins-input');
                const amount = parseInt(input.value, 10);
                if (amount && amount > 0) {
                    network.emitAdminAddCoins({ amount });
                    input.value = '';
                } else {
                    alert('Por favor, insira um número positivo.');
                }
            }
        });
    }


    // --- Shop Handlers ---
    dom.shopButton.addEventListener('click', () => {
        const { isLoggedIn } = getState();
        if (!isLoggedIn) {
            alert(t('common.login_required', { feature: t('splash.shop') }));
            return;
        }
        dom.shopModal.classList.remove('hidden');
        renderShopAvatars(); // Initial render
    });

    dom.closeShopButton.addEventListener('click', () => {
        dom.shopModal.classList.add('hidden');
    });

    dom.shopAvatarsGrid.addEventListener('click', (e) => {
        const button = e.target.closest('.buy-avatar-btn');
        if (button) {
            const avatarCode = button.dataset.avatarCode;
            if (confirm(t('shop.confirm_purchase', { avatarName: t(`avatars.${avatarCode}`) }))) {
                button.disabled = true;
                button.textContent = t('shop.buying');
                network.emitBuyAvatar({ avatarCode });
            }
        }
    });
}
