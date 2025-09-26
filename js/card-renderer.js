// This file acts as a shim to re-export the functions from their new location.
// It ensures that older, cached versions of files that still import from 
// 'js/card-renderer.js' will not break.
export { getCardImageUrl, renderCard } from './ui/card-renderer.js';