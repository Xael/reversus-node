
import { getState, updateState } from '../core/state.js';
import * as dom from '../core/dom.js';
import * as config from '../core/config.js';
import { renderAll, showTurnIndicator, showRoundSummaryModal, showGameOver } from '../ui/ui-renderer.js';
import { renderCard } from '../ui/card-renderer.js';
import { executeAiTurn } from '../ai/ai-controller.js';
import { triggerFieldEffects, checkAndTriggerPawnLandingAbilities } from '../story/story-abilities.js';
import { updateLog, dealCard, shuffle } from '../core/utils.js';
import { grantAchievement } from '../core/achievements.js';
import { showSplashScreen } from '../ui/splash-screen.js';
import { toggleReversusTotalBackground, clearInversusScreenEffects } from '../ui/animations.js';
import { updateLiveScoresAndWinningStatus } from './score.js';
import { rotateAndApplyKingNecroversoBoardEffects } from './board.js';
import { playSoundEffect, announceEffect } from '../core/sound.js';
import { t } from '../core/i18n.js';


/**
 * Displays the initial draw sequence for a PvP match based on server results.
 * @param {object} gameState - The initial game state from the server.
 */
export async function showPvpDrawSequence(gameState) {
    const { drawResults, currentPlayer: startingPlayerId } = gameState;

    dom.drawStartTitle.textContent = t('draw.title');
    dom.drawStartResultMessage.textContent = t('draw.message_drawing');

    dom.drawStartCardsContainerEl.innerHTML = gameState.playerIdsInGame.map(id => {
        const player = gameState.players[id];
        return `
            <div class="draw-start-player-slot">
                <span class="player-name ${id}">${player.name}</span>
                <div class="card modal-card" style="background-image: url('./verso_valor.png');" id="draw-card-${id}"></div>
            </div>
        `;
    }).join('');

    dom.drawStartModal.classList.remove('hidden');
    await new Promise(res => setTimeout(res, 1500));

    const cardPromises = [];
    for (const id of gameState.playerIdsInGame) {
        const card = drawResults[id];
        const cardEl = document.getElementById(`draw-card-${id}`);
        const promise = new Promise(res => {
            setTimeout(() => {
                if (cardEl) cardEl.outerHTML = renderCard(card, 'modal');
                res();
            }, 500 * (cardPromises.length));
        });
        cardPromises.push(promise);
    }
    
    await Promise.all(cardPromises);
    await new Promise(res => setTimeout(res, 1500));

    const winner = gameState.players[startingPlayerId];
    dom.drawStartResultMessage.textContent = t('draw.message_winner', { winnerName: winner.name });

    await new Promise(res => setTimeout(res, 2000));
    dom.drawStartModal.classList.add('hidden');
}


/**
 * Initiates the sequence to start a game, beginning with the initial draw.
 */
export async function initiateGameStartSequence() {
    const { gameState } = getState();
    
    // Skip initial draw for the final battle or Xael challenge
    if (gameState.isFinalBoss || gameState.isXaelChallenge) {
        // Set paths once at the start
        const chosenPaths = new Set();
        const playerIdsToAssign = gameState.playerIdsInGame;
        playerIdsToAssign.forEach(id => {
            let availablePaths = gameState.boardPaths.filter(p => !chosenPaths.has(p.id));
            if (availablePaths.length > 0) {
                let chosenPath = availablePaths[0]; // Simplified for predictability
                gameState.players[id].pathId = chosenPath.id;
                chosenPaths.add(chosenPath.id);
            }
        });
        
        await startNewRound(true);
        return;
    }

    dom.drawStartTitle.textContent = "Sorteio Inicial";
    dom.drawStartResultMessage.textContent = "Sorteando cartas para ver quem começa...";
    
    dom.drawStartCardsContainerEl.innerHTML = gameState.playerIdsInGame.map(id => {
        const player = gameState.players[id];
        return `
            <div class="draw-start-player-slot">
                <span class="player-name ${id}">${player.name}</span>
                <div class="card modal-card" style="background-image: url('./verso_valor.png');" id="draw-card-${id}"></div>
            </div>
        `;
    }).join('');

    dom.drawStartModal.classList.remove('hidden');
    await new Promise(res => setTimeout(res, 1500));
    await drawToStart();
};

