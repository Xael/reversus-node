// js/core/auth.js
import { getState, updateState } from './state.js';
import * as dom from './dom.js';
import * as network from './network.js';

/**
 * Handles the credential response from Google Sign-In.
 * @param {object} response - The credential response object from Google.
 */
function handleCredentialResponse(response) {
    console.log("Google credential response received.");
    const { socket } = getState();
    if (socket && response.credential) {
        // Send the ID token to the server for verification
        socket.emit('google-login', { token: response.credential });
    } else {
        console.error("Socket not available or credential missing in response.");
        alert("Não foi possível processar o login. Ocorreu um erro de conexão com o servidor. Tente novamente.");
    }
}

/**
 * Initializes the Google Sign-In client and renders the sign-in button.
 */
export function initializeGoogleSignIn() {
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds total wait time

    const init = () => {
        // Check if the google object from the external script is available.
        if (typeof google !== 'undefined' && google.accounts) {
            // The library is loaded, now we can initialize it.
            google.accounts.id.initialize({
                client_id: "2701468714-udbjtea2v5d1vnr8sdsshi3lem60dvkn.apps.googleusercontent.com",
                callback: handleCredentialResponse,
                ux_mode: 'popup' // Force popup flow to avoid FedCM issues
            });
            
            // Explicitly check login state to set visibility of login button vs profile display
            const { isLoggedIn } = getState();
            dom.loginButton.classList.toggle('hidden', isLoggedIn);
            dom.userProfileDisplay.classList.toggle('hidden', !isLoggedIn);

        } else {
            attempts++;
            if (attempts < maxAttempts) {
                // If not, try again in 100ms.
                setTimeout(init, 100);
            } else {
                console.error("Google Sign-In library failed to load in time. Login will not be available.");
                if (dom.loginButton) {
                    dom.loginButton.textContent = 'Erro de Login';
                    dom.loginButton.disabled = true;
                }
            }
        }
    };
    
    // Start the initialization check.
    init();
}