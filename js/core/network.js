// js/core/network.js
import { getState, updateState } from './state.js';
import * as dom from './dom.js';
import { renderAll, showGameOver, showRoundSummaryModal, showTurnIndicator } from '../ui/ui-renderer.js';
import { renderRanking, updateLobbyUi, renderRoomList, addLobbyChatMessage } from '../ui/lobby-renderer.js';
import { renderProfile, renderFriendsList, renderSearchResults, addPrivateChatMessage, updateFriendStatusIndicator, renderFriendRequests, renderAdminPanel, renderOnlineFriendsForInvite } from '../ui/profile-renderer.js';
import { showSplashScreen } from './splash-screen.js';
import { updateLog } from './utils.js';
import { updateGameTimer } from '../game-controller.js';
import { showPvpDrawSequence } from '../game-logic/turn-manager.js';
import { t } from './i18n.js';
import { animateCardPlay } from '../ui/animations.js';
import { showCoinRewardNotification } from '../ui/toast-renderer.js';
import { playSoundEffect, announceEffect } from '../core/sound.js';
import * as sound from './sound.js';
import { renderShopAvatars, updateCoinVersusDisplay } from '../ui/shop-renderer.js';

/**
 * Sets up the player areas in the UI so the local player is always at the bottom.
 */
function setupPlayerPerspective() {
    const { gameState, playerId } = getState();
    if (!gameState || !playerId || !gameState.playerIdsInGame) return;

    const playerIds = gameState.playerIdsInGame;
    if (!playerIds.includes(playerId)) return;
    
    const myIndex = playerIds.indexOf(playerId);
    
    const orderedPlayerIds = [...playerIds.slice(myIndex), ...playerIds.slice(0, myIndex)];

    const player1Container = document.getElementById('player-1-area-container');
    const opponentsContainer = document.getElementById('opponent-zones-container');
    const createPlayerAreaHTML = (id) => `<div class="player-area" id="player-area-${id}"></div>`;
    
    if(player1Container) player1Container.innerHTML = createPlayerAreaHTML(orderedPlayerIds[0]);
    if(opponentsContainer) opponentsContainer.innerHTML = orderedPlayerIds.slice(1).map(id => createPlayerAreaHTML(id)).join('');
}


