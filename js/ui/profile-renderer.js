// js/ui/profile-renderer.js
import * as dom from '../core/dom.js';
import { t, getCurrentLanguage } from '../core/i18n.js';
import * as network from '../core/network.js';
import { getState } from '../core/state.js';
import { openChatWindow } from './chat-handler.js';
import { TITLE_CONFIG, AVATAR_CATALOG } from '../core/config.js';
import { updateCoinVersusDisplay } from './shop-renderer.js';

function xpForLevel(level) {
    if (level <= 1) return 0;
    return (level - 1) * (level - 1) * 100;
}

/**
 * Renders the "My Avatars" section within the profile modal.
 * @param {object} profileData - The profile data for the user.
 */
function renderMyAvatars(profileData) {
    const grid = document.getElementById('profile-my-avatars-grid');
    const container = document.getElementById('profile-avatar-selection-container');
    if (!grid || !container) return;

    const ownedAvatars = profileData.owned_avatars || [];
    container.classList.remove('hidden');

    const isDefaultEquipped = !profileData.equipped_avatar_code;

    const defaultAvatarHTML = `
        <div class="avatar-item ${isDefaultEquipped ? 'equipped' : ''}">
            <div class="avatar-image-wrapper">
                <svg viewBox="0 0 100 100" fill="#888" xmlns="http://www.w3.org/2000/svg">
                    <path d="M50 50.31a19 19 0 100-38 19 19 0 000 38zm0 5.69c-12.71 0-38 6.35-38 19v9.48h76v-9.48c0-12.65-25.29-19-38-19z"/>
                </svg>
            </div>
            <span class="avatar-name">${t('profile.remove_avatar')}</span>
            ${isDefaultEquipped 
                ? `<button class="control-button" disabled>${t('profile.equipped')}</button>` 
                : `<button class="control-button equip-avatar-btn" data-avatar-code="default">${t('profile.equip')}</button>`
            }
        </div>
    `;

    const ownedAvatarsHTML = ownedAvatars.map(code => {
        const avatar = AVATAR_CATALOG[code];
        if (!avatar) {
            console.warn(`Avatar with code "${code}" not found in local catalog.`);
            return '';
        }

        const isEquipped = profileData.equipped_avatar_code === code;
        const avatarName = t(avatar.nameKey);

        const buttonHTML = isEquipped
            ? `<button class="control-button" disabled>${t('profile.equipped')}</button>`
            : `<button class="control-button equip-avatar-btn" data-avatar-code="${code}">${t('profile.equip')}</button>`;

        return `
            <div class="avatar-item ${isEquipped ? 'equipped' : ''}">
                <div class="avatar-image-wrapper">
                    <img src="./${avatar.image_url}" alt="${avatarName}">
                </div>
                <span class="avatar-name">${avatarName}</span>
                ${buttonHTML}
            </div>
        `;
    }).join('');

    grid.innerHTML = defaultAvatarHTML + ownedAvatarsHTML;
}


