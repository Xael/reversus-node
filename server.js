// server.js --- SERVIDOR DE JOGO PVP COMPLETO COM BANCO DE DADOS ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { OAuth2Client } = require('google-auth-library');
const db = require('./db.js');

const app = express();
const server = http.createServer(app);

// --- Static File Serving ---
app.use(express.static('.')); 
// -----------------------------------------


const GOOGLE_CLIENT_ID = "2701468714-udbjtea2v5d1vnr8sdsshi3lem60dvkn.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const ADMIN_EMAIL = 'alexblbn@gmail.com';

const io = new Server(server, {
  cors: {
    origin: ["https://reversus.online", "https://reversus-game.dke42d.easypanel.host", "http://localhost:8080"],
    methods: ["GET", "POST"]
  }
});

const rooms = {};
const onlineUsers = new Map(); // Key: userId (DB id), Value: { socketId, username, avatar_url, google_id }
const userSockets = new Map(); // Key: socket.id, Value: userId (DB id)

// --- LÓGICA DE JOGO ---
const VALUE_DECK_CONFIG = [{ value: 2, count: 12 }, { value: 4, count: 10 }, { value: 6, count: 8 }, { value: 8, count: 6 }, { value: 10, count: 4 }];
const EFFECT_DECK_CONFIG = [{ name: 'Mais', count: 4 }, { name: 'Menos', count: 4 }, { name: 'Sobe', count: 4 }, { name: 'Desce', count: 4 }, { name: 'Pula', count: 4 }, { name: 'Reversus', count: 4 }, { name: 'Reversus Total', count: 1 }];
const POSITIVE_EFFECTS = {
    'Resto Maior': {}, 'Carta Menor': {}, 'Jogo Aberto': {}, 'Imunidade': {},
    'Desafio': {}, 'Impulso': {}, 'Troca Justa': {}, 'Reversus Total': {}
};
const NEGATIVE_EFFECTS = {
    'Resto Menor': {}, 'Carta Maior': {}, 'Super Exposto': {}, 'Castigo': {},
    'Parada': {}, 'Troca Injusta': {}, 'Total Revesus Nada!': {}
};
const MAX_VALUE_CARDS_IN_HAND = 3;
const MAX_EFFECT_CARDS_IN_HAND = 2;
const WINNING_POSITION = 10;
const TEAM_A_IDS = ['player-1', 'player-3'];
const TEAM_B_IDS = ['player-2', 'player-4'];
const NUM_PATHS = 6;
const BOARD_SIZE = 9;
const TURN_DURATION_MS = 60000;

// --- MATCHMAKING ---
const matchmakingQueues = {
    '1v1': [],
    '1v4': [],
    '2v2': []
};
const matchRequirements = {
    '1v1': 2,
    '1v4': 4,
    '2v2': 4
};
const modeToGameMode = {
    '1v1': 'solo-2p',
    '1v4': 'solo-4p',
    '2v2': 'duo'
};


// --- FUNÇÕES DE LÓGICA DE JOGO ---
const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

const createDeck = (config, cardType) => {
    let idCounter = 0;
    return config.flatMap(item => Array.from({ length: item.count }, () => {
        const cardData = 'value' in item ? { name: item.value, value: item.value } : { name: item.name };
        return { id: Date.now() + Math.random() + idCounter++, type: cardType, ...cardData };
    }));
};

const generateBoardPaths = () => {
    const paths = [];
    const allPositiveEffects = Object.keys(POSITIVE_EFFECTS);
    const allNegativeEffects = Object.keys(NEGATIVE_EFFECTS);

    for (let i = 0; i < NUM_PATHS; i++) {
        const spaces = Array.from({ length: BOARD_SIZE }, (_, j) => ({
            id: j + 1, color: 'white', effectName: null, isUsed: false
        }));

        const colorableSpaceIds = Array.from({ length: 7 }, (_, j) => j + 2);
        shuffle(colorableSpaceIds);
        const spacesToColor = colorableSpaceIds.slice(0, 2);
        
        spacesToColor.forEach(spaceId => {
            const space = spaces.find(s => s.id === spaceId);
            if (space) {
                const isPositive = Math.random() > 0.5;
                if (isPositive) {
                    space.color = 'blue';
                    space.effectName = allPositiveEffects[Math.floor(Math.random() * allPositiveEffects.length)];
                } else {
                    space.color = 'red';
                    space.effectName = allNegativeEffects[Math.floor(Math.random() * allNegativeEffects.length)];
                }
            }
        });
        paths.push({ id: i, spaces });
    }
    return paths;
};

const dealCard = (gameState, deckType) => {
    if (gameState.decks[deckType].length === 0) {
        if (gameState.discardPiles[deckType].length > 0) {
            gameState.decks[deckType] = shuffle([...gameState.discardPiles[deckType]]);
            gameState.discardPiles[deckType] = [];
        } else {
             const configDeck = deckType === 'value' ? VALUE_DECK_CONFIG : EFFECT_DECK_CONFIG;
             gameState.decks[deckType] = shuffle(createDeck(configDeck, deckType));
        }
    }
    return gameState.decks[deckType].pop();
};

const getInverseEffect = (effect) => {
    const map = { 'Mais': 'Menos', 'Menos': 'Mais', 'Sobe': 'Desce', 'Desce': 'Sobe' };
    return map[effect] || null;
};

const applyEffect = (gameState, card, targetId, casterName, effectTypeToReverse, options = {}) => {
    const target = gameState.players[targetId];
    if (!target) return;

    let effectName = card.isLocked ? card.lockedEffect : card.name;
    const originalCardName = card.name;

    if (gameState.reversusTotalActive && originalCardName !== 'Reversus Total' && !card.isLocked) {
        const inverted = getInverseEffect(effectName);
        if (inverted) {
            gameState.log.unshift({ type: 'system', message: `Reversus Total inverteu ${originalCardName} para ${inverted}!` });
            effectName = inverted;
        }
    }

    if (originalCardName === 'Reversus') {
        const scoreEffectCategory = ['Mais', 'Menos'];
        const moveEffectCategory = ['Sobe', 'Desce', 'Pula'];

        if (effectTypeToReverse === 'score') {
            const cardToReverseIndex = target.playedCards.effect.findIndex(c => scoreEffectCategory.includes(c.lockedEffect || c.name));
            if (cardToReverseIndex > -1) {
                const cardToReverse = target.playedCards.effect[cardToReverseIndex];
                if (cardToReverse.isLocked) {
                    gameState.log.unshift({ type: 'system', message: `Ação bloqueada! O efeito em ${target.name} está travado.` });
                    const reversusCardIndex = target.playedCards.effect.findIndex(c => c.id === card.id);
                    if (reversusCardIndex > -1) {
                        const [reversusCard] = target.playedCards.effect.splice(reversusCardIndex, 1);
                        gameState.discardPiles.effect.push(reversusCard);
                    }
                    return;
                }
                const [removedCard] = target.playedCards.effect.splice(cardToReverseIndex, 1);
                gameState.discardPiles.effect.push(removedCard);
            }
            target.effects.score = getInverseEffect(target.effects.score);
        } else if (effectTypeToReverse === 'movement') {
            const cardToReverseIndex = target.playedCards.effect.findIndex(c => moveEffectCategory.includes(c.lockedEffect || c.name));
            if (cardToReverseIndex > -1) {
                const cardToReverse = target.playedCards.effect[cardToReverseIndex];
                 if (cardToReverse.isLocked) {
                    gameState.log.unshift({ type: 'system', message: `Ação bloqueada! O efeito em ${target.name} está travado.` });
                    const reversusCardIndex = target.playedCards.effect.findIndex(c => c.id === card.id);
                    if (reversusCardIndex > -1) {
                        const [reversusCard] = target.playedCards.effect.splice(reversusCardIndex, 1);
                        gameState.discardPiles.effect.push(reversusCard);
                    }
                    return;
                }
                const [removedCard] = target.playedCards.effect.splice(cardToReverseIndex, 1);
                gameState.discardPiles.effect.push(removedCard);
            }

            if(target.effects.movement === 'Pula') {
                target.effects.movement = null;
            } else {
                target.effects.movement = getInverseEffect(target.effects.movement);
            }
        }
    } else if (originalCardName === 'Reversus Total' && options.isGlobal) {
        gameState.reversusTotalActive = true;
        Object.values(gameState.players).forEach(p => {
            if (p.effects.score && !p.playedCards.effect.some(c => c.isLocked && ['Mais', 'Menos'].includes(c.lockedEffect))) {
                p.effects.score = getInverseEffect(p.effects.score);
            }
            if (p.effects.movement && p.effects.movement !== 'Pula' && !p.playedCards.effect.some(c => c.isLocked && ['Sobe', 'Desce'].includes(c.lockedEffect))) {
                p.effects.movement = getInverseEffect(p.effects.movement);
            }
        });
    } else {
        let isScoreEffect = ['Mais', 'Menos'].includes(effectName);
        let isMoveEffect = ['Sobe', 'Desce', 'Pula'].includes(effectName);
        if (isScoreEffect) {
            target.effects.score = effectName;
        } else if (isMoveEffect) {
            target.effects.movement = effectName;
        }
    }
    
    gameState.log.unshift({ type: 'system', message: `${casterName} usou ${originalCardName} em ${target.name}.` });
};