export function connectToServer() {
    const SERVER_URL = "https://reversus-node.dke42d.easypanel.host";
    const socket = io(SERVER_URL, {
        reconnectionAttempts: 3,
        timeout: 10000,
    });
    updateState('socket', socket);

    socket.on('connect', () => {
        const clientId = socket.id;
        console.log('Conectado ao servidor com ID:', clientId);
        updateState('clientId', clientId);
    });
    
    socket.on('connect_error', (err) => {
        console.error("Falha na conexão:", err.message);
        showSplashScreen();
    });

    socket.on('loginSuccess', (userProfile) => {
        console.log('Login successful on client:', userProfile);
        updateState('isLoggedIn', true);
        updateState('userProfile', userProfile);
        
        dom.loginButton.classList.add('hidden');
        dom.userProfileDisplay.classList.remove('hidden');
        renderProfile(userProfile);
        dom.rankingButton.classList.remove('hidden'); 
        dom.eventButton.classList.remove('hidden');
        emitGetFriendsList(); // Carrega a lista de amigos após o login
        emitGetPendingRequests(); // Carrega pedidos pendentes
        emitClaimDailyLoginReward(); // Solicita a recompensa diária
    });

    socket.on('dailyRewardSuccess', ({ amount }) => {
        showCoinRewardNotification(t('rewards.daily_login_toast', { amount }));
    });
    
    socket.on('challengeRewardSuccess', ({ amount }) => {
        showCoinRewardNotification(t('rewards.challenge_complete_toast', { amount }));
    });

    socket.on('loginError', (message) => {
        console.error('Login failed:', message);
        alert(`Erro de login: ${message}`);
    });

    socket.on('forceDisconnect', (message) => {
        alert(message);
        window.location.reload();
    });
    
    socket.on('rankingData', (rankingData) => {
        renderRanking(rankingData);
    });

    socket.on('profileData', (profile) => {
        const { userProfile: myProfile } = getState();
        // This check ensures we only update the main user's profile if it matches,
        // but it still allows viewing other profiles.
        if (myProfile && profile.google_id === myProfile.google_id) {
            updateState('userProfile', profile);
        }
        renderProfile(profile);
    });
    
    socket.on('viewProfileData', (profile) => {
        renderProfile(profile);
        dom.profileModal.classList.remove('hidden');
    });

    socket.on('rewardClaimed', ({ titleCode }) => {
        // A atualização do perfil via 'profileData' cuidará da UI.
    });

    // --- Admin Listeners ---
    socket.on('adminData', (data) => {
        renderAdminPanel(data);
    });

    socket.on('adminActionSuccess', (message) => {
        alert(message);
        emitAdminGetData(); // Refresh panel
    });

    socket.on('newReport', () => {
        const { userProfile } = getState();
        if (userProfile?.isAdmin && !dom.profileModal.classList.contains('hidden') && document.getElementById('profile-admin-tab-content')?.classList.contains('active')) {
            emitAdminGetData();
        }
    });

    socket.on('reportSuccess', (message) => {
        alert(message);
    });


    // --- Social Listeners ---
    socket.on('searchResults', (results) => {
        renderSearchResults(results);
    });

    socket.on('friendsList', (friends) => {
        renderFriendsList(friends);
    });

    socket.on('pendingRequestsData', (requests) => {
        renderFriendRequests(requests);
        dom.friendRequestBadge.classList.toggle('hidden', requests.length === 0);
    });

    socket.on('newFriendRequest', (request) => {
        alert(t('friends.new_request_alert', { username: request.username }));
        dom.friendRequestBadge.classList.remove('hidden');
        if (!dom.profileModal.classList.contains('hidden')) {
            emitGetPendingRequests();
        }
    });

    socket.on('friendRequestResponded', ({ username, action }) => {
        if (action === 'accept') {
            alert(t('friends.request_accepted_alert', { username }));
        }
        // Refresh both lists to show new friend or updated request list
        emitGetFriendsList();
        emitGetPendingRequests();
    });
    
    socket.on('friendStatusUpdate', () => {
        // A simple status change for one friend requires a full refresh to guarantee
        // that the online status and message buttons are always correct.
        emitGetFriendsList();
    });

    socket.on('privateMessage', (message) => {
        addPrivateChatMessage(message);
    });


    // --- Room & Game Listeners ---
    socket.on('roomList', (rooms) => {
        renderRoomList(rooms);
    });
    
    socket.on('lobbyUpdate', async (roomData) => {
        updateState('currentRoomId', roomData.id);
        const { clientId, userProfile } = getState();
        const myPlayerData = roomData.players.find(p => p.id === clientId);
        if (myPlayerData) {
            updateState('playerId', myPlayerData.playerId);
            if (userProfile) {
                userProfile.playerId = myPlayerData.playerId;
                updateState('userProfile', userProfile);
            }
        }
        
        // Hide other modals/screens that might be open
        dom.splashScreenEl.classList.add('hidden');
        dom.pvpRoomListModal.classList.add('hidden');
        dom.lobbyInviteNotificationModal.classList.add('hidden');
        
        // Show lobby
        dom.pvpLobbyModal.classList.remove('hidden');
        
        updateLobbyUi(roomData);
    });

    socket.on('lobbyChatMessage', ({ speaker, message }) => {
        addLobbyChatMessage(speaker, message);
    });

    socket.on('chatMessage', ({ speaker, message, googleId }) => {
        updateLog({ type: 'dialogue', speaker, message, googleId });
    });

    socket.on('gameStarted', async (initialGameState) => {
        // Determine this client's player ID from the map sent by the server.
        if (initialGameState.playerSocketMap) {
            const myEntry = Object.entries(initialGameState.playerSocketMap).find(([socketId, pId]) => socketId === getState().clientId);
            if (myEntry) {
                updateState('playerId', myEntry[1]);
            }
        }

        updateState('gameState', initialGameState);
        
        dom.pvpLobbyModal.classList.add('hidden');
        dom.matchmakingStatusModal.classList.add('hidden');
        dom.appContainerEl.classList.remove('hidden');
        sound.stopStoryMusic(); // Restore default playlist and enable next track button
        dom.nextTrackButton.disabled = false; // Explicitly re-enable for PvP
        
        const state = getState();
        if (state.gameTimerInterval) clearInterval(state.gameTimerInterval);
        updateState('gameStartTime', Date.now());
        updateGameTimer();
        updateState('gameTimerInterval', setInterval(updateGameTimer, 1000));
        
        if (initialGameState.gamePhase === 'initial_draw') {
            await showPvpDrawSequence(initialGameState);
            // The server will send a gameStateUpdate with gamePhase: 'playing' after this.
        } else {
             // Fallback for games that might not have a draw phase
            setupPlayerPerspective();
            renderAll();
        }
    });

    socket.on('cardPlayedAnimation', async ({ casterId, targetId, card, targetSlotLabel }) => {
        const startElement = document.querySelector(`#hand-${casterId} [data-card-id="${card.id}"]`);
        await animateCardPlay(card, startElement, targetId, targetSlotLabel);
    
        // Adiciona som e anúncio visual para cartas de efeito
        const soundToPlay = card.name.toLowerCase().replace(/\s/g, '');
        const effectsWithSounds = ['mais', 'menos', 'sobe', 'desce', 'pula', 'reversus'];
    
        if (card.isLocked) {
            announceEffect("REVERSUS INDIVIDUAL!", 'reversus');
            playSoundEffect('reversustotal');
        } else if (card.name === 'Reversus Total') {
            announceEffect('Reversus Total!', 'reversus-total');
            playSoundEffect('reversustotal');
        } else if (effectsWithSounds.includes(soundToPlay)) {
            setTimeout(() => playSoundEffect(soundToPlay), 100);
            setTimeout(() => announceEffect(card.name), 150);
        }
    });

    socket.on('gameStateUpdate', (gameState) => {
        const { gameState: localGameState, playerId } = getState();
        const oldCurrentPlayer = localGameState?.currentPlayer;

        const localUiState = localGameState ? {
            selectedCard: localGameState.selectedCard,
            reversusTarget: localGameState.reversusTarget,
            pulaTarget: localGameState.pulaTarget,
        } : {};
        const newGameState = { ...gameState, ...localUiState };
        updateState('gameState', newGameState);
        setupPlayerPerspective();
        renderAll();

        const newCurrentPlayer = newGameState.currentPlayer;
        if (newCurrentPlayer === playerId && oldCurrentPlayer !== newCurrentPlayer && newGameState.gamePhase === 'playing') {
            showTurnIndicator();
        }
    });

    socket.on('roundSummary', (summaryData) => {
        showRoundSummaryModal(summaryData);
    });
    
    socket.on('matchCancelled', (message) => {
        alert(message);
        showSplashScreen();
    });

    socket.on('gameOver', ({ message, winnerId }) => {
        showGameOver(message, "Fim de Jogo!", { action: 'menu' });
    });

    socket.on('error', (message) => {
        console.error('Server Error:', message);
        alert(`Erro do Servidor: ${message}`);
    });

    // --- Matchmaking Listeners ---
    socket.on('matchmakingStatus', ({ mode, current, needed }) => {
        if (dom.matchmakingStatusText) {
            dom.matchmakingStatusText.textContent = t('matchmaking.status_update', { mode, current, needed });
        }
    });

    socket.on('matchmakingCancelled', () => {
        updateState('currentQueueMode', null);
        dom.matchmakingStatusModal.classList.add('hidden');
        dom.pvpMatchmakingModal.classList.remove('hidden');
        alert(t('matchmaking.cancel_success'));
    });
    
    // --- New Invite Listeners ---
    socket.on('onlineFriendsList', (friends) => {
        renderOnlineFriendsForInvite(friends);
        dom.inviteFriendsModal.classList.remove('hidden');
    });

    socket.on('lobbyInvite', ({ inviterUsername, roomName, roomId }) => {
        dom.lobbyInviteNotificationText.textContent = t('pvp.invite_notification_text', { username: inviterUsername, roomName });
        dom.lobbyInviteAcceptButton.dataset.roomId = roomId;
        dom.lobbyInviteDeclineButton.dataset.inviterId = inviterUsername; // Not strictly needed but good practice
        dom.lobbyInviteNotificationModal.classList.remove('hidden');
    });

    socket.on('inviteResponse', ({ status, username }) => {
        let message = '';
        switch (status) {
            case 'sent':
                message = t('pvp.invite_sent', { username });
                break;
            case 'declined':
                message = t('pvp.invite_declined', { username });
                break;
            case 'offline':
                message = t('pvp.invite_failed_offline', { username });
                break;
            case 'in_game':
                 message = t('pvp.invite_failed_ingame', { username });
                 break;
            case 'already_in_lobby':
                message = t('pvp.already_in_lobby');
                break;
        }
        if (message) {
            alert(message);
        }
    });

    // --- Shop Listeners ---
    socket.on('avatarPurchaseSuccess', ({ updatedProfile }) => {
        const { userProfile } = getState();
        if (userProfile.google_id === updatedProfile.google_id) {
            updateState('userProfile', updatedProfile);
            renderShopAvatars();
            updateCoinVersusDisplay(updatedProfile.coinversus);
            showCoinRewardNotification(t('shop.purchase_success'));
        }
    });

    socket.on('avatarPurchaseError', ({ message }) => {
        alert(t('shop.purchase_error', { error: message }));
        renderShopAvatars(); // Re-render to re-enable button
    });
}

