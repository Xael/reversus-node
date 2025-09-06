// This object holds the single source of truth for the application's state.
const appState = {
    // Core game state object, holds all data about the current match.
    // In PvP, this state is received from the server.
    gameState: null,
    // Holds the user's sound preferences.
    soundState: { muted: false, volume: 0.5 },
    // Flag to ensure music is only initialized once.
    isMusicInitialized: false,
    // Index of the current background music track.
    currentTrackIndex: 0,
    // Interval timer for the in-game clock.
    gameTimerInterval: null,
    // Timestamp for when the game started, used by the timer.
    gameStartTime: null,
    // A promise resolver for when the game is waiting for a player to target a field effect.
    fieldEffectTargetResolver: null,
    // A promise resolver for the final battle path selection.
    pathSelectionResolver: null,
    // ID of the current node in the story dialogue tree.
    currentStoryNodeId: null,
    // Timeout for the typewriter effect in story mode.
    typewriterTimeout: null,
    // State specific to story mode progression.
    storyState: {
        lostToVersatrix: false,
    },
    // Holds the unlocked achievement IDs.
    achievements: new Set(),
    // Flag for the new Reversus Total individual flow
    reversusTotalIndividualFlow: false,
    // Interval for the secret Versatrix card animation on the splash screen.
    versatrixCardInterval: null,
    // Interval for the INVERSUS boss animation.
    inversusAnimationInterval: null,
    // Interval for the secret battle logo glitch effect.
    glitchInterval: null,
    // Queue for managing effect announcements to prevent overlap.
    announcementQueue: [],
    // Flag to indicate if an announcement is currently being shown.
    isAnnouncing: false,
    // Holds the options for the last story duel, for a safe restart.
    lastStoryGameOptions: null,
    // Controls which messages are shown in the game log. Can be 'all', 'log', or 'chat'.
    chatFilter: 'all',
    // Controls if the chat input is visible and usable.
    isChatMuted: false,

    // --- PVP/Network State ---
    isConnectionAttempted: false, // Flag to ensure we only try to connect once.
    socket: null, // Holds the socket.io client instance
    clientId: null, // The unique ID for this client, assigned by the server
    playerId: null, // Which player this client is controlling (e.g., 'player-1')
    username: null, // Player's chosen username
    userProfile: {
        isAdmin: false, // Holds profile data from the server (name, avatar, stats)
    }, 
    isLoggedIn: false, // Flag to indicate if the user is authenticated
    currentRoomId: null, // The ID of the room the player is currently in
    currentQueueMode: null, // The mode ('1v1', '1v4', '2v2') the player is queuing for
    betAmount: 0, // The bet amount for the current PvP match
    pot: 0, // The current pot for the PvP match
};

/**
 * Returns the global application state object.
 * @returns {object} The appState object.
 */
export function getState() {
    return appState;
}

/**
 * Updates a specific key in the global application state.
 * @param {string} key - The key in the appState object to update.
 * @param {*} value - The new value for the key.
 */
export function updateState(key, value) {
    if (Object.prototype.hasOwnProperty.call(appState, key)) {
        appState[key] = value;
    } else {
        console.error(`Attempting to update a non-existent state key: ${key}`);
    }
}