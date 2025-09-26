import { initializeUiHandlers } from '../ui/ui-handlers.js';
import { showSplashScreen } from '../ui/splash-screen.js';
import { setupPvpRooms } from '../game-controller.js';
import { checkForSavedGame } from './save-load.js';
import { loadAchievements } from './achievements.js';
import { initializeGoogleSignIn } from './auth.js';
import { connectToServer } from './network.js';
import { initI18n } from './i18n.js';
import { updateState } from './state.js';
import { scalableContainer } from './dom.js';

/**
 * Scales and centers the main application container to fit the window,
 * preserving its 16:9 aspect ratio (1920x1080).
 */
function resizeAndCenterApp() {
    if (!scalableContainer) return;

    const baseWidth = 1920;
    const baseHeight = 1080;
    const { innerWidth: windowWidth, innerHeight: windowHeight } = window;

    // Calculate the scale factor to fit the content within the window (letterboxing)
    const scale = Math.min(windowWidth / baseWidth, windowHeight / baseHeight);

    // Calculate the top and left offsets to center the container
    const offsetX = (windowWidth - (baseWidth * scale)) / 2;
    const offsetY = (windowHeight - (baseHeight * scale)) / 2;

    // Apply the transformation. The translate moves the container into position,
    // and the scale resizes it from its top-left origin.
    scalableContainer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

/**
 * Ensures the splash screen is centered, especially on mobile.
 */
function centerSplashScreen() {
  const splash = document.querySelector('.modal-content.splash-content');
  if (!splash) return;
  // This is mostly a fallback; flexbox on the parent should handle centering.
  splash.style.margin = '0 auto';
}


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

    // --- Add new resize logic ---
    resizeAndCenterApp();
    centerSplashScreen(); // Center it on load
    window.addEventListener('resize', () => {
        resizeAndCenterApp();
        centerSplashScreen(); // And on resize
    });
});