// --- EMITTERS ---
export function emitGetRanking(page = 1) { const { socket } = getState(); if (socket) socket.emit('getRanking', { page }); }
export function emitGetProfile() { const { socket } = getState(); if (socket) socket.emit('getProfile'); }
export function emitViewProfile(googleId) { const { socket } = getState(); if (socket) socket.emit('viewProfile', { googleId }); }
export function emitSetSelectedTitle(titleCode) { const { socket } = getState(); if (socket) socket.emit('setSelectedTitle', { titleCode }); }
export function emitSetSelectedAvatar(data) { const { socket } = getState(); if (socket) socket.emit('setSelectedAvatar', data); }
export function emitClaimEventReward(titleCode) { const { socket } = getState(); if (socket) socket.emit('claimEventReward', { titleCode });}
export function emitListRooms() { const { socket } = getState(); if (socket) socket.emit('listRooms'); }
export function emitCreateRoom({ name, password, betAmount }) { const { socket } = getState(); if (socket) socket.emit('createRoom', { name, password, betAmount }); }
export function emitJoinRoom({ roomId, password }) { const { socket } = getState(); if (socket) socket.emit('joinRoom', { roomId, password }); }
export function emitLobbyChat(message) { const { socket } = getState(); if(socket) socket.emit('lobbyChatMessage', message); }
export function emitChatMessage(message) { const { socket } = getState(); if (socket) socket.emit('chatMessage', message); }
export function emitChangeMode(mode) { const { socket } = getState(); if (socket) socket.emit('changeMode', mode); }
export function emitStartGame() { const { socket } = getState(); if (socket) socket.emit('startGame'); }
export function emitPlayCard({ cardId, targetId, options = {} }) { const { socket } = getState(); if (socket) socket.emit('playCard', { cardId, targetId, options }); }
export function emitSearchUsers(query) { const { socket } = getState(); if (socket) socket.emit('searchUsers', { query }); }
export function emitSendFriendRequest(targetUserId, callback) { 
    const { socket } = getState(); 
    if (socket) {
        socket.emit('sendFriendRequest', { targetUserId }, callback);
    } else {
        callback({ success: false, error: 'Sem conexão com o servidor.' });
    }
}
export function emitRespondToRequest(requestId, action) { const { socket } = getState(); if(socket) socket.emit('respondToRequest', { requestId, action }); }
export function emitGetPendingRequests() { const { socket } = getState(); if(socket) socket.emit('getPendingRequests'); }
export function emitRemoveFriend(targetUserId) { const { socket } = getState(); if (socket) socket.emit('removeFriend', { targetUserId }); }
export function emitGetFriendsList() { const { socket } = getState(); if (socket) socket.emit('getFriendsList'); }
export function emitSendPrivateMessage(recipientId, content) { const { socket } = getState(); if (socket) socket.emit('sendPrivateMessage', { recipientId, content }); }
export function emitReportPlayer(reportedGoogleId, message) { const { socket } = getState(); if (socket) socket.emit('reportPlayer', { reportedGoogleId, message }); }
export function emitClaimDailyLoginReward() { const { socket } = getState(); if(socket) socket.emit('claimDailyLoginReward'); }
export function emitClaimChallengeReward(data) { const { socket } = getState(); if(socket) socket.emit('claimChallengeReward', data); }
export function emitGrantAchievement(achievementId) { const { socket } = getState(); if (socket) socket.emit('grantAchievement', { achievementId }); }
export function emitBuyAvatar(avatarCode) { const { socket } = getState(); if (socket) socket.emit('buyAvatar', avatarCode); }

