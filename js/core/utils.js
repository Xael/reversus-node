import { getState } from './state.js';
import * as dom from './dom.js';
import * as config from './config.js';
import { createDeck } from '../game-logic/deck.js';

/**
 * Handles dealing a card from a specified deck, reshuffling from the discard pile if empty.
 * This function is now more robust and centralized.
 * @param {('value'|'effect')} deckType - The type of deck to draw from.
 * @returns {object | null} The card object, or null if no cards are available.
 */
export function dealCard(deckType) {
    const { gameState } = getState();
    if (gameState.decks[deckType].length === 0) {
        if (gameState.discardPiles[deckType].length === 0) {
            const configDeck = deckType === 'value' ? config.VALUE_DECK_CONFIG : config.EFFECT_DECK_CONFIG;
            gameState.decks[deckType] = shuffle(createDeck(configDeck, deckType));
            updateLog(`O baralho de ${deckType} e o descarte estavam vazios. Um novo baralho foi criado.`);
            if (gameState.decks[deckType].length === 0) {
                 console.error(`Falha catastrófica ao recriar o baralho de ${deckType}`);
                 return null;
            }
        } else {
            gameState.decks[deckType] = shuffle([...gameState.discardPiles[deckType]]);
            gameState.discardPiles[deckType] = [];
        }
    }
    return gameState.decks[deckType].pop();
}


/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 * @param {Array} array The array to shuffle.
 * @returns {Array} The shuffled array.
 */
export const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

/**
 * Adds a message to the in-game log and updates the UI. Can also be called without a message to just re-render from the current state.
 * @param {string | object} [logEntry] - The message string or a log object with metadata.
 */
export const updateLog = (logEntry) => {
    const { gameState, chatFilter, userProfile } = getState();
    if (!gameState) return;

    if (logEntry) {
        const entry = typeof logEntry === 'string' ? { type: 'system', message: logEntry } : logEntry;
        gameState.log.push(entry);
    }
    
    // Trim the log to a reasonable size, removing the oldest messages from the start.
    if (gameState.log.length > 100) { // Increased log size
        gameState.log.shift();
    }
    
    const emojiMap = {
        ':)': '😊',
        ':(': '😞',
        ';(': '😭',
        's2': '❤️',
        '<3': '❤️'
    };

    const filteredLog = gameState.log.filter(m => {
        if (chatFilter === 'log') return m.type === 'system';
        if (chatFilter === 'chat') return m.type === 'dialogue';
        return true; // 'all'
    });

    dom.logEl.innerHTML = filteredLog.map(m => {
        const sanitizedMessage = String(m.message || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const emojiMessage = sanitizedMessage.replace(/:\)|:\(|;\(|s2|&lt;3|<3/gi, (match) => emojiMap[match.toLowerCase()] || match);

        if (m.type === 'dialogue' && m.speaker) {
            const myGoogleId = userProfile?.google_id;
            const isMyMessage = m.googleId === myGoogleId || (m.speaker === userProfile?.username && !m.googleId);

            const reportButton = !isMyMessage && m.googleId ? 
                `<button class="report-button" title="Denunciar jogador por má conduta" data-google-id="${m.googleId}" data-username="${m.speaker}" data-message="${sanitizedMessage}">🚩</button>` 
                : '';
            
            let speakerClass = '';
            // Find the player by username to get their ID ('player-1', etc.)
            const playerEntry = Object.values(gameState.players).find(p => p.name === m.speaker);
            if (playerEntry) {
                speakerClass = `speaker-${playerEntry.id}`; 
            } else if (config.AI_CHAT_PERSONALITIES.hasOwnProperty(m.speaker)) {
                speakerClass = `speaker-${m.speaker}`;
            } else {
                 // Fallback for human player if not found in players list (e.g., before game start)
                speakerClass = 'speaker-player-1';
            }
            
            return `<div class="log-message dialogue ${speakerClass}"><span class="message-content"><strong>${m.speaker}:</strong> ${emojiMessage}</span>${reportButton}</div>`;
        }
        return `<div class="log-message system"><span class="message-content">${emojiMessage}</span></div>`;
    }).join('');
    
    // Use a timeout to ensure the DOM has been updated before we try to scroll.
    // This robustly fixes issues where scrolling happens before the new content is rendered.
    setTimeout(() => {
        if (dom.logEl) {
            dom.logEl.scrollTop = dom.logEl.scrollHeight;
        }
    }, 0);
};