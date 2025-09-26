// js/ui/dom.js

// This file acts as a redirector to fix incorrect import paths.
// It ensures any module trying to load 'dom.js' from within the 'ui' directory
// gets the correct module from the 'core' directory.
export * from '../core/dom.js';
