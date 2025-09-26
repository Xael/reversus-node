// js/ui/torneio-renderer.js
import * as dom from '../core/dom.js';
import { t } from '../core/i18n.js';
import { getState } from '../core/state.js';

let queueCountdownInterval = null;

function clearViews(container) {
    const hubView = container.querySelector('#tournament-hub-view');
    const queueView = container.querySelector('#tournament-queue-view');
    const mainView = container.querySelector('#tournament-main-view');
    const championView = container.querySelector('#tournament-champion-view');

    if (hubView) hubView.classList.add('hidden');
    if (queueView) queueView.classList.add('hidden');
    if (mainView) mainView.classList.add('hidden');
    if (championView) championView.classList.add('hidden');
}

function getPlayerName(player) {
    if (player && player.username && (player.username.startsWith('event_chars.') || player.username.startsWith('player_names.') || player.username.startsWith('avatars.'))) {
        return t(player.username);
    }
    return player ? player.username : 'Desconhecido';
}

export function renderTournamentView(state) {
    const { gameState } = getState();
    const inMatch = gameState && gameState.isTournamentMatch;

    if (inMatch) {
        // We are in a match, render the bracket inside the game's center panel
        dom.tournamentModal.classList.add('hidden');
        dom.tournamentViewContainer.classList.remove('hidden');
        renderMainView(state, dom.tournamentViewContainer);
    } else {
        // Not in a match, render the appropriate view inside the modal
        dom.tournamentModal.classList.remove('hidden');
        dom.tournamentViewContainer.classList.add('hidden');
        
        switch (state.status) {
            case 'hub':
                renderHubView(dom.tournamentModal);
                break;
            case 'queue':
                renderQueueView(state, dom.tournamentModal);
                break;
            case 'active':
            case 'finished':
                renderMainView(state, dom.tournamentModal);
                break;
            default:
                renderHubView(dom.tournamentModal);
                break;
        }
    }
}

function renderHubView(container) {
    clearViews(container);
    container.querySelector('#tournament-hub-view').classList.remove('hidden');
}

function renderQueueView(state, container) {
    clearViews(container);
    const queueView = container.querySelector('#tournament-queue-view');
    queueView.classList.remove('hidden');

    const queueStatusEl = queueView.querySelector('#tournament-queue-status-text');
    if (queueStatusEl) {
        queueStatusEl.textContent = t('tournament.searching', { current: state.playerCount, max: state.max || 8 });
    }

    if (queueCountdownInterval) clearInterval(queueCountdownInterval);
    const countdownEl = queueView.querySelector('#tournament-queue-countdown');
    if (countdownEl && state.timeout && state.playerCount > 0) {
        let timeLeft = state.timeout;
        countdownEl.textContent = t('tournament.starting_in', { seconds: timeLeft });
        countdownEl.classList.remove('hidden');

        queueCountdownInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft >= 0) {
                countdownEl.textContent = t('tournament.starting_in', { seconds: timeLeft });
            } else {
                countdownEl.textContent = t('tournament.starting_now');
                clearInterval(queueCountdownInterval);
            }
        }, 1000);
    } else if (countdownEl) {
        countdownEl.classList.add('hidden');
    }
}

