

import { getState, updateState } from '../core/state.js';
import * as config from '../core/config.js';
import * as dom from '../core/dom.js';
import { updateLog, dealCard, shuffle } from '../core/utils.js';
import { renderAll } from '../ui/ui-renderer.js';
import { showGameOver } from '../ui/ui-renderer.js';
import { animateNecroX, shatterImage, toggleReversusTotalBackground } from '../ui/animations.js';
import { playSoundEffect, announceEffect } from '../core/sound.js';
import { applyEffect } from '../game-logic/card-effects.js';
import { t } from '../core/i18n.js';


/**
 * Triggers the secret Xael challenge popup if conditions are met.
 * This is now a centralized function.
 */
export function triggerXaelChallengePopup() {
    const { gameState } = getState();
    if (gameState.isStoryMode && !gameState.xaelChallengeOffered && !gameState.xaelChallengeStarted && !gameState.isInversusMode) {
        gameState.xaelChallengeOffered = true; // Mark as offered to prevent repeats
        setTimeout(() => {
            playSoundEffect('xael');
            dom.xaelPopup.classList.remove('hidden');
            updateLog("Um Desafiante secreto apareceu!");
             // Add this to auto-hide the popup if not clicked
            setTimeout(() => {
                if (!dom.xaelPopup.classList.contains('hidden')) {
                    dom.xaelPopup.classList.add('hidden');
                }
            }, 4000); // Increased duration from 2s to 4s
        }, 1000); // 1 second delay
    }
}


/**
 * Triggers Necroverso's "NECRO X" ability, now reworked to apply a curse card.
 * @param {object} caster - The Necroverso player object.
 * @param {object} target - The player being targeted by the ability.
 */
export async function triggerNecroX(caster, target) {
    const { gameState } = getState();
    
    // Check if target has any cards to replace
    if (target.hand.length === 0) {
        updateLog(`${caster.name} tentou usar Necro X, mas ${target.name} não tinha cartas!`);
        return;
    }

    gameState.necroXUsedThisRound = true;
    updateLog({ type: 'dialogue', speaker: caster.aiType, message: `${caster.name}: "Sinta o poder da escuridão!"` });

    playSoundEffect('x');
    document.body.classList.add('screen-shaking');
    animateNecroX();

    setTimeout(() => document.body.classList.remove('screen-shaking'), 400);
    await new Promise(res => setTimeout(res, 1000));

    // Choose a random card from the target's hand to replace
    const cardIndexToReplace = Math.floor(Math.random() * target.hand.length);
    const originalCard = target.hand[cardIndexToReplace];
    
    // Store the original card to give it back later
    target.replacedCardByNecroX = originalCard;
    
    // Create the curse card
    const curseCard = { 
        id: Date.now() + Math.random(), 
        type: 'effect', 
        name: 'NECRO_X_CURSE', 
        isBlocked: true // This card cannot be played
    };

    // Replace the original card with the curse card
    target.hand.splice(cardIndexToReplace, 1, curseCard);

    updateLog(`${caster.name} usou Necro X! Uma das cartas de ${target.name} foi substituída por uma maldição por 1 rodada!`);
    
    renderAll();
}

/**
 * Checks for and triggers special abilities based on where a pawn lands.
 * This is called at the end of a round after all movements are calculated.
 * @param {object} player The player whose landing position is being checked.
 */
export async function checkAndTriggerPawnLandingAbilities(player) {
    const { gameState } = getState();
    if (gameState.isPvp) return; // Server is authoritative in PvP
    if (!gameState.isStoryMode) return; // Only story mode has landing abilities

    // --- King Necro Battle: Heart Collection ---
    if (gameState.isKingNecroBattle) {
        const path = gameState.boardPaths[player.pathId];
        // Check if player is on the board
        if (path && player.position > 0) {
            const space = path.spaces[player.position - 1];
            if (space && space.hasHeart && !space.isUsed) {
                // Increment player's hearts, but not beyond their max
                player.hearts = Math.min(player.maxHearts || 6, player.hearts + 1);
                space.isUsed = true; // Mark space as used so heart cannot be collected again
                playSoundEffect('coracao');
                announceEffect('❤+', 'positive', 1000);
                updateLog(`${player.name} coletou um coração e recuperou uma vida! Total: ${player.hearts}`);
                renderAll(); // Rerender to update the UI immediately
            }
        }
    }

    // --- Contravox Ability: !OÃSUFNOC ---
    const isContravoxBattle = gameState.currentStoryBattle === 'contravox';
    const isPlayer1 = player.id === 'player-1';
    const triggerPositions = [3, 6, 9];
    const isOnTriggerPosition = triggerPositions.includes(player.position);

    if (isContravoxBattle && isPlayer1 && isOnTriggerPosition) {
        if (gameState.contravoxAbilityUses > 0) {
            gameState.player1CardsObscured = true;
            gameState.contravoxAbilityUses--;
            playSoundEffect('confusao');
            announceEffect('!OÃSUFNOC', 'reversus');
            updateLog({ type: 'dialogue', speaker: 'contravox', message: 'Contravox: "!oãçurtsnoc ed sateL"' });
            updateLog(`A habilidade do Contravox foi ativada! Suas cartas foram obscurecidas para a próxima rodada.`);
        }
    }
}