async function drawToStart() {
    const { gameState } = getState();
    const drawnCards = {};
    const cardPromises = [];

    // Use a robust for...of loop to handle potential dealing errors
    let dealFailed = false;
    for (const id of gameState.playerIdsInGame) {
        const card = dealCard('value');
        if (!card) {
            console.error(`Falha crítica ao sortear carta para ${id}. Abortando início do jogo.`);
            dealFailed = true;
            break; // Exit the loop immediately
        }
        drawnCards[id] = card;
        const cardEl = document.getElementById(`draw-card-${id}`);
        
        const promise = new Promise(res => {
            setTimeout(() => {
                if(cardEl) cardEl.outerHTML = renderCard(card, 'modal');
                res();
            }, 500 * (cardPromises.length));
        });
        cardPromises.push(promise);
    }

    if (dealFailed) {
        dom.drawStartResultMessage.textContent = "Erro ao distribuir cartas. Tente novamente.";
        updateLog("Erro crítico no sorteio inicial. O jogo não pode começar.");
        setTimeout(showSplashScreen, 3000);
        return;
    }

    await Promise.all(cardPromises);
    await new Promise(res => setTimeout(res, 1500));

    // Create a copy for sorting to avoid modifying the original turn order array
    const sortedPlayers = [...gameState.playerIdsInGame].sort((a, b) => {
        const cardA = drawnCards[a]?.value || 0;
        const cardB = drawnCards[b]?.value || 0;
        return cardB - cardA;
    });
    
    const logParts = gameState.playerIdsInGame.map(id => `${gameState.players[id].name} sacou ${drawnCards[id].name}`);
    updateLog(`Sorteio: ${logParts.join(', ')}.`);
    
    if (sortedPlayers.length < 2 || (drawnCards[sortedPlayers[0]]?.value > drawnCards[sortedPlayers[1]]?.value)) {
        const winner = gameState.players[sortedPlayers[0]];
        gameState.currentPlayer = winner.id;
        gameState.initialDrawCards = drawnCards;
        dom.drawStartResultMessage.textContent = `${winner.name} tirou a carta mais alta e começa!`;
        
        await new Promise(res => setTimeout(res, 2000));
        dom.drawStartModal.classList.add('hidden');
        
        await finalizeGameStart();
    } else {
        dom.drawStartResultMessage.textContent = "Empate! Sorteando novamente...";
        updateLog("Empate! Sacando novas cartas...");
        Object.values(drawnCards).forEach(card => gameState.discardPiles.value.push(card));
        await initiateGameStartSequence();
    }
};

async function finalizeGameStart() {
    const { gameState } = getState();
    
    if (gameState.initialDrawCards) {
        gameState.playerIdsInGame.forEach(id => {
            gameState.players[id].resto = gameState.initialDrawCards[id];
            updateLog(`Resto inicial de ${gameState.players[id].name} é ${gameState.initialDrawCards[id].name}.`);
        });
    }

    // --- Habilidade de Evento: Cupido do Caos ---
    const eventBoss = Object.values(gameState.players).find(p => p.isEventBoss);
    if (eventBoss && eventBoss.aiType === 'cupidodocaos') {
        const player1 = gameState.players['player-1'];
        const player2 = gameState.players['player-2'];
        if (player1.resto && player2.resto) {
            [player1.resto, player2.resto] = [player2.resto, player1.resto];
            updateLog("Cupido do Caos usou sua habilidade! As cartas de Resto iniciais foram trocadas!");
            playSoundEffect('reversus');
        }
    }
    
    await startNewRound(true);
};

/**
 * Advances the game to the next player's turn or ends the round.
 */