function renderMainView(state, container) {
    const isModal = container.id === 'tournament-modal';

    const leaderboardHTML = renderLeaderboard(state.leaderboard, state.players);
    const matchesHTML = renderMatches(state, state.currentRound);
    const championHTML = state.status === 'finished' ? renderChampionView(state) : '';

    const content = `
        <div id="tournament-main-view" class="${isModal ? '' : 'in-game-view'}">
             ${championHTML}
             <div class="tournament-main-grid">
                <div id="tournament-leaderboard-container">
                    ${leaderboardHTML}
                </div>
                <div id="tournament-matches-container">
                    ${matchesHTML}
                </div>
            </div>
            <div class="tournament-actions-container">
                 <button id="tournament-continue-btn" class="control-button hidden" data-i18n="tournament.continue_to_match">Continuar para Partida</button>
            </div>
        </div>
    `;

    if (isModal) {
        clearViews(container);
        const modalContent = container.querySelector('.modal-content');
        let mainViewEl = modalContent.querySelector('#tournament-main-view');
        if (!mainViewEl) {
            mainViewEl = document.createElement('div');
            modalContent.appendChild(mainViewEl);
        }
        mainViewEl.innerHTML = content;
        mainViewEl.classList.remove('hidden');
    } else {
        container.innerHTML = content;
    }
    
    // After rendering, check if the "Continue" button should be shown
    const continueBtn = container.querySelector('#tournament-continue-btn');
    const { userProfile } = getState();
    const roundMatches = state.schedule.find(round => round.round === state.currentRound)?.matches || [];
    const myMatch = roundMatches.find(m => (m.p1.id === userProfile.id || m.p2.id === userProfile.id) && m.result === null);
    if (myMatch && continueBtn) {
        continueBtn.dataset.matchId = myMatch.matchId;
        continueBtn.classList.remove('hidden');
    }
}

function renderChampionView(state) {
    const champion = state.leaderboard[0];
    const runnerUp = state.leaderboard[1];
    const championPlayer = state.players.find(p => p.id === champion.id);
    const runnerUpPlayer = state.players.find(p => p.id === runnerUp.id);
    
    return `
        <div id="tournament-champion-view">
            <h2>${t('tournament.champion_title')}</h2>
            <p class="champion-name">🏆 ${getPlayerName(championPlayer)} 🏆</p>
            <p class="prize-info">${t('tournament.prize_champion')}</p>
            <br>
            <h3>${t('tournament.runner_up_title')}</h3>
            <p class="runner-up-name">🥈 ${getPlayerName(runnerUpPlayer)} 🥈</p>
            <p class="prize-info">${t('tournament.prize_runner_up')}</p>
        </div>
    `;
}