async function triggerFieldEffects_server(room) {
    const { gameState } = room;
    if (!gameState) return;
    
    gameState.activeFieldEffects = []; // Reset effects each round

    for (const id of gameState.playerIdsInGame) {
        const player = gameState.players[id];
        if (player.isEliminated || player.pathId === -1) continue;

        const path = gameState.boardPaths[player.pathId];
        if (!path || player.position < 1 || player.position > path.spaces.length) continue;
        
        const space = path.spaces[player.position - 1];

        if (space && space.effectName && !space.isUsed) {
            const isPositive = space.color === 'blue';
            const effectName = space.effectName;
            gameState.log.unshift({ type: 'system', message: `${player.name} ativou o Efeito de Campo: ${effectName}` });
            
            let effectSucceeded = false;

            // Handle active effects that modify game state directly
            switch (effectName) {
                case 'Jogo Aberto':
                    gameState.revealedHands = gameState.playerIdsInGame.filter(pId => pId !== id);
                    effectSucceeded = true;
                    break;
                case 'Reversus Total':
                    gameState.reversusTotalActive = true;
                    effectSucceeded = true;
                    break;
                case 'Carta Menor': {
                    const valueCards = player.hand.filter(c => c.type === 'value').sort((a, b) => a.value - b.value);
                    if (valueCards.length > 0) {
                        const cardToDiscard = valueCards[0];
                        player.hand = player.hand.filter(c => c.id !== cardToDiscard.id);
                        gameState.discardPiles.value.push(cardToDiscard);
                        const newCard = dealCard(gameState, 'value');
                        if (newCard) player.hand.push(newCard);
                        gameState.log.unshift({ type: 'system', message: `${player.name} descartou sua carta de menor valor (${cardToDiscard.name}) e comprou uma nova.` });
                        effectSucceeded = true;
                    }
                    break;
                }
                case 'Carta Maior': {
                    const valueCards = player.hand.filter(c => c.type === 'value').sort((a, b) => b.value - a.value);
                    if (valueCards.length > 0) {
                        const cardToDiscard = valueCards[0];
                        player.hand = player.hand.filter(c => c.id !== cardToDiscard.id);
                        gameState.discardPiles.value.push(cardToDiscard);
                        const newCard = dealCard(gameState, 'value');
                        if (newCard) player.hand.push(newCard);
                        gameState.log.unshift({ type: 'system', message: `${player.name} descartou sua carta de maior valor (${cardToDiscard.name}) e comprou uma nova.` });
                        effectSucceeded = true;
                    }
                    break;
                }
                case 'Troca Justa':
                case 'Troca Injusta': { // Combine logic, as both target a random opponent now for PvP
                    const opponents = gameState.playerIdsInGame.filter(pId => pId !== id && !gameState.players[pId].isEliminated);
                    if (opponents.length > 0) {
                        const targetPlayer = gameState.players[opponents[Math.floor(Math.random() * opponents.length)]];
                        const myCards = player.hand.filter(c => c.type === 'value').sort((a, b) => a.value - b.value);
                        const targetCards = targetPlayer.hand.filter(c => c.type === 'value').sort((a, b) => a.value - b.value);

                        if (myCards.length > 0 && targetCards.length > 0) {
                            const cardToGive = (effectName === 'Troca Justa') ? myCards[0] : myCards[myCards.length - 1];
                            const cardToTake = (effectName === 'Troca Justa') ? targetCards[targetCards.length - 1] : targetCards[0];
                            
                            // Swap
                            player.hand = player.hand.filter(c => c.id !== cardToGive.id);
                            targetPlayer.hand = targetPlayer.hand.filter(c => c.id !== cardToTake.id);
                            player.hand.push(cardToTake);
                            targetPlayer.hand.push(cardToGive);

                            gameState.log.unshift({ type: 'system', message: `${effectName}: ${player.name} trocou ${cardToGive.name} pela ${cardToTake.name} de ${targetPlayer.name}.` });
                            effectSucceeded = true;
                        }
                    }
                    break;
                }
                case 'Total Revesus Nada!': {
                    const effectCards = player.hand.filter(c => c.type === 'effect');
                    if (effectCards.length > 0) {
                        player.hand = player.hand.filter(c => c.type !== 'effect');
                        gameState.discardPiles.effect.push(...effectCards);
                        gameState.log.unshift({ type: 'system', message: `${player.name} descartou ${effectCards.length} carta(s) de efeito.` });
                        effectSucceeded = true;
                    }
                    break;
                }
                default:
                    // This handles passive effects
                    gameState.activeFieldEffects.push({
                        name: effectName,
                        type: isPositive ? 'positive' : 'negative',
                        appliesTo: player.id
                    });
                    effectSucceeded = true;
                    break;
            }

            if (effectSucceeded) {
                space.isUsed = true;
            }
        }
    }
}

async function processGameWin(room, winnerIds) {
    if (!room || !winnerIds || winnerIds.length === 0) return;

    // --- Pot Distribution on Game Win ---
    const { gameState } = room;
    const potToDistribute = gameState.pot;

    if (gameState.betAmount > 0 && potToDistribute > 0) {
        const potWinningsPerPlayer = Math.floor(potToDistribute / winnerIds.length);
        gameState.log.unshift({ type: 'system', message: `O prêmio de ${potToDistribute} 🪙 foi concedido a ${winnerIds.map(id => gameState.players[id].name).join(', ')} por vitória na partida.` });

        const playersToUpdateInDB = [];
        for (const winnerId of winnerIds) {
            const playerState = gameState.players[winnerId];
            playerState.coinversus += potWinningsPerPlayer;
            const playerProfile = room.players.find(p => p.playerId === winnerId).userProfile;
            playersToUpdateInDB.push({ userId: playerProfile.id, amountChange: potWinningsPerPlayer });
        }

        if (playersToUpdateInDB.length > 0) {
            await Promise.all(playersToUpdateInDB.map(p => db.updateUserCoins(p.userId, p.amountChange)));
        }
        gameState.pot = 0; // Pot is awarded
    }
    // --- End Pot Distribution ---
    
    const winnerData = [];
    const loserData = [];
    
    room.players.forEach(p => {
        if (winnerIds.includes(p.playerId)) {
            winnerData.push(p.userProfile);
        } else {
            loserData.push(p.userProfile);
        }
    });

    for (const winner of winnerData) {
        try {
            await db.addXp(winner.google_id, 100);
            await db.addMatchToHistory(winner.google_id, {
                outcome: 'Vitória',
                mode: `PVP ${room.mode}`,
                opponents: 'Jogadores Online'
            });
            await db.updateUserRankAndTitles(winner.id);
        } catch (error) {
            console.error(`Error processing win for ${winner.username}:`, error);
        }
    }

    for (const loser of loserData) {
         try {
            await db.addXp(loser.google_id, 25); // Some XP for playing
            await db.addMatchToHistory(loser.google_id, {
                outcome: 'Derrota',
                mode: `PVP ${room.mode}`,
                opponents: 'Jogadores Online'
            });
        } catch (error) {
            console.error(`Error processing loss for ${loser.username}:`, error);
        }
    }
}


async function checkGameEnd(room, from = 'unknown') {
    const { gameState } = room;

    const activePlayers = gameState.playerIdsInGame.filter(id => !gameState.players[id].isEliminated);
    let gameEnded = false;
    let winners = [];

    // Check for elimination victory
    if (room.mode === 'duo') {
        const teamA_active = activePlayers.some(pId => TEAM_A_IDS.includes(pId));
        const teamB_active = activePlayers.some(pId => TEAM_B_IDS.includes(pId));
        if (teamA_active && !teamB_active) {
            gameEnded = true;
            winners = activePlayers.filter(pId => TEAM_A_IDS.includes(pId));
        } else if (!teamA_active && teamB_active) {
            gameEnded = true;
            winners = activePlayers.filter(pId => TEAM_B_IDS.includes(pId));
        }
    } else { // Solo modes
        if (activePlayers.length <= 1) {
            gameEnded = true;
            winners = activePlayers;
        }
    }
    
    if (gameEnded) {
        await processGameWin(room, winners);
        const winnerNames = winners.map(id => gameState.players[id].name).join(' e ');
        io.to(room.id).emit('gameOver', { message: `${winnerNames} venceu o jogo!`, winnerId: winners.length > 0 ? winners[0] : null });
        delete rooms[room.id];
        return true;
    }

    // Check for position victory
    const positionWinners = gameState.playerIdsInGame.filter(id => !gameState.players[id].isEliminated && gameState.players[id].position >= WINNING_POSITION);
    if (positionWinners.length > 0) {
        await processGameWin(room, positionWinners);
        const winnerNames = positionWinners.map(id => gameState.players[id].name).join(' e ');
        io.to(room.id).emit('gameOver', { message: `${winnerNames} venceu o jogo!`, winnerId: positionWinners[0] });
        delete rooms[room.id];
        return true;
    }
    
    return false;
}