export async function advanceToNextPlayer() {
    const { gameState } = getState();
    if (gameState.gamePhase !== 'playing') return;

    const activePlayers = gameState.playerIdsInGame.filter(id => !gameState.players[id].isEliminated);
    
    // New round end condition: 2 full rounds of passes
    const endRoundPassCount = activePlayers.length * 2;

    // The round ends if everyone has passed consecutively twice.
    if (activePlayers.length > 0 && gameState.consecutivePasses >= endRoundPassCount) {
        await endRound();
        return;
    }
    
    // Announce the "last call" when one full round of passes is complete.
    if (activePlayers.length > 0 && gameState.consecutivePasses === activePlayers.length) {
        updateLog("ÚLTIMA CHAMADA! Todos os jogadores passaram. A rodada terminará se todos passarem novamente.");
    }

    // --- Find next active player (robustly) ---
    let currentIndex = gameState.playerIdsInGame.indexOf(gameState.currentPlayer);
    let nextIndex = currentIndex;
    let attempts = 0;
    
    // This loop will find the next player who is NOT eliminated.
    // The attempts check prevents an infinite loop if all players are somehow eliminated.
    do {
        nextIndex = (nextIndex + 1) % gameState.playerIdsInGame.length;
        if (++attempts > gameState.playerIdsInGame.length * 2) { // Increased safeguard
            // This should not happen if game end is checked properly, but it's a fail-safe.
            updateLog("Nenhum jogador ativo encontrado. Forçando o fim da rodada.");
            await endRound();
            return;
        }
    } while (gameState.players[gameState.playerIdsInGame[nextIndex]].isEliminated);
    
    gameState.currentPlayer = gameState.playerIdsInGame[nextIndex];
    // --- End of finding next player ---

    const nextPlayer = gameState.players[gameState.currentPlayer];
    nextPlayer.playedValueCardThisTurn = false; // Reset for the new turn

    if (nextPlayer.id === 'player-1' && nextPlayer.hasXaelStarPower) {
        // Decrease Xael Star Power cooldown
        if (nextPlayer.xaelStarPowerCooldown > 0) {
            nextPlayer.xaelStarPowerCooldown--;
            if (nextPlayer.xaelStarPowerCooldown > 0) {
                updateLog(`Recarga do Poder Estelar: ${nextPlayer.xaelStarPowerCooldown} turnos restantes.`);
            } else {
                updateLog(`Poder Estelar está pronto!`);
            }
        }
    }

    updateLog(`É a vez de ${nextPlayer.name}.`);
    renderAll();

    if (nextPlayer.isHuman) {
        await showTurnIndicator();
    } else {
        executeAiTurn(nextPlayer);
    }
}

async function endRound() {
    const { gameState } = getState();
    if (gameState.gamePhase !== 'playing') return;
    
    gameState.gamePhase = 'resolution';
    renderAll(); // Update UI to show "Fim da rodada!"
    updateLog('Todos os jogadores passaram. Resolvendo a rodada...');
    await calculateScoresAndEndRound();
}