function renderLeaderboard(leaderboard, allPlayers) {
    const sortedLeaderboard = [...leaderboard].sort((a, b) => b.points - a.points || b.wins - a.wins);
    return `
        <h3 class="tournament-section-title">${t('tournament.leaderboard')}</h3>
        <table class="tournament-table">
            <thead>
                <tr>
                    <th>${t('tournament.header_pos')}</th>
                    <th>${t('tournament.header_name')}</th>
                    <th>${t('tournament.header_points')}</th>
                    <th>${t('tournament.header_wins')}</th>
                    <th>${t('tournament.header_draws')}</th>
                    <th>${t('tournament.header_losses')}</th>
                </tr>
            </thead>
            <tbody>
                ${sortedLeaderboard.map((playerEntry, index) => {
                    const fullPlayer = allPlayers.find(p => p.id === playerEntry.id);
                    const avatarUrl = fullPlayer?.avatar_url ? (fullPlayer.avatar_url.startsWith('http') ? fullPlayer.avatar_url : `./${fullPlayer.avatar_url}`) : './aleatorio1.png';
                    return `
                    <tr>
                        <td>${index + 1}</td>
                        <td class="tournament-player-cell">
                            <img src="${avatarUrl}" alt="Avatar" class="tournament-player-avatar">
                            <span>${getPlayerName(fullPlayer)}</span>
                        </td>
                        <td>${playerEntry.points}</td>
                        <td>${playerEntry.wins}</td>
                        <td>${playerEntry.draws}</td>
                        <td>${playerEntry.losses}</td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
    `;
}

function renderMatches(state, currentRound) {
    const allPlayers = state.players;
    const roundMatches = state.schedule.find(round => round.round === currentRound)?.matches || [];
    const { userProfile } = getState();

    return `
        <h3 class="tournament-section-title">${t('tournament.current_round', { round: currentRound })}</h3>
        <div class="matches-grid">
            ${roundMatches.map(match => {
                const player1 = allPlayers.find(p => p.id === match.p1.id);
                const player2 = allPlayers.find(p => p.id === match.p2.id);
                const isMyMatch = player1.id === userProfile.id || player2.id === userProfile.id;
                const isFinished = match.result !== null;
                
                let resultText = '';
                if (isFinished) {
                    if (match.winnerId === 'draw') resultText = '1 - 1';
                    else if (match.winnerId === player1.id) resultText = 'V - D';
                    else resultText = 'D - V';
                }

                const p1AvatarUrl = player1?.avatar_url ? (player1.avatar_url.startsWith('http') ? player1.avatar_url : `./${player1.avatar_url}`) : './aleatorio1.png';
                const p2AvatarUrl = player2?.avatar_url ? (player2.avatar_url.startsWith('http') ? player2.avatar_url : `./${player2.avatar_url}`) : './aleatorio1.png';

                return `
                    <div class="match-card ${isMyMatch && !isFinished ? 'my-match' : ''} ${isFinished ? 'finished' : ''}">
                        <div class="match-player">
                            <img src="${p1AvatarUrl}" class="match-player-avatar">
                            <span>${getPlayerName(player1)}</span>
                        </div>
                        <div class="match-result">${isFinished ? resultText : 'vs'}</div>
                        <div class="match-player">
                            <img src="${p2AvatarUrl}" class="match-player-avatar">
                            <span>${getPlayerName(player2)}</span>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

export function renderTournamentRankingTable(rankingData) {
    const { players, currentPage, totalPages } = rankingData;
    const container = dom.tournamentRankingContainer;
    const pagination = dom.tournamentRankingPagination;

    if (!players || !container || !pagination) return;
    
    if (players.length === 0 && currentPage === 1) {
        container.innerHTML = `<p>${t('ranking.empty')}</p>`;
        pagination.innerHTML = '';
        return;
    }

    const tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>${t('ranking.header_rank')}</th>
                    <th colspan="2">${t('ranking.header_player')}</th>
                    <th>${t('tournament.header_total_points')}</th>
                    <th>${t('tournament.header_tournaments_won')}</th>
                </tr>
            </thead>
            <tbody>
                ${players.map((player, index) => {
                    const rank = (currentPage - 1) * 10 + index + 1;
                    let titleText = player.selected_title_code ? t(`titles.${player.selected_title_code}`) : '';
                    if (titleText.startsWith('titles.')) titleText = player.selected_title_code;
                    const avatarUrl = player.avatar_url ? (player.avatar_url.startsWith('http') ? player.avatar_url : `./${player.avatar_url}`) : './aleatorio1.png';
                    return `
                    <tr class="rank-${rank}">
                        <td class="rank-position">${rank}</td>
                        <td><img src="${avatarUrl}" alt="Avatar" class="rank-avatar"></td>
                        <td>
                            <span class="rank-name clickable" data-google-id="${player.google_id}">${player.username}</span>
                            <span class="rank-player-title">${titleText}</span>
                        </td>
                        <td>${player.total_points}</td>
                        <td>${player.tournaments_won || 0}</td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
    `;
    container.innerHTML = tableHTML;

    const paginationHTML = `
        <button id="tournament-rank-prev-btn" ${currentPage === 1 ? 'disabled' : ''}>&lt;</button>
        <span>Página ${currentPage} de ${totalPages}</span>
        <button id="tournament-rank-next-btn" ${currentPage >= totalPages ? 'disabled' : ''}>&gt;</button>
    `;
    pagination.innerHTML = paginationHTML;
}

export function renderTournamentMatchScore(score) {
    const container = dom.tournamentMatchScoreContainer;
    if (!container) return;
    container.classList.remove('hidden');
    container.innerHTML = `<span class="tournament-match-score">${t('tournament.best_of_3_score')}: ${score[0]} - ${score[1]}</span>`;
}

export function clearTournamentMatchScore() {
    const container = dom.tournamentMatchScoreContainer;
    if (container) {
        container.classList.add('hidden');
        container.innerHTML = '';
    }
}