/**
 * Executes the logic for a specific field effect. Returns true on success, false on failure.
 * @param {object} player - The player who landed on the space.
 * @param {string} effectName - The name of the effect to execute.
 * @returns {Promise<boolean>} True if the effect was successfully applied, false otherwise.
 */
async function executeFieldEffect(player, effectName) {
    const { gameState } = getState();
    const isDuo = gameState.gameMode === 'duo' && !gameState.isFinalBoss;
    const playerTeamIds = isDuo ? (config.TEAM_A.includes(player.id) ? config.TEAM_A : config.TEAM_B) : [];
    const partner = isDuo ? gameState.players[playerTeamIds.find(id => id !== player.id)] : null;
    let targetPlayer;

    switch (effectName) {
        case 'Jogo Aberto':
            gameState.revealedHands = gameState.playerIdsInGame.filter(id => id !== player.id && !gameState.players[id].isEliminated);
            updateLog(`Efeito 'Jogo Aberto' ativado por ${player.name}! As mãos dos oponentes estão reveladas por esta rodada.`);
            return true;

        case 'Reversus Total':
            setTimeout(() => {
                announceEffect('Reversus Total!', 'reversus-total');
                playSoundEffect('reversustotal');
            }, 100);
            toggleReversusTotalBackground(true);
            gameState.reversusTotalActive = true;
            dom.appContainerEl.classList.add('reversus-total-active');
            dom.reversusTotalIndicatorEl.classList.remove('hidden');
            updateLog(`Efeito de Campo 'Reversus Total' ativado por ${player.name}!`);
            return true;

        case 'Carta Menor': {
            let playerSuccess = false, partnerSuccess = false;
            if (isDuo && partner) {
                const playerValueCards = player.hand.filter(c => c.type === 'value').sort((a,b) => a.value - b.value);
                if (playerValueCards.length > 0) {
                    const card = player.hand.splice(player.hand.findIndex(c => c.id === playerValueCards[0].id), 1)[0];
                    gameState.discardPiles.value.push(card);
                    const newCard = dealCard('value');
                    if (newCard) player.hand.push(newCard);
                    updateLog(`${player.name} descartou ${card.name} e comprou uma nova.`);
                    playerSuccess = true;
                }
                const partnerValueCards = partner.hand.filter(c => c.type === 'value').sort((a,b) => a.value - b.value);
                if (partnerValueCards.length > 0) {
                    const card = partner.hand.splice(partner.hand.findIndex(c => c.id === partnerValueCards[0].id), 1)[0];
                    gameState.discardPiles.value.push(card);
                    const newCard = dealCard('value');
                    if (newCard) partner.hand.push(newCard);
                    updateLog(`${partner.name} (parceiro) descartou ${card.name} e comprou uma nova.`);
                    partnerSuccess = true;
                }
                return playerSuccess || partnerSuccess;
            } else {
                const valueCards = player.hand.filter(c => c.type === 'value').sort((a,b) => a.value - b.value);
                if (valueCards.length === 0) {
                    updateLog(`'Carta Menor' falhou para ${player.name}: não há cartas de valor.`);
                    return false;
                }
                const card = player.hand.splice(player.hand.findIndex(c => c.id === valueCards[0].id), 1)[0];
                gameState.discardPiles.value.push(card);
                const newCard = dealCard('value');
                if (newCard) player.hand.push(newCard);
                updateLog(`${player.name} descartou sua carta de menor valor (${card.name}) e comprou uma nova.`);
                return true;
            }
        }

        case 'Carta Maior': {
            let playerSuccess = false, partnerSuccess = false;
            if (isDuo && partner) {
                 const playerValueCards = player.hand.filter(c => c.type === 'value').sort((a,b) => b.value - a.value);
                 if (playerValueCards.length > 0) {
                     const card = player.hand.splice(player.hand.findIndex(c => c.id === playerValueCards[0].id), 1)[0];
                     gameState.discardPiles.value.push(card);
                     const newCard = dealCard('value');
                     if (newCard) player.hand.push(newCard);
                     updateLog(`${player.name} descartou ${card.name} e comprou uma nova.`);
                     playerSuccess = true;
                 }
                 const partnerValueCards = partner.hand.filter(c => c.type === 'value').sort((a,b) => b.value - a.value);
                 if (partnerValueCards.length > 0) {
                     const card = partner.hand.splice(partner.hand.findIndex(c => c.id === partnerValueCards[0].id), 1)[0];
                     gameState.discardPiles.value.push(card);
                     const newCard = dealCard('value');
                     if (newCard) partner.hand.push(newCard);
                     updateLog(`${partner.name} (parceiro) descartou ${card.name} e comprou uma nova.`);
                     partnerSuccess = true;
                 }
                 return playerSuccess || partnerSuccess;
            } else {
                const valueCards = player.hand.filter(c => c.type === 'value').sort((a,b) => b.value - a.value);
                if (valueCards.length === 0) {
                    updateLog(`'Carta Maior' falhou para ${player.name}: não há cartas de valor.`);
                    return false;
                }
                const card = player.hand.splice(player.hand.findIndex(c => c.id === valueCards[0].id), 1)[0];
                gameState.discardPiles.value.push(card);
                const newCard = dealCard('value');
                if (newCard) player.hand.push(newCard);
                updateLog(`${player.name} descartou sua carta de maior valor (${card.name}) e comprou uma nova.`);
                return true;
            }
        }

        case 'Troca Justa': {
            if (isDuo && partner) {
                const pCards = player.hand.filter(c => c.type === 'value').sort((a,b) => a.value - b.value);
                const partnerCards = partner.hand.filter(c => c.type === 'value').sort((a,b) => a.value - b.value);
                if (pCards.length > 0 && partnerCards.length > 0) {
                    const cardToGive = pCards[0];
                    const cardToTake = partnerCards[partnerCards.length - 1];
                    player.hand.splice(player.hand.findIndex(c => c.id === cardToGive.id), 1, cardToTake);
                    partner.hand.splice(partner.hand.findIndex(c => c.id === cardToTake.id), 1, cardToGive);
                    updateLog(`Troca Justa (Dupla): ${player.name} trocou ${cardToGive.name} pela ${cardToTake.name} de ${partner.name}.`);
                    return true;
                }
                updateLog(`'Troca Justa' (Dupla) falhou: ${player.name} ou ${partner.name} não tinham cartas.`);
                return false;
            } else {
                const opponents = gameState.playerIdsInGame.filter(id => id !== player.id && !gameState.players[id].isEliminated);
                if (opponents.length === 0) return false;
                if (player.isHuman) {
                    dom.fieldEffectTargetTitle.textContent = 'Efeito: Troca Justa';
                    dom.fieldEffectTargetText.textContent = 'Escolha um oponente para trocar sua carta de valor mais baixa pela mais alta dele.';
                    dom.fieldEffectTargetButtons.innerHTML = opponents.map(id => `<button class="control-button target-player-${id.split('-')[1]}" data-player-id="${id}">${gameState.players[id].name}</button>`).join('');
                    dom.fieldEffectTargetModal.classList.remove('hidden');
                    const targetId = await new Promise(resolve => updateState('fieldEffectTargetResolver', resolve));
                    dom.fieldEffectTargetModal.classList.add('hidden');
                    if (!targetId) return false;
                    targetPlayer = gameState.players[targetId];
                } else {
                    targetPlayer = gameState.players[opponents[Math.floor(Math.random() * opponents.length)]];
                    updateLog(`${player.name} (IA) escolheu ${targetPlayer.name} para a Troca Justa.`);
                }
                const pCards = player.hand.filter(c => c.type === 'value').sort((a,b) => a.value - b.value);
                const targetCards = targetPlayer.hand.filter(c => c.type === 'value').sort((a,b) => a.value - b.value);
                if (pCards.length > 0 && targetCards.length > 0) {
                    const cardToGive = pCards[0];
                    const cardToTake = targetCards[targetCards.length - 1];
                    player.hand.splice(player.hand.findIndex(c => c.id === cardToGive.id), 1, cardToTake);
                    targetPlayer.hand.splice(targetPlayer.hand.findIndex(c => c.id === cardToTake.id), 1, cardToGive);
                    updateLog(`Troca Justa: ${player.name} trocou ${cardToGive.name} pela ${cardToTake.name} de ${targetPlayer.name}.`);
                    return true;
                }
                updateLog(`'Troca Justa' falhou: ${player.name} ou ${targetPlayer.name} não tinham cartas.`);
                return false;
            }
        }

        case 'Troca Injusta': {
             if (isDuo && partner) {
                const pCards = player.hand.filter(c => c.type === 'value').sort((a,b) => a.value - b.value);
                const partnerCards = partner.hand.filter(c => c.type === 'value').sort((a,b) => a.value - b.value);
                if (pCards.length > 0 && partnerCards.length > 0) {
                    const cardToGive = pCards[pCards.length - 1];
                    const cardToTake = partnerCards[0];
                    player.hand.splice(player.hand.findIndex(c => c.id === cardToGive.id), 1, cardToTake);
                    partner.hand.splice(partner.hand.findIndex(c => c.id === cardToTake.id), 1, cardToGive);
                    updateLog(`Troca Injusta (Dupla): ${player.name} trocou ${cardToGive.name} pela ${cardToTake.name} de ${partner.name}.`);
                    return true;
                }
                updateLog(`'Troca Injusta' (Dupla) falhou: ${player.name} ou ${partner.name} não tinham cartas.`);
                return false;
            } else {
                const opponents = gameState.playerIdsInGame.filter(id => id !== player.id && !gameState.players[id].isEliminated);
                if (opponents.length === 0) return false;
                targetPlayer = gameState.players[opponents[Math.floor(Math.random() * opponents.length)]];
                updateLog(`${player.name} ativou 'Troca Injusta'. O alvo aleatório é ${targetPlayer.name}.`);
                const pCards = player.hand.filter(c => c.type === 'value').sort((a,b) => a.value - b.value);
                const targetCards = targetPlayer.hand.filter(c => c.type === 'value').sort((a,b) => a.value - b.value);
                if (pCards.length > 0 && targetCards.length > 0) {
                    const cardToGive = pCards[pCards.length - 1];
                    const cardToTake = targetCards[0];
                    player.hand.splice(player.hand.findIndex(c => c.id === cardToGive.id), 1, cardToTake);
                    targetPlayer.hand.splice(targetPlayer.hand.findIndex(c => c.id === cardToTake.id), 1, cardToGive);
                    updateLog(`Troca Injusta: ${player.name} deu ${cardToGive.name} e recebeu ${cardToTake.name} de ${targetPlayer.name}.`);
                    return true;
                }
                updateLog(`'Troca Injusta' falhou: ${player.name} ou ${targetPlayer.name} não tinham cartas.`);
                return false;
            }
        }
        
        case 'Total Revesus Nada!': {
            let actionTaken = false;
            if (isDuo && partner) {
                const pEffectCards = player.hand.filter(c => c.type === 'effect');
                if (pEffectCards.length > 0) {
                    const card = pEffectCards[Math.floor(Math.random() * pEffectCards.length)];
                    player.hand.splice(player.hand.findIndex(c => c.id === card.id), 1);
                    gameState.discardPiles.effect.push(card);
                    updateLog(`${player.name} descartou ${card.name}.`);
                    actionTaken = true;
                }
                let discardedCount = 0;
                while (partner.hand.filter(c => c.type === 'effect').length > 1) {
                    const card = partner.hand.find(c => c.type === 'effect');
                    partner.hand.splice(partner.hand.findIndex(c => c.id === card.id), 1);
                    gameState.discardPiles.effect.push(card);
                    discardedCount++;
                    actionTaken = true;
                }
                if (discardedCount > 0) updateLog(`${partner.name} descartou ${discardedCount} carta(s) de efeito.`);
                return actionTaken;
            } else {
                const effectCards = player.hand.filter(c => c.type === 'effect');
                if (effectCards.length > 0) {
                    player.hand = player.hand.filter(c => c.type !== 'effect');
                    gameState.discardPiles.effect.push(...effectCards);
                    updateLog(`${player.name} descartou ${effectCards.length} cartas de efeito.`);
                    return true;
                }
                updateLog(`${player.name} não tinha cartas de efeito.`);
                return false;
            }
        }

        default:
            const isPositive = config.POSITIVE_EFFECTS.hasOwnProperty(effectName);
            const appliesToList = (isDuo && partner && ['Imunidade', 'Desafio', 'Impulso'].includes(effectName)) ? [player.id, partner.id] : [player.id];
            appliesToList.forEach(id => gameState.activeFieldEffects.push({ name: effectName, type: isPositive ? 'positive' : 'negative', appliesTo: id }));
            updateLog(`'${effectName}' está ativo para ${player.name}${appliesToList.length > 1 ? ' e sua dupla' : ''}.`);
            return true;
    }
}