async function startNewRound(isFirstRound = false) {
    const { gameState } = getState();
    if (!isFirstRound) {
        gameState.turn++;
    }
    updateLog(`--- Iniciando Rodada ${gameState.turn} ---`);

    // Reset round-specific states for each player
    gameState.playerIdsInGame.forEach(id => {
        const player = gameState.players[id];
        if (player.isEliminated) return;
        
        // Discard played cards
        gameState.discardPiles.value.push(...player.playedCards.value);
        gameState.discardPiles.effect.push(...player.playedCards.effect);
        player.playedCards = { value: [], effect: [] };

        // Update resto
        if (player.nextResto) {
            player.resto = player.nextResto;
            player.nextResto = null;
        }
        
        // --- Habilidade de Evento: Guardião da Aurora ---
        if (player.isEventBoss && player.aiType === 'guardiaodaaurora' && player.resto) {
            const restoCardIndex = gameState.discardPiles.value.findIndex(c => c.id === player.resto.id);
            if (restoCardIndex > -1) {
                const [revivedCard] = gameState.discardPiles.value.splice(restoCardIndex, 1);
                player.hand.push(revivedCard);
                updateLog(`Guardião da Aurora usou sua habilidade e reviveu sua carta de Resto (${revivedCard.name})!`);
            }
        }

        // Revert Necro X curse
        if (player.replacedCardByNecroX) {
            const curseCardIndex = player.hand.findIndex(c => c.name === 'NECRO_X_CURSE');
            if (curseCardIndex > -1) {
                player.hand.splice(curseCardIndex, 1);
            }
            player.hand.push(player.replacedCardByNecroX);
            updateLog(`A maldição de Necro X em ${player.name} se desfez.`);
            player.replacedCardByNecroX = null;
        }


        player.effects = { score: null, movement: null };
        player.playedValueCardThisTurn = false;
        player.targetPathForPula = null;

        // Decrease Versatrix Card cooldown per round
        const versatrixCard = player.hand.find(c => c.name === 'Carta da Versatrix');
        if (versatrixCard && versatrixCard.cooldown > 0) {
            versatrixCard.cooldown--;
             if (versatrixCard.cooldown > 0) {
                updateLog(`Recarga da Carta da Versatrix: ${versatrixCard.cooldown} rodadas restantes.`);
            } else {
                updateLog(`A Carta da Versatrix está pronta!`);
            }
        }
    });
    
    // Reset global round states
    gameState.selectedCard = null;
    gameState.reversusTotalActive = false;
    gameState.consecutivePasses = 0;
    gameState.activeFieldEffects = [];
    gameState.revealedHands = [];
    gameState.reversumAbilityUsedThisRound = false;
    gameState.necroXUsedThisRound = false;
    gameState.eventBossAbilityUsedThisRound = false;
    
    toggleReversusTotalBackground(false);
    dom.appContainerEl.classList.remove('reversus-total-active');
    dom.reversusTotalIndicatorEl.classList.add('hidden');

    // Inversus screen effects with escalating chaos
    clearInversusScreenEffects();
    if (gameState.isInversusMode) {
        const turn = gameState.turn;
        const effects = ['screen-flipped', 'screen-inverted', 'screen-mirrored'];
        shuffle(effects);
        let effectApplied = false;

        if (turn >= 7) {
            dom.scalableContainer.classList.add(effects[0], effects[1], effects[2]);
            announceEffect('REALIDADE DISTORCIDA', 'reversus');
            effectApplied = true;
        } else if (turn >= 4) {
            dom.scalableContainer.classList.add(effects[0], effects[1]);
            announceEffect('CONFUSÃO DUPLA', 'reversus');
            effectApplied = true;
        } else if (turn >= 1) {
            const effectChance = Math.random();
            if (effectChance < 0.6) { // 60% chance for an effect on early turns
                dom.scalableContainer.classList.add(effects[0]);
                const effectNameMap = {
                    'screen-flipped': 'TELA INVERTIDA',
                    'screen-inverted': 'CORES INVERTIDAS',
                    'screen-mirrored': 'TELA ESPELHADA'
                };
                announceEffect(effectNameMap[effects[0]], 'reversus');
                effectApplied = true;
            }
        }

        if (effectApplied) {
            playSoundEffect('campoinverso');
        }
    }

    // Draw cards to replenish hands
    gameState.playerIdsInGame.forEach(id => {
        const player = gameState.players[id];
        if (player.isEliminated) return;
        while (player.hand.filter(c => c.type === 'value').length < config.MAX_VALUE_CARDS_IN_HAND) {
            const newCard = dealCard('value');
            if (newCard) player.hand.push(newCard); else break;
        }
        // Versatrix card doesn't count towards the effect card limit
        while (player.hand.filter(c => c.type === 'effect' && c.name !== 'Carta da Versatrix').length < config.MAX_EFFECT_CARDS_IN_HAND) {
            const newCard = dealCard('effect');
            if (newCard) player.hand.push(newCard); else break;
        }
    });

    // Special Logic for King Necro Battle
    if (gameState.isKingNecroBattle) {
        await rotateAndApplyKingNecroversoBoardEffects(!isFirstRound);
        if (checkGameEnd()) return; // Stop if board effects ended the game
    }

    if (!isFirstRound) {
        // PvP check: The server now handles field effects for PvP.
        if (!gameState.isPvp) {
            await triggerFieldEffects();
        }
        if (checkGameEnd()) return;
    }
    
    gameState.gamePhase = 'playing';
    const currentPlayer = gameState.players[gameState.currentPlayer];
    currentPlayer.playedValueCardThisTurn = false; // Reset for the first player of the round
    updateLog(`É a vez de ${currentPlayer.name}.`);
    
    renderAll();

    if (currentPlayer.isHuman) {
        await showTurnIndicator();
    } else {
        executeAiTurn(currentPlayer);
    }
}

