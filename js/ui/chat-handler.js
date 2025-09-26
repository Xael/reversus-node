
// js/ui/chat-handler.js
import * as dom from '../core/dom.js';
import { t } from '../core/i18n.js';
import * as network from '../core/network.js';

const activeChatWindows = new Set();

/**
 * Creates and manages a private chat window for a specific user.
 * @param {string} userId - The ID of the user to chat with.
 * @param {string} username - The username of the user to chat with.
 */
export function openChatWindow(userId, username) {
    if (activeChatWindows.has(userId)) {
        const existingWindow = document.getElementById(`chat-window-${userId}`);
        if (existingWindow) existingWindow.querySelector('.chat-window-input').focus();
        return;
    }
    activeChatWindows.add(userId);
    dom.privateChatPanel.classList.remove('hidden');

    const chatWindow = document.createElement('div');
    chatWindow.className = 'chat-window';
    chatWindow.id = `chat-window-${userId}`;
    chatWindow.innerHTML = `
        <div class="chat-window-header">
            <span>${username}</span>
            <button class="chat-window-close" data-user-id="${userId}">&times;</button>
        </div>
        <div class="chat-window-messages"></div>
        <div class="chat-window-input-area">
            <input type="text" class="chat-window-input" placeholder="${t('chat.placeholder')}">
        </div>
    `;
    dom.privateChatPanel.appendChild(chatWindow);

    const input = chatWindow.querySelector('.chat-window-input');
    input.focus();

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const content = input.value.trim();
            if (content) {
                network.emitSendPrivateMessage(parseInt(userId, 10), content);
                input.value = '';
            }
        }
    });
}

/**
 * Initializes the event listener for closing private chat windows.
 */
export function initializeChatHandlers() {
    if (dom.privateChatPanel) {
        dom.privateChatPanel.addEventListener('click', (e) => {
            if (e.target.matches('.chat-window-close')) {
                const userId = e.target.dataset.userId;
                const chatWindow = document.getElementById(`chat-window-${userId}`);
                if (chatWindow) {
                    chatWindow.remove();
                    activeChatWindows.delete(userId);
                    if (activeChatWindows.size === 0) {
                        dom.privateChatPanel.classList.add('hidden');
                    }
                }
            }
        });
    }
}