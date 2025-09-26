// js/game-controller.js

import * as config from './core/config.js';
import * as dom from './core/dom.js';
import { getState, updateState } from './core/state.js';
import { renderAll } from './ui/ui-renderer.js';
import { showSplashScreen } from './ui/splash-screen.js';
import { playStoryMusic, stopStoryMusic } from './core/sound.js';
import { updateLog, shuffle } from './core/utils.js';
import { createDeck } from './game-logic/deck.js';
import { initiateGameStartSequence, startNewRound } from './game-logic/turn-manager.js';
import { generateBoardPaths } from './game-logic/board.js';
import { executeAiTurn } from './ai/ai-controller.js';
import { createSpiralStarryBackground, resetGameEffects } from './ui/animations.js';
import { t } from './core/i18n.js';
import { renderTournamentView } from './ui/torneio-renderer.js';


/**
 * Updates the in-game timer display, handling normal and countdown modes.
 */
export const updateGameTimer = () => {
    const { gameStartTime, gameState, gameTimerInterval, infiniteChallengeTimerInterval } = getState();
    if (!gameStartTime || !gameState) return;
    
    const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
    gameState.elapsedSeconds = elapsed;

    let totalSeconds, remaining, container, warningClass;

    if (gameState.isInfiniteChallenge) {
        totalSeconds = 30 * 60; // 30 minutes
        remaining = totalSeconds - elapsed;
        container = dom.gameTimerContainerEl;
        warningClass = 'countdown-warning';
    } else if (gameState.currentStoryBattle === 'necroverso_final') {
        totalSeconds = 15 * 60; // 15 minutes
        remaining = totalSeconds - elapsed;
        container = dom.gameTimerContainerEl;
        warningClass = 'countdown-warning';
    } else {
        // Normal elapsed time mode
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        dom.gameTimerContainerEl.textContent = `${minutes}:${seconds}`;
        return;
    }

    if (remaining <= 0) {
        container.textContent = '00:00';
        if (gameState.isInfiniteChallenge) {
            if (infiniteChallengeTimerInterval) clearInterval(infiniteChallengeTimerInterval);
            updateState('infiniteChallengeTimerInterval', null);
            if (gameState.gamePhase !== 'game_over') {
                 document.dispatchEvent(new CustomEvent('infiniteChallengeEnd', { detail: { reason: 'time' } }));
            }
        } else { // Necroverso final
            if(gameTimerInterval) clearInterval(gameTimerInterval);
            updateState('gameTimerInterval', null);
            if (gameState.gamePhase !== 'game_over') {
                document.dispatchEvent(new CustomEvent('storyWinLoss', { detail: { battle: 'necroverso_final', won: false, reason: 'time' } }));
            }
        }
        return;
    }

    if (warningClass) container.classList.add(warningClass);
    const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
    const seconds = (remaining % 60).toString().padStart(2, '0');
    container.textContent = `${minutes}:${seconds}`;
};


/**
 * Displays a fullscreen announcement for final bosses.
 * @param {string} text - The dialogue text.
 * @param {string} imageSrc - The source URL for the character image.
 */
const showFullscreenAnnounce = async (text, imageSrc) => {
    return new Promise(resolve => {
        dom.fullscreenAnnounceModal.classList.remove('hidden');
        dom.fullscreenAnnounceModal.classList.add('psychedelic-bg');
        dom.fullscreenAnnounceImage.src = imageSrc;
        dom.fullscreenAnnounceText.textContent = text;
        
        setTimeout(() => {
            dom.fullscreenAnnounceModal.classList.add('hidden');
            dom.fullscreenAnnounceModal.classList.remove('psychedelic-bg');
            resolve();
        }, 5000); // Show for 5 seconds
    });
};

/**
 * Initializes a new SINGLE PLAYER game with the specified mode and options.
 * The core game state creation is now handled by the server for PvP.
 */
