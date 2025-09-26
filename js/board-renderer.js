// This file acts as a shim to re-export the function from its new location.
// It ensures that older, cached versions of files that still import from 
// 'js/board-renderer.js' will not break.
export { renderBoard } from './ui/board-renderer.js';