export function renderProfile(profileData) {
    if (!profileData) return;
    const { userProfile: myProfile } = getState();
    if (!myProfile) return;
    const isMyProfile = myProfile.google_id === profileData.google_id;

    // --- Dynamically add Admin Tab if user is admin ---
    const tabsContainer = document.getElementById('profile-tabs-container');
    let adminTab = tabsContainer.querySelector('[data-tab="profile-admin"]');
    if (isMyProfile && profileData.isAdmin) {
        if (!adminTab) {
            adminTab = document.createElement('button');
            adminTab.className = 'profile-tab-button';
            adminTab.dataset.tab = 'profile-admin';
            adminTab.setAttribute('data-i18n', 'admin.tab_title');
            adminTab.textContent = t('admin.tab_title');
            tabsContainer.appendChild(adminTab);
        }
    } else {
        if (adminTab) {
            adminTab.remove();
            // Ensure admin content is hidden if tab is removed
            document.getElementById('profile-admin-tab-content').classList.remove('active');
            // Switch back to main profile tab if admin tab was active
            if (adminTab.classList.contains('active')) {
                tabsContainer.querySelector('[data-tab="profile-main"]').classList.add('active');
                document.getElementById('profile-main-tab-content').classList.add('active');
            }
        }
    }


    // --- 1. Renderizar o Display do Cabeçalho (se for meu perfil) ---
    if (isMyProfile) {
        if (dom.userProfileDisplay.classList.contains('hidden')) {
            dom.userProfileDisplay.classList.remove('hidden');
        }
        dom.userAvatar.src = profileData.avatar_url || '';
        dom.userName.textContent = profileData.username || t('game.you');
        dom.userLevel.textContent = profileData.level || 1;
        updateCoinVersusDisplay(profileData.coinversus);
        const currentLevelXp = xpForLevel(profileData.level);
        const nextLevelXp = xpForLevel(profileData.level + 1);
        const xpIntoLevel = profileData.xp - currentLevelXp;
        const xpForThisLevel = nextLevelXp - currentLevelXp;
        const xpPercentage = xpForThisLevel > 0 ? (xpIntoLevel / xpForThisLevel) * 100 : 0;
        dom.xpBarFill.style.width = `${Math.min(100, xpPercentage)}%`;
        dom.xpBarText.textContent = `${profileData.xp} / ${nextLevelXp} XP`;
    }

    // --- 2. Renderizar o Modal de Perfil Detalhado ---
    const lang = getCurrentLanguage().replace('_', '-');
    const joinDate = new Date(profileData.created_at).toLocaleDateString(lang);
    
    let selectedTitleText = profileData.selected_title_code ? t(`titles.${profileData.selected_title_code}`) : '';
    if (selectedTitleText.startsWith('titles.')) {
        selectedTitleText = profileData.selected_title_code;
    }

    // Filter PvP titles to only show the best one achieved
    let filteredTitles = profileData.titles || [];
    if (isMyProfile) {
        const pvpTitles = filteredTitles
            .filter(t => t.line === 'Ranking PvP')
            .sort((a, b) => {
                const rankA = TITLE_CONFIG[a.code]?.rank || 999;
                const rankB = TITLE_CONFIG[b.code]?.rank || 999;
                return rankA - rankB; // Sort by rank number, ascending (1 is best)
            });
        
        if (pvpTitles.length > 0) {
            const bestPvpTitle = pvpTitles[0];
            // Filter out all PvP titles, then add back only the best one.
            filteredTitles = filteredTitles.filter(t => t.line !== 'Ranking PvP');
            filteredTitles.push(bestPvpTitle);
        }
    }


    const titlesHTML = isMyProfile ? (filteredTitles || []).reduce((acc, title) => {
        if (!acc[title.line]) acc[title.line] = '';
        let titleName = t(`titles.${title.code}`) || title.name;
        if (titleName.startsWith('titles.')) {
            titleName = title.code;
        }
        acc[title.line] += `
            <li>
                <input type="radio" id="title-${title.code}" name="selected-title" value="${title.code}" ${profileData.selected_title_code === title.code ? 'checked' : ''}>
                <label for="title-${title.code}">${titleName}</label>
            </li>`;
        return acc;
    }, {}) : {};
    
    const titlesSectionHTML = isMyProfile ? `
        <div class="profile-section">
            <h3>${t('profile.select_title')}</h3>
            <form id="title-selection-form">
                ${Object.entries(titlesHTML).map(([line, lis]) => `<h4>${line}</h4><ul class="profile-titles-list">${lis}</ul>`).join('') || `<p>${t('profile.no_titles')}</p>`}
            </form>
        </div>` : '';

    const historyHTML = (profileData.history || []).map(match => `
        <li>
            <span class="${match.outcome === 'Vitória' ? 'history-outcome-win' : 'history-outcome-loss'}">${t(match.outcome === 'Vitória' ? 'profile.outcome_win' : 'profile.outcome_loss')}</span>
            <span>${match.mode}</span>
            <span>${new Date(match.date).toLocaleDateString(lang)}</span>
        </li>`
    ).join('');

    let finalHTML = `
        <div class="profile-grid">
            <div class="profile-sidebar">
                <img src="${profileData.avatar_url}" alt="${t('profile.avatar_alt')}" class="profile-avatar">
                <h2 class="profile-username">${profileData.username}</h2>
                <p class="profile-title-display">${selectedTitleText}</p>
                <p class="profile-joindate">${t('profile.since', { date: joinDate })}</p>
            </div>
            <div class="profile-main-content">
                <div class="profile-stats-grid">
                    <div class="profile-stat-item"><h4>${t('profile.level')}</h4><p>${profileData.level}</p></div>
                    <div class="profile-stat-item"><h4>${t('profile.experience')}</h4><p>${profileData.xp}</p></div>
                    <div class="profile-stat-item"><h4>${t('profile.victories')}</h4><p>${profileData.victories}</p></div>
                    <div class="profile-stat-item"><h4>${t('profile.defeats')}</h4><p>${profileData.defeats}</p></div>
                    <div class="profile-stat-item"><h4>${t('profile.coinversus')}</h4><p>${profileData.coinversus || 0}</p></div>
                </div>
                ${titlesSectionHTML}
                <div class="profile-section">
                    <h3>${t('profile.match_history')}</h3>
                    <ul class="profile-history-list">${historyHTML || `<li>${t('profile.no_history')}</li>`}</ul>
                </div>
            </div>
        </div>`;
    
    dom.profileDataContainer.innerHTML = finalHTML;

    // --- 3. Renderizar Meus Avatares (se for meu perfil) ---
    if (isMyProfile) {
        renderMyAvatars(profileData);
    } else {
        const container = document.getElementById('profile-avatar-selection-container');
        if (container) container.classList.add('hidden');
    }

    // Adicionar botões de ação (amigo/silenciar) fora do grid principal de dados
    const actionButtonsContainer = document.getElementById('profile-action-buttons');
    const settingsContainer = document.getElementById('profile-settings-container');

    if(settingsContainer) settingsContainer.innerHTML = ''; // Limpa configurações anteriores
    if(actionButtonsContainer) actionButtonsContainer.innerHTML = ''; // Limpa botões de amizade anteriores

    if (!isMyProfile) {
        let buttonHTML = '';
        switch(profileData.friendshipStatus) {
            case 'friends':
                buttonHTML = `<button class="control-button cancel remove-friend-btn" data-user-id="${profileData.id}">${t('profile.remove_friend')}</button>`;
                break;
            case 'pending':
                buttonHTML = `<button class="control-button" disabled>${t('profile.request_sent')}</button>`;
                break;
            default: // 'none'
                buttonHTML = `<button class="control-button add-friend-btn" data-user-id="${profileData.id}">${t('profile.add_friend')}</button>`;
                break;
        }
        if(actionButtonsContainer) actionButtonsContainer.innerHTML = buttonHTML;
    } else {
        document.getElementById('title-selection-form')?.addEventListener('change', (e) => {
            if (e.target.name === 'selected-title') network.emitSetSelectedTitle(e.target.value);
        });
    }
}

