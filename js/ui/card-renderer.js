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

    const name = String(card.name);

    // Using a map is more robust than string manipulation.
    const fixedImageMap = {
        "2": "frente_2.png",
        "4": "frente_4.png",
        "6": "frente_6.png",
        "8": "frente_8.png",
        "10": "frente_10.png",
        "Mais": "mais_frente.png",
        "Menos": "menos_frente.png",
        "Sobe": "sobe_frente.png",
        "Desce": "desce_frente.png",
        "Pula": "pular_frente.png",
        "Reversus": "reversus_frente.png",
        "Reversus Total": "reversustotal_frente.png",
        'NECRO_X_CURSE': 'cartanecroverso.png',
        'NECRO X': 'cartanecroverso.png',
        'Carta da Versatrix': 'cartaversatrix.png'
    };

    // Return the correct image or a fallback if the name is not found
    return fixedImageMap[name] || (card.type === 'value' ? 'verso_valor.png' : 'verso_efeito.png');
};


/**
 * Creates the HTML for a single card.
 * @param {object} card - The card object to render.
 * @param {string} context - The context in which the card is being rendered (e.g., 'player-hand', 'opponent-hand', 'play-zone', 'overlay-hand').
 * @param {string} playerId - The ID of the player associated with the card.
 * @returns {string} The HTML string for the card.
 */
export const renderCard = (card, context, playerId) => {
    const { gameState, playerId: myPlayerId } = getState();
    const classList = ['card', card.type];

    const player = gameState.players[playerId];
    const isMyCardContext = (gameState.isPvp && player.id === myPlayerId) || (!gameState.isPvp && player.isHuman);

    let isHidden;
    if (context === 'play-zone' || context === 'modal' || context === 'overlay-hand') {
        // Cards in these contexts are always face-up.
        isHidden = false;
    } else {
        // Visibility for hands depends on perspective and game state.
        isHidden = !isMyCardContext && !(gameState.revealedHands || []).includes(playerId);
    }

    // Logic to obscure cards (Contravox ability)
    const isCardObscuredByContravox = isMyCardContext && context === 'player-hand' && gameState.player1CardsObscured;

    let isCardDisabled = card.isBlocked || false;
    if (isMyCardContext && (context === 'player-hand' || context === 'overlay-hand')) {
        const valueCardsInHandCount = player.hand.filter(c => c.type === 'value').length;
        
        if (card.type === 'value' && (valueCardsInHandCount <= 1 || player.playedValueCardThisTurn)) {
             isCardDisabled = true;
        }
    }
    
    if (isMyCardContext && (context === 'player-hand' || context === 'overlay-hand') && gameState.selectedCard?.id === card.id) {
        classList.push('selected');
    }
    if (isCardDisabled) classList.push('disabled');
    if (context === 'modal') classList.push('modal-card');
    
    if (card.name === 'Reversus Total') {
        classList.push('reversus-total-card');
        if (isMyCardContext) {
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