// --- Matchmaking Emitters ---
export function emitJoinMatchmaking(mode) {
    const { socket } = getState();
    if (socket) {
        updateState('currentQueueMode', mode);
        socket.emit('joinMatchmaking', mode);
    }
}
export function emitCancelMatchmaking() {
    const { socket } = getState();
    if (socket) {
        socket.emit('cancelMatchmaking');
    }
}

// --- Invite Emitters ---
export function emitGetOnlineFriends() {
    const { socket } = getState();
    if (socket) socket.emit('getOnlineFriends');
}
export function emitInviteFriendToLobby(targetUserId) {
    const { socket, currentRoomId } = getState();
    if (socket && currentRoomId) {
        socket.emit('inviteFriendToLobby', { targetUserId, roomId: currentRoomId });
    }
}
export function emitAcceptInvite(roomId) {
    const { socket } = getState();
    if (socket) socket.emit('acceptInvite', { roomId });
}
export function emitDeclineInvite(roomId) {
    const { socket } = getState();
    if (socket) socket.emit('declineInvite', { roomId });
}
export function emitKickPlayer(targetClientId) { 
    const { socket, currentRoomId } = getState(); 
    if (socket && currentRoomId) socket.emit('kickPlayer', { targetClientId, roomId: currentRoomId }); 
}


