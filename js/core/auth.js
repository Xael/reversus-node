// js/core/auth.js
import { getState } from './state.js';
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
    const init = () => {
        // Check if the google object from the external script is available.
        if (typeof google === 'undefined' || !google.accounts) {
            // If not, try again in 100ms.
            setTimeout(init, 100);
            return;
        }

        // The library is loaded, now we can initialize it.
        google.accounts.id.initialize({
            client_id: "2701468714-udbjtea2v5d1vnr8sdsshi3lem60dvkn.apps.googleusercontent.com",
            callback: handleCredentialResponse
        });
        
        // Explicitly check login state to set visibility
        const { isLoggedIn } = getState();
        dom.googleSignInContainer.classList.toggle('hidden', isLoggedIn);
        dom.userProfileDisplay.classList.toggle('hidden', !isLoggedIn);

        // Only render the button if the user is NOT logged in.
        if (!isLoggedIn) {
            const signInButton = document.getElementById('google-signin-button');
            if (signInButton) {
                google.accounts.id.renderButton(
                    signInButton,
                    { theme: "outline", size: "large", type: "standard" } 
                );
            } else {
                console.error("Google Sign-In button container not found.");
            }
        }
    };
    
    // Start the initialization check.
    init();
}