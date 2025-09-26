import { getState } from '../core/state.js';
import * as dom from '../core/dom.js';
import * as config from '../core/config.js';

/**
 * Calculates live scores for all players and determines their winning/losing status for UI rendering.
 * Also updates the side score boxes based on game mode.
 */
export function updateLiveScoresAndWinningStatus() {
    const { gameState } = getState();
    if (!gameState) return;

    // --- Part 1: Calculate live scores for all players ---
    const scores = {};
    gameState.playerIdsInGame.forEach(id => {
        const player = gameState.players[id];
        let score = player.playedCards.value.reduce((sum, card) => sum + card.value, 0);

        // Apply temporary effects for live scoring
        const effect = player.effects.score;
        let restoValue = player.resto ? player.resto.value : 0;
        
        const activeEffects = gameState.activeFieldEffects || [];
        const restoMaiorEffect = activeEffects.find(fe => fe.name === 'Resto Maior' && fe.appliesTo === id);
        if(restoMaiorEffect) restoValue = 10;
        const restoMenorEffect = activeEffects.find(fe => fe.name === 'Resto Menor' && fe.appliesTo === id);
        if(restoMenorEffect) restoValue = 2;

        if (effect === 'Mais') score += restoValue;
        if (effect === 'Menos') score -= restoValue;

        // --- NEW TOURNAMENT LOGIC ---
        if (gameState.isTournamentMatch && player.tournamentScoreEffect) {
            if (player.tournamentScoreEffect.effect === 'Sobe') {
                score += 5;
            } else if (player.tournamentScoreEffect.effect === 'Desce') {
                score -= 5;
            }
        }
        
        player.liveScore = score;
        scores[id] = score;
    });

    // --- Part 2: Determine winning/losing status for each player ---
    const activePlayers = gameState.playerIdsInGame.filter(id => !gameState.players[id].isEliminated);
    if (activePlayers.length > 1) {
        const playerScores = activePlayers.map(id => scores[id]);
        const highestScore = Math.max(...playerScores);
        const lowestScore = Math.min(...playerScores);

        activePlayers.forEach(id => {
            if (highestScore > lowestScore) {
                if (scores[id] === highestScore) gameState.players[id].status = 'winning';
                else if (scores[id] === lowestScore) gameState.players[id].status = 'losing';
                else gameState.players[id].status = 'neutral';
            } else {
                gameState.players[id].status = 'neutral';
            }
        });
    } else if (activePlayers.length === 1) {
        gameState.players[activePlayers[0]].status = 'neutral';
    }

    // --- Part 3: Update side score boxes and their statuses ---
    updateSideScoreBoxes(scores);
}


/**
 * Updates the side score boxes and team headers based on the current scores and game mode.
 * @param {object} scores - An object mapping player IDs to their current scores.
 */