export function emitLeaveRoom() {
    const { socket, currentRoomId } = getState();
    if (socket && currentRoomId) {
        socket.emit('leaveRoom');
        updateState('currentRoomId', null);
        updateState('gameState', null);
        dom.pvpLobbyModal.classList.add('hidden');
        dom.appContainerEl.classList.add('hidden');
        showSplashScreen();
    }
}

export function emitEndTurn() {
    const { socket, gameState, playerId } = getState();
    if (!socket || !gameState || gameState.currentPlayer !== playerId) return;
    const player = gameState.players[playerId];
    if(!player) return;
    const valueCardsInHandCount = player.hand.filter(c => c.type === 'value').length;
    if (valueCardsInHandCount > 1 && !player.playedValueCardThisTurn) {
        alert("Você precisa jogar uma carta de valor neste turno!");
        return;
    }
    socket.emit('endTurn');
}

// --- Admin Emitters ---
export function emitAdminGetData() {
    const { socket } = getState();
    if (socket) socket.emit('admin:getData');
}

export function emitAdminBanUser(userId) {
    const { socket } = getState();
    if (socket) socket.emit('admin:banUser', userId);
}

export function emitAdminUnbanUser(userId) {
    const { socket } = getState();
    if (socket) socket.emit('admin:unbanUser', userId);
}

export function emitAdminRollbackUser(userId) {
    const { socket } = getState();
    if (socket) socket.emit('admin:rollbackUser', userId);
}

export function emitAdminAddCoins(amount) {
    const { socket } = getState();
    if (socket) socket.emit('admin:addCoins', { amount });
}

export function emitAdminResolveReport(reportId) {
    const { socket } = getState();
    if (socket) socket.emit('admin:resolveReport', reportId);
}