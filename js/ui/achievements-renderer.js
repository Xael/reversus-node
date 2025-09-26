import * as dom from '../core/dom.js';
import * as config from '../core/config.js';
import { getState } from '../core/state.js';
import { t } from '../core/i18n.js';

/**
 * Renders the content of the achievements modal.
 */
export function renderAchievementsModal() {
    const { achievements } = getState();
    const allAchievements = config.ACHIEVEMENTS;

    dom.achievementsGrid.innerHTML = Object.keys(allAchievements).map(id => {
        const achievement = allAchievements[id];
        const isUnlocked = achievements.has(id);
        
        const name = isUnlocked ? t(achievement.nameKey) : '???';
        const description = isUnlocked 
            ? t(achievement.descriptionKey) 
            : t(config.ACHIEVEMENT_HINTS[id]);
        
        return `
            <div class="achievement-card ${isUnlocked ? 'unlocked' : ''}">
                <div class="achievement-icon">🏆</div>
                <h3 class="achievement-name">${name}</h3>
                <p class="achievement-description">${description}</p>
            </div>
        `;
    }).join('');
}