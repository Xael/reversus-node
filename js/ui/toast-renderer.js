import * as dom from '../core/dom.js';
import { t } from '../core/i18n.js';

/**
 * Shows a toast notification for an unlocked achievement.
 * This is now in its own module to prevent circular dependencies.
 * @param {object} achievementData - The data for the unlocked achievement.
 * @param {string} [overrideDescription=''] - An optional override for the description text.
 */
export const showAchievementNotification = (achievementData, overrideDescription = '') => {
    const name = t(achievementData.nameKey);
    const description = overrideDescription || t(achievementData.descriptionKey);

    dom.toastText.textContent = t('achievements.unlocked_toast', { name, description });
    dom.achievementUnlockedToast.classList.remove('hidden');

    // Automatically hide after the CSS animation completes.
    setTimeout(() => {
        dom.achievementUnlockedToast.classList.add('hidden');
    }, 4500); // This duration must match the 'toast-in-down-out' animation in index.css.
};

/**
 * Shows a toast notification for a coin reward.
 * @param {string} message - The message to display in the toast.
 */
export const showCoinRewardNotification = (message) => {
    dom.rewardToastText.textContent = message;
    dom.dailyRewardToast.classList.remove('hidden');

    setTimeout(() => {
        dom.dailyRewardToast.classList.add('hidden');
    }, 4500);
};