/**
 * Triggers special effects based on where players are at the start of a round.
 * This is called from the turn manager after cards have been dealt.
 */
export async function triggerFieldEffects() {
    const { gameState } = getState();
    if (gameState.isPvp) return; // Server is authoritative in PvP
    const originalCurrentPlayer = gameState.currentPlayer;

    for (const id of gameState.playerIdsInGame) {
        const player = gameState.players[id];
        if (player.isEliminated || player.pathId === -1) continue;

        const path = gameState.boardPaths[player.pathId];
        if (!path || player.position < 1 || player.position > path.spaces.length) continue;
        
        const space = path.spaces[player.position - 1];

        if (space && !space.isUsed) {
            let effectWasHandled = false;
            let effectSucceeded = false;

            if (space.color === 'red' && player.aiType === 'reversum') {
                updateLog(`Rei Reversum é imune ao efeito da casa vermelha!`);
                effectWasHandled = true;
                effectSucceeded = true;
            }

            if (!effectWasHandled) {
                 switch (space.color) {
                    case 'black':
                        effectWasHandled = true;
                        effectSucceeded = true;
                        if (gameState.currentStoryBattle === 'necroverso_final') {
                             const teamA_Ids = ['player-1', 'player-4'];
                             if (teamA_Ids.includes(player.id)) {
                                gameState.teamA_hearts = Math.max(0, gameState.teamA_hearts - 1);
                                updateLog(`Sua equipe caiu em um buraco negro e perdeu 1 coração! Restam: ${gameState.teamA_hearts}`);
                             } else {
                                gameState.teamB_hearts = Math.max(0, gameState.teamB_hearts - 1);
                                updateLog(`A equipe do Necroverso caiu em um buraco negro e perdeu 1 coração! Restam: ${gameState.teamB_hearts}`);
                             }
                             playSoundEffect('coracao');
                             announceEffect('💔', 'heartbreak', 1500);
    
                             if (gameState.teamA_hearts <= 0 || gameState.teamB_hearts <= 0) {
                                const player1Won = gameState.teamB_hearts <= 0;
                                gameState.gamePhase = 'game_over';
                                document.dispatchEvent(new CustomEvent('storyWinLoss', { detail: { battle: gameState.currentStoryBattle, won: player1Won } }));
                                return;
                             }
                        } else {
                            playSoundEffect('destruido');
                            updateLog(`Jogador ${player.name} foi consumido por um buraco negro na casa ${space.id}!`);
                            player.isEliminated = true;
                            
                            const remainingPlayers = gameState.playerIdsInGame.filter(pId => !gameState.players[pId].isEliminated);
                            if (remainingPlayers.length <= 1 && gameState.isStoryMode) {
                                gameState.gamePhase = 'game_over';
                                const player1Won = remainingPlayers.includes('player-1');
                                document.dispatchEvent(new CustomEvent('storyWinLoss', { detail: { battle: gameState.currentStoryBattle, won: player1Won } }));
                                return;
                            }
                        }
                        break;
                    case 'yellow':
                        effectWasHandled = true;
                        effectSucceeded = true;
                        updateLog(`${player.name} parou na casa de Versatrix!`);
                        if (player.aiType === 'versatrix') {
                            player.position = Math.min(config.WINNING_POSITION, player.position + 1);
                            updateLog('Sendo Versatrix, ela avança uma casa!');
                        } else {
                            player.position = Math.max(1, player.position - 1);
                            updateLog('Como não é Versatrix, volta uma casa!');
                        }
                        dom.versatrixFieldModal.classList.remove('hidden');
                        await new Promise(resolve => {
                            const handler = () => {
                                dom.versatrixFieldContinueButton.removeEventListener('click', handler);
                                dom.versatrixFieldModal.classList.add('hidden');
                                resolve();
                            };
                            dom.versatrixFieldContinueButton.addEventListener('click', handler);
                        });
                        break;
    
                    case 'star':
                        effectWasHandled = true;
                        effectSucceeded = true;
                        playSoundEffect('conquista');
                        player.stars = (player.stars || 0) + 1;
                        updateLog(`Jogador ${player.name} coletou uma estrela! Total: ${player.stars}`);
                        break;
                }
            }
            
            if (space.effectName && !effectWasHandled) {
                const isPositive = space.color === 'blue';
                updateLog(`${player.name} parou em uma casa ${isPositive ? 'azul' : 'vermelha'}! Ativando efeito: ${space.effectName}`);
                
                const effectData = isPositive ? config.POSITIVE_EFFECTS[space.effectName] : config.NEGATIVE_EFFECTS[space.effectName];
                
                if (effectData && effectData.descriptionKey) {
                    dom.fieldEffectCardEl.className = `field-effect-card ${isPositive ? 'positive' : 'negative'}`;
                    dom.fieldEffectNameEl.textContent = space.effectName;
                    dom.fieldEffectDescriptionEl.textContent = t(effectData.descriptionKey);
                    dom.fieldEffectModal.classList.remove('hidden');
                    
                    await new Promise(resolve => {
                        const handler = () => {
                            dom.fieldEffectContinueButton.removeEventListener('click', handler);
                            dom.fieldEffectModal.classList.add('hidden');
                            resolve();
                        };
                        dom.fieldEffectContinueButton.addEventListener('click', handler);
                    });
                    
                    effectSucceeded = await executeFieldEffect(player, space.effectName);
                } else {
                    console.error(`Missing effect data for effect: ${space.effectName}`);
                    effectSucceeded = false;
                }
            }

            if (effectSucceeded) {
                space.isUsed = true;
            }
        }
    }
    
    gameState.currentPlayer = originalCurrentPlayer;
    renderAll();
}