async function handleBettingPhase(room) {
    const { gameState } = room;
    if (!gameState || gameState.betAmount <= 0) return true; // Continue if no betting

    const playersToUpdateInDB = [];
    let totalPotContribution = 0;

    for (const playerId of gameState.playerIdsInGame) {
        const playerState = gameState.players[playerId];
        if (playerState.isEliminated) continue;

        const bet = playerState.position * gameState.betAmount;
        if (playerState.coinversus < bet) {
            playerState.isEliminated = true;
            gameState.log.unshift({ type: 'system', message: `${playerState.name} não tem moedas suficientes para a aposta (${bet}) e foi eliminado!` });
        } else {
            playerState.coinversus -= bet;
            totalPotContribution += bet;
            const playerProfile = room.players.find(p => p.playerId === playerId).userProfile;
            playersToUpdateInDB.push({ userId: playerProfile.id, amountChange: -bet });
            gameState.log.unshift({ type: 'system', message: `${playerState.name} apostou ${bet} 🪙.` });
        }
    }

    gameState.pot += totalPotContribution;

    if (playersToUpdateInDB.length > 0) {
        await Promise.all(playersToUpdateInDB.map(p => db.updateUserCoins(p.userId, p.amountChange)));
    }
    
    if (await checkGameEnd(room, 'betting')) {
        return false; 
    }
    return true; 
}

async function handlePotDistribution(room, winnerIds) {
    const { gameState } = room;
    const potToDistribute = gameState.pot;

    if (!gameState || gameState.betAmount <= 0 || potToDistribute <= 0) {
        return 0; // No betting or no pot, nothing to do.
    }

    if (winnerIds.length === 0) {
        gameState.log.unshift({ type: 'system', message: `A rodada empatou! O prêmio de ${potToDistribute} 🪙 acumula para a próxima rodada.` });
        return 0; // On a tie, the pot carries over.
    }

    const potWinningsPerPlayer = Math.floor(potToDistribute / winnerIds.length);
    gameState.log.unshift({ type: 'system', message: `O prêmio de ${potToDistribute} 🪙 foi dividido entre ${winnerIds.length} vencedor(es)! Cada um recebe ${potWinningsPerPlayer} 🪙.` });

    const playersToUpdateInDB = [];
    for (const winnerId of winnerIds) {
        const playerState = gameState.players[winnerId];
        playerState.coinversus += potWinningsPerPlayer;
        const playerProfile = room.players.find(p => p.playerId === winnerId).userProfile;
        playersToUpdateInDB.push({ userId: playerProfile.id, amountChange: potWinningsPerPlayer });
    }

    if (playersToUpdateInDB.length > 0) {
        await Promise.all(playersToUpdateInDB.map(p => db.updateUserCoins(p.userId, p.amountChange)));
    }

    gameState.pot = 0; // Reset pot AFTER distribution
    return potToDistribute;
}


async function startNewRound(room) {
    const { gameState } = room;
    gameState.turn++;
    gameState.log.unshift({ type: 'system', message: `--- Iniciando Rodada ${gameState.turn} ---`});

    // Handle betting phase before anything else
    const canContinue = await handleBettingPhase(room);
    if (!canContinue) return; // Game ended due to elimination

    gameState.playerIdsInGame.forEach(id => {
        const player = gameState.players[id];
        if (player.isEliminated) return;
        
        gameState.discardPiles.value.push(...player.playedCards.value);
        gameState.discardPiles.effect.push(...player.playedCards.effect);
        player.playedCards = { value: [], effect: [] };
        if (player.nextResto) player.resto = player.nextResto;
        player.nextResto = null;
        player.effects = { score: null, movement: null };
        player.playedValueCardThisTurn = false;
    });

    gameState.reversusTotalActive = false;
    gameState.consecutivePasses = 0;
    gameState.revealedHands = [];
    
    await triggerFieldEffects_server(room);
    
    gameState.playerIdsInGame.forEach(id => {
        const player = gameState.players[id];
        if (player.isEliminated) return;
        while (player.hand.filter(c => c.type === 'value').length < MAX_VALUE_CARDS_IN_HAND) {
            const newCard = dealCard(gameState, 'value');
            if (newCard) player.hand.push(newCard); else break;
        }
        while (player.hand.filter(c => c.type === 'effect').length < MAX_EFFECT_CARDS_IN_HAND) {
            const newCard = dealCard(gameState, 'effect');
            if (newCard) player.hand.push(newCard); else break;
        }
    });

    gameState.gamePhase = 'playing';
    startTurnTimer(room);
}

async function calculateScoresAndEndRound(room) {
    const { gameState } = room;
    gameState.gamePhase = 'resolution';
    
    const finalScores = {};
    gameState.playerIdsInGame.forEach(id => {
        const p = gameState.players[id];
        if (p.isEliminated) return;

        let score = p.playedCards.value.reduce((sum, card) => sum + card.value, 0);
        let restoValue = p.resto?.value || 0;

        // Apply field effects
        const activeEffects = gameState.activeFieldEffects || [];
        if (activeEffects.some(fe => fe.name === 'Resto Maior' && fe.appliesTo === id)) restoValue = 10;
        if (activeEffects.some(fe => fe.name === 'Resto Menor' && fe.appliesTo === id)) restoValue = 2;

        if (p.effects.score === 'Mais') score += restoValue;

        let scoreModifier = 1;
        if (activeEffects.some(fe => fe.name === 'Super Exposto' && fe.appliesTo === id)) {
            scoreModifier = 2;
            gameState.log.unshift({ type: 'system', message: `Efeito 'Super Exposto' dobrou o efeito negativo em ${p.name}!` });
        }
        
        if (p.effects.score === 'Menos') score -= (restoValue * scoreModifier);
        
        finalScores[id] = score;
    });

    // Determine winner(s)
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

    // Handle tie logic
    if (winners.length > 1) {
        if (gameState.gameMode === 'duo') {
            const firstWinnerTeam = TEAM_A_IDS.includes(winners[0]) ? 'A' : 'B';
            const allOnSameTeam = winners.every(id => (firstWinnerTeam === 'A' && TEAM_A_IDS.includes(id)) || (firstWinnerTeam === 'B' && TEAM_B_IDS.includes(id)));
            if (!allOnSameTeam) winners = [];
        } else {
            winners = [];
        }
    }
    
    const potWon = await handlePotDistribution(room, winners);

    const winnerNames = winners.map(id => gameState.players[id].name).join(' e ');
    gameState.log.unshift({ type: 'system', message: winners.length > 0 ? `Vencedor(es) da rodada: ${winnerNames}.` : "A rodada terminou em empate." });

    io.to(room.id).emit('roundSummary', { winners, finalScores, potWon });

    await new Promise(resolve => setTimeout(resolve, 5000));
    if (!rooms[room.id]) return;

    // Apply pawn movements
    gameState.playerIdsInGame.forEach(id => {
        const p = gameState.players[id];
        if (p.isEliminated) return;

        if (p.effects.movement === 'Pula' && p.targetPathForPula !== null) {
            p.pathId = p.targetPathForPula;
        }

        let netMovement = 0;
        const isWinner = winners.includes(id);
        const isLoser = !isWinner && winners.length > 0;
        const activeEffects = gameState.activeFieldEffects || [];

        // Win/Loss standard
        if (isWinner) {
            netMovement++;
        }

        // Card Effects
        if (p.effects.movement === 'Sobe') netMovement++;
        if (p.effects.movement === 'Desce') {
            let movementModifier = activeEffects.some(fe => fe.name === 'Super Exposto' && fe.appliesTo === id) ? 2 : 1;
            netMovement -= (1 * movementModifier);
        }

        // Win/Loss Field Effects
        if (isWinner) {
            if (activeEffects.some(fe => fe.name === 'Parada' && fe.appliesTo === id)) {
                gameState.log.unshift({ type: 'system', message: `Efeito 'Parada' impede ${p.name} de avançar.` });
                netMovement--; // Cancel the standard win advance
            }
            if (activeEffects.some(fe => fe.name === 'Desafio' && fe.appliesTo === id) && p.effects.score !== 'Mais' && p.effects.movement !== 'Sobe') {
                netMovement += 2; // Already advanced 1, so add 2 more
                gameState.log.unshift({ type: 'system', message: `Efeito 'Desafio' completo! ${p.name} ganha um bônus de avanço!` });
            }
        } else if (isLoser) {
            if (activeEffects.some(fe => fe.name === 'Castigo' && fe.appliesTo === id)) {
                netMovement -= 3;
                gameState.log.unshift({ type: 'system', message: `Efeito 'Castigo' ativado para ${p.name}.` });
            }
            if (activeEffects.some(fe => fe.name === 'Impulso' && fe.appliesTo === id)) {
                netMovement += 1;
                gameState.log.unshift({ type: 'system', message: `Efeito 'Impulso' ativado para ${p.name}.` });
            }
        }

        if (netMovement !== 0) {
            p.position = Math.min(WINNING_POSITION, Math.max(1, p.position + netMovement));
        }
    });

    if (await checkGameEnd(room, 'score')) return;

    if (winners.length > 0) {
        const winnerTurnOrder = gameState.playerIdsInGame.filter(pId => winners.includes(pId));
        gameState.currentPlayer = winnerTurnOrder[0];
    }
    
    await startNewRound(room);
}

