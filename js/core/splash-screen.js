// This file acts as a shim to re-export the function from its new location.
// It ensures that older, cached versions of files that still import from 
// 'js/core/splash-screen.js' will not break.
export { showSplashScreen } from '../ui/splash-screen.js';
