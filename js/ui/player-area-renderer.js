// js/ui/player-area-renderer.js
import * as dom from '../core/dom.js';
import * as config from '../core/config.js';
import { getState } from '../core/state.js';
import { getCardImageUrl, renderCard } from './card-renderer.js';
import { t } from '../core/i18n.js';

/**
 * Renders a single player's entire area, including header, hand, and play zone.
 * @param {object} player - The player object to render.
 */
export const renderPlayerArea = (player) => {
    const playerEl = document.getElementById(`player-area-${player.id}`);
    if (!playerEl) return;
    
    const { gameState, playerId: myPlayerId } = getState();
    const pIdNum = parseInt(player.id.split('-')[1]);

    // Apply classes for styling
    playerEl.className = 'player-area'; // Reset
    playerEl.classList.add(`p${pIdNum}-bg`);
    if (player.id === gameState.currentPlayer) playerEl.classList.add('active');
    if (player.isEliminated) playerEl.classList.add('eliminated');

    // Special AI glow effects
    const glowMap = {
        'contravox': 'contravox-glow',
        'versatrix': 'versatrix-glow',
        'reversum': 'reversum-glow'
    };
    if (glowMap[player.aiType]) {
        playerEl.classList.add(glowMap[player.aiType]);
    }
    if (player.aiType === 'necroverso_tutorial') {
        playerEl.classList.add('player-area-necro-tutorial');
    }
    if (player.aiType === 'necroverso_final') {
        playerEl.classList.add('player-area-necro-final');
    }
     if (gameState.isInversusMode) {
        playerEl.classList.add('inversus-bg');
    }
    if(gameState.currentStoryBattle === 'xael_challenge' && player.aiType === 'xael') {
        playerEl.classList.add('xael-portrait-bg');
    }

    const isMyArea = (gameState.isPvp && player.id === myPlayerId) || (!gameState.isPvp && player.isHuman);
    
    let handHTML = '';
    // Only render the hand area for opponents. The main player's hand is now in the floating overlay.
    if (!isMyArea) {
        const context = 'opponent-hand';
        handHTML = `<div class="player-hand" id="hand-${player.id}">${player.hand.map(card => renderCard(card, context, player.id)).join('')}</div>`;
    }

    const playZoneSlots = [
        { label: 'Valor 1', card: player.playedCards.value[0] },
        { label: 'Valor 2', card: player.playedCards.value[1] },
        { label: 'Pontuação', card: player.playedCards.effect.find(c => ['Mais', 'Menos', 'Carta da Versatrix', 'NECRO X', 'NECRO X Invertido', 'Estrela Subente'].includes(c.name) || (c.isLocked && ['Mais', 'Menos'].includes(c.lockedEffect)) || (c.name === 'Reversus' && c.reversedEffectType === 'score')) },
        { label: 'Movimento', card: player.playedCards.effect.find(c => ['Sobe', 'Desce', 'Pula'].includes(c.name) || (c.isLocked && ['Sobe', 'Desce'].includes(c.lockedEffect)) || (c.name === 'Reversus' && c.reversedEffectType === 'movement')) },
        { label: 'Reversus T.', card: player.playedCards.effect.find(c => c.name === 'Reversus Total' && !c.isLocked) }
    ];

    const playZoneHTML = `
        <div class="play-zone">
            ${playZoneSlots.map(slot => `
                <div class="play-zone-slot" data-label="${slot.label}">
                    ${slot.card ? renderCard(slot.card, 'play-zone', player.id) : ''}
                </div>
            `).join('')}
        </div>`;
        
    const headerHTML = renderPlayerHeader(player);
    
    playerEl.innerHTML = `
        ${headerHTML}
        ${playZoneHTML}
        ${handHTML}
    `;

    const portraitMap = {
        'necroverso_tutorial': { src: './necroverso.png', class: 'player-area-character-portrait necro-tutorial-portrait' },
        'contravox': { src: './contravox.png', class: 'player-area-character-portrait contravox-portrait' },
        'versatrix': { src: './versatrix.png', class: 'player-area-character-portrait versatrix-portrait' },
        'reversum': { src: './reversum.png', class: 'player-area-character-portrait reversum-portrait' },
        'necroverso_king': { src: './necroverso.png', class: 'player-area-character-portrait' },
        'necroverso_final': { src: './necroverso2.png', class: 'player-area-character-portrait final-boss-glow' },
        'narrador': { src: './narrador.png', class: 'player-area-character-portrait effect-glitch' },
        'xael': { src: './xaeldesafio.png', class: 'player-area-character-portrait xael-glow' },
        'inversus': { src: './INVERSUM1.png', class: 'inversus-character-portrait', id: 'inversus-character-portrait' }
    };
    
    config.MONTHLY_EVENTS.forEach(event => {
        portraitMap[event.ai] = { src: `./${event.image}`, class: 'player-area-character-portrait' };
    });

    let portraitSrc = null;
    let portraitClass = 'player-area-character-portrait';
    let portraitId = null;

    // Priority 1: A specific avatar_url on the player object (from PvP, Infinite Challenge, equipped avatar)
    if (player.avatar_url) {
        portraitSrc = player.avatar_url.startsWith('http') ? player.avatar_url : `./${player.avatar_url}`;
        // Add special glows based on AI type even if they use a generic avatar
        if (player.aiType === 'oespectro') portraitClass += ' specter-glow';

    } 
    // Priority 2: Fallback to the story/event map based on aiType for characters without a specific avatar_url
    else {
        const portraitInfo = portraitMap[player.aiType];
        if (portraitInfo) {
            portraitSrc = portraitInfo.src;
            portraitClass = portraitInfo.class;
            if (portraitInfo.id) portraitId = portraitInfo.id;
        }
    }

    if (portraitSrc) {
        const portraitImg = document.createElement('img');
        portraitImg.src = portraitSrc;
        portraitImg.className = portraitClass;
        if (portraitId) portraitImg.id = portraitId;
        playerEl.appendChild(portraitImg);
    }
};

