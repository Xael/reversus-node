// js/game-logic/card-effects.js

import { getState, updateState } from '../core/state.js';
import { updateLog, dealCard } from '../core/utils.js';
import { playSoundEffect, announceEffect } from '../core/sound.js';
import { toggleReversusTotalBackground } from '../ui/animations.js';
import * as dom from '../core/dom.js';
import { triggerXaelChallengePopup } from '../story/story-abilities.js';
import { renderAll } from '../ui/ui-renderer.js';

export async function applyEffect(card, targetId, casterId, effectTypeToReverse, options) {
    const { gameState } = getState();
    const target = gameState.players[targetId];
    const caster = gameState.players[casterId];
    if (!target || !caster) return;

    // --- TOURNAMENT MODE LOGIC ---
    if (gameState.isTournamentMatch) {
        const cardName = card.name;
        const allPlayers = Object.values(gameState.players);
        
        // Helper to play sound and announce tournament-specific effects
        const playTournamentEffectSound = (name) => {
            const soundToPlay = name.toString().toLowerCase().replace(/\s/g, '');
            setTimeout(() => playSoundEffect(soundToPlay), 100);
            setTimeout(() => announceEffect(name), 150);
        };

        switch (cardName) {
            case 'Sobe':
            case 'Desce':
                // The last effect played is the one that counts.
                // It's applied to the target, and we record who cast it.
                target.tournamentScoreEffect = { effect: cardName, casterId: caster.id };
                updateLog(`${caster.name} usou ${cardName} em ${target.name}.`);
                playTournamentEffectSound(cardName);
                return;

            case 'Pula':
                if (target.tournamentScoreEffect) {
                    const stolenEffect = { ...target.tournamentScoreEffect };
                    target.tournamentScoreEffect = null; // Remove effect from target
                    
                    // Give the stolen effect to the caster of Pula
                    caster.tournamentScoreEffect = { effect: stolenEffect.effect, casterId: caster.id };
                    updateLog(`${caster.name} usou Pula e roubou o efeito '${stolenEffect.effect}' de ${target.name}!`);
                } else {
                    updateLog(`${caster.name} usou Pula em ${target.name}, mas não havia efeito para roubar.`);
                }
                playTournamentEffectSound(cardName);
                return;

            case 'Reversus':
                if (target.tournamentScoreEffect) {
                    const effectToReverse = target.tournamentScoreEffect;
                    const originalCasterId = effectToReverse.casterId;
                    const originalEffect = effectToReverse.effect;

                    // Special case: reclaim stolen effect
                    if (target.id !== originalCasterId && caster.id === originalCasterId) {
                        target.tournamentScoreEffect = null; // Remove from target
                        caster.tournamentScoreEffect = { effect: originalEffect, casterId: caster.id }; // Reclaim it
                        updateLog(`${caster.name} usou Reversus e recuperou seu efeito '${originalEffect}' de ${target.name}!`);
                    } else {
                        // Standard inversion
                        const newEffect = originalEffect === 'Sobe' ? 'Desce' : 'Sobe';
                        target.tournamentScoreEffect.effect = newEffect;
                        updateLog(`${caster.name} usou Reversus e inverteu o efeito em ${target.name} para '${newEffect}'!`);
                    }
                } else {
                    updateLog(`${caster.name} usou Reversus em ${target.name}, mas não havia efeito para reverter.`);
                }
                playTournamentEffectSound(cardName);
                return;
            
            case 'Mais':
            case 'Menos':
            case 'Reversus Total':
                // These cards have no effect in tournament mode as per the new rules.
                updateLog(`A carta ${cardName} não tem efeito especial no modo Torneio.`);
                return;
        }
    }
    // --- END OF TOURNAMENT MODE LOGIC ---

    let effectName;
    // Correctly determine the effect name, especially for locked Reversus Total
    if (card.isLocked) {
        effectName = card.lockedEffect;
    } else {
        effectName = card.name;
    }

    // --- Habilidades de Evento Passivas ---
    // Habilidade do Dragão Dourado: Ignora 1 efeito negativo por turno.
    if (target.isEventBoss && target.aiType === 'dragaodourado' && !target.eventAbilityUsedThisTurn && ['Menos', 'Desce', 'Pula'].includes(effectName)) {
        updateLog(`Dragão Dourado usou sua habilidade e ignorou o efeito de ${effectName}!`);
        target.eventAbilityUsedThisTurn = true;
        return; // Efeito é ignorado
    }

    // Check for field effect immunity AND the player's own immunity buff from Infinite Challenge
    if (((gameState.activeFieldEffects || []).some(fe => fe.name === 'Imunidade' && fe.appliesTo === targetId) || target.isImmuneToNegativeEffects) && (effectName === 'Menos' || effectName === 'Desce')) {
        updateLog(`${target.name} está imune a ${effectName} nesta rodada!`);
        return; // Buff lasts for the whole duel, so we don't consume it here.
    }


    const getInverseEffect = (effect) => {
        const map = { 'Mais': 'Menos', 'Menos': 'Mais', 'Sobe': 'Desce', 'Desce': 'Sobe', 'NECRO X': 'NECRO X Invertido', 'NECRO X Invertido': 'NECRO X' };
        return map[effect] || null;
    };

    if (gameState.reversusTotalActive && effectName !== 'Reversus Total') {
        const inverted = getInverseEffect(effectName);
        if (inverted) {
            updateLog(`Reversus Total inverteu ${card.name} para ${inverted}!`);
            effectName = inverted;
        }
    }
    
    // Play sound and announce effect
    const soundToPlay = effectName.toString().toLowerCase().replace(/\s/g, '');
    const effectsWithSounds = ['mais', 'menos', 'sobe', 'desce', 'pula', 'reversus'];

    if (card.isLocked) {
        announceEffect("REVERSUS INDIVIDUAL!", 'reversus');
        playSoundEffect('reversustotal');
    } else if (effectsWithSounds.includes(soundToPlay)) {
        setTimeout(() => playSoundEffect(soundToPlay), 100);
        setTimeout(() => announceEffect(effectName), 150);
    } else if (card.name !== 'Carta da Versatrix' && card.name !== 'Reversus Total') {
        setTimeout(() => announceEffect(effectName), 150);
    }


    switch (effectName) {
        case 'Mais': case 'Menos': case 'NECRO X': case 'NECRO X Invertido':
            target.effects.score = effectName;
            break;
        case 'Sobe': case 'Desce':
            target.effects.movement = effectName;
            break;
        case 'Pula':
            target.effects.movement = effectName;
            // NEW BUFF LOGIC for pula_draw_effect
            if (caster.hasPulaDrawEffect && casterId === targetId) {
                const newCard = dealCard('effect');
                if (newCard) {
                    caster.hand.push(newCard);
                    updateLog(`${caster.name} usou Pula em si mesmo e comprou uma nova carta de efeito.`);
                }
            }
            break;
        case 'Reversus': {
            const targetScoreEffectCard = target.playedCards.effect.find(c => ['Mais', 'Menos'].includes(c.name) || (c.isLocked && ['Mais', 'Menos'].includes(c.lockedEffect)));
            const targetMoveEffectCard = target.playedCards.effect.find(c => ['Sobe', 'Desce', 'Pula'].includes(c.name) || (c.isLocked && ['Sobe', 'Desce'].includes(c.lockedEffect)));

            if (effectTypeToReverse === 'score' && targetScoreEffectCard?.isLocked) {
                updateLog(`Ação bloqueada! O efeito ${target.effects.score} em ${target.name} está travado por um Reversus Individual e não pode ser revertido!`);
                return; 
            }
             if (effectTypeToReverse === 'movement' && targetMoveEffectCard?.isLocked) {
                updateLog(`Ação bloqueada! O efeito ${target.effects.movement} em ${target.name} está travado por um Reversus Individual e não pode ser revertido!`);
                return; 
            }
            
            if (effectTypeToReverse === 'score') {
                target.effects.score = getInverseEffect(target.effects.score);
                updateLog(`${caster.name} usou ${card.name} em ${target.name} para reverter efeito de pontuação para ${target.effects.score || 'Nenhum'}.`);
            } else if (effectTypeToReverse === 'movement') {
                if (target.effects.movement === 'Pula') {
                    target.effects.movement = null;
                    updateLog(`${caster.name} anulou o efeito 'Pula' de ${target.name} com Reversus!`);
                } else {
                    target.effects.movement = getInverseEffect(target.effects.movement);
                    updateLog(`${caster.name} usou ${card.name} em ${target.name} para reverter efeito de movimento para ${target.effects.movement || 'Nenhum'}.`);
                }
            }
            break;
        }
        case 'Reversus Total': {
            setTimeout(() => {
                announceEffect('Reversus Total!', 'reversus-total');
                playSoundEffect('reversustotal');
            }, 100);
            toggleReversusTotalBackground(true);
            gameState.reversusTotalActive = true;
            dom.appContainerEl.classList.add('reversus-total-active');
            dom.reversusTotalIndicatorEl.classList.remove('hidden');
            Object.values(gameState.players).forEach(p => {
                const scoreEffectCard = p.playedCards.effect.find(c => ['Mais', 'Menos', 'NECRO X', 'NECRO X Invertido'].includes(c.name) || (c.name === 'Reversus' && c.reversedEffectType === 'score'));
                if (p.effects.score && !scoreEffectCard?.isLocked) {
                    p.effects.score = getInverseEffect(p.effects.score);
                }
                const moveEffectCard = p.playedCards.effect.find(c => ['Sobe', 'Desce', 'Pula'].includes(c.name) || (c.name === 'Reversus' && c.reversedEffectType === 'movement'));
                if (p.effects.movement && p.effects.movement !== 'Pula' && !moveEffectCard?.isLocked) {
                    p.effects.movement = getInverseEffect(p.effects.movement);
                }
            });
            updateLog(`${caster.name} ativou o Reversus Total!`);
            
            // XAEL POPUP TRIGGER
            triggerXaelChallengePopup();
            return;
        }
        case 'Carta da Versatrix': {
            // Show info modal
            dom.versatrixCardInfoModal.classList.remove('hidden');
            await new Promise(resolve => {
                const handler = () => {
                    dom.versatrixCardInfoContinueButton.removeEventListener('click', handler);
                    dom.versatrixCardInfoModal.classList.add('hidden');
                    resolve();
                };
                dom.versatrixCardInfoContinueButton.addEventListener('click', handler);
            });

            // Apply the +2 card effect
            for (let i = 0; i < 2; i++) {
                const newCard = dealCard('effect');
                if (newCard) {
                    target.hand.push(newCard);
                }
            }
            updateLog(`${caster.name} usou a ${card.name}, comprando 2 cartas de efeito.`);

            // Set cooldown on the card object itself
            card.cooldown = 3; 
            
            // This card is a one-off effect, it doesn't apply a persistent score/movement effect
            // We remove it from the play zone immediately and put it back in the caster's hand
            const cardIndexInPlay = target.playedCards.effect.findIndex(c => c.id === card.id);
            if (cardIndexInPlay > -1) {
                const [removedCard] = target.playedCards.effect.splice(cardIndexInPlay, 1);
                if(caster) {
                    caster.hand.push(removedCard);
                } else {
                    // Fallback: if caster not found, discard it to prevent card loss
                    gameState.discardPiles.effect.push(removedCard);
                }
            }
            
            renderAll(); // Re-render to show new cards and cooldown
            break;
        }
    }

    if (card.isLocked) {
        updateLog(`${caster.name} usou Reversus Individual para travar o efeito ${effectName} em ${target.name}.`);
    } else if (card.name !== 'Pula' && card.name !== 'Reversus' && card.name !== 'Reversus Total' && card.name !== 'Carta da Versatrix') {
        // This covers Mais, Menos, Sobe, Desce
        updateLog(`${caster.name} usou ${card.name} em ${target.name} para aplicar o efeito ${effectName}.`);
    }
}