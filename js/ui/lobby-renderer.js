import * as dom from '../core/dom.js';
import { getState } from '../core/state.js';
import { t } from '../core/i18n.js';
import * as network from '../core/network.js';

export const renderRoomList = (rooms) => {
    if (!dom.pvpRoomGridEl) return;
    if (rooms.length === 0) {
        dom.pvpRoomGridEl.innerHTML = `<p style="text-align: center; width: 100%;">${t('pvp.no_rooms')}</p>`;
        return;
    }

    const modeKeyMap = {
        'solo-2p': 'pvp.mode_2p',
        'solo-3p': 'pvp.mode_3p',
        'solo-4p': 'pvp.mode_4p',
        'duo': 'pvp.mode_duo'
    };

    dom.pvpRoomGridEl.innerHTML = rooms.map((room, index) => {
        const colorClass = `color-${(index % 4) + 1}`;
        const modeText = t(modeKeyMap[room.mode] || room.mode);
        const passwordIcon = room.hasPassword ? '<span class="password-icon" title="Sala com senha">🔒</span>' : '';
        const betIcon = room.betAmount > 0 ? `<span class="bet-icon" title="${t('pvp.bet_title', { betAmount: room.betAmount })}">🪙 x${room.betAmount}</span>` : '';
        const playersHTML = room.players.map(p => `<span class="room-player-name clickable" data-google-id="${p.googleId}">${p.username}</span>`).join('') || `<span class="room-player-name">${t('pvp.empty_room')}</span>`;

        return `
            <div class="room-card ${colorClass}">
                <h3>${room.name} ${passwordIcon} ${betIcon}</h3>
                <div class="room-card-players-list">
                    ${playersHTML}
                </div>
                <div class="room-card-footer">
                    <span>${t('pvp.room_card_mode', { mode: modeText })}</span>
                    <span>${t('pvp.room_card_players', { count: room.playerCount, max: 4 })}</span>
                </div>
                <button class="control-button join-room-button" data-room-id="${room.id}" data-has-password="${room.hasPassword}">${t('pvp.enter')}</button>
            </div>
        `;
    }).join('');
};


export const renderRanking = (rankingData) => {
    const { players, currentPage, totalPages } = rankingData;

    if (!players) {
        dom.rankingContainer.innerHTML = `<p>${t('ranking.error')}</p>`;
        dom.rankingPagination.innerHTML = '';
        return;
    }
    if (players.length === 0 && currentPage === 1) {
        dom.rankingContainer.innerHTML = `<p>${t('ranking.empty')}</p>`;
        dom.rankingPagination.innerHTML = '';
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
    dom.rankingContainer.innerHTML = tableHTML;

    // Render pagination
    const paginationHTML = `
        <button id="rank-prev-btn" ${currentPage === 1 ? 'disabled' : ''}>&lt;</button>
        <span>Página ${currentPage} de ${totalPages}</span>
        <button id="rank-next-btn" ${currentPage >= totalPages ? 'disabled' : ''}>&gt;</button>
    `;
    dom.rankingPagination.innerHTML = paginationHTML;
};


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
};