function updateSideScoreBoxes(scores) {
    const { gameState } = getState();
    
    // Clear previous statuses and hide elements by default
    dom.leftScoreStatus.textContent = '';
    dom.leftScoreStatus.className = 'side-score-status';
    dom.rightScoreStatus.textContent = '';
    dom.rightScoreStatus.className = 'side-score-status';
    dom.leftScoreBox.classList.add('hidden');
    dom.rightScoreBox.classList.add('hidden');
    dom.teamScoresContainer.classList.add('hidden');


    const player1 = gameState.players['player-1'];
    const opponents = gameState.playerIdsInGame.filter(id => id !== 'player-1' && !gameState.players[id].isEliminated);
    
    if (!player1) return; // Exit if player 1 doesn't exist

    // In duo mode, scores are aggregated by team.
    if (gameState.gameMode === 'duo') {
        const teamA_Ids = gameState.currentStoryBattle === 'necroverso_final' ? ['player-1', 'player-4'] : config.TEAM_A;
        const teamB_Ids = gameState.currentStoryBattle === 'necroverso_final' ? ['player-2', 'player-3'] : config.TEAM_B;
        
        let teamAScore = teamA_Ids.reduce((sum, id) => sum + (scores[id] || 0), 0);
        let teamBScore = teamB_Ids.reduce((sum, id) => sum + (scores[id] || 0), 0);
        
        // Update Side Score Boxes for Teams
        dom.leftScoreBox.classList.remove('hidden');
        dom.leftScoreBox.className = 'side-score-box player-1-score'; // Team A is always blue
        dom.leftScoreValue.textContent = teamAScore;

        dom.rightScoreBox.classList.remove('hidden');
        dom.rightScoreBox.className = 'side-score-box player-2-score'; // Team B is always red
        dom.rightScoreValue.textContent = teamBScore;
        
        if (teamAScore > teamBScore) {
            dom.leftScoreStatus.textContent = 'Ganhando';
            dom.leftScoreStatus.classList.add('winning');
            dom.rightScoreStatus.textContent = 'Perdendo';
            dom.rightScoreStatus.classList.add('losing');
        } else if (teamBScore > teamAScore) {
            dom.rightScoreStatus.textContent = 'Ganhando';
            dom.rightScoreStatus.classList.add('winning');
            dom.leftScoreStatus.textContent = 'Perdendo';
            dom.leftScoreStatus.classList.add('losing');
        }

        // Update Header Team Scores (with hearts for the final battle)
        dom.teamScoresContainer.classList.remove('hidden');
        let teamAHeartsHTML = gameState.currentStoryBattle === 'necroverso_final' ? `<span class="header-hearts">${'❤'.repeat(gameState.teamA_hearts)}</span>` : '';
        let teamBHeartsHTML = gameState.currentStoryBattle === 'necroverso_final' ? `<span class="header-hearts">${'❤'.repeat(gameState.teamB_hearts)}</span>` : '';
        
        dom.teamScoresContainer.innerHTML = `
            <div class="team-score team-a">
                <span>Time Azul/Verde: ${teamAScore}</span>
                ${teamAHeartsHTML}
            </div>
            <div class="team-score team-b">
                <span>Time Vermelho/Amarelo: ${teamBScore}</span>
                ${teamBHeartsHTML}
            </div>
        `;

    } else { // Solo modes (1v1, 1v2, 1v3, etc.)
        // Do not show side scores for tournament matches
        if (gameState.isTournamentMatch) {
            return;
        }

        // Always show and update the human player's score box (left)
        dom.leftScoreBox.classList.remove('hidden');
        dom.leftScoreBox.className = 'side-score-box player-1-score'; // Always blue for player 1
        dom.leftScoreValue.textContent = scores['player-1'] || 0;
        if(player1.status === 'winning') {
            dom.leftScoreStatus.textContent = 'Ganhando';
            dom.leftScoreStatus.classList.add('winning');
        } else if (player1.status === 'losing') {
            dom.leftScoreStatus.textContent = 'Perdendo';
            dom.leftScoreStatus.classList.add('losing');
        }
        
        // Find the leading opponent to display on the right side
        if (opponents.length > 0) {
            const leadingOpponentId = opponents.sort((a, b) => (scores[b] || 0) - (scores[a] || 0))[0];
            const opponentPlayer = gameState.players[leadingOpponentId];
            const pIdNum = parseInt(leadingOpponentId.split('-')[1]);

            dom.rightScoreBox.classList.remove('hidden');
            dom.rightScoreBox.className = `side-score-box player-${pIdNum}-score`;
            
            const rightScoreDisplay = (opponentPlayer.aiType === 'oespectro' && gameState.gamePhase === 'playing') ? '??' : (scores[leadingOpponentId] || 0);
            dom.rightScoreValue.textContent = rightScoreDisplay;
            
            if (opponentPlayer.status === 'winning' && rightScoreDisplay !== '??') {
                dom.rightScoreStatus.textContent = 'Ganhando';
                dom.rightScoreStatus.classList.add('winning');
            } else if (opponentPlayer.status === 'losing' && rightScoreDisplay !== '??') {
                dom.rightScoreStatus.textContent = 'Perdendo';
                dom.rightScoreStatus.classList.add('losing');
            }
        }
    }
}
