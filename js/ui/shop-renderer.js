// js/ui/shop-renderer.js
import * as dom from '../core/dom.js';
import { getState } from '../core/state.js';
import { t } from '../core/i18n.js';
import { AVATAR_CATALOG } from '../core/config.js';

/**
 * Updates the CoinVersus balance display in the header.
 * @param {number} balance - The new coin balance.
 */
export function updateCoinVersusDisplay(balance) {
    if (dom.userCoinBalanceHeader) {
        dom.userCoinBalanceHeader.textContent = `🪙 ${balance || 0}`;
    }
}

/**
 * Renders the avatars in the shop grid, checking for unlock conditions and ownership.
 */
export function renderShopAvatars() {
    const { userProfile, achievements } = getState();
    if (!userProfile) {
        dom.shopAvatarsGrid.innerHTML = `<p>${t('shop.login_required')}</p>`;
        return;
    }

    const ownedAvatars = userProfile.owned_avatars || [];
    
    // Also include achievements from local storage for responsiveness before server sync
    const clientAchievements = getState().achievements;

    dom.shopAvatarsGrid.innerHTML = Object.entries(AVATAR_CATALOG).map(([code, avatar]) => {
        // Check unlock condition using both server and client data
        if (avatar.unlock_achievement_code && !clientAchievements.has(avatar.unlock_achievement_code)) {
            return ''; // Don't render if not unlocked
        }

        const isOwned = ownedAvatars.includes(code);
        const canAfford = userProfile.coinversus >= avatar.cost;
        const avatarName = t(avatar.nameKey);

        let buttonHTML;
        if (isOwned) {
            buttonHTML = `<button class="control-button" disabled>${t('shop.owned')}</button>`;
        } else {
            buttonHTML = `<button class="control-button buy-avatar-btn" data-avatar-code="${code}" ${canAfford ? '' : 'disabled'}>${t('shop.buy')}</button>`;
        }

        return `
            <div class="avatar-item ${isOwned ? 'owned' : ''}">
                <div class="avatar-image-wrapper">
                    <img src="./${avatar.image_url}" alt="${avatarName}">
                </div>
                <span class="avatar-name">${avatarName}</span>
                <span class="avatar-price">🪙 ${avatar.cost}</span>
                ${buttonHTML}
            </div>
        `;
    }).join('');
}