export const initializeGame = async (mode, options) => {
    const { isChatMuted, infiniteChallengeOpponentQueue, tournamentState } = getState();
    dom.chatInput.disabled = isChatMuted;
    dom.chatInput.placeholder = t(isChatMuted ? 'chat.chat_muted_message' : 'game.chat_placeholder');

    // This function now ONLY handles non-PvP game setup.
    // The server will create and manage the gameState for PvP.
    Object.assign(config.PLAYER_CONFIG, structuredClone(config.originalPlayerConfig));
    updateState('reversusTotalIndividualFlow', false); // Reset flow state
    
    let playerIdsInGame, numPlayers, modeText, isStoryMode = false, isFinalBoss = false, storyBattle = null, storyBattleType = null, isInversusMode = false, isXaelChallenge = false, isInfiniteChallenge = false, isTournamentMatch = false;
    let isKingNecroBattle = false;
    let eventData = null;

    // Clean up special background effects from previous games
    dom.cosmicGlowOverlay.classList.add('hidden');
    resetGameEffects();
    const { inversusAnimationInterval } = getState();
    if (inversusAnimationInterval) clearInterval(inversusAnimationInterval);
    if(dom.storyStarsBackgroundEl) dom.storyStarsBackgroundEl.innerHTML = '';

    if (mode === 'inversus') {
        isInversusMode = true;
        numPlayers = 2;
        playerIdsInGame = config.MASTER_PLAYER_IDS.slice(0, numPlayers);
        modeText = 'Modo Inversus';
        await playStoryMusic('inversus.ogg');
        // Ensure the correct AI type is set for the Inversus opponent
        options.overrides = { 'player-2': { name: 'Inversus', aiType: 'inversus' } };
    } else if (mode === 'infinite_challenge') {
        isInfiniteChallenge = true;
        isInversusMode = true; // Use Inversus mechanics
        numPlayers = 2;
        playerIdsInGame = ['player-1', 'player-2'];
        modeText = 'Desafio Infinito';
        await playStoryMusic('oprofetasombrio.ogg');
        const nextOpponent = infiniteChallengeOpponentQueue[0];
        const opponentName = nextOpponent.name || (nextOpponent.nameKey ? t(nextOpponent.nameKey) : 'Opponent');
        options.overrides = { 'player-2': { name: opponentName, aiType: nextOpponent.aiType, avatar_url: nextOpponent.avatar_url } };
    } else if (mode === 'tournament') {
        isTournamentMatch = true;
        numPlayers = 2;
        // In tournament mode, playerIds come from the match options
        playerIdsInGame = options.tournamentMatch.playerIds; 
        modeText = 'Partida de Torneio';
        // Music is managed by the splash screen/hub for tournaments
    }
    else if (options.story) { // Covers both Story Mode and Events
        isStoryMode = true; // We use the story mode flag to handle shared logic like win/loss events.
        storyBattle = options.story.battle;
        updateState('xaelChallengeOffered', false); // Reset Xael challenge for new story game
        updateState('xaelChallengeStarted', false);

        if (storyBattle.startsWith('event_')) {
            eventData = options.story.eventData;
            modeText = `Evento: ${eventData.name}`;
            playerIdsInGame = ['player-1', 'player-2'];
            numPlayers = 2;
            await playStoryMusic(`${eventData.ai}.ogg`);
        } else { // Regular Story Mode logic
             if (options.story.playerIds) {
                playerIdsInGame = options.story.playerIds;
            } else {
                playerIdsInGame = config.MASTER_PLAYER_IDS.slice(0, options.numPlayers);
            }
            numPlayers = playerIdsInGame.length;
            storyBattleType = options.story.type || null;
            isFinalBoss = storyBattle === 'necroverso_final' || storyBattle === 'necroverso_king';
            isKingNecroBattle = storyBattle === 'necroverso_king';
            isXaelChallenge = storyBattle === 'xael_challenge';
            
            switch(storyBattle) {
                case 'contravox': modeText = 'Modo História: Contravox'; await playStoryMusic('contravox.ogg'); break;
                case 'versatrix': modeText = 'Modo História: Versatrix'; await playStoryMusic('versatrix.ogg'); break;
                case 'reversum': modeText = 'Modo História: Rei Reversum'; await playStoryMusic('reversum.ogg'); break;
                case 'necroverso_king': modeText = 'Modo História: Rei Necroverso'; await playStoryMusic('necroverso.ogg'); break;
                case 'necroverso_final':
                    modeText = 'Modo História: Necroverso Final';
                    await playStoryMusic('necroversofinal.ogg');
                    createSpiralStarryBackground(dom.storyStarsBackgroundEl);
                    break;
                case 'narrador': modeText = 'Batalha Secreta: Narrador'; await playStoryMusic('narrador.ogg'); break;
                case 'xael_challenge': modeText = 'Desafio: Xael'; await playStoryMusic('xaeldesafio.ogg'); break;
                default: modeText = `Modo História: ${storyBattle}`; stopStoryMusic();
            }
        }
    } else {
        numPlayers = options.numPlayers;
        playerIdsInGame = config.MASTER_PLAYER_IDS.slice(0, numPlayers);
        modeText = mode === 'solo' ? `Solo (${numPlayers}p)` : 'Duplas';
        
        // Check if the opponent is Inversus from a random match
        const isRandomInversus = options.overrides && options.overrides['player-2']?.aiType === 'inversus';

        if (isRandomInversus) {
            isInversusMode = true;
            await playStoryMusic('inversus.ogg');
        } else {
            stopStoryMusic();
        }
    }

    // Handle overrides from either PvP lobby or Story Mode
    const overrides = options.story ? options.story.overrides : options.overrides;
    if (overrides) {
        for (const id in overrides) {
            if (config.PLAYER_CONFIG[id]) {
                Object.assign(config.PLAYER_CONFIG[id], overrides[id]);
            }
        }
    }
    
    // Clear any leftover complex state
    updateState('pathSelectionResolver', null);
    
    // Announce final boss battles before showing the game screen
    if (storyBattle === 'necroverso_king') {
        await showFullscreenAnnounce("Será capaz de vencer este desafio contra nós três?", 'necroversorevelado.png');
    } else if (storyBattle === 'necroverso_final') {
        await showFullscreenAnnounce("Nem mesmo com ajuda da Versatrix poderá me derrotar, eu dominarei o Inversum e consumirei TUDO", 'necroversorevelado.png');
    }

    // Universal UI cleanup for starting any game
    dom.splashScreenEl.classList.add('hidden');
    dom.gameSetupModal.classList.add('hidden');
    dom.storyModeModalEl.classList.add('hidden');
    dom.storyStartOptionsModal.classList.add('hidden');
    dom.eventModal.classList.add('hidden');
    dom.pvpRoomListModal.classList.add('hidden');
    dom.pvpLobbyModal.classList.add('hidden');
    dom.tournamentModal.classList.add('hidden'); // Hide the hub modal
    dom.appContainerEl.classList.remove('blurred', 'hidden');
    dom.reversusTotalIndicatorEl.classList.add('hidden');
    dom.debugButton.classList.remove('hidden');

    // --- NEW TOURNAMENT VIEW LOGIC ---
    dom.appContainerEl.classList.toggle('in-tournament-match', isTournamentMatch);
    dom.tournamentViewContainer.classList.toggle('hidden', !isTournamentMatch);


    // Reset board classes
    dom.boardEl.classList.remove('inverted', 'board-rotating', 'board-rotating-fast', 'board-rotating-super-fast'); 
    
    dom.boardEl.classList.toggle('final-battle-board', isFinalBoss);
    dom.boardEl.classList.toggle('board-rotating', isFinalBoss); // Slow rotation for final bosses
    dom.boardEl.classList.toggle('board-rotating-super-fast', isInversusMode || isInfiniteChallenge); // Fast rotation for Inversus
    
    // Apply narrator monitor effect
    dom.appContainerEl.classList.toggle('effect-monitor', storyBattle === 'narrador');

    const state = getState();
    if (!isStoryMode && !isInversusMode && !isTournamentMatch) {
        stopStoryMusic();
        updateState('currentTrackIndex', 0);
        dom.musicPlayer.src = config.MUSIC_TRACKS[state.currentTrackIndex];
    }
    
    dom.gameTimerContainerEl.classList.remove('countdown-warning');
    if (storyBattle === 'necroverso_final' || isInfiniteChallenge) {
        dom.gameTimerContainerEl.classList.add('countdown-warning');
    }
    if (state.gameTimerInterval) clearInterval(state.gameTimerInterval);
    updateState('gameStartTime', Date.now());
    updateGameTimer();
    const timerInterval = setInterval(updateGameTimer, 1000);
    if (isInfiniteChallenge) {
        updateState('infiniteChallengeTimerInterval', timerInterval);
    } else {
        updateState('gameTimerInterval', timerInterval);
    }
    
    const valueDeck = shuffle(createDeck(config.VALUE_DECK_CONFIG, 'value'));
    const effectDeck = shuffle(createDeck(config.EFFECT_DECK_CONFIG, 'effect'));

    const players = Object.fromEntries(
        playerIdsInGame.map((id, index) => {
             // In tournament mode, get player data from the tournament state
            const playerConfig = isTournamentMatch 
                ? (tournamentState.players.find(p => p.id === options.tournamentMatch.playerData[id].id))
                : config.PLAYER_CONFIG[id];

            const playerName = isTournamentMatch 
                ? (playerConfig.username.startsWith('player_names.') ? t(playerConfig.username) : playerConfig.username)
                : (playerConfig.name || (playerConfig.nameKey ? t(playerConfig.nameKey) : `Player ${index + 1}`));
            
            const isHuman = isTournamentMatch ? !playerConfig.isAI : playerConfig.isHuman;

            const playerObject = {
                ...playerConfig,
                dbId: playerConfig.id, // Store the persistent ID
                id: id, // Overwrite with the game-specific ID ('player-1', 'player-2')
                name: playerName,
                isHuman: isHuman,
                aiType: isHuman ? null : (playerConfig.aiType || 'default'),
                pathId: index,
                position: 1,
                hand: [],
                resto: null,
                nextResto: null,
                effects: { score: null, movement: null },
                playedCards: { value: [], effect: [] },
                playedValueCardThisTurn: false,
                targetPathForPula: null,
                liveScore: 0,
                status: 'neutral', // neutral, winning, losing
                isEliminated: false,
                tournamentScoreEffect: null
            };
            if (eventData && id === 'player-2') {
                playerObject.isEventBoss = true;
                playerObject.eventAbilityUsedThisMatch = false;
            }
             // Correct heart logic
            if (isInfiniteChallenge) {
                playerObject.hearts = 1;
                playerObject.maxHearts = 1;
            } else if (isInversusMode) {
                playerObject.hearts = 10;
                playerObject.maxHearts = 10;
            }
            if (isKingNecroBattle) {
                playerObject.hearts = 6;
                playerObject.maxHearts = 6;
            }
             if (storyBattle === 'narrador' && id === 'player-2') {
                playerObject.narratorAbilities = {
                    confusion: true,
                    reversus: true,
                    necroX: true
                };
            }
            if (isXaelChallenge) {
                playerObject.stars = 0;
            }
            if (id === 'player-1' && isStoryMode && getState().achievements.has('xael_win')) {
                playerObject.hasXaelStarPower = true;
                playerObject.xaelStarPowerCooldown = 0;
            }
            return [id, playerObject];
        })
    );
    
    const boardPaths = generateBoardPaths({ storyBattle, isFinalBoss, isXaelChallenge, isKingNecroBattle });
    if (!isFinalBoss && !isXaelChallenge && !isTournamentMatch) {
        playerIdsInGame.forEach((id, index) => { 
            if(boardPaths[index]) boardPaths[index].playerId = id; 
        });
    }

    const gameState = {
        players,
        playerIdsInGame,
        decks: { value: valueDeck, effect: effectDeck },
        discardPiles: { value: [], effect: [] },
        boardPaths,
        gamePhase: 'setup',
        gameMode: mode,
        isPvp: false, 
        isTournamentMatch,
        tournamentMatch: options.tournamentMatch || null,
        gameOptions: options,
        isStoryMode,
        isInversusMode,
        isInfiniteChallenge,
        infiniteChallengeLevel: 1,
        isFinalBoss,
        isKingNecroBattle,
        isXaelChallenge,
        necroversoHearts: 3,
        currentStoryBattle: storyBattle,
        storyBattleType: storyBattleType,
        currentPlayer: 'player-1',
        reversusTotalActive: false,
        inversusTotalAbilityActive: false,
        turn: 1,
        selectedCard: null,
        reversusTarget: null,
        pulaTarget: null,
        fieldEffectTargetingInfo: null,
        log: [],
        activeFieldEffects: [],
        revealedHands: [],
        consecutivePasses: 0,
        initialDrawCards: null,
        contravoxAbilityUses: 3,
        versatrixSwapActive: false,
        versatrixPowerDisabled: false,
        reversumAbilityUsedThisRound: false,
        necroXUsedThisRound: false,
        eventBossAbilityUsedThisRound: false,
        dialogueState: { spokenLines: new Set() },
        player1CardsObscured: false,
        xaelChallengeOffered: false,
        xaelChallengeStarted: false,
        elapsedSeconds: 0,
    };
    
    if (storyBattle === 'necroverso_final') {
        gameState.teamA_hearts = 10;
        gameState.teamB_hearts = 10;
    }

    if (isKingNecroBattle) {
        gameState.kingBattlePathColors = ['blue', 'red', 'green', 'yellow', 'black', 'white'];
    }
    
    const isKingOrFinalNecro = gameState.currentStoryBattle === 'necroverso_king' || gameState.currentStoryBattle === 'necroverso_final';
    if (isKingOrFinalNecro && getState().achievements.has('versatrix_win')) {
        const versatrixCard = { id: Date.now() + Math.random(), type: 'effect', name: 'Carta da Versatrix', cooldown: 0 };
        players['player-1'].hand.push(versatrixCard);
        updateLog("A bênção da Versatrix está com você. Uma carta especial foi adicionada à sua mão.");
    }

    updateState('gameState', gameState);

    // Start Inversus animation if needed, regardless of mode.
    const player2IsRandomInversus = players['player-2'] && players['player-2'].aiType === 'inversus';
    if (gameState.isInversusMode || player2IsRandomInversus) {
        const { inversusAnimationInterval } = getState();
        if (inversusAnimationInterval) clearInterval(inversusAnimationInterval); // Clear old one before starting new

        const inversusImages = ['INVERSUM1.png', 'INVERSUM2.png', 'INVERSUM3.png'];
        let imageIndex = 0;
        const intervalId = setInterval(() => {
            const imgEl = document.getElementById('inversus-character-portrait');
            if (imgEl) {
                imageIndex = (imageIndex + 1) % inversusImages.length;
                imgEl.src = inversusImages[imageIndex];
            }
        }, 2000);
        updateState('inversusAnimationInterval', intervalId);
    }

    if (dom.leftScoreBox && dom.rightScoreBox) {
        if (isInversusMode || isKingNecroBattle || isInfiniteChallenge || isTournamentMatch) {
            dom.leftScoreBox.classList.add('hidden');
            dom.rightScoreBox.classList.add('hidden');
        } else {
            dom.leftScoreBox.classList.remove('hidden');
            dom.rightScoreBox.classList.remove('hidden');
        }
    }
    
    const player1Container = document.getElementById('player-1-area-container');
    const opponentsContainer = document.getElementById('opponent-zones-container');
    const createPlayerAreaHTML = (id) => `<div class="player-area" id="player-area-${id}"></div>`;
    player1Container.innerHTML = createPlayerAreaHTML('player-1');
    opponentsContainer.innerHTML = playerIdsInGame.filter(id => id !== 'player-1').map(id => createPlayerAreaHTML(id)).join('');

    updateLog(`Bem-vindo ao Reversus! Modo: ${modeText}.`);
    if(mode === 'duo' && !isStoryMode) updateLog("Equipe Azul/Verde (Você & Jogador 3) vs. Equipe Vermelho/Amarelo (Jogador 2 & Jogador 4)");
    
    renderAll();

    // For non-tournament games, start the action immediately.
    // For tournaments, wait for the player to click "Continue".
    if (!isTournamentMatch) {
        await initiateGameStartSequence();
    }
};

export function restartLastDuel() {
    const { lastStoryGameOptions } = getState();
    if (!lastStoryGameOptions) {
        console.error("No last duel info found to restart from.");
        showSplashScreen();
        return;
    }
    updateLog("Retornando ao duelo anterior...");
    // Clear modals and overlays before restarting
    dom.gameOverModal.classList.add('hidden');
    dom.cosmicGlowOverlay.classList.add('hidden');

    // Call initializeGame with the saved options (robust access)
    const mode = lastStoryGameOptions.mode;
    const options = lastStoryGameOptions.options;
    initializeGame(mode, options);
}

export function setupPvpRooms() {
    // This function is now obsolete as rooms are managed by the server.
    // Kept here to avoid breaking old calls, but it does nothing.
}