function checkGameEnd() {
    const { gameState } = getState();

    // Specific win/loss condition for heart-based battles
    if (gameState.currentStoryBattle === 'necroverso_final') {
        if (gameState.teamB_hearts <= 0) { // Necro's team
            gameState.gamePhase = 'game_over';
            document.dispatchEvent(new CustomEvent('storyWinLoss', { detail: { battle: 'necroverso_final', won: true } }));
            return true;
        }
        if (gameState.teamA_hearts <= 0) { // Player's team
            gameState.gamePhase = 'game_over';
            document.dispatchEvent(new CustomEvent('storyWinLoss', { detail: { battle: 'necroverso_final', won: false } }));
            return true;
        }
    }
    
    if (gameState.isKingNecroBattle || gameState.isInversusMode) {
        const activePlayers = gameState.playerIdsInGame.filter(id => !gameState.players[id].isEliminated);
        if (activePlayers.length <= 1) {
            gameState.gamePhase = 'game_over';
            const player1Victorious = activePlayers.length === 1 && activePlayers[0] === 'player-1';
            document.dispatchEvent(new CustomEvent('storyWinLoss', { detail: { battle: gameState.currentStoryBattle || 'inversus', won: player1Victorious } }));
            return true;
        }
    }

    // CRITICAL FIX: In heart-based battles, the game should NOT end by reaching position 10.
    if (gameState.currentStoryBattle === 'necroverso_final' || gameState.isKingNecroBattle || gameState.isInversusMode) {
        return false; // Only heart-based win/loss applies.
    }

    // Standard win condition for all other modes (reaching position 10)
    const gameWinners = gameState.playerIdsInGame.filter(id => !gameState.players[id].isEliminated && gameState.players[id].position >= config.WINNING_POSITION);

    if (gameWinners.length > 0) {
        let actualWinners = [...gameWinners];
        
        if (gameState.isXaelChallenge) {
            const player1 = gameState.players['player-1'];
            const xael = gameState.players['player-2'];
            
            const player1Won = gameWinners.includes('player-1');
            const xaelWon = gameWinners.includes('player-2');

            if (player1Won && xaelWon) {
                // Tie-breaker: most stars. Xael wins ties.
                actualWinners = (player1.stars > xael.stars) ? ['player-1'] : ['player-2'];
            } else if (player1Won) {
                actualWinners = ['player-1'];
            } else if (xaelWon) {
                actualWinners = ['player-2'];
            } else {
                 actualWinners = []; // Should not happen if gameWinners has items
            }
        }
        
        if(actualWinners.length > 0) {
            gameState.gamePhase = 'game_over';
            if (gameState.isStoryMode) {
                 const player1Victorious = gameState.gameMode === 'duo'
                    ? actualWinners.some(id => (gameState.currentStoryBattle === 'necroverso_final' ? ['player-1', 'player-4'] : config.TEAM_A).includes(id))
                    : actualWinners.includes('player-1');
                document.dispatchEvent(new CustomEvent('storyWinLoss', { detail: { battle: gameState.currentStoryBattle, won: player1Victorious } }));
            } else {
                const winnerNames = actualWinners.map(id => gameState.players[id].name).join(' e ');
                showGameOver(`${winnerNames} venceu o jogo!`);
                grantAchievement('first_win');
            }
            return true; // Game has ended
        }
    }
    return false; // Game continues
}


/**
 * Calculates final scores, determines winner, moves pawns, and checks for game over.
 */
