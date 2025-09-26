// js/core/network.js
import { getState, updateState } from './state.js';
import * as dom from './dom.js';
import { renderAll, showGameOver, showRoundSummaryModal, showTurnIndicator } from '../ui/ui-renderer.js';
import { renderRoomList, renderPvpRanking, renderInfiniteRanking, updateLobbyUi } from '../ui/lobby-renderer.js';
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
import { renderTournamentView, renderTournamentRankingTable, renderTournamentMatchScore, clearTournamentMatchScore } from '../ui/torneio-renderer.js';
import { executeAiTurn } from '../ai/ai-controller.js';


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
        dom.pvpModeButton.classList.remove('hidden');
        dom.infiniteChallengeButton.classList.remove('hidden');
        dom.tournamentButton.classList.remove('hidden');


        emitGetFriendsList(); // Carrega a lista de amigos após o login
        emitGetPendingRequests(); // Carrega pedidos pendentes
        emitClaimDailyLoginReward(); // Solicita a recompensa diária
    });

    socket.on('dailyRewardSuccess', ({ amount }) => {
        showCoinRewardNotification(t('rewards.daily_login_toast', { amount }));
    });
    
    socket.on('challengeRewardSuccess', ({ amount, titleCode }) => {
        let message;
        if (titleCode) {
            const titleName = t(`titles.${titleCode}`);
            if (titleCode === 'eternal_reversus') {
                message = t('rewards.infinite_challenge_toast', { amount, titleName });
            } else {
                message = t('rewards.challenge_complete_toast_with_title', { amount, titleName });
            }
        } else {
            message = t('rewards.challenge_complete_toast', { amount });
        }
        showCoinRewardNotification(message);
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
        renderPvpRanking(rankingData);
    });

    socket.on('infiniteRankingData', (rankingData) => {
        renderInfiniteRanking(rankingData);
    });

    socket.on('profileData', (profile) => {
        const { userProfile: myProfile } = getState();
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
        alert(message); // Simple feedback for the admin
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
        emitGetFriendsList();
        emitGetPendingRequests();
    });
    
    socket.on('friendStatusUpdate', () => {
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
        
        dom.splashScreenEl.classList.add('hidden');
        dom.pvpRoomListModal.classList.add('hidden');
        dom.lobbyInviteNotificationModal.classList.add('hidden');
        
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
        sound.stopStoryMusic();
        dom.nextTrackButton.disabled = false;
        
        const state = getState();
        if (state.gameTimerInterval) clearInterval(state.gameTimerInterval);
        updateState('gameStartTime', Date.now());
        updateGameTimer();
        updateState('gameTimerInterval', setInterval(updateGameTimer, 1000));
        
        if (initialGameState.gamePhase === 'initial_draw') {
            await showPvpDrawSequence(initialGameState);
        } else {
            setupPlayerPerspective();
            renderAll();
        }
    });

    socket.on('cardPlayedAnimation', async ({ casterId, targetId, card, targetSlotLabel }) => {
        const startElement = document.querySelector(`#hand-${casterId} [data-card-id="${card.id}"]`);
        await animateCardPlay(card, startElement, targetId, targetSlotLabel);
    
        const soundToPlay = card.name.toString().toLowerCase().replace(/\s/g, '');
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
        const state = getState();
        const localGameState = state.gameState;
        const playerId = state.playerId;
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

        const newCurrentPlayer = newGameState.players[newGameState.currentPlayer];
        if (newCurrentPlayer?.id === playerId && oldCurrentPlayer !== newGameState.currentPlayer && newGameState.gamePhase === 'playing') {
            showTurnIndicator();
        }

        // AI TURN TRIGGER FOR TOURNAMENTS (CLIENT SIDE)
        if (newGameState.isTournamentMatch && newCurrentPlayer && !newCurrentPlayer.isHuman && oldCurrentPlayer !== newGameState.currentPlayer) {
             console.log(`Game state updated. It's now AI's turn: ${newCurrentPlayer.name}. Triggering AI logic.`);
             setTimeout(() => executeAiTurn(newCurrentPlayer), 1500);
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
        const { gameState } = getState();
        const buttonOptions = (gameState && gameState.isTournamentMatch)
            ? { action: 'tournament_continue', text: t('common.continue') }
            : { action: 'menu' };
        showGameOver(message, "Fim de Jogo!", buttonOptions);
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
        dom.lobbyInviteDeclineButton.dataset.roomId = roomId;
        dom.lobbyInviteDeclineButton.dataset.inviterId = inviterUsername;
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
        renderShopAvatars();
    });

    // --- Infinite Challenge Listeners ---
    socket.on('infiniteChallengePotUpdate', ({ pot }) => {
        const potDisplay = dom.infiniteChallengePotDisplay;
        if (potDisplay) {
            potDisplay.textContent = t('infinite_challenge.pot_display', { pot: pot || 0 });
            potDisplay.dataset.potValue = pot || 0;
        }
    });

    socket.on('infiniteChallengeStartSuccess', (payload) => {
        if (!payload || !payload.opponentQueue) {
            console.error("Received empty or invalid payload for infiniteChallengeStartSuccess.", payload);
            alert("Ocorreu um erro ao iniciar o desafio. Por favor, tente novamente.");
            document.dispatchEvent(new Event('cleanupInfiniteChallengeUI'));
            return;
        }
        
        const { opponentQueue, updatedProfile } = payload;

        if (opponentQueue.length === 0) {
            console.error("Received empty opponent queue from server for Infinite Challenge.");
            alert("Erro ao iniciar o desafio: não foi possível carregar os oponentes.");
            document.dispatchEvent(new Event('cleanupInfiniteChallengeUI'));
            return;
        }
        
        if (updatedProfile) {
            updateState('userProfile', updatedProfile);
            renderProfile(updatedProfile);
        }

        updateState('infiniteChallengeOpponentQueue', opponentQueue);
        document.dispatchEvent(new Event('initiateInfiniteChallengeGame'));
    });

    socket.on('infiniteChallengeStartError', ({ message }) => {
        alert(message);
        document.dispatchEvent(new Event('cleanupInfiniteChallengeUI'));
    });

    socket.on('infiniteChallengeWin', ({ potWon }) => {
        const { gameState } = getState();
        const timeSeconds = gameState ? gameState.elapsedSeconds : 0;
        const minutes = Math.floor(timeSeconds / 60).toString().padStart(2, '0');
        const seconds = (timeSeconds % 60).toString().padStart(2, '0');
        const timeFormatted = `${minutes}:${seconds}`;

        showGameOver(
            t('game_over.infinite_challenge_win', { time: timeFormatted, pot: potWon }),
            t('game_over.infinite_challenge_title'),
            { action: 'menu', text: t('game_over.back_to_menu') }
        );
    });

    // --- TOURNAMENT LISTENERS ---
    socket.on('tournamentQueueUpdate', (data) => {
        renderTournamentView({ status: 'queue', playerCount: data.count, max: data.max, timeout: data.timeout });
    });

    socket.on('tournamentStateUpdate', (tournamentState) => {
        if (tournamentState.status === 'active' || tournamentState.status === 'finished') {
            renderTournamentView(tournamentState);
        }
    });

    socket.on('tournamentMatchStart', async (initialGameState) => {
        dom.tournamentModal.classList.add('hidden');
        dom.splashScreenEl.classList.add('hidden');
        
        // --- UI FIX ---
        dom.appContainerEl.classList.add('in-tournament-match');
        dom.tournamentViewContainer.classList.remove('hidden');
        if (dom.boardAndScoresWrapper) {
            dom.boardAndScoresWrapper.style.display = 'none';
        }

        const { userProfile } = getState();
        const myPlayerEntry = Object.values(initialGameState.players).find(p => p.name === userProfile.username);
        if (myPlayerEntry) {
            updateState('playerId', myPlayerEntry.id);
        } else {
             // Fallback for AI matches
            const human = Object.values(initialGameState.players).find(p => p.isHuman);
            if (human) updateState('playerId', human.id);
            else updateState('playerId', 'player-1');
        }

        updateState('gameState', initialGameState);
        
        dom.appContainerEl.classList.remove('hidden');
        dom.nextTrackButton.disabled = false;
        
        const state = getState();
        if (state.gameTimerInterval) clearInterval(state.gameTimerInterval);
        updateState('gameStartTime', Date.now());
        updateGameTimer();
        updateState('gameTimerInterval', setInterval(updateGameTimer, 1000));
        
        setupPlayerPerspective();
        renderAll();
        
        // --- INITIAL DRAW FIX ---
        if (initialGameState.gamePhase === 'initial_draw') {
            await showPvpDrawSequence(initialGameState);
        } else {
            // Fallback if draw phase isn't sent
            const firstPlayer = state.gameState.players[state.gameState.currentPlayer];
            const myPlayerId = state.playerId;
            
            if (firstPlayer && !firstPlayer.isHuman && state.gameState.currentPlayer !== myPlayerId) {
                 setTimeout(() => executeAiTurn(firstPlayer), 1500);
            } else if (firstPlayer && firstPlayer.isHuman) {
                await showTurnIndicator();
            }
        }
        
        clearTournamentMatchScore();
        renderTournamentMatchScore([0, 0]);
    });

    socket.on('tournamentMatchScoreUpdate', (score) => {
        renderTournamentMatchScore(score);
    });

    socket.on('tournamentMatchEnd', () => {
        clearTournamentMatchScore();
        dom.appContainerEl.classList.add('hidden');
        dom.tournamentModal.classList.remove('hidden');
    });

    socket.on('tournamentRankingData', (rankingData) => {
        renderTournamentRankingTable(rankingData);
    });
}

