import * as dom from '../core/dom.js';
import { getState } from '../core/state.js';
import { t } from '../core/i18n.js';
import * as network from '../core/network.js';

export function renderRoomList(rooms) {
    if (!dom.pvpRoomGridEl) return;

    if (rooms.length === 0) {
        dom.pvpRoomGridEl.innerHTML = `<p style="grid-column: 1 / -1; text-align: center;">${t('pvp.no_rooms')}</p>`;
        return;
    }

    const roomColors = ['color-1', 'color-2', 'color-3', 'color-4'];
    dom.pvpRoomGridEl.innerHTML = rooms.map((room, index) => {
        const passwordIcon = room.hasPassword ? `<span class="password-icon" title="Sala com senha">🔒</span>` : '';
        const betIcon = room.betAmount > 0 ? `<span class="bet-icon" title="${t('pvp.bet_title', { betAmount: room.betAmount })}">🪙x${room.betAmount}</span>` : '';
        
        let modeText = '';
        switch(room.mode) {
            case 'solo-2p': modeText = t('pvp.mode_2p'); break;
            case 'solo-3p': modeText = t('pvp.mode_3p'); break;
            case 'solo-4p': modeText = t('pvp.mode_4p'); break;
            case 'duo': modeText = t('pvp.mode_duo'); break;
            default: modeText = room.mode;
        }

        return `
            <div class="room-card ${roomColors[index % roomColors.length]}">
                <h3>
                    <span>${room.name}</span>
                    <span style="display: flex; gap: 0.5rem;">${betIcon}${passwordIcon}</span>
                </h3>
                <div class="room-card-players-list">
                    ${room.players.map(p => `<span class="room-player-name clickable" data-google-id="${p.googleId}">${p.username}</span>`).join('')}
                </div>
                <div class="room-card-footer">
                    <span>${t('pvp.room_card_mode', { mode: modeText })}</span>
                    <span>${t('pvp.room_card_players', { count: room.playerCount })}</span>
                    <button class="control-button join-room-button" data-room-id="${room.id}" data-has-password="${room.hasPassword}" ${room.playerCount >= 4 ? 'disabled' : ''}>
                        ${t('pvp.enter')}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

export function renderPvpRanking(rankingData) {
    const { players, currentPage, totalPages } = rankingData;

    const container = document.getElementById('ranking-container');
    const pagination = document.getElementById('ranking-pagination');

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
                    <th>${t('ranking.header_victories')}</th>
                    <th>${t('ranking.header_coinversus')}</th>
                </tr>
            </thead>
            <tbody>
                ${players.map(player => {
                    let titleText = player.selected_title_code ? t(`titles.${player.selected_title_code}`) : '';
                    if (titleText.startsWith('titles.')) {
                        titleText = player.selected_title_code; // Fallback to the code itself
                    }
                    return `
                    <tr class="rank-${player.rank}">
                        <td class="rank-position">${player.rank}</td>
                        <td><img src="${player.avatar_url}" alt="Avatar" class="rank-avatar"></td>
                        <td>
                            <span class="rank-name clickable" data-google-id="${player.google_id}">${player.username}</span>
                            <span class="rank-player-title">${titleText}</span>
                        </td>
                        <td>${player.victories}</td>
                        <td>${player.coinversus || 0}</td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
    `;
    container.innerHTML = tableHTML;

    // Render pagination
    const paginationHTML = `
        <button id="rank-prev-btn" ${currentPage === 1 ? 'disabled' : ''}>&lt;</button>
        <span>Página ${currentPage} de ${totalPages}</span>
        <button id="rank-next-btn" ${currentPage >= totalPages ? 'disabled' : ''}>&gt;</button>
    `;
    pagination.innerHTML = paginationHTML;
};

export function renderInfiniteRanking(rankingData) {
    const { players, currentPage, totalPages } = rankingData;
    const container = dom.infiniteRankingContainer;
    const pagination = document.getElementById('infinite-ranking-pagination');

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
                    <th>${t('ranking.header_level')}</th>
                    <th>${t('ranking.header_time')}</th>
                </tr>
            </thead>
            <tbody>
                ${players.map((player, index) => {
                    const rank = (currentPage - 1) * 10 + index + 1;
                    const minutes = Math.floor(player.time_seconds / 60).toString().padStart(2, '0');
                    const seconds = (player.time_seconds % 60).toString().padStart(2, '0');
                    const timeFormatted = `${minutes}:${seconds}`;
                    let titleText = player.selected_title_code ? t(`titles.${player.selected_title_code}`) : '';
                    if (titleText.startsWith('titles.')) {
                        titleText = player.selected_title_code;
                    }
                    return `
                    <tr class="rank-${rank}">
                        <td class="rank-position">${rank}</td>
                        <td><img src="${player.avatar_url}" alt="Avatar" class="rank-avatar"></td>
                        <td>
                            <span class="rank-name clickable" data-google-id="${player.google_id}">${player.username}</span>
                            <span class="rank-player-title">${titleText}</span>
                        </td>
                        <td>${player.highest_level}</td>
                        <td>${timeFormatted}</td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
    `;
    container.innerHTML = tableHTML;

    const paginationHTML = `
        <button id="infinite-rank-prev-btn" ${currentPage === 1 ? 'disabled' : ''}>&lt;</button>
        <span>Página ${currentPage} de ${totalPages}</span>
        <button id="infinite-rank-next-btn" ${currentPage >= totalPages ? 'disabled' : ''}>&gt;</button>
    `;
    pagination.innerHTML = paginationHTML;
}

export const updateLobbyUi = (roomData) => {
    const { clientId } = getState();
    const isHost = roomData.hostId === clientId;

    dom.lobbyTitle.textContent = t('pvp.lobby_title', { roomName: roomData.name });

    const playerGrid = document.querySelector('.lobby-player-grid');
    playerGrid.innerHTML = ''; 
    const playerSlots = ['player-1', 'player-2', 'player-3', 'player-4'];
    
    playerSlots.forEach((slot, index) => {
        const player = roomData.players.find(p => p.playerId === slot);
        const slotEl = document.createElement('div');
        slotEl.className = 'lobby-player-slot';
        slotEl.id = `lobby-player-${index + 1}`;
        
        if (player) {
            const hostStar = player.id === roomData.hostId ? ' <span class="master-star">★</span>' : '';
            let playerTitleText = player.title_code ? t(`titles.${player.title_code}`) : '';
            if (playerTitleText.startsWith('titles.')) {
                playerTitleText = player.title_code;
            }
            const playerTitle = playerTitleText ? `<span class="player-title">${playerTitleText}</span>` : '';
            const kickButton = (isHost && player.id !== clientId) ? `<button class="kick-player-button" data-kick-id="${player.id}" title="${t('pvp.kick_player_title', { username: player.username })}">×</button>` : '';

            slotEl.innerHTML = `
                ${kickButton}
                <div>
                    <span class="player-name clickable" data-google-id="${player.googleId}">${player.username}</span>${hostStar}
                </div>
                ${playerTitle}
            `;
        } else {
            if (isHost) {
                slotEl.innerHTML = `<button class="control-button invite-friend-slot-btn">${t('pvp.invite_friend')}</button>`;
            } else {
                slotEl.textContent = t('pvp.waiting_player');
            }
        }
        playerGrid.appendChild(slotEl);
    });

    dom.lobbyGameModeEl.value = roomData.mode;
    dom.lobbyGameModeEl.disabled = !isHost;

    const playerCount = roomData.players.length;
    let canStart = false;
    switch (roomData.mode) {
        case 'solo-2p': canStart = playerCount === 2; break;
        case 'solo-3p': canStart = playerCount === 3; break;
        case 'solo-4p': case 'duo': canStart = playerCount === 4; break;
    }
    dom.lobbyStartGameButton.disabled = !(isHost && canStart);
};

export const addLobbyChatMessage = (speaker, message) => {
    const messageEl = document.createElement('div');
    const sanitizedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    messageEl.innerHTML = `<strong>${speaker}:</strong> ${sanitizedMessage}`;
    dom.lobbyChatHistoryEl.appendChild(messageEl);
    dom.lobbyChatHistoryEl.scrollTop = dom.lobbyChatHistoryEl.scrollHeight;
}