// --- FUNÇÕES DE TIMER DE TURNO ---
function clearTurnTimers(room) {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    if (room.turnCountdownInterval) clearInterval(room.turnCountdownInterval);
    room.turnTimer = null;
    room.turnCountdownInterval = null;
    if (room.gameState) {
        room.gameState.remainingTurnTime = undefined;
    }
}

function advanceToNextPlayerInRoom(room) {
    let currentIndex = room.gameState.playerIdsInGame.indexOf(room.gameState.currentPlayer);
    let nextIndex = currentIndex;
    let attempts = 0;
    do {
        nextIndex = (nextIndex + 1) % room.gameState.playerIdsInGame.length;
        if (++attempts > room.gameState.playerIdsInGame.length * 2) {
             console.log(`Nenhum jogador ativo encontrado na sala ${room.id}. Encerrando o jogo.`);
             io.to(room.id).emit('gameOver', { message: 'Não há jogadores ativos. A partida terminou.' });
             clearTurnTimers(room);
             delete rooms[room.id];
             return;
        }
    } while (room.gameState.players[room.gameState.playerIdsInGame[nextIndex]].isEliminated);
    
    room.gameState.currentPlayer = room.gameState.playerIdsInGame[nextIndex];
    room.gameState.players[room.gameState.currentPlayer].playedValueCardThisTurn = false;
    
    startTurnTimer(room);
}

async function handleTurnTimeout(room) {
    if (!room || !room.gameState) return;
    const timedOutPlayerId = room.gameState.currentPlayer;
    const timedOutPlayer = room.players.find(p => p.playerId === timedOutPlayerId);
    if (!timedOutPlayer) return;

    console.log(`Jogador ${timedOutPlayer.username} (${timedOutPlayerId}) esgotou o tempo na sala ${room.id}`);
    clearTurnTimers(room);
    
    if (room.gameState.turn < 3) {
        io.to(room.id).emit('matchCancelled', 'Partida anulada por inatividade no início.');
        delete rooms[room.id];
        return;
    }

    room.gameState.log.unshift({type: 'system', message: `${timedOutPlayer.username} demorou demais e foi eliminado por inatividade.`});
    room.gameState.players[timedOutPlayerId].isEliminated = true;
    
    if (await checkGameEnd(room, 'timeout')) {
        return;
    } else {
       if (room.gameState.currentPlayer === timedOutPlayerId) {
           advanceToNextPlayerInRoom(room);
       } else {
           broadcastGameState(room.id);
       }
    }
}

function startTurnTimer(room) {
    if (!room || !room.gameState) return;
    clearTurnTimers(room);

    room.gameState.remainingTurnTime = 60;
    const currentPlayerId = room.gameState.currentPlayer;

    room.turnTimer = setTimeout(() => {
        if(rooms[room.id]) {
            handleTurnTimeout(room);
        }
    }, TURN_DURATION_MS);

    room.turnCountdownInterval = setInterval(() => {
        if (!rooms[room.id] || !rooms[room.id].gameState) {
            clearInterval(room.turnCountdownInterval);
            return;
        }
        room.gameState.remainingTurnTime--;
        if (room.gameState.remainingTurnTime <= 10) {
            broadcastGameState(room.id);
        }
        if(room.gameState.remainingTurnTime <= 0) {
             clearInterval(room.turnCountdownInterval);
        }
    }, 1000);

    broadcastGameState(room.id);
}


// --- FUNÇÕES HELPER DO SERVIDOR ---
function getLobbyDataForRoom(room) {
    return {
        id: room.id, name: room.name, hostId: room.hostId,
        players: room.players.map(p => ({ 
            id: p.id, 
            username: p.username, 
            playerId: p.playerId,
            googleId: p.googleId,
            title_code: p.title_code
        })),
        mode: room.mode,
    };
}

function getPublicRoomsList() {
    return Object.values(rooms).filter(r => !r.gameStarted)
        .map(r => ({
            id: r.id,
            name: r.name,
            playerCount: r.players.length,
            players: r.players.map(p => ({ username: p.username, googleId: p.googleId })),
            mode: r.mode,
            hasPassword: r.hasPassword,
            betAmount: r.betAmount || 0,
        }));
}


function broadcastGameState(roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameState) return;
    room.players.forEach(client => {
        const personalizedState = JSON.parse(JSON.stringify(room.gameState));
        Object.keys(personalizedState.players).forEach(pId => {
            if (pId !== client.playerId && !(personalizedState.revealedHands || []).includes(pId)) {
                personalizedState.players[pId].hand = personalizedState.players[pId].hand.map(card => ({...card, isHidden: true}));
            }
        });
        io.to(client.id).emit('gameStateUpdate', personalizedState);
    });
}
// --- FIM DAS FUNÇÕES HELPER ---