// --- EMITTERS ---
export function emitGetRanking(page = 1) { const { socket } = getState(); if (socket) socket.emit('getRanking', { page }); }
export function emitGetInfiniteRanking(page = 1) { const { socket } = getState(); if (socket) socket.emit('getInfiniteRanking', { page }); }
export function emitGetInfiniteChallengePot(callback) { const { socket } = getState(); if (socket) socket.emit('getInfiniteChallengePot', callback); }
export function emitStartInfiniteChallenge() { const { socket } = getState(); if (socket) socket.emit('startInfiniteChallenge'); }
export function emitSubmitInfiniteResult(result) { const { socket } = getState(); if (socket) socket.emit('submitInfiniteResult', result); }
export function emitClaimInfiniteChallengeReward() { const { socket } = getState(); if (socket) socket.emit('claimInfiniteChallengeReward'); }
export function emitGetProfile() { const { socket } = getState(); if (socket) socket.emit('getProfile'); }
export function emitViewProfile(googleId) { const { socket } = getState(); if (socket) socket.emit('viewProfile', { googleId }); }
export function emitSetSelectedTitle(titleCode) { const { socket } = getState(); if (socket) socket.emit('setSelectedTitle', { titleCode }); }
export function emitSetSelectedAvatar({ avatarCode }) { const { socket } = getState(); if (socket) socket.emit('setSelectedAvatar', { avatarCode }); }
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
export function emitBuyAvatar(data) { const { socket } = getState(); if (socket) socket.emit('buyAvatar', data); }