export function renderAdminPanel({ online, banned, pendingReports, totalConnections, dailyStats }) {
    const adminTabContent = document.getElementById('profile-admin-tab-content');
    if (!adminTabContent) return;

    const lang = getCurrentLanguage().replace('_', '-');

    const dailyStatsHTML = dailyStats && dailyStats.length > 0 ? `
        <div class="admin-user-list" style="max-height: 200px;">
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Jogadores Únicos</th>
                    </tr>
                </thead>
                <tbody>
                    ${dailyStats.map(stat => `
                        <tr>
                            <td>${new Date(stat.access_date).toLocaleDateString(lang)}</td>
                            <td>${stat.unique_users}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    ` : `<p>Nenhum dado de acesso diário registrado.</p>`;


    const reportsHTML = pendingReports && pendingReports.length > 0 ? pendingReports.map(report => `
        <div class="admin-user-item">
            <div class="admin-user-info">
                <img src="${report.reported_avatar_url}" alt="Avatar" class="friend-avatar">
                <div class="admin-user-details" style="flex-grow: 1;">
                    <span class="friend-name">${report.reported_username}</span>
                    <span class="friend-title" style="word-break: break-word;">${t('admin.report_from', { username: report.reporter_username })}</span>
                    <p class="friend-title" style="margin-top: 5px; font-style: italic; background: rgba(0,0,0,0.2); padding: 5px; border-radius: 4px;">“${report.message}”</p>
                </div>
            </div>
            <div class="admin-actions" style="flex-direction: column; align-items: flex-end; gap: 0.5rem;">
                <button class="control-button cancel admin-ban-btn" data-user-id="${report.reported_user_id}" data-username="${report.reported_username}">${t('admin.ban_button')}</button>
                <button class="control-button secondary admin-dismiss-report-btn" data-report-id="${report.id}">${t('admin.dismiss_report')}</button>
            </div>
        </div>
    `).join('') : `<p>${t('admin.no_reports')}</p>`;

    const onlineUsersHTML = online.length > 0 ? online.map(user => `
        <div class="admin-user-item">
            <div class="admin-user-info">
                <img src="${user.avatar_url}" alt="Avatar" class="friend-avatar">
                <div class="admin-user-details">
                    <span class="friend-name">${user.username}</span>
                    <span class="friend-title">ID: ${user.id}</span>
                </div>
            </div>
            <div class="admin-actions" style="flex-direction: column; align-items: flex-end; gap: 0.5rem;">
                <button class="control-button cancel admin-rollback-btn" data-user-id="${user.id}" data-username="${user.username}" title="${t('admin.rollback_button')}">${t('admin.rollback_button')}</button>
                <button class="control-button cancel admin-ban-btn" data-user-id="${user.id}" data-username="${user.username}">${t('admin.ban_button')}</button>
            </div>
        </div>
    `).join('') : `<p>${t('admin.no_online_users')}</p>`;

    const bannedUsersHTML = banned.length > 0 ? banned.map(user => `
         <div class="admin-user-item">
            <div class="admin-user-info">
                <img src="${user.avatar_url}" alt="Avatar" class="friend-avatar">
                <div class="admin-user-details">
                    <span class="friend-name">${user.username}</span>
                     <span class="friend-title">ID: ${user.id}</span>
                </div>
            </div>
            <div class="admin-actions" style="flex-direction: column; align-items: flex-end; gap: 0.5rem;">
                 <button class="control-button cancel admin-rollback-btn" data-user-id="${user.id}" data-username="${user.username}" title="${t('admin.rollback_button')}">${t('admin.rollback_button')}</button>
                <button class="control-button btn-p3-color admin-unban-btn" data-user-id="${user.id}" data-username="${user.username}">${t('admin.unban_button')}</button>
            </div>
        </div>
    `).join('') : `<p>${t('admin.no_banned_users')}</p>`;

    adminTabContent.innerHTML = `
        <div class="admin-section">
            <h3>${t('admin.server_status')}</h3>
            <p><strong>Conexões Ativas no Servidor:</strong> ${totalConnections || 0}</p>
            <br>
            <h4>Acessos Diários (Últimos 30 Dias)</h4>
            ${dailyStatsHTML}
        </div>
        <div class="admin-section">
            <h3 style="color: var(--accent-yellow); border-bottom-color: var(--accent-yellow);">${t('admin.self_actions')}</h3>
             <div class="admin-self-actions">
                <label for="admin-add-coins-input">${t('admin.add_coins_label')}</label>
                <div class="friends-search-container" style="margin-top: 0.5rem;">
                    <input type="number" id="admin-add-coins-input" class="friends-search-input" placeholder="1000">
                    <button id="admin-add-coins-btn" class="control-button">${t('admin.add_coins_button')}</button>
                </div>
            </div>
        </div>
        <div class="admin-section">
            <h3 style="color: var(--accent-yellow); border-bottom-color: var(--accent-yellow);">${t('admin.player_reports')}</h3>
            <div class="admin-user-list">${reportsHTML}</div>
        </div>
        <div class="admin-section">
            <h3>${t('admin.online_users')}</h3>
            <div class="admin-user-list">${onlineUsersHTML}</div>
        </div>
        <div class="admin-section">
            <h3>${t('admin.banned_users')}</h3>
            <div class="admin-user-list">${bannedUsersHTML}</div>
        </div>
    `;
}


export function renderSearchResults(results) {
    const container = document.getElementById('friends-search-results');
    if (results.length === 0) {
        container.innerHTML = `<p>${t('friends.no_results')}</p>`;
        return;
    }
    container.innerHTML = results.map(user => `
        <div class="friend-item">
            <img src="${user.avatar_url}" alt="Avatar" class="friend-avatar">
            <div class="friend-info">
                <span class="friend-name">${user.username}</span>
            </div>
            <div class="friend-actions">
                <button class="control-button add-friend-btn" data-user-id="${user.id}">${t('friends.add')}</button>
            </div>
        </div>
    `).join('');
}

export function renderFriendsList(friends) {
    const container = document.getElementById('friends-list-container');
    if (friends.length === 0) {
        container.innerHTML = `<p>${t('friends.no_friends')}</p>`;
        return;
    }

    container.innerHTML = friends.map(friend => {
        const statusClass = friend.isOnline ? 'online' : 'offline';
        const statusText = friend.isOnline ? t('friends.status_online') : t('friends.status_offline');
        let titleText = friend.selected_title_code ? t(`titles.${friend.selected_title_code}`) : '';
        if (titleText.startsWith('titles.')) {
            titleText = friend.selected_title_code;
        }

        return `
            <div class="friend-item">
                <img src="${friend.avatar_url}" alt="Avatar" class="friend-avatar">
                <div class="friend-info">
                    <span class="friend-name">
                        <div class="friend-status ${statusClass}" title="${statusText}"></div>
                        ${friend.username}
                    </span>
                    <span class="friend-title">${titleText}</span>
                </div>
                <div class="friend-actions">
                    <button class="control-button view-profile-btn" data-google-id="${friend.google_id}" title="${t('friends.view_profile')}">👤</button>
                    ${friend.isOnline ? `<button class="control-button send-message-btn" data-user-id="${friend.id}" data-username="${friend.username}" title="${t('friends.send_message')}">💬</button>` : ''}
                    <button class="control-button cancel remove-friend-btn" data-user-id="${friend.id}" title="${t('friends.remove')}">✖</button>
                </div>
            </div>
        `;
    }).join('');
}

export function renderOnlineFriendsForInvite(friends) {
    if (!dom.inviteFriendsList) return;

    if (friends.length === 0) {
        dom.inviteFriendsList.innerHTML = `<p>${t('pvp.no_online_friends')}</p>`;
        return;
    }
    
    dom.inviteFriendsList.innerHTML = friends.map(friend => `
        <div class="friend-item">
            <img src="${friend.avatar_url}" alt="Avatar" class="friend-avatar">
            <div class="friend-info">
                <span class="friend-name">${friend.username}</span>
            </div>
            <div class="friend-actions">
                <button class="control-button invite-friend-btn" data-user-id="${friend.id}">${t('pvp.invite')}</button>
            </div>
        </div>
    `).join('');
}

export function renderFriendRequests(requests) {
    if (!dom.friendRequestsListContainer) return;
    if (requests.length === 0) {
        dom.friendRequestsListContainer.innerHTML = `<p>${t('friends.no_requests')}</p>`;
        return;
    }
    dom.friendRequestsListContainer.innerHTML = requests.map(req => `
        <div class="friend-item friend-request-item">
             <img src="${req.avatar_url}" alt="Avatar" class="friend-avatar">
            <div class="friend-info">
                <span class="friend-name">${req.username}</span>
            </div>
            <div class="friend-actions">
                <button class="control-button btn-p3-color accept-request-btn" data-request-id="${req.id}">${t('friends.accept')}</button>
                <button class="control-button cancel decline-request-btn" data-request-id="${req.id}">${t('friends.decline')}</button>
            </div>
        </div>
    `).join('');
}

export function addPrivateChatMessage({ senderId, senderUsername, content, recipientId }) {
    const { userProfile } = getState();
    const isSent = senderId === userProfile.id;
    const targetUserId = isSent ? recipientId : senderId;
    const targetUsername = isSent ? '???' : senderUsername; // We need a way to get recipient username

    // Open window if it doesn't exist
    const chatWindow = document.getElementById(`chat-window-${targetUserId}`);
    if (!chatWindow) {
        openChatWindow(targetUserId, targetUsername);
    }
    
    const messagesContainer = document.querySelector(`#chat-window-${targetUserId} .chat-window-messages`);
    if (messagesContainer) {
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${isSent ? 'sent' : 'received'}`;
        messageEl.textContent = content;
        messagesContainer.appendChild(messageEl);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

export function updateFriendStatusIndicator(userId, isOnline) {
    // This is less efficient than a targeted update, but safer for now.
    // A better implementation would find the specific friend item and toggle its class.
    network.emitGetFriendsList();
}