/**
 * Creates the HTML for a player's header area, including name, stats, and status.
 * @param {object} player - The player object.
 * @returns {string} The HTML string for the player header.
 */
function renderPlayerHeader(player) {
    const { gameState } = getState();
    
    const pathDisplay = player.pathId === -1 ? 'N/A' : player.pathId + 1;
    const effectText = [player.effects.score, player.effects.movement]
        .filter(Boolean) // Remove null/undefined effects
        .map(e => e.toUpperCase())
        .join(' / ') || t('game.none');
    
    const restoValue = player.resto ? player.resto.value : 'N/A';
    const scoreValue = (player.aiType === 'oespectro' && gameState.gamePhase === 'playing') ? '??' : (player.liveScore || 0);

    const activeFieldEffect = (gameState.activeFieldEffects || []).find(fe => fe.appliesTo === player.id);

    const nameClasses = ['player-name', `player-${player.id.split('-')[1]}`];
    if (player.aiType === 'necroverso') nameClasses.push('necro');
    if (player.aiType === 'xael') nameClasses.push('xael');
    if (player.aiType === 'necroverso_final') nameClasses.push('final-boss-glow');
    if (gameState.isInversusMode && !player.isHuman) nameClasses.push('inversus-name-glow');

    const revealedIcon = (gameState.revealedHands || []).includes(player.id) ? '<div class="revealed-icon" title="Mão revelada"></div>' : '';

    let heartsOrStarsHTML = '';
    if (gameState.isInversusMode) {
        heartsOrStarsHTML = `<div class="inversus-hearts-container">${'❤'.repeat(player.hearts)}</div>`;
    }
    if (gameState.isKingNecroBattle) {
        heartsOrStarsHTML = `<div class="player-hearts-container" title="Corações restantes">${'❤'.repeat(player.hearts)}</div>`;
    }
    if (gameState.isXaelChallenge) {
        heartsOrStarsHTML = `<div class="player-star-counter" title="Estrelas de Xael">⭐ ${player.stars}</div>`;
    }

    const fieldEffectHTML = activeFieldEffect ? `
        <div class="field-effect-indicator" title="${t('game.field_effect_indicator_title', { effectName: activeFieldEffect.name })}" data-player-id="${player.id}">
            <div class="field-effect-square" style="background-color: ${activeFieldEffect.type === 'positive' ? 'var(--accent-blue)' : 'var(--accent-red)'};"></div>
            <span>${t('game.field_effect_indicator')}</span>
        </div>
    ` : '';

    const coinversusHTML = gameState.betAmount > 0 ? `
        <span class="stat-item" title="${t('game.coinversus_header_title')}">🪙 <strong>${player.coinversus !== undefined ? player.coinversus : '...'}</strong></span>
    ` : '';

    const positionDisplay = gameState.isInfiniteChallenge ? gameState.infiniteChallengeLevel : player.position;

    return `
        <div class="player-header">
            <div class="opponent-header-top">
                 <div class="player-name-container">
                    <span class="${nameClasses.join(' ')}">${player.name}</span>
                    ${revealedIcon}
                </div>
                 <div class="player-header-right">
                    ${heartsOrStarsHTML}
                 </div>
            </div>
            <div class="player-stats">
                 <span class="stat-item" title="${t('game.score_header_title')}">${t('game.score_header')}: <strong>${scoreValue}</strong></span>
                 ${coinversusHTML}
                 <span class="stat-item" title="${t('game.resto_header_title')}">${t('game.resto_header')}: <strong>${restoValue}</strong></span>
                 <span class="stat-item" title="${t('game.path_header_title')}">${t('game.path_header')}: <strong>${pathDisplay}</strong></span>
                 <span class="stat-item" title="${t('game.house_header_title')}">${gameState.isInfiniteChallenge ? t('ranking.header_level') : t('game.house_header')}: <strong>${positionDisplay}</strong></span>
                 <span class="stat-item" title="${t('game.effect_header_title')}">${t('game.effect_header')}: <strong>${effectText}</strong></span>
                 ${fieldEffectHTML}
            </div>
        </div>
    `;
}