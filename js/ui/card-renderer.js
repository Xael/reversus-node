// js/ui/card-renderer.js
import { getState } from '../core/state.js';

/**
 * Gets the image URL for a given card.
 * @param {object} card - The card object.
 * @param {boolean} isHidden - Whether the card should be rendered face-down.
 * @returns {string} The URL of the card image.
 */
export const getCardImageUrl = (card, isHidden) => {
    if (isHidden) {
        return card.type === 'value' ? 'verso_valor.png' : 'verso_efeito.png';
    }
    if (card.name === 'NECRO_X_CURSE' || card.name === 'NECRO X') {
        return 'cartanecroverso.png';
    }
    if (card.name === 'Carta da Versatrix') {
        return 'cartaversatrix.png';
    }
    const cardNameSanitized = card.name.toString().toLowerCase().replace(/\s/g, '');
    return `frente_${cardNameSanitized}.png`;
};

/**
 * Creates the HTML for a single card.
 * @param {object} card - The card object to render.
 * @param {string} context - The context in which the card is being rendered (e.g., 'player-hand', 'opponent-hand', 'play-zone').
 * @param {string} playerId - The ID of the player associated with the card.
 * @returns {string} The HTML string for the card.
 */
export const renderCard = (card, context, playerId) => {
    const { gameState, playerId: myPlayerId } = getState();
    const classList = ['card', card.type];
    const player = gameState.players[playerId];

    let isHidden;
    if (context === 'play-zone' || context === 'modal' || context === 'floating-hand') {
        isHidden = false;
    } else if (gameState.isPvp) {
        const isMyCard = playerId === myPlayerId;
        isHidden = !isMyCard && !(gameState.revealedHands || []).includes(playerId);
    } else {
        const isHumanPlayer = player ? player.isHuman : false;
        isHidden = !isHumanPlayer && !(gameState.revealedHands || []).includes(playerId);
    }
    
    // Specter's ability: Hide cards in play zone during the 'playing' phase.
    if (player && player.aiType === 'oespectro' && context === 'play-zone' && gameState.gamePhase === 'playing') {
        isHidden = true;
    }

    const isMyTurnToSeeObscured = gameState.isPvp ? (playerId === myPlayerId) : (gameState.players[playerId]?.isHuman);
    const isCardObscuredByContravox = isMyTurnToSeeObscured && (context === 'player-hand' || context === 'floating-hand') && gameState.player1CardsObscured;

    let isCardDisabled = card.isBlocked || card.isFrozen || false;
    if (isMyTurnToSeeObscured && (context === 'player-hand' || context === 'floating-hand')) {
        const valueCardsInHandCount = player.hand.filter(c => c.type === 'value').length;
        
        if (card.type === 'value' && (valueCardsInHandCount <= 1 || player.playedValueCardThisTurn)) {
             isCardDisabled = true;
        }
    }
    
    if (isMyTurnToSeeObscured && (context === 'player-hand' || context === 'floating-hand') && gameState.selectedCard?.id === card.id) {
        classList.push('selected');
    }
    if (isCardDisabled) classList.push('disabled');
    if (context === 'modal') classList.push('modal-card');
    
    if (card.name === 'Reversus Total') {
        classList.push('reversus-total-card');
        if (isMyTurnToSeeObscured) {
            classList.push('reversus-total-glow');
        }
    }
    
    if (card.isLocked) {
        classList.push('locked');
    }
    
    if (context === 'play-zone' && card.casterId) {
        const caster = gameState.players[card.casterId];
        if (caster && caster.aiType === 'necroverso') {
            classList.push('necro-glow');
        }
    }
    
    let cardTitle = '';
    if (isCardObscuredByContravox && card.type === 'effect') {
        cardTitle = 'title="Não é possível saber qual efeito será aplicado..."';
    }
    if (card.name === 'NECRO_X_CURSE') {
        cardTitle = 'title="Esta carta está amaldiçoada e não pode ser jogada."';
    }
    if (card.isFrozen) {
        cardTitle = 'title="Esta carta está congelada e não pode ser jogada nesta rodada."';
    }


    let cardStyle;
    if (isCardObscuredByContravox) {
        cardStyle = `style="background-image: url('cartacontravox.png');"`;
    } else {
        cardStyle = `style="background-image: url('./${getCardImageUrl(card, isHidden)}');"`;
    }
    
    const maximizeButtonHTML = !isHidden && !isCardObscuredByContravox ? '<div class="card-maximize-button" title="Ver carta"></div>' : '';

    return `<div class="${classList.join(' ')}" data-card-id="${card.id}" ${cardTitle} ${isCardDisabled ? 'aria-disabled="true"' : ''} ${cardStyle}>
                ${maximizeButtonHTML}
            </div>`;
};