// --- Matchmaking Emitters ---
export function emitJoinMatchmaking(mode) {
    const { socket } = getState();
    if (socket) {
        updateState('currentQueueMode', mode);
        socket.emit('joinMatchmaking', { mode });
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

export function emitAcceptInvite({ roomId }) {
    const { socket } = getState();
    if (socket) socket.emit('acceptInvite', roomId);
}

export function emitDeclineInvite({ roomId }) {
    const { socket } = getState();
    if (socket) socket.emit('declineInvite', roomId);
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
    if (socket) socket.emit('admin:banUser', { userId });
}

export function emitAdminUnbanUser(userId) {
    const { socket } = getState();
    if (socket) socket.emit('admin:unbanUser', { userId });
}

export function emitAdminResolveReport(reportId) {
    const { socket } = getState();
    if (socket) socket.emit('admin:resolveReport', { reportId });
}

// --- Tournament Emitters ---
export function emitJoinTournamentQueue(data) {
    const { socket } = getState();
    if (socket) socket.emit('joinTournamentQueue', data);
}
export function emitCancelTournamentQueue() {
    const { socket } = getState();
    if (socket) socket.emit('cancelTournamentQueue');
}
export function emitGetTournamentRanking(data) {
    const { socket } = getState();
    if (socket) socket.emit('getTournamentRanking', data);
}
export function emitPlayerReadyForTournamentMatch(matchId) {
    const { socket } = getState();
    if (socket) socket.emit('playerReadyForTournamentMatch', { matchId });
}