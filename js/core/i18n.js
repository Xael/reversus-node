import { getState } from './state.js';
import { renderAll } from '../ui/ui-renderer.js';

let currentLanguage = 'pt-BR';
let translations = {};

const supportedLanguages = ['pt-BR', 'en-US'];

async function loadTranslations(lang) {
    try {
        const response = await fetch(`locales/${lang}.json`);
        if (!response.ok) {
            throw new Error(`Failed to load translation file for ${lang}`);
        }
        translations = await response.json();
    } catch (error) {
        console.error(error);
        // Fallback to Portuguese if the selected language file fails to load
        if (lang !== 'pt-BR') {
            await loadTranslations('pt-BR');
        }
    }
}

function translateElements() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translation = getTranslation(key);
        if (translation) {
            element.innerHTML = translation;
        }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        const translation = getTranslation(key);
        if (translation) {
            element.placeholder = translation;
        }
    });
     document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        const translation = getTranslation(key);
        if (translation) {
            element.title = translation;
        }
    });
}

function getTranslation(key, replacements = {}) {
    let translation = key.split('.').reduce((obj, k) => obj && obj[k], translations);
    if (translation) {
        for (const placeholder in replacements) {
            translation = translation.replace(`{${placeholder}}`, replacements[placeholder]);
        }
    }
    return translation || key; // Fallback to the key itself if not found
}

export function t(key, replacements) {
    return getTranslation(key, replacements);
}

export async function setLanguage(lang) {
    if (!supportedLanguages.includes(lang)) {
        console.warn(`Unsupported language: ${lang}. Defaulting to pt-BR.`);
        lang = 'pt-BR';
    }
    currentLanguage = lang;
    localStorage.setItem('reversus-lang', lang);
    await loadTranslations(lang);
    translateElements();
    document.documentElement.lang = lang.split('-')[0];

    // Re-render dynamic components if a game is active, to update their text.
    const { gameState } = getState();
    if (gameState) {
        renderAll();
    }

    // Update active state on buttons
    document.querySelectorAll('.lang-button').forEach(btn => {
        btn.classList.toggle('active', btn.id === `lang-${lang}`);
    });
}

export async function initI18n() {
    let lang = localStorage.getItem('reversus-lang');
    if (!lang) {
        const browserLang = navigator.language || navigator.userLanguage;
        lang = supportedLanguages.find(l => l === browserLang) || 'pt-BR';
    }
    await setLanguage(lang);
}

export function getCurrentLanguage() {
    return currentLanguage;
}