async function calculateScoresAndEndRound() {
    const { gameState } = getState();
    
    const finalScores = {};

    // 0. Reset Contravox flag before checking for new triggers
    gameState.player1CardsObscured = false;

    // 1. Calculate final scores including all effects
    gameState.playerIdsInGame.forEach(id => {
        const p = gameState.players[id];
        if (p.isEliminated) return;

        let score = p.playedCards.value.reduce((sum, card) => sum + card.value, 0);
        let restoValue = p.resto?.value || 0;

        // Check for field effects on resto
        if (gameState.activeFieldEffects.some(fe => fe.name === 'Resto Maior' && fe.appliesTo === id)) restoValue = 10;
        if (gameState.activeFieldEffects.some(fe => fe.name === 'Resto Menor' && fe.appliesTo === id)) restoValue = 2;

        if (p.effects.score === 'Mais') score += restoValue;

        let scoreModifier = 1;
        // Check for Super Exposto before applying Menos
        if (gameState.activeFieldEffects.some(fe => fe.name === 'Super Exposto' && fe.appliesTo === id)) {
            scoreModifier = 2;
             updateLog(`Efeito 'Super Exposto' dobrou o efeito negativo em ${p.name}!`);
        }
        
        if (p.effects.score === 'Menos') score -= (restoValue * scoreModifier);
        if (p.effects.score === 'NECRO X') score += 10;
        if (p.effects.score === 'NECRO X Invertido') score -= 10;

        finalScores[id] = score;
        p.liveScore = score;
    });

    // 2. Determine winner(s)
    let winners = [];
    if (gameState.playerIdsInGame.filter(pId => !gameState.players[pId].isEliminated).length > 0) {
        let highestScore = -Infinity;
        gameState.playerIdsInGame.forEach(id => {
            const p = gameState.players[id];
            if (p.isEliminated) return;
            if (finalScores[id] > highestScore) {
                highestScore = finalScores[id];
                winners = [id];
            } else if (finalScores[id] === highestScore) {
                winners.push(id);
            }
        });
    }

    // 3. Handle tie logic
    if (winners.length > 1) { // A tie exists
        if (gameState.gameMode === 'duo') {
            const teamA_Ids = gameState.currentStoryBattle === 'necroverso_final' ? ['player-1', 'player-4'] : config.TEAM_A;
            const teamB_Ids = gameState.currentStoryBattle === 'necroverso_final' ? ['player-2', 'player-3'] : config.TEAM_B;

            const firstWinnerTeam = teamA_Ids.includes(winners[0]) ? 'A' : 'B';
            const allWinnersOnSameTeam = winners.every(id => 
                (firstWinnerTeam === 'A' && teamA_Ids.includes(id)) || 
                (firstWinnerTeam === 'B' && teamB_Ids.includes(id))
            );
            if (!allWinnersOnSameTeam) {
                winners = []; // Tie between teams
            }
        } else { // Solo mode tie
            winners = []; 
        }
    }
    
    // 4. Log winner and show summary modal
    if (winners.length > 0) {
        const winnerNames = winners.map(id => gameState.players[id].name).join(' e ');
        updateLog(`Vencedor(es) da rodada: ${winnerNames}.`);
    } else {
        updateLog("A rodada terminou em empate. Ninguém avança por pontuação.");
    }
    await showRoundSummaryModal({ winners, finalScores, potWon: 0 });

    // Handle INVERSUS heart loss
    if (gameState.isInversusMode && !checkGameEnd()) {
        const player1Won = winners.includes('player-1');
        const inversusWon = winners.includes('player-2');
        const player1 = gameState.players['player-1'];
        const inversus = gameState.players['player-2'];
    
        if (inversusWon && player1) {
            player1.hearts = Math.max(0, player1.hearts - 1);
            updateLog(`Você perdeu a rodada e 1 coração! Restam: ${player1.hearts}.`);
            playSoundEffect('coracao');
            announceEffect('💔', 'heartbreak', 1500);
            if (player1.hearts === 0) {
                player1.isEliminated = true;
            }
        } else if (player1Won && inversus) {
            inversus.hearts = Math.max(0, inversus.hearts - 1);
            updateLog(`Inversus perdeu a rodada e 1 coração! Restam: ${inversus.hearts}.`);
            playSoundEffect('coracao');
            announceEffect('💔', 'heartbreak', 1500);
            if (inversus.hearts === 0) {
                inversus.isEliminated = true;
            }
        }
        if(checkGameEnd()) return;
    }
    
    // Handle King Necro Battle punishment
    if (gameState.isKingNecroBattle) {
        const activePlayers = gameState.playerIdsInGame.filter(id => !gameState.players[id].isEliminated);
        if (activePlayers.length > 1) {
            let lowestScore = Infinity;
            activePlayers.forEach(id => {
                if (finalScores[id] < lowestScore) {
                    lowestScore = finalScores[id];
                }
            });
            
            const losers = activePlayers.filter(id => finalScores[id] === lowestScore);
            
            if (losers.length > 0) {
                const loserNames = losers.map(id => gameState.players[id].name).join(', ');
                updateLog(`${loserNames} tiveram a menor pontuação e perdem 1 coração cada!`);
                
                for (const loserId of losers) {
                    const loserPlayer = gameState.players[loserId];
                    loserPlayer.hearts--;
                    playSoundEffect('coracao');
                    announceEffect('💔', 'heartbreak', 1500);
                    updateLog(`Corações de ${loserPlayer.name}: ${loserPlayer.hearts}`);
                    
                    if (loserPlayer.hearts <= 0) {
                        loserPlayer.hearts = 0; // Prevent negative hearts
                        loserPlayer.isEliminated = true;
                        updateLog(`${loserPlayer.name} foi eliminado da batalha!`);
                    }
                }
            }
        }
        if (checkGameEnd()) return; // Stop if game ended due to heart loss
    }
    
    // Handle heart loss for final battle
    if (gameState.currentStoryBattle === 'necroverso_final' && winners.length > 0) {
        const winningTeamIsA = (gameState.currentStoryBattle === 'necroverso_final' ? ['player-1', 'player-4'] : config.TEAM_A).includes(winners[0]);
        if (winningTeamIsA) {
            gameState.teamB_hearts--;
            updateLog(`A equipe do Necroverso perdeu a rodada e 1 coração! Restam: ${gameState.teamB_hearts}`);
        } else {
            gameState.teamA_hearts--;
            updateLog(`Sua equipe perdeu a rodada e 1 coração! Restam: ${gameState.teamA_hearts}`);
        }
        playSoundEffect('coracao');
        announceEffect('💔', 'heartbreak', 1500);
        if (checkGameEnd()) return; // Stop if game ended due to heart loss
    }
    
    // 5. Apply pawn movements using a consolidated approach (skip for heart-based battles)
    if (!gameState.isInversusMode && !gameState.isKingNecroBattle) {
        for (const id of gameState.playerIdsInGame) {
            const p = gameState.players[id];
            if (p.isEliminated) continue;

            // First, handle path changes from 'Pula'
            if (p.effects.movement === 'Pula' && p.targetPathForPula !== null) {
                p.pathId = p.targetPathForPula;
                updateLog(`${p.name} foi forçado a pular para o caminho ${p.targetPathForPula + 1}.`);
            }

            let netMovement = 0;
            const isWinner = winners.includes(id);
            const isLoser = !isWinner && winners.length > 0;

            // A. Card Effects
            if (p.effects.movement === 'Sobe') netMovement++;
            if (p.effects.movement === 'Desce') {
                let movementModifier = gameState.activeFieldEffects.some(fe => fe.name === 'Super Exposto' && fe.appliesTo === id) ? 2 : 1;
                netMovement -= (1 * movementModifier);
            }

            // B. Win/Loss Effects (Field & Standard)
            if (isWinner) {
                if (gameState.activeFieldEffects.some(fe => fe.name === 'Parada' && fe.appliesTo === id)) {
                    updateLog(`Efeito 'Parada' impede ${p.name} de avançar.`);
                } else {
                    let advanceAmount = 1;
                    if (gameState.activeFieldEffects.some(fe => fe.name === 'Desafio' && fe.appliesTo === id) && p.effects.score !== 'Mais' && p.effects.movement !== 'Sobe') {
                        advanceAmount = 3;
                        updateLog(`Efeito 'Desafio' completo! ${p.name} ganha um bônus de avanço!`);
                    }
                    netMovement += advanceAmount;
                }
            } else if (isLoser) {
                if (gameState.activeFieldEffects.some(fe => fe.name === 'Castigo' && fe.appliesTo === id)) {
                    netMovement -= 3;
                    updateLog(`Efeito 'Castigo' ativado para ${p.name}.`);
                }
                if (gameState.activeFieldEffects.some(fe => fe.name === 'Impulso' && fe.appliesTo === id)) {
                    netMovement += 1;
                    updateLog(`Efeito 'Impulso' ativado para ${p.name}.`);
                }
            }

            // C. Apply the final calculated movement
            if (netMovement !== 0) {
                const oldPosition = p.position;
                p.position = Math.min(config.WINNING_POSITION, Math.max(1, p.position + netMovement));
                updateLog(`${p.name} ${netMovement > 0 ? 'avançou' : 'voltou'} de ${oldPosition} para ${p.position}.`);
            }
        }
    }

    // 6. Check for pawn landing abilities and field effects before next round starts
    for (const id of gameState.playerIdsInGame) {
        if (!gameState.players[id].isEliminated) {
            await checkAndTriggerPawnLandingAbilities(gameState.players[id]);
        }
    }
    
    // 7. Check for game win/loss conditions
    if (checkGameEnd()) {
        return; // Stop processing if the game has ended
    }

    // 8. Set next player for the new round
    if (winners.length > 0) {
        // In duo mode, if multiple players from the winning team won, pick the one who comes first in turn order
        const winnerTurnOrder = gameState.playerIdsInGame.filter(pId => winners.includes(pId));
        if (winnerTurnOrder.length > 0) {
            gameState.currentPlayer = winnerTurnOrder[0];
        }
    }
    
    // 9. Start the next round
    await startNewRound();
}
