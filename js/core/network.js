// js/core/network.js
import { getState, updateState } from './state.js';
import * as dom from './dom.js';
import { renderAll, showGameOver } from '../ui/ui-renderer.js';
import { renderRanking, updateLobbyUi, renderRoomList } from '../ui/lobby-renderer.js';
import { renderProfile } from '../ui/profile-renderer.js';
import { showSplashScreen } from '../ui/splash-screen.js';
import { updateLog } from './utils.js';
import { updateGameTimer } from '../game-controller.js';

/**
 * Sets up the player areas in the UI so the local player is always at the bottom.
 */
function setupPlayerPerspective() {
    const { gameState, playerId } = getState();
    if (!gameState || !playerId || !gameState.playerIdsInGame) return;

    const playerIds = gameState.playerIdsInGame;
    if (!playerIds.includes(playerId)) return;
    
    const myIndex = playerIds.indexOf(playerId);
    
    // Create a new array with the local player first, followed by others in order
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

        // Atualizações da UI
        dom.googleSignInContainer.classList.add('hidden');
        dom.userProfileDisplay.classList.remove('hidden');
        renderProfile(userProfile); // Renderiza o perfil completo, incluindo a barra de XP
        dom.rankingButton.classList.remove('hidden'); 
        dom.eventButton.classList.remove('hidden');
    });

    socket.on('loginError', (message) => {
        console.error('Login failed:', message);
        alert(`Erro de login: ${message}`);
    });

    socket.on('roomCreated', (roomId) => {
        console.log(`Room created by server with ID: ${roomId}. Joining...`);
        emitJoinRoom(roomId); // Automatically join the room just created.
    });
    
    socket.on('rankingData', (ranking) => {
        renderRanking(ranking);
    });

    socket.on('profileData', (profile) => {
        updateState('userProfile', profile);
        renderProfile(profile);
    });

    socket.on('rewardClaimed', ({ titleCode }) => {
        console.log(`Servidor confirmou a recompensa resgatada: ${titleCode}`);
        // A atualização do perfil via 'profileData' cuidará da UI.
    });

    socket.on('roomList', (rooms) => {
        renderRoomList(rooms);
    });
    
    socket.on('lobbyUpdate', (roomData) => {
        updateState('currentRoomId', roomData.id);

        // --- CRITICAL FIX: Identify my playerId ---
        const { clientId, userProfile } = getState();
        const myPlayerData = roomData.players.find(p => p.id === clientId);
        if (myPlayerData) {
            updateState('playerId', myPlayerData.playerId);
            if (userProfile) {
                userProfile.playerId = myPlayerData.playerId;
                updateState('userProfile', userProfile);
            }
        }
        
        dom.pvpRoomListModal.classList.add('hidden');
        dom.pvpLobbyModal.classList.remove('hidden');
        updateLobbyUi(roomData);
    });

    socket.on('gameStarted', (initialGameState) => {
        console.log('Game is starting!');
        updateState('gameState', initialGameState);
        
        dom.pvpLobbyModal.classList.add('hidden');
        dom.appContainerEl.classList.remove('hidden');

        const state = getState();
        if (state.gameTimerInterval) clearInterval(state.gameTimerInterval);
        updateState('gameStartTime', Date.now());
        updateGameTimer();
        updateState('gameTimerInterval', setInterval(updateGameTimer, 1000));
        
        // --- CRITICAL FIX: Setup player perspective ---
        setupPlayerPerspective();
        renderAll();
    });

    socket.on('gameStateUpdate', (gameState) => {
        const { gameState: localGameState } = getState();

        // Preserve local UI state (like selected card) across updates
        const localUiState = localGameState ? {
            selectedCard: localGameState.selectedCard,
            reversusTarget: localGameState.reversusTarget,
            pulaTarget: localGameState.pulaTarget,
        } : {};

        const newGameState = { ...gameState, ...localUiState };
        updateState('gameState', newGameState);

        // --- CRITICAL FIX: Ensure perspective is maintained ---
        setupPlayerPerspective();
        renderAll();
    });

    socket.on('gameOver', ({ message, winnerId }) => {
        const { gameState } = getState();
        if (gameState) {
             emitGameFinished(winnerId, [], gameState.gameMode);
        }
        showGameOver(message, "Fim de Jogo!", { action: 'menu' });
    });


    socket.on('error', (message) => {
        console.error('Server Error:', message);
        alert(`Erro do Servidor: ${message}`);
    });

    // --- Single Session Handler ---
    socket.on('forceDisconnect', (message) => {
        alert(message);
        // A full reload is the cleanest way to reset the client state after a forced disconnect.
        window.location.reload();
    });
}

// --- EMISSORES DE EVENTOS ---

export function emitGetRanking() {
    const { socket } = getState();
    if (socket) socket.emit('getRanking');
}

export function emitGetProfile() {
    const { socket } = getState();
    if (socket) socket.emit('getProfile');
}

export function emitClaimEventReward(titleCode) {
    const { socket } = getState();
    if (socket) {
        socket.emit('claimEventReward', { titleCode });
    }
}

export function emitGameFinished(winnerId, loserIds, mode) {
    const { socket } = getState();
    if (socket) socket.emit('gameFinished', { winnerId, loserIds, mode });
}


export function emitListRooms() {
    const { socket } = getState();
    if (socket) socket.emit('listRooms');
}

export function emitCreateRoom() {
    const { socket } = getState();
    if (socket) {
        socket.emit('createRoom');
    }
}

export function emitJoinRoom(roomId) {
    const { socket } = getState();
    if (socket) {
        socket.emit('joinRoom', { roomId });
    }
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

export function emitLobbyChat(message) {
    const { socket } = getState();
    if(socket) {
        socket.emit('lobbyChatMessage', message);
    }
}

export function emitChatMessage(message) {
    const { socket } = getState();
    if (socket) {
        socket.emit('chatMessage', message);
    }
}

export function emitChangeMode(mode) {
    const { socket } = getState();
    if (socket) {
        socket.emit('changeMode', mode);
    }
}

export function emitStartGame() {
    const { socket } = getState();
    if (socket) {
        socket.emit('startGame');
    }
}

export function emitPlayCard({ cardId, targetId, options = {} }) {
    const { socket } = getState();
    if (socket) {
        socket.emit('playCard', { cardId, targetId, options });
    }
}

export function emitEndTurn() {
    const { socket, gameState, playerId } = getState();
    if (!socket || !gameState || gameState.currentPlayer !== playerId) return;
    
    const player = gameState.players[playerId];
    const valueCardsInHandCount = player.hand.filter(c => c.type === 'value').length;
    const mustPlayValueCard = valueCardsInHandCount > 1 && !player.playedValueCardThisTurn;
    if (mustPlayValueCard) {
        alert("Você precisa jogar uma carta de valor neste turno!");
        return;
    }
    
    socket.emit('endTurn');
}