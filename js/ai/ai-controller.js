import { getState } from '../core/state.js';
import { updateLog } from '../core/utils.js';
import { renderAll } from '../ui/ui-renderer.js';
import { playCard } from '../game-logic/player-actions.js';
import { tryToSpeak, triggerNecroX } from '../story/story-abilities.js';
import { playSoundEffect, announceEffect } from '../core/sound.js';
import * as config from '../core/config.js';

/**
 * Executes a full turn for an AI player with enhanced strategic logic.
 * The AI will play at most one value card and consider playing one effect card per turn.
 * @param {object} player - The AI player object.
 */
export async function executeAiTurn(player) {
    const { gameState } = getState();
    gameState.gamePhase = 'paused';
    renderAll(); // Update UI to show AI is thinking
    await tryToSpeak(player);
    await new Promise(res => setTimeout(res, 1200));

    let playedACard = false;
    let specialAbilityUsed = false;

    try {
        // --- Part 1: Event Boss Special Abilities ---
        if (player.isEventBoss) {
            const player1 = gameState.players['player-1'];
            switch(player.aiType) {
                case 'detetivemisterioso': // September
                    if (!gameState.eventBossAbilityUsedThisRound) {
                        let swapMade = false;
                        
                        playSoundEffect('escolhido');
                        announceEffect('Habilidade');
                        updateLog({ type: 'dialogue', speaker: player.aiType, message: `Detetive Misterioso: "Hum... um movimento interessante. Vejamos suas cartas mais de perto."` });
                        await new Promise(res => setTimeout(res, 500));

                        const playerEffectCards = player1.hand.filter(c => c.type === 'effect');
                        const aiEffectCards = player.hand.filter(c => c.type === 'effect');

                        if (playerEffectCards.length > 0 && aiEffectCards.length > 0) {
                            const priorityTake = ['Reversus Total', 'Reversus', 'Sobe'];
                            let cardToTake = null;
                            for (const cardName of priorityTake) {
                                cardToTake = playerEffectCards.find(c => c.name === cardName);
                                if (cardToTake) break;
                            }

                            if (cardToTake) {
                                const priorityGive = ['Pula'];
                                let cardToGive = aiEffectCards.find(c => priorityGive.includes(c.name)) || aiEffectCards[0];

                                const p1_take_idx = player1.hand.findIndex(c => c.id === cardToTake.id);
                                const ai_give_idx = player.hand.findIndex(c => c.id === cardToGive.id);
                                
                                if (p1_take_idx > -1 && ai_give_idx > -1) {
                                    player1.hand.splice(p1_take_idx, 1, cardToGive);
                                    player.hand.splice(ai_give_idx, 1, cardToTake);
                                    updateLog({ type: 'dialogue', speaker: player.aiType, message: `Detetive Misterioso: "Elementar, meu caro jogador. Uma simples troca de... perspectivas. Eu fico com sua carta '${cardToTake.name}' e você com a minha '${cardToGive.name}'.` });
                                    swapMade = true;
                                }
                            }
                        }

                        if (!swapMade) {
                            const playerValueCards = player1.hand.filter(c => c.type === 'value').sort((a,b) => b.value - a.value);
                            const aiValueCards = player.hand.filter(c => c.type === 'value').sort((a,b) => a.value - b.value);
                            
                            if (playerValueCards.length > 0 && aiValueCards.length > 0) {
                                const cardToTake = playerValueCards[0];
                                const cardToGive = aiValueCards[0];
                                
                                const p1_take_idx = player1.hand.findIndex(c => c.id === cardToTake.id);
                                const ai_give_idx = player.hand.findIndex(c => c.id === cardToGive.id);

                                if (p1_take_idx > -1 && ai_give_idx > -1) {
                                    player1.hand.splice(p1_take_idx, 1, cardToGive);
                                    player.hand.splice(ai_give_idx, 1, cardToTake);
                                    updateLog({ type: 'dialogue', speaker: player.aiType, message: `Detetive Misterioso: "Observo que você valoriza esta carta de valor ${cardToTake.name}. Permita-me analisá-la em troca desta, de valor ${cardToGive.name}."` });
                                    swapMade = true;
                                }
                            }
                        }
                        
                        if (swapMade) {
                            gameState.eventBossAbilityUsedThisRound = true;
                            specialAbilityUsed = true;
                            renderAll();
                            await new Promise(res => setTimeout(res, 1500));
                        } else {
                            updateLog({ type: 'dialogue', speaker: player.aiType, message: `Detetive Misterioso: "Hmm, sua mão não apresenta nada de valor para minha investigação... por enquanto."` });
                        }
                    }
                    break;
                case 'astronomoperdido': // August
                    if (!player.eventAbilityUsedThisMatch && player.position < player1.position - 3) {
                        updateLog(`${player.name} usa 'Caos Cósmico' para trocar de lugar!`);
                        [player.position, player1.position] = [player1.position, player.position];
                        player.eventAbilityUsedThisMatch = true;
                        specialAbilityUsed = true;
                        renderAll();
                        await new Promise(res => setTimeout(res, 1000));
                    }
                    break;
            }
        }

        // --- Part 2: Play a value card if necessary ---
        const valueCards = player.hand.filter(c => c.type === 'value');
        if (valueCards.length > 1 && !player.playedValueCardThisTurn) {
            const otherScores = gameState.playerIdsInGame
                .filter(id => id !== player.id && !gameState.players[id].isEliminated)
                .map(id => gameState.players[id].liveScore || 0);
            
            const maxOtherScore = otherScores.length > 0 ? Math.max(...otherScores) : -Infinity;
            const sortedValueCards = [...valueCards].sort((a, b) => a.value - b.value);
            let cardToPlay;

            // AI logic for which value card to play
            if (player.aiType === 'necroverso_final' || player.aiType === 'reversum') {
                cardToPlay = sortedValueCards[sortedValueCards.length - 1]; // Always play highest value card
            } else {
                const potentialWinCard = sortedValueCards[sortedValueCards.length - 1];
                const currentScoreWithResto = player.liveScore + (player.resto?.value || 0);
                
                if ((currentScoreWithResto + potentialWinCard.value) > maxOtherScore) {
                    cardToPlay = potentialWinCard; // Play high to win
                } else {
                    cardToPlay = sortedValueCards[0]; // Play low to save good cards
                }
            }
            
            updateLog(`AI ${player.name}: Jogando a carta de valor ${cardToPlay.name}.`);
            await playCard(player, cardToPlay, player.id);
            await new Promise(res => setTimeout(res, 800));
            playedACard = true;
        }

        // --- Part 3: Consider playing one effect card ---
        const effectCards = player.hand.filter(c => c.type === 'effect');
        let bestMove = { score: -1 };
        
        // --- AI PERSONALITY LOGIC ---
        if (gameState.gameMode === 'duo' && !player.isHuman && !gameState.isFinalBoss) { // Generic Duo Partner Logic
            const playerTeamIds = config.TEAM_A.includes(player.id) ? config.TEAM_A : config.TEAM_B;
            const ally = gameState.players[playerTeamIds.find(id => id !== player.id)];
            const opponentTeamIds = playerTeamIds === config.TEAM_A ? config.TEAM_B : config.TEAM_A;
            const opponents = opponentTeamIds.map(id => gameState.players[id]).filter(p => p && !p.isEliminated);
            const leader = opponents.length > 0 ? [...opponents].sort((a, b) => b.liveScore - a.liveScore)[0] : null;

            for (const card of effectCards) {
                 // Prioritize helping ally if they are losing or have a bad effect
                if (['Mais', 'Sobe'].includes(card.name) && ally && 50 > bestMove.score) {
                     bestMove = { card, target: ally.id, score: 50, reason: "para ajudar seu aliado" };
                }
                // Then, help self
                else if (['Mais', 'Sobe'].includes(card.name) && 40 > bestMove.score) {
                    bestMove = { card, target: player.id, score: 40, reason: "para se fortalecer" };
                }
                // Attack the leading opponent
                else if (['Menos', 'Desce', 'Pula'].includes(card.name) && leader && 60 > bestMove.score) {
                    if (card.name === 'Pula') {
                        const availablePaths = gameState.boardPaths.filter(p => !Object.values(gameState.players).map(pl => pl.pathId).includes(p.id));
                        if (availablePaths.length > 0) {
                            bestMove = { card, target: leader.id, score: 60, reason: "para atrapalhar o oponente líder" };
                        }
                    } else {
                        bestMove = { card, target: leader.id, score: 60, reason: "para atacar o oponente líder" };
                    }
                }
                // Use Reversus defensively on ally or offensively on leader
                else if (card.name === 'Reversus') {
                    if (ally && (ally.effects.score === 'Menos' || ally.effects.movement === 'Desce') && 70 > bestMove.score) {
                        const effectType = ally.effects.score === 'Menos' ? 'score' : 'movement';
                        bestMove = { card, target: ally.id, effectType, score: 70, reason: "para defender seu aliado" };
                    } else if (leader && (leader.effects.score === 'Mais' || leader.effects.movement === 'Sobe') && 65 > bestMove.score) {
                        const effectType = leader.effects.score === 'Mais' ? 'score' : 'movement';
                        bestMove = { card, target: leader.id, effectType, score: 65, reason: "para anular a vantagem do oponente" };
                    }
                }
            }
        } else if (player.aiType === 'versatrix' && gameState.currentStoryBattle === 'necroverso_final') {
             // ALLY LOGIC
            const player1 = gameState.players['player-1'];
            const necroTeamIds = ['player-2', 'player-3'];
            const opponents = necroTeamIds.map(id => gameState.players[id]).filter(p => p && !p.isEliminated);
            const leader = opponents.length > 0 ? [...opponents].sort((a,b) => b.liveScore - a.liveScore)[0] : null;

            for (const card of effectCards) {
                // Help player 1
                if (['Mais', 'Sobe'].includes(card.name) && player1.effects.score !== 'Mais' && 50 > bestMove.score) {
                    bestMove = { card, target: player1.id, score: 50, reason: "para ajudar seu aliado" };
                }
                // Attack opponents
                if (['Menos', 'Desce'].includes(card.name) && leader && leader.effects.score !== 'Menos' && 40 > bestMove.score) {
                    bestMove = { card, target: leader.id, score: 40, reason: "para atacar o inimigo" };
                }
            }
        } else if (player.aiType === 'reversum') {
            const player1 = gameState.players['player-1'];
            // Highest Priority: Use Reversus Total ability if conditions are met.
            if (!gameState.reversumAbilityUsedThisRound) {
                const selfHasNegativeEffect = player.effects.score === 'Menos' || player.effects.movement === 'Desce';
                const player1HasPositiveEffect = player1.effects.score === 'Mais' || player1.effects.movement === 'Sobe';
        
                if (selfHasNegativeEffect || player1HasPositiveEffect) {
                    const reason = selfHasNegativeEffect ? "para reverter um efeito negativo sobre si mesmo" : "para sabotar a vantagem do jogador";
                    const reversusTotalAbilityCard = { id: 'ability_reversus_total', name: 'Reversus Total', type: 'effect' };
                    bestMove = { card: reversusTotalAbilityCard, target: player.id, score: 110, reason, isReversumAbility: true };
                }
            }
            
            // Evaluate cards only if ability wasn't chosen
            if (bestMove.score < 100) {
                 const opponents = Object.values(gameState.players).filter(p => p.id !== player.id && !p.isEliminated);
                 const leader = opponents.length > 0 ? [...opponents].sort((a, b) => b.liveScore - a.liveScore)[0] : null;

                for (const card of effectCards) {
                    if (card.name === 'Reversus Total' && leader && 100 > bestMove.score) {
                        bestMove = { card, target: player.id, score: 100, reason: "para causar o caos total" };
                    }
                    else if (card.name === 'Reversus' && leader && (leader.effects.score === 'Mais' || leader.effects.movement === 'Sobe') && 85 > bestMove.score) {
                        const effectType = leader.effects.score === 'Mais' ? 'score' : 'movement';
                        bestMove = { card, target: leader.id, effectType, score: 85, reason: "para anular a vantagem do oponente" };
                    }
                    else if (card.name === 'Pula' && leader && 75 > bestMove.score) {
                        const availablePaths = gameState.boardPaths.filter(p => !Object.values(gameState.players).map(pl => pl.pathId).includes(p.id));
                        if (availablePaths.length > 0) {
                            bestMove = { card, target: leader.id, score: 75, reason: "para reposicionar o oponente" };
                        }
                    }
                    else if (['Menos', 'Desce'].includes(card.name) && leader && 70 > bestMove.score) {
                        bestMove = { card, target: leader.id, score: 70, reason: "para esmagar o oponente" };
                    }
                    else if (card.name === 'Reversus' && (player.effects.score === 'Menos' || player.effects.movement === 'Desce') && 60 > bestMove.score) {
                        const effectType = player.effects.score === 'Menos' ? 'score' : 'movement';
                        bestMove = { card, target: player.id, effectType, score: 60, reason: "para se defender" };
                    }
                    else if (['Mais', 'Sobe'].includes(card.name) && 50 > bestMove.score) {
                        bestMove = { card, target: player.id, score: 50, reason: "para se fortalecer" };
                    }
                }
            }
        } else { // DEFAULT LOGIC FOR QUICK START and other AIs
            const opponents = Object.values(gameState.players).filter(p => p.id !== player.id && !p.isEliminated);
            const leader = opponents.length > 0 ? [...opponents].sort((a, b) => b.liveScore - a.liveScore)[0] : null;
            const isLosing = leader && player.liveScore < leader.liveScore;

            for (const card of effectCards) {
                // Highest priority: Reversus Total if losing or opponent has advantage
                const leaderHasGoodEffects = leader && (leader.effects.score === 'Mais' || leader.effects.movement === 'Sobe');
                if (card.name === 'Reversus Total' && (isLosing || leaderHasGoodEffects) && 100 > bestMove.score) {
                    bestMove = { card, target: player.id, score: 100, reason: "para causar o caos total" };
                }
                // Offensive Reversus
                else if (card.name === 'Reversus' && leaderHasGoodEffects && 85 > bestMove.score) {
                    const effectType = leader.effects.score === 'Mais' ? 'score' : 'movement';
                    bestMove = { card, target: leader.id, effectType, score: 85, reason: "para anular a vantagem do oponente" };
                }
                // Offensive Pula
                else if (card.name === 'Pula' && leader && 75 > bestMove.score) {
                    const availablePaths = gameState.boardPaths.filter(p => !Object.values(gameState.players).map(pl => pl.pathId).includes(p.id));
                    if (availablePaths.length > 0) {
                        bestMove = { card, target: leader.id, score: 75, reason: "para reposicionar o oponente" };
                    }
                }
                // Offensive cards
                else if (['Menos', 'Desce'].includes(card.name) && leader && 70 > bestMove.score) {
                    bestMove = { card, target: leader.id, score: 70, reason: "para atacar o oponente" };
                }
                // Defensive Reversus
                else if (card.name === 'Reversus' && (player.effects.score === 'Menos' || player.effects.movement === 'Desce') && 60 > bestMove.score) {
                    const effectType = player.effects.score === 'Menos' ? 'score' : 'movement';
                    bestMove = { card, target: player.id, effectType, score: 60, reason: "para se defender" };
                }
                // Buff self
                else if (['Mais', 'Sobe'].includes(card.name) && 50 > bestMove.score) {
                    bestMove = { card, target: player.id, score: 50, reason: "para se fortalecer" };
                }
            }
        }

        if (bestMove.score > -1) {
            updateLog(`AI ${player.name}: Jogando ${bestMove.card.name} ${bestMove.reason}.`);
            
            if (bestMove.isReversumAbility) {
                gameState.reversumAbilityUsedThisRound = true;
                announceEffect('REVERSUS TOTAL!', 'reversus-total');
                playSoundEffect('reversustotal');
                gameState.reversusTotalActive = true;
                Object.values(gameState.players).forEach(p => {
                    if (p.effects.score) p.effects.score = p.effects.score === 'Mais' ? 'Menos' : 'Mais';
                    if (p.effects.movement && p.effects.movement !== 'Pula') p.effects.movement = p.effects.movement === 'Sobe' ? 'Desce' : 'Sobe';
                });
            } else if (bestMove.card.name === 'Pula') {
                const targetPlayer = gameState.players[bestMove.target];
                const availablePaths = gameState.boardPaths.filter(p => !Object.values(gameState.players).some(pl => pl.pathId === p.id && !pl.isEliminated));
                if (availablePaths.length > 0) {
                    targetPlayer.targetPathForPula = availablePaths[0].id;
                    await playCard(player, bestMove.card, bestMove.target);
                }
            } else {
                await playCard(player, bestMove.card, bestMove.target, bestMove.effectType);
            }
            playedACard = true;
            await new Promise(res => setTimeout(res, 800));
        }

    } catch (error) {
        console.error("Erro durante o turno da IA:", error);
    } finally {
        // --- Part 4: End turn ---
        if (!playedACard && !specialAbilityUsed) {
            updateLog(`AI ${player.name}: Passando o turno.`);
        }
        gameState.consecutivePasses = playedACard ? 0 : gameState.consecutivePasses + 1;
        
        gameState.gamePhase = 'playing'; // Resume game
        document.dispatchEvent(new Event('aiTurnEnded'));
    }
}