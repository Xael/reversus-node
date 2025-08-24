import { initializeUiHandlers } from '../ui/ui-handlers.js';
import { showSplashScreen } from '../ui/splash-screen.js';
import { setupPvpRooms } from '../game-controller.js';
import { checkForSavedGame } from './save-load.js';
import { loadAchievements } from './achievements.js';
import { initializeGoogleSignIn } from './auth.js';
import { connectToServer } from './network.js';
import { initI18n } from './i18n.js';

// This is the main entry point of the application.
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize internationalization first
    await initI18n();

    // Establish connection with the server for PvP functionalities.
    connectToServer();

    // Sets up all the button clicks and other user interactions.
    initializeUiHandlers();

    // Initializes the PvP rooms data structure.
    setupPvpRooms();

    // Load any existing achievements from local storage.
    loadAchievements();

    // Checks if a saved game exists to enable the 'Continue' button.
    checkForSavedGame();
    
    // Displays the initial splash screen.
    showSplashScreen();

    // Initializes Google Sign-In functionality
    initializeGoogleSignIn();
});