io.on('connection', (socket) => {
    console.log(`Jogador conectado: ${socket.id}`);
    db.ensureSchema().catch(console.error);

    socket.on('google-login', async ({ token }) => {
        try {
            const ticket = await client.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
            const payload = ticket.getPayload();
            let userProfile = await db.findOrCreateUser(payload);
            
            if (onlineUsers.has(userProfile.id)) {
                const oldSocketId = onlineUsers.get(userProfile.id)?.socketId;
                const oldSocket = io.sockets.sockets.get(oldSocketId);
                if (oldSocket) {
                    oldSocket.emit('forceDisconnect', 'Você se conectou em um novo local. Esta sessão foi desconectada.');
                    oldSocket.disconnect();
                }
            }
            
            onlineUsers.set(userProfile.id, { 
                socketId: socket.id, 
                username: userProfile.username, 
                avatar_url: userProfile.avatar_url,
                google_id: userProfile.google_id
            });
            userSockets.set(socket.id, userProfile.id);
            
            const profileFromDb = await db.getUserProfile(userProfile.google_id, userProfile.id);
            await db.logUserAccess(userProfile.id);
            
            // Check for Admin
            if (payload.email === ADMIN_EMAIL) {
                profileFromDb.isAdmin = true;
            }
            
            socket.data.userProfile = profileFromDb;
            socket.emit('loginSuccess', profileFromDb);

            const friends = await db.getFriendsList(userProfile.id);
            friends.forEach(friend => {
                const friendSocketData = onlineUsers.get(friend.id);
                if (friendSocketData) {
                    io.to(friendSocketData.socketId).emit('friendStatusUpdate', { userId: userProfile.id, isOnline: true });
                }
            });

        } catch (error) {
            console.error("Login Error:", error);
            socket.emit('loginError', error.message || 'Falha na autenticação.');
        }
    });
    
    socket.on('claimDailyLoginReward', async () => {
        if (!socket.data.userProfile) return;
        try {
            const result = await db.claimDailyReward(socket.data.userProfile.id);
            if (result.success) {
                socket.emit('dailyRewardSuccess', { amount: result.amount });
                const updatedProfile = await db.getUserProfile(socket.data.userProfile.google_id, socket.data.userProfile.id);
                socket.emit('profileData', updatedProfile);
            }
        } catch (error) {
            console.error("Daily Reward Error:", error);
        }
    });

    socket.on('claimChallengeReward', async ({ challengeId, amount }) => {
        if (!socket.data.userProfile || !challengeId || !amount || typeof amount !== 'number' || amount <= 0) {
            return;
        }
        try {
            const userId = socket.data.userProfile.id;
            const hasClaimed = await db.hasClaimedChallengeReward(userId, challengeId);

            if (!hasClaimed) {
                await db.claimChallengeReward(userId, challengeId);
                await db.updateUserCoins(userId, amount);
                socket.emit('challengeRewardSuccess', { amount });
                const updatedProfile = await db.getUserProfile(socket.data.userProfile.google_id, userId);
                socket.emit('profileData', updatedProfile);
            }
        } catch (error) {
            console.error("Challenge Reward Error:", error);
            socket.emit('error', 'Falha ao resgatar a recompensa do desafio.');
        }
    });

    socket.on('grantAchievement', async ({ achievementId }) => {
        if (!socket.data.userProfile || !achievementId) return;
        try {
            await db.grantUserAchievement(socket.data.userProfile.id, achievementId);
        } catch (error) {
            console.error(`Failed to save achievement ${achievementId} for user ${socket.data.userProfile.id}:`, error);
        }
    });

    socket.on('buyAvatar', async ({ avatarCode }) => {
        if (!socket.data.userProfile) {
            return socket.emit('avatarPurchaseError', { message: 'Usuário não autenticado.' });
        }

        try {
            const userId = socket.data.userProfile.id;
            const result = await db.purchaseAvatar(userId, avatarCode);

            if (result.success) {
                const updatedProfile = await db.getUserProfile(socket.data.userProfile.google_id, userId);
                socket.data.userProfile = updatedProfile;
                socket.emit('avatarPurchaseSuccess', { updatedProfile });
            } else {
                socket.emit('avatarPurchaseError', { message: result.error });
            }
        } catch (error) {
            console.error("Buy Avatar server error:", error);
            socket.emit('avatarPurchaseError', { message: 'Ocorreu um erro no servidor.' });
        }
    });

    socket.on('setSelectedAvatar', async ({ avatarCode }) => {
        if (!socket.data.userProfile) return;
        try {
            const userId = socket.data.userProfile.id;
            await db.setSelectedAvatar(userId, avatarCode);
            const updatedProfile = await db.getUserProfile(socket.data.userProfile.google_id, userId);
            socket.data.userProfile = updatedProfile;
            socket.emit('profileData', updatedProfile);
        } catch (error) {
            console.error("Set Avatar Error:", error);
            socket.emit('error', 'Falha ao equipar o avatar.');
        }
    });

    socket.on('getRanking', async ({ page = 1 } = {}) => {
        try {
            const rankingData = await db.getTopPlayers(page, 10);
            socket.emit('rankingData', rankingData);
        } catch (error) {
            socket.emit('error', 'Não foi possível carregar o ranking.');
        }
    });
    
    socket.on('getProfile', async () => {
        if (!socket.data.userProfile) return;
        try {
            const profileData = await db.getUserProfile(socket.data.userProfile.google_id, socket.data.userProfile.id);
            profileData.isAdmin = socket.data.userProfile.isAdmin || false;
            socket.emit('profileData', profileData);
        } catch (error) {
            socket.emit('error', 'Não foi possível carregar seu perfil.');
        }
    });

    socket.on('viewProfile', async ({ googleId }) => {
        if (!socket.data.userProfile || !googleId) return;
        try {
            const profileData = await db.getUserProfile(googleId, socket.data.userProfile.id);
            socket.emit('viewProfileData', profileData);
        } catch (error) {
            console.error("View Profile Error:", error);
            socket.emit('error', 'Não foi possível carregar o perfil do jogador.');
        }
    });

    socket.on('setSelectedTitle', async ({ titleCode }) => {
        if (!socket.data.userProfile) return;
        try {
            await db.setSelectedTitle(socket.data.userProfile.id, titleCode);
            const profileData = await db.getUserProfile(socket.data.userProfile.google_id, socket.data.userProfile.id);
            socket.emit('profileData', profileData);
        } catch (error) {
             socket.emit('error', 'Não foi possível selecionar o título.');
        }
    });
    
    socket.on('searchUsers', async ({ query }) => {
        if (!socket.data.userProfile) return;
        try {
            const results = await db.searchUsers(query, socket.data.userProfile.id);
            socket.emit('searchResults', results);
        } catch (error) { console.error("Search Error:", error); }
    });

    socket.on('sendFriendRequest', async ({ targetUserId }, callback) => {
        if (!socket.data.userProfile) {
            return callback({ success: false, error: 'Usuário não autenticado.' });
        }
        try {
            const senderProfile = socket.data.userProfile;
            const request = await db.sendFriendRequest(senderProfile.id, targetUserId);
            if (request) {
                const targetSocketData = onlineUsers.get(targetUserId);
                if (targetSocketData) {
                    io.to(targetSocketData.socketId).emit('newFriendRequest', {
                        id: request.id,
                        sender_id: senderProfile.id,
                        username: senderProfile.username,
                        avatar_url: senderProfile.avatar_url
                    });
                }
            }
            callback({ success: true });
        } catch (error) {
            console.error("Send Friend Request Error:", error);
            callback({ success: false, error: 'Não foi possível enviar o pedido de amizade. O usuário já pode ser seu amigo ou ter um pedido pendente.' });
        }
    });

    socket.on('getPendingRequests', async () => {
        if (!socket.data.userProfile) return;
        try {
            const requests = await db.getPendingFriendRequests(socket.data.userProfile.id);
            socket.emit('pendingRequestsData', requests);
        } catch (error) { console.error("Get Pending Requests Error:", error); }
    });

    socket.on('respondToRequest', async ({ requestId, action }) => {
        if (!socket.data.userProfile || !['accept', 'decline'].includes(action)) return;
        try {
            const userId = socket.data.userProfile.id;
            const senderId = await db.respondToFriendRequest(requestId, userId, action);
            
            if (senderId) {
                const senderSocketData = onlineUsers.get(senderId);
                if (senderSocketData) {
                    io.to(senderSocketData.socketId).emit('friendRequestResponded', { username: socket.data.userProfile.username, action });
                }
            }
            const requests = await db.getPendingFriendRequests(userId);
            socket.emit('pendingRequestsData', requests);
        } catch (error) {
            console.error("Respond to Request Error:", error);
            socket.emit('error', 'Não foi possível responder ao pedido.');
        }
    });

    socket.on('removeFriend', async ({ targetUserId }) => {
        if (!socket.data.userProfile) return;
        try {
            await db.removeFriend(socket.data.userProfile.id, targetUserId);
            const friendSocketData = onlineUsers.get(targetUserId);
            if (friendSocketData) {
                io.to(friendSocketData.socketId).emit('friendRequestResponded', { action: 'removed' });
            }
            socket.emit('friendRequestResponded', { action: 'removed' });
        } catch(error) { console.error("Remove Friend Error:", error); }
    });

    socket.on('getFriendsList', async () => {
        if (!socket.data.userProfile) return;
        try {
            const friends = await db.getFriendsList(socket.data.userProfile.id);
            const friendsWithStatus = friends.map(f => ({ ...f, isOnline: onlineUsers.has(f.id) }));
            socket.emit('friendsList', friendsWithStatus);
        } catch(error) { console.error("Get Friends Error:", error); }
    });
    
    socket.on('sendPrivateMessage', async ({ recipientId, content }) => {
        if (!socket.data.userProfile) return;
        const senderId = socket.data.userProfile.id;
        const senderUsername = socket.data.userProfile.username;
        try {
            await db.savePrivateMessage(senderId, recipientId, content);
            const recipientSocketData = onlineUsers.get(recipientId);
            const messageData = { senderId, senderUsername, content, timestamp: new Date() };
            
            if (recipientSocketData) {
                io.to(recipientSocketData.socketId).emit('privateMessage', { ...messageData, recipientId });
            }
            socket.emit('privateMessage', { ...messageData, recipientId });
        } catch (error) { console.error("Send Message Error:", error); }
    });

    socket.on('reportPlayer', async ({ reportedGoogleId, message }) => {
        if (!socket.data.userProfile) return;
        const reporter = socket.data.userProfile;
        try {
            await db.createPlayerReport(reporter.id, reportedGoogleId, message);
            socket.emit('reportSuccess', 'Denúncia enviada com sucesso.');

            // Notifica todos os administradores online sobre a nova denúncia
            for (const [userId, userData] of onlineUsers.entries()) {
                const userSocket = io.sockets.sockets.get(userData.socketId);
                const userProfile = userSocket?.data?.userProfile;
                if (userProfile?.isAdmin) {
                    userSocket.emit('newReport');
                }
            }
        } catch (error) {
            console.error("Report Player Error:", error);
            socket.emit('error', 'Não foi possível enviar a denúncia.');
        }
    });
    
    socket.on('listRooms', () => { socket.emit('roomList', getPublicRoomsList()); });

    socket.on('createRoom', async ({ name, password, betAmount }) => {
        if (!socket.data.userProfile) {
            return socket.emit('error', 'Você precisa estar logado para criar uma sala.');
        }
        if (socket.data.roomId && rooms[socket.data.roomId]) {
            return socket.emit('error', 'Você já está em uma sala.');
        }

        const username = socket.data.userProfile.username;
        const roomId = `room-${Date.now()}`;
        const roomName = name || `Sala de ${username}`;
        const hasPassword = !!password;

        const room = {
            id: roomId, name: roomName, hostId: socket.id, players: [],
            gameStarted: false, mode: 'solo-4p', gameState: null,
            turnTimer: null, turnCountdownInterval: null,
            password: password, hasPassword: hasPassword,
            betAmount: parseInt(betAmount || 0, 10),
        };
        rooms[roomId] = room;

        socket.data.roomId = roomId;
        socket.join(roomId);

        const userFullProfile = await db.getUserProfile(socket.data.userProfile.google_id, socket.data.userProfile.id);

        const newPlayer = {
            id: socket.id,
            username: userFullProfile.username,
            googleId: userFullProfile.google_id,
            title_code: userFullProfile.selected_title_code,
            playerId: 'player-1',
            userProfile: userFullProfile
        };
        socket.data.userProfile.playerId = newPlayer.playerId;
        room.players.push(newPlayer);
        
        console.log(`Sala criada: ${roomId} por ${username}, que entrou automaticamente.`);
        
        io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
        io.emit('roomList', getPublicRoomsList());
    });

    socket.on('joinRoom', async ({ roomId, password }) => {
        if (!socket.data.userProfile) {
            return socket.emit('error', 'Você precisa estar logado para entrar em uma sala.');
        }
        const room = rooms[roomId];
        if (room && !room.gameStarted && room.players.length < 4) {
            if (room.hasPassword && room.password !== password) {
                return socket.emit('error', 'Senha incorreta.');
            }
            
            const userFullProfile = await db.getUserProfile(socket.data.userProfile.google_id, socket.data.userProfile.id);
            socket.data.userProfile = userFullProfile;
            const userCoins = userFullProfile.coinversus || 0;
            if (room.betAmount > 0 && userCoins < room.betAmount) {
                return socket.emit('error', 'Você não tem CoinVersus suficiente para a aposta inicial desta sala.');
            }

            socket.data.roomId = roomId;
            socket.join(roomId);
            
            const newPlayer = {
                id: socket.id,
                username: userFullProfile.username,
                googleId: userFullProfile.google_id,
                title_code: userFullProfile.selected_title_code,
                playerId: `player-${room.players.length + 1}`,
                userProfile: userFullProfile
            };
            socket.data.userProfile.playerId = newPlayer.playerId;
            
            room.players.push(newPlayer);
            io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
            io.emit('roomList', getPublicRoomsList());
        } else {
            socket.emit('error', 'A sala está cheia, já começou ou não existe.');
        }
    });

    socket.on('lobbyChatMessage', (message) => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId] && socket.data.userProfile) {
            io.to(roomId).emit('lobbyChatMessage', { speaker: socket.data.userProfile.username, message });
        }
    });

    socket.on('chatMessage', (message) => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId] && socket.data.userProfile) {
            io.to(roomId).emit('chatMessage', { 
                speaker: socket.data.userProfile.username, 
                message,
                googleId: socket.data.userProfile.google_id
            });
        }
    });

    socket.on('changeMode', (mode) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (room && room.hostId === socket.id) {
            room.mode = mode;
            io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
        }
    });

    socket.on('startGame', () => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (!room || room.hostId !== socket.id || room.gameStarted) return;
    
        room.gameStarted = true;
        io.emit('roomList', getPublicRoomsList());
    
        const valueDeck = createDeck(VALUE_DECK_CONFIG, 'value');
        const effectDeck = createDeck(EFFECT_DECK_CONFIG, 'effect');
    
        let startingPlayerId;
        let drawResults = {};
        let tie = true;
    
        while (tie) {
            const drawnCards = {};
            const tempDeck = shuffle([...valueDeck]);
            room.players.forEach(p => { drawnCards[p.playerId] = tempDeck.pop(); });
            drawResults = drawnCards;
    
            const sortedPlayers = [...room.players].sort((a, b) => drawnCards[b.playerId].value - drawnCards[a.playerId].value);
    
            if (sortedPlayers.length < 2 || drawnCards[sortedPlayers[0].playerId].value > drawnCards[sortedPlayers[1].playerId].value) {
                tie = false;
                startingPlayerId = sortedPlayers[0].playerId;
            } else {
                 Object.values(drawnCards).forEach(card => valueDeck.push(card)); // Return cards to deck
                 shuffle(valueDeck);
            }
        }
    
        shuffle(valueDeck);
        shuffle(effectDeck);
    
        const playerIdsInGame = room.players.map(p => p.playerId);
        
        const players = Object.fromEntries(
            room.players.map((p, index) => [
                p.playerId,
                {
                    id: p.playerId, name: p.username, pathId: index, position: 1,
                    hand: [], 
                    resto: drawResults[p.playerId],
                    nextResto: null,
                    effects: { score: null, movement: null },
                    playedCards: { value: [], effect: [] },
                    playedValueCardThisTurn: false, liveScore: 0,
                    status: 'neutral', isEliminated: false,
                    coinversus: p.userProfile.coinversus,
                    avatar_url: p.userProfile.avatar_url
                }
            ])
        );
    
        Object.values(players).forEach(player => {
            for(let i=0; i < 3; i++) if(valueDeck.length > 0) player.hand.push(valueDeck.pop());
            for(let i=0; i < 2; i++) if(effectDeck.length > 0) player.hand.push(effectDeck.pop());
        });
    
        const boardPaths = generateBoardPaths();
        playerIdsInGame.forEach((id, index) => { 
            if(boardPaths[index]) boardPaths[index].playerId = id; 
        });
    
        const playerSocketMap = {};
        room.players.forEach(p => {
            playerSocketMap[p.id] = p.playerId;
        });

        const gameState = {
            players, playerIdsInGame, playerSocketMap,
            decks: { value: valueDeck, effect: effectDeck },
            discardPiles: { value: [], effect: [] },
            boardPaths: boardPaths, 
            gamePhase: 'initial_draw', // Start with draw phase
            gameMode: room.mode,
            isPvp: true, currentPlayer: startingPlayerId, turn: 1,
            log: [{ type: 'system', message: `Partida PvP iniciada! Modo: ${room.mode}` }],
            consecutivePasses: 0,
            drawResults: drawResults,
            activeFieldEffects: [],
            revealedHands: [],
            betAmount: room.betAmount,
            pot: 0,
        };
    
        room.gameState = gameState;
        io.to(roomId).emit('gameStarted', gameState);
        
        setTimeout(async () => {
            if (rooms[roomId] && rooms[roomId].gameState) {
                rooms[roomId].gameState.gamePhase = 'playing';
                await startNewRound(rooms[roomId]);
            }
        }, 5000); 
    });

    socket.on('playCard', ({ cardId, targetId, options = {} }) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const player = room?.players.find(p => p.id === socket.id);
        if (!room || !room.gameState || !player || room.gameState.currentPlayer !== player.playerId) return;
    
        const playerState = room.gameState.players[player.playerId];
        const cardIndex = playerState.hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return;
    
        const [card] = playerState.hand.splice(cardIndex, 1);
        room.gameState.consecutivePasses = 0;
    
        let cardDestinationPlayer = room.gameState.players[targetId];
        if (!cardDestinationPlayer) return;
    
        let targetSlotLabel;
        if (card.type === 'value') {
            targetSlotLabel = playerState.playedCards.value.length === 0 ? 'Valor 1' : 'Valor 2';
        } else {
            const effectNameToApply = options.isIndividualLock ? options.effectNameToApply : card.name;
            const isScoreEffect = ['Mais', 'Menos'].includes(effectNameToApply) || (card.name === 'Reversus' && options.effectType === 'score');
            if (isScoreEffect) {
                targetSlotLabel = 'Pontuação';
            } else if (card.name === 'Reversus Total' && !options.isIndividualLock) {
                targetSlotLabel = 'Reversus T.';
            } else {
                targetSlotLabel = 'Movimento';
            }
        }
        io.to(roomId).emit('cardPlayedAnimation', { casterId: player.playerId, targetId, card, targetSlotLabel });
    
        if (card.type === 'value') {
            playerState.playedCards.value.push(card);
            playerState.playedValueCardThisTurn = true;
            playerState.nextResto = card;
            room.gameState.log.unshift({ type: 'system', message: `${playerState.name} jogou a carta de valor ${card.name}.` });
        } else {
            const effectNameToApply = options.isIndividualLock ? options.effectNameToApply : card.name;
            const scoreEffectCategory = ['Mais', 'Menos'];
            const moveEffectCategory = ['Sobe', 'Desce', 'Pula'];
    
            let isScoreEffect = scoreEffectCategory.includes(effectNameToApply) || (card.name === 'Reversus' && options.effectType === 'score');
            let isMoveEffect = moveEffectCategory.includes(effectNameToApply) || (card.name === 'Reversus' && options.effectType === 'movement');
    
            const categoryToCheck = isScoreEffect ? scoreEffectCategory : (isMoveEffect ? moveEffectCategory : null);
    
            if (categoryToCheck) {
                const cardToReplaceIndex = cardDestinationPlayer.playedCards.effect.findIndex(c =>
                    categoryToCheck.includes(c.name) ||
                    (c.isLocked && categoryToCheck.includes(c.lockedEffect)) ||
                    (c.name === 'Reversus' && (c.reversedEffectType === (isScoreEffect ? 'score' : 'movement')))
                );
    
                if (cardToReplaceIndex > -1) {
                    const cardToReplace = cardDestinationPlayer.playedCards.effect[cardToReplaceIndex];
                    if (cardToReplace.isLocked) {
                        room.gameState.log.unshift({ type: 'system', message: `O efeito ${cardToReplace.lockedEffect} em ${cardDestinationPlayer.name} está travado! A carta ${card.name} não teve efeito.` });
                        room.gameState.discardPiles.effect.push(card);
                        return broadcastGameState(roomId);
                    } else {
                        const [removedCard] = cardDestinationPlayer.playedCards.effect.splice(cardToReplaceIndex, 1);
                        room.gameState.discardPiles.effect.push(removedCard);
                    }
                }
            }
    
            if (options.isIndividualLock) {
                card.isLocked = true;
                card.lockedEffect = options.effectNameToApply;
            }
            if (card.name === 'Pula' && options.pulaPath !== undefined) cardDestinationPlayer.targetPathForPula = options.pulaPath;
            if (card.name === 'Reversus') card.reversedEffectType = options.effectType;
            
            cardDestinationPlayer.playedCards.effect.push(card);
            applyEffect(room.gameState, card, targetId, playerState.name, options.effectType, options);
        }
        
        broadcastGameState(roomId);
    });
    
    socket.on('endTurn', async () => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const player = room?.players.find(p => p.id === socket.id);
        if (!room || !room.gameState || !player || room.gameState.currentPlayer !== player.playerId) return;

        clearTurnTimers(room);
        room.gameState.consecutivePasses++;
        
        const activePlayers = room.gameState.playerIdsInGame.filter(id => !room.gameState.players[id].isEliminated);
        if (activePlayers.length > 0 && room.gameState.consecutivePasses === activePlayers.length) {
             room.gameState.log.unshift({ type: 'system', message: "ÚLTIMA CHAMADA! Todos os jogadores passaram. A rodada terminará se todos passarem novamente." });
        }
        
        if (activePlayers.length > 0 && room.gameState.consecutivePasses >= activePlayers.length * 2) {
            await calculateScoresAndEndRound(room);
        } else {
            advanceToNextPlayerInRoom(room);
        }
    });

    const handleDisconnect = async () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        
        // Remove from matchmaking queue
        for (const mode in matchmakingQueues) {
            const index = matchmakingQueues[mode].findIndex(p => p.id === socket.id);
            if (index !== -1) {
                matchmakingQueues[mode].splice(index, 1);
                console.log(`Jogador ${socket.id} removido da fila ${mode}`);
                broadcastQueueStatus(mode);
                break;
            }
        }

        const userId = userSockets.get(socket.id);
        if (userId) {
            const currentSocketData = onlineUsers.get(userId);
            // Only process disconnect if the socket matches the current active socket for the user
            if (currentSocketData && currentSocketData.socketId === socket.id) {
                onlineUsers.delete(userId);
                try {
                    const friends = await db.getFriendsList(userId);
                    friends.forEach(friend => {
                        const friendSocketData = onlineUsers.get(friend.id);
                        if (friendSocketData) {
                            io.to(friendSocketData.socketId).emit('friendStatusUpdate', { userId, isOnline: false });
                        }
                    });
                } catch (error) {
                    console.error("Error notifying friends on disconnect:", error);
                }
            }
            userSockets.delete(socket.id);
        }
        
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;

        const room = rooms[roomId];
        const disconnectedPlayer = room.players.find(p => p.id === socket.id);
        if (!disconnectedPlayer) return;

        clearTurnTimers(room);

        if (room.gameStarted && room.gameState) {
             if (room.gameState.turn < 3) {
                io.to(roomId).emit('matchCancelled', 'Partida anulada por desistência no início.');
                delete rooms[roomId];
                io.emit('roomList', getPublicRoomsList());
                return;
            }

            const playerState = room.gameState.players[disconnectedPlayer.playerId];
            if (playerState && !playerState.isEliminated) {
                playerState.isEliminated = true;
                room.gameState.log.unshift({type: 'system', message: `${disconnectedPlayer.username} se desconectou e foi eliminado.`});
                
                if (await checkGameEnd(room, 'disconnect')) {
                    return;
                } else {
                   if (room.gameState.currentPlayer === disconnectedPlayer.playerId) {
                       advanceToNextPlayerInRoom(room);
                   } else {
                       broadcastGameState(room.id);
                   }
                }
            }
        } else {
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                delete rooms[roomId];
            } else {
                if (room.hostId === socket.id) room.hostId = room.players[0].id;
                io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
            }
        }
        io.emit('roomList', getPublicRoomsList());
    };

    socket.on('leaveRoom', handleDisconnect);
    socket.on('disconnect', handleDisconnect);

    // --- Matchmaking Handlers ---
    socket.on('joinMatchmaking', async ({ mode }) => {
        if (!socket.data.userProfile) {
            return socket.emit('error', 'Você precisa estar logado para entrar na fila.');
        }
        if (!matchmakingQueues[mode]) {
            return socket.emit('error', 'Modo de jogo inválido.');
        }

        // Remove from other queues first
        for (const m in matchmakingQueues) {
            matchmakingQueues[m] = matchmakingQueues[m].filter(p => p.id !== socket.id);
        }

        matchmakingQueues[mode].push({ id: socket.id, userProfile: socket.data.userProfile });
        socket.data.currentQueue = mode;
        console.log(`Jogador ${socket.id} (${socket.data.userProfile.username}) entrou na fila ${mode}.`);
        
        broadcastQueueStatus(mode);
        await checkAndStartMatch(mode);
    });

    socket.on('cancelMatchmaking', () => {
        const mode = socket.data.currentQueue;
        if (mode && matchmakingQueues[mode]) {
            const index = matchmakingQueues[mode].findIndex(p => p.id === socket.id);
            if (index !== -1) {
                matchmakingQueues[mode].splice(index, 1);
                socket.data.currentQueue = null;
                console.log(`Jogador ${socket.id} cancelou e saiu da fila ${mode}.`);
                socket.emit('matchmakingCancelled');
                broadcastQueueStatus(mode);
            }
        }
    });

    // --- Invite Handlers ---
    socket.on('getOnlineFriends', async () => {
        if (!socket.data.userProfile) return;
        try {
            const friends = await db.getFriendsList(socket.data.userProfile.id);
            const roomId = socket.data.roomId;
            const room = rooms[roomId];
            const playersInLobby = room ? room.players.map(p => p.userProfile.id) : [];

            const onlineFriends = friends
                .filter(f => onlineUsers.has(f.id) && !playersInLobby.includes(f.id))
                .map(f => {
                    const targetSocketId = onlineUsers.get(f.id)?.socketId;
                    const targetSocket = io.sockets.sockets.get(targetSocketId);
                    const isInGameOrQueue = targetSocket ? (!!targetSocket.data.roomId || !!targetSocket.data.currentQueue) : true;
                    return { ...f, isInGameOrQueue };
                })
                .filter(f => !f.isInGameOrQueue);

            socket.emit('onlineFriendsList', onlineFriends);
        } catch(error) {
            console.error("Get Online Friends Error:", error);
        }
    });

    socket.on('inviteFriendToLobby', async ({ targetUserId, roomId }) => {
        const inviterProfile = socket.data.userProfile;
        const room = rooms[roomId];
        if (!inviterProfile || !room) return;

        const targetSocketData = onlineUsers.get(targetUserId);
        
        if (targetSocketData) {
            const targetSocket = io.sockets.sockets.get(targetSocketData.socketId);
            if (targetSocket && !targetSocket.data.roomId && !targetSocket.data.currentQueue) {
                io.to(targetSocketData.socketId).emit('lobbyInvite', {
                    inviterUsername: inviterProfile.username,
                    roomName: room.name,
                    roomId: room.id
                });
                socket.emit('inviteResponse', { status: 'sent', username: targetSocketData.username });
            } else {
                 socket.emit('inviteResponse', { status: 'in_game', username: targetSocketData.username });
            }
        } else {
            const targetUser = await db.getUserProfile(null, targetUserId);
            socket.emit('inviteResponse', { status: 'offline', username: targetUser ? targetUser.username : 'O jogador' });
        }
    });

    socket.on('acceptInvite', async ({ roomId }) => {
        if (!socket.data.userProfile) { return socket.emit('error', 'Você precisa estar logado para entrar em uma sala.'); }
        const room = rooms[roomId];
        if (room && !room.gameStarted && room.players.length < 4) {
            if (socket.data.roomId) {
                return socket.emit('error', 'Você já está em uma sala.');
            }
            
            const userFullProfile = await db.getUserProfile(socket.data.userProfile.google_id, socket.data.userProfile.id);
            socket.data.userProfile = userFullProfile;
            
            if (room.betAmount > 0 && (userFullProfile.coinversus || 0) < room.betAmount) {
                return socket.emit('error', 'Você não tem CoinVersus suficiente para a aposta inicial desta sala.');
            }
    
            socket.data.roomId = roomId;
            socket.join(roomId);
            
            const newPlayer = {
                id: socket.id,
                username: userFullProfile.username,
                googleId: userFullProfile.google_id,
                title_code: userFullProfile.selected_title_code,
                playerId: `player-${room.players.length + 1}`,
                userProfile: userFullProfile
            };
            socket.data.userProfile.playerId = newPlayer.playerId;
            
            room.players.push(newPlayer);
            io.to(roomId).emit('lobbyUpdate', getLobbyDataForRoom(room));
            io.emit('roomList', getPublicRoomsList());
        } else {
            socket.emit('error', 'Não foi possível entrar na sala. Pode estar cheia ou a partida já começou.');
        }
    });
    
    socket.on('declineInvite', ({ roomId }) => {
        const room = rooms[roomId];
        if (room && rooms[roomId].hostId) {
            io.to(rooms[roomId].hostId).emit('inviteResponse', { status: 'declined', username: socket.data.userProfile.username });
        }
    });


    // --- Admin Handlers ---
    socket.on('admin:getData', async () => {
        if (!socket.data.userProfile?.isAdmin) return;
        try {
            const online = Array.from(onlineUsers.values()).map(u => ({
                id: userSockets.get(u.socketId), // Get DB ID
                ...u
            }));
            const banned = await db.getBannedUsers();
            const pendingReports = await db.getPendingReports();
            const dailyStats = await db.getDailyAccessStats();

            socket.emit('adminData', { 
                online, 
                banned, 
                pendingReports,
                totalConnections: io.engine.clientsCount,
                dailyStats
            });
        } catch (error) {
            console.error("Admin GetData Error:", error);
        }
    });

    socket.on('admin:banUser', async ({ userId }) => {
        if (!socket.data.userProfile?.isAdmin) return;
        try {
            const adminId = socket.data.userProfile.id;
            await db.banUser({ userId, adminId });
            await db.resolveReportsForUser(userId, adminId); // Resolve automaticamente as denúncias ao banir

            const targetSocketData = onlineUsers.get(userId);
            if (targetSocketData) {
                const targetSocket = io.sockets.sockets.get(targetSocketData.socketId);
                if (targetSocket) {
                    targetSocket.emit('forceDisconnect', 'Você foi banido do jogo.');
                    targetSocket.disconnect();
                }
            }
            console.log(`Admin ${socket.data.userProfile.username} banned user ID ${userId}`);
            
            socket.emit('adminActionSuccess', `Usuário ID ${userId} banido com sucesso.`);
        } catch (error) {
            console.error("Admin Ban Error:", error);
        }
    });
    
    socket.on('admin:resolveReport', async ({ reportId }) => {
        if (!socket.data.userProfile?.isAdmin) return;
        try {
            await db.resolveReport(reportId, socket.data.userProfile.id);
            socket.emit('adminActionSuccess', `Denúncia #${reportId} dispensada.`);
        } catch (error) {
            console.error("Admin Resolve Report Error:", error);
        }
    });

    socket.on('admin:addCoins', async ({ amount }) => {
        if (!socket.data.userProfile?.isAdmin) return;
        try {
            await db.updateUserCoins(socket.data.userProfile.id, amount);
            socket.emit('adminActionSuccess', `${amount} CoinVersus adicionados com sucesso.`);
        } catch (error) {
            console.error("Admin Add Coins Error:", error);
        }
    });


    socket.on('admin:unbanUser', async ({ userId }) => {
        if (!socket.data.userProfile?.isAdmin) return;
        try {
            await db.unbanUser(userId);
            console.log(`Admin ${socket.data.userProfile.username} unbanned user ID ${userId}`);
            socket.emit('adminActionSuccess', `Banimento do usuário ID ${userId} removido.`);
        } catch (error) {
            console.error("Admin Unban Error:", error);
        }
    });
});