/**
 * Makes an AI player "speak" a line of dialogue based on the game situation.
 * @param {object} player - The AI player object.
 */
export async function tryToSpeak(player) {
    const { gameState } = getState();
    const aiType = player.aiType;

    // Do not speak if this AI type has no dialogue configured
    if (!config.AI_DIALOGUE[aiType] || (!config.AI_DIALOGUE[aiType].winning && !config.AI_DIALOGUE[aiType].losing)) {
        return;
    }

    // Determine if the player is generally winning or losing based on board position
    const otherPlayerPositions = gameState.playerIdsInGame
        .filter(id => id !== player.id && !gameState.players[id].isEliminated)
        .map(id => gameState.players[id].position);
    
    if (otherPlayerPositions.length === 0) return; // No one else to compare to

    const avgOpponentPosition = otherPlayerPositions.reduce((a, b) => a + b, 0) / otherPlayerPositions.length;
    const status = player.position > avgOpponentPosition ? 'winning' : 'losing';
    const lines = config.AI_DIALOGUE[aiType][status];

    if (lines && lines.length > 0) {
        // Find a line that hasn't been said yet
        let lineToSay = lines.find(line => !gameState.dialogueState.spokenLines.has(`${aiType}-${line}`));
        
        // If all lines for this status have been said, reset them for this character and status
        if (!lineToSay) {
            lines.forEach(line => gameState.dialogueState.spokenLines.delete(`${aiType}-${line}`));
            lineToSay = lines[0]; // Say the first one again
        }
        
        if (lineToSay) {
            const translatedMessage = t(lineToSay);
            updateLog({ type: 'dialogue', speaker: aiType, message: `${player.name}: "${translatedMessage}"` });
            gameState.dialogueState.spokenLines.add(`${aiType}-${lineToSay}`);
            await new Promise(res => setTimeout(res, 500));
        }
    }
}