// --- Matchmaking Logic ---
function broadcastQueueStatus(mode) {
    const queue = matchmakingQueues[mode];
    const needed = matchRequirements[mode];
    const current = queue.length;
    queue.forEach(player => {
        io.to(player.id).emit('matchmakingStatus', { mode, current, needed });
    });
}

async function checkAndStartMatch(mode) {
    const queue = matchmakingQueues[mode];
    const needed = matchRequirements[mode];

    if (queue.length >= needed) {
        const playersForMatch = queue.splice(0, needed);
        console.log(`Jogadores suficientes para a partida ${mode}. Iniciando...`);

        const roomId = `match-${Date.now()}`;
        const room = {
            id: roomId, name: `Partida Rápida ${mode}`, players: [],
            gameStarted: true, mode: modeToGameMode[mode], gameState: null,
            turnTimer: null, turnCountdownInterval: null,
            betAmount: 0,
        };
        rooms[roomId] = room;
        
        const playerPromises = playersForMatch.map(async (playerData, index) => {
            const playerSocket = io.sockets.sockets.get(playerData.id);
            if (playerSocket) {
                const fullProfile = await db.getUserProfile(playerData.userProfile.google_id, playerData.userProfile.id);
                return {
                    id: playerSocket.id,
                    username: fullProfile.username,
                    playerId: `player-${index + 1}`,
                    userProfile: fullProfile
                };
            }
            return null;
        });

        const resolvedPlayers = (await Promise.all(playerPromises)).filter(p => p);

        resolvedPlayers.forEach(pData => {
            const playerSocket = io.sockets.sockets.get(pData.id);
            if (playerSocket) {
                room.players.push(pData);
                playerSocket.data.roomId = room.id;
                playerSocket.data.currentQueue = null;
                playerSocket.join(room.id);
            }
        });

        const valueDeck = createDeck(VALUE_DECK_CONFIG, 'value');
        const effectDeck = createDeck(EFFECT_DECK_CONFIG, 'effect');
        
        let startingPlayerId, drawResults = {}, tie = true;
        while(tie) {
            const drawnCards = {};
            const tempDeck = shuffle([...valueDeck]);
            room.players.forEach(p => { drawnCards[p.playerId] = tempDeck.pop(); });
            drawResults = drawnCards;
            const sortedPlayers = [...room.players].sort((a,b) => drawnCards[b.playerId].value - drawnCards[a.playerId].value);
            if (sortedPlayers.length < 2 || drawnCards[sortedPlayers[0].playerId].value > drawnCards[sortedPlayers[1].playerId].value) {
                tie = false;
                startingPlayerId = sortedPlayers[0].playerId;
            }
        }
        
        shuffle(valueDeck);
        shuffle(effectDeck);
        
        const playerIdsInGame = room.players.map(p => p.playerId);
        const players = Object.fromEntries(
            room.players.map((p, index) => [ p.playerId, {
                id: p.playerId, name: p.username, pathId: index, position: 1, hand: [], 
                resto: drawResults[p.playerId], nextResto: null,
                effects: { score: null, movement: null },
                playedCards: { value: [], effect: [] },
                playedValueCardThisTurn: false, liveScore: 0,
                status: 'neutral', isEliminated: false,
                coinversus: p.userProfile.coinversus,
                avatar_url: p.userProfile.avatar_url,
            }])
        );
        Object.values(players).forEach(p => {
            for(let i=0; i<3; i++) if(valueDeck.length>0) p.hand.push(valueDeck.pop());
            for(let i=0; i<2; i++) if(effectDeck.length>0) p.hand.push(effectDeck.pop());
        });
        
        const boardPaths = generateBoardPaths();
        playerIdsInGame.forEach((id, index) => { if(boardPaths[index]) boardPaths[index].playerId = id; });
        
        const playerSocketMap = {};
        room.players.forEach(p => {
            playerSocketMap[p.id] = p.playerId;
        });

        const gameState = {
            players, playerIdsInGame, playerSocketMap,
            decks: { value: valueDeck, effect: effectDeck },
            discardPiles: { value: [], effect: [] },
            boardPaths, gamePhase: 'initial_draw', gameMode: room.mode,
            isPvp: true, currentPlayer: startingPlayerId, turn: 1,
            log: [{ type: 'system', message: `Partida Rápida iniciada! Modo: ${mode}` }],
            consecutivePasses: 0, drawResults,
            activeFieldEffects: [],
            revealedHands: [],
            betAmount: 0,
            pot: 0,
        };
        room.gameState = gameState;
        
        io.to(roomId).emit('gameStarted', gameState);
        
        setTimeout(async () => {
            if (rooms[roomId] && rooms[roomId].gameState) {
                rooms[roomId].gameState.gamePhase = 'playing';
                await startNewRound(rooms[roomId]);
            }
        }, 5000);
    }
}


const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`--- SERVIDOR DE JOGO REVERSUS ONLINE ---`);
    console.log(`O servidor está rodando e escutando na porta: ${PORT}`);
    console.log(`Aguardando conexões de jogadores...`);
    console.log('------------------------------------');
    db.testConnection();
});