import { getState, updateState } from '../core/state.js';
import * as dom from '../core/dom.js';
import * as config from '../core/config.js';
import { playStoryMusic, initializeMusic } from '../core/sound.js';
import { shatterImage, createStarryBackground, initializeFloatingItemsAnimation } from '../ui/animations.js';
import { storyDialogue } from './story-dialogue.js';
import { initializeGame } from '../game-controller.js';
import { updateLog } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { showSplashScreen } from '../ui/splash-screen.js';

const typewriter = (element, text, onComplete) => {
    let { typewriterTimeout } = getState();
    if (typewriterTimeout) clearTimeout(typewriterTimeout);
    let i = 0;
    element.innerHTML = '';
    const speed = 30;

    function type() {
        if (i < text.length) {
            let char = text.charAt(i);
            if (char === '\n') {
                element.innerHTML += '<br>';
            } else {
                element.innerHTML += char;
            }
            i++;
            typewriterTimeout = setTimeout(type, speed);
            updateState('typewriterTimeout', typewriterTimeout);
        } else {
            if (onComplete) onComplete();
        }
    }
    type();
};

const updateStoryStars = (character) => {
    // If no character is provided for the current node, don't change the stars.
    if (!character) {
        return;
    }
    const characterColors = {
        'Necroverso': '#FFFFFF',
        'Contravox': '#52b788',
        'Versatrix': '#fca311',
        'Reversum': '#e63946',
    };
    const color = characterColors[character] || 'transparent';
    if (color === 'transparent') {
        if (dom.storyStarsBackgroundEl) dom.storyStarsBackgroundEl.innerHTML = '';
        return;
    };
    createStarryBackground(dom.storyStarsBackgroundEl, color, 100);
};

export const renderStoryNode = (nodeId) => {
    // New logic to handle function-based node IDs
    if (typeof nodeId === 'function') {
        nodeId = nodeId(); // Evaluate the function to get the string ID
    }
    
    updateState('currentStoryNodeId', nodeId);
    const node = storyDialogue[nodeId];
    if (!node) {
        console.error(`Story node not found: ${nodeId}`);
        // Prevent getting stuck, go to splash screen
        document.dispatchEvent(new Event('showSplashScreen'));
        return;
    }

    if (node.music && (!dom.musicPlayer.src || !dom.musicPlayer.src.includes(node.music))) {
        playStoryMusic(node.music);
    }

    if (node.isEndStory) {
        if (!node.startGame || !node.startGame.battle) {
            console.error(`Story node '${nodeId}' is set to end and start a game, but 'startGame' configuration is missing or invalid.`);
            alert("Ocorreu um erro ao carregar a próxima batalha. Retornando ao menu principal.");
            dom.storyModeModalEl.classList.add('hidden');
            document.dispatchEvent(new Event('showSplashScreen'));
            return;
        }

        dom.storyModeModalEl.classList.add('hidden');
        let gameOptions, mode = 'solo';
        
        switch(node.startGame.battle) {
            case 'return_to_menu':
                showSplashScreen();
                return;
            case 'tutorial_necroverso':
                gameOptions = { 
                    story: { 
                        battle: 'tutorial_necroverso', 
                        playerIds: ['player-1', 'player-2'], 
                        overrides: { 'player-2': { name: 'Necroverso', aiType: 'necroverso_tutorial' } }
                    } 
                };
                break;
            case 'contravox':
                gameOptions = { story: { battle: 'contravox', playerIds: ['player-1', 'player-3'], overrides: { 'player-3': { name: 'Contravox', aiType: 'contravox' } } } };
                break;
            case 'versatrix':
                gameOptions = { story: { battle: 'versatrix', playerIds: ['player-1', 'player-4'], overrides: { 'player-4': { name: 'Versatrix', aiType: 'versatrix' } } } };
                break;
            case 'reversum':
                gameOptions = { story: { battle: 'reversum', playerIds: ['player-1', 'player-2'], overrides: { 'player-2': { name: 'Rei Reversum', aiType: 'reversum' } } } };
                break;
            case 'necroverso_king':
                 gameOptions = { story: { battle: 'necroverso_king', type: '1v3_king', playerIds: ['player-1', 'player-2', 'player-3', 'player-4'], overrides: { 'player-2': { name: 'Rei Necroverso', aiType: 'reversum' }, 'player-3': { name: 'Rei Necroverso', aiType: 'contravox' }, 'player-4': { name: 'Rei Necroverso', aiType: 'versatrix' } } } };
                break;
            case 'necroverso_final':
                mode = 'duo';
                gameOptions = { story: { battle: 'necroverso_final', type: '2v2_necro_final', playerIds: ['player-1', 'player-4', 'player-2', 'player-3'], overrides: { 'player-2': { name: 'Necroverso Final', aiType: 'necroverso_final' }, 'player-3': { name: 'Necroverso Final', aiType: 'necroverso_final' }, 'player-4': { name: 'Versatrix', aiType: 'versatrix' } } } };
                break;
             case 'xael_challenge':
                 gameOptions = {
                    story: {
                        battle: 'xael_challenge',
                        playerIds: ['player-1', 'player-2'],
                        overrides: { 'player-2': { name: 'Xael', aiType: 'xael' } }
                    }
                };
                break;
        }
        document.dispatchEvent(new CustomEvent('startStoryGame', { detail: { mode, options: gameOptions } }));
        return;
    }
    
    updateStoryStars(node.character);

    const previousImageName = dom.storyCharacterImageEl.dataset.imageName;
    const nextImageName = node.image || '';

    if (previousImageName !== nextImageName) {
        dom.storyCharacterImageEl.style.opacity = 0;
        setTimeout(() => {
            dom.storyCharacterImageEl.src = nextImageName ? `./${nextImageName}` : '';
            dom.storyCharacterImageEl.dataset.imageName = nextImageName;
            // special cases
            dom.storyCharacterImageEl.classList.toggle('final-boss-glow', node.character === 'Necroverso');
            dom.storyCharacterImageEl.style.opacity = 1;
        }, 400); // match transition
    } else {
        // If image is the same, no fade needed
        dom.storyCharacterImageEl.style.opacity = 1;
    }

    const textContentKey = typeof node.text === 'function' ? node.text() : node.text;
    const textContent = t(textContentKey);
    const optionsSource = typeof node.options === 'function' ? node.options() : node.options;


    const onTypewriterComplete = () => {
        dom.storyDialogueOptionsEl.innerHTML = ''; // Clear previous options
        if (node.isContinue) {
            const button = document.createElement('button');
            button.textContent = t('common.continue') + '...';
            button.className = 'control-button';
            button.onclick = () => renderStoryNode(node.next);
            dom.storyDialogueOptionsEl.appendChild(button);
        } else if (optionsSource) {
            optionsSource.forEach(option => {
                const button = document.createElement('button');
                button.textContent = t(option.text);
                button.className = 'control-button';
                button.onclick = () => renderStoryNode(option.next);
                dom.storyDialogueOptionsEl.appendChild(button);
            });
        }
        dom.storyDialogueOptionsEl.style.opacity = 1;
    };

    dom.storyDialogueOptionsEl.style.opacity = 0; // Hide options while typing
    typewriter(dom.storyDialogueTextEl, textContent, onTypewriterComplete);

    dom.storySceneDialogueEl.classList.remove('hidden');
};

export const startStoryMode = () => {
    initializeMusic();
    dom.splashScreenEl.classList.add('hidden');
    dom.storyModeModalEl.classList.remove('hidden');
    
    const { storyState } = getState();
    renderStoryNode('start_necroverso');
};

export async function playEndgameSequence() {
    // Hide all other UI
    document.querySelectorAll('.modal-overlay:not(#endgame-sequence-modal)').forEach(el => el.classList.add('hidden'));
    dom.appContainerEl.classList.add('hidden');
    dom.debugButton.classList.add('hidden');

    const endgameModal = dom.endgameSequenceModal;
    const characterContainer = dom.endgameCharacterContainer;
    const dialogueTextEl = dom.endgameDialogueText;
    const dialogueOptionsEl = dom.endgameDialogueOptions;

    endgameModal.classList.remove('hidden');

    const sleep = (ms) => new Promise(res => setTimeout(res, ms));

    const typeDialogue = (textKey) => {
        return new Promise(resolve => {
            dialogueTextEl.textContent = ''; // Clear previous text
            typewriter(dialogueTextEl, t(textKey), resolve);
        });
    };

    // Sequence Start
    const versatrixImg = document.createElement('img');
    versatrixImg.src = './versatrix.png';
    versatrixImg.className = 'endgame-character';
    versatrixImg.style.opacity = '0';
    characterContainer.appendChild(versatrixImg);

    versatrixImg.style.opacity = '1';
    await typeDialogue("story_dialogue.endgame_dialogue_1");
    await sleep(2000);

    const necroversoImg = document.createElement('img');
    necroversoImg.src = './necroverso2.png';
    necroversoImg.className = 'endgame-character';
    necroversoImg.style.opacity = '0';
    characterContainer.appendChild(necroversoImg);

    await typeDialogue("story_dialogue.endgame_dialogue_2");
    await sleep(1000);

    necroversoImg.style.opacity = '1';
    await typeDialogue("story_dialogue.endgame_dialogue_3");
    await sleep(2000);

    await typeDialogue("story_dialogue.endgame_dialogue_4");
    await sleep(2000);

    await shatterImage(necroversoImg);
    characterContainer.removeChild(necroversoImg);

    await typeDialogue("story_dialogue.endgame_dialogue_5");
    await sleep(3000);

    await typeDialogue("story_dialogue.endgame_dialogue_6");

    dialogueOptionsEl.innerHTML = `
        <button id="endgame-choice-return" class="control-button">${t('story_dialogue.endgame_option_return')}</button>
        <button id="endgame-choice-stay" class="control-button secondary">${t('story_dialogue.endgame_option_stay')}</button>
    `;

    const handleChoice = async () => {
        dialogueOptionsEl.innerHTML = ''; // Clear buttons
        // Fade to white and start credits
        dom.storyScreenFlashEl.classList.remove('hidden');
        dom.storyScreenFlashEl.style.animation = 'flash-white 2s forwards';
        await sleep(2000);
        endgameModal.classList.add('hidden');
        dom.storyScreenFlashEl.classList.add('hidden');
        dom.storyScreenFlashEl.style.animation = ''; // reset animation
        showCreditsRoll();
    };

    dialogueOptionsEl.querySelector('#endgame-choice-return').onclick = () => {
        updateLog("Você escolheu voltar para casa, levando consigo as memórias do Inversus.");
        handleChoice();
    };
    dialogueOptionsEl.querySelector('#endgame-choice-stay').onclick = () => {
        updateLog("Você escolheu ficar, tornando-se um guardião do Inversus ao lado de Versatrix.");
        handleChoice();
    };
}

function showCreditsRoll() {
    const creditsRollModal = document.getElementById('credits-roll-modal');
    const creditsAnimationContainer = document.getElementById('credits-animation-container');
    const creditsVideoContainer = document.getElementById('credits-video-container');
    const finalVideoModal = document.getElementById('final-video-modal');
    const finalVideoPlayer = document.getElementById('final-video-player');

    creditsRollModal.classList.remove('hidden');
    playStoryMusic('creditos.ogg', false);

    initializeFloatingItemsAnimation(creditsAnimationContainer, 'credits');

    const videos = [
        { name: 'Contravox', file: 'video3.mp4', time: 15000, side: 'left' },
        { name: 'Versatrix', file: 'video2.mp4', time: 50000, side: 'right' },
        { name: 'Rei Reversum', file: 'video4.mp4', time: 85000, side: 'left' },
        { name: 'Necroverso', file: 'video1.mp4', time: 120000, side: 'right' }
    ];

    const totalDuration = 176000; // 2:56 in milliseconds

    videos.forEach(video => {
        setTimeout(() => {
            const wrapper = document.createElement('div');
            wrapper.className = 'floating-video-wrapper';
            
            if (video.side === 'left') {
                wrapper.style.left = '15%';
            } else {
                wrapper.style.left = '65%';
            }
            
            wrapper.style.animationDuration = `30s`;

            const nameEl = document.createElement('p');
            nameEl.className = 'floating-video-name';
            nameEl.classList.add(`name-${video.name.toLowerCase().replace(/\s/g, '-')}`);
            nameEl.textContent = video.name;

            const videoEl = document.createElement('video');
            videoEl.className = 'floating-video-player';
            videoEl.src = `./${video.file}`;
            videoEl.autoplay = true;
            videoEl.loop = true;
            videoEl.muted = true;
            videoEl.playsInline = true;

            wrapper.appendChild(nameEl);
            wrapper.appendChild(videoEl);
            creditsVideoContainer.appendChild(wrapper);
        }, video.time);
    });

    const creditsHtml = `
        <h2>${t('credits.title')}</h2>
        <p class="credits-category">${t('credits.category_script')}</p>
        <p>Xael</p>
        <p class="credits-category">${t('credits.category_music')}</p>
        <p>Suno Ai</p>
        <p class="credits-category">${t('credits.category_sound')}</p>
        <p>Xael + RPT RPG MAKER</p>
        <p class="credits-category">${t('credits.category_art')}</p>
        <p>Gemini Ai + Chatgpt</p>
        <p class="credits-category">${t('credits.category_programming')}</p>
        <p>Xael + Google AI Studio</p>
        <p class="credits-category">${t('credits.category_beta_testers')}</p>
        <p>${t('credits.beta_testers_names')}<br>(${t('credits.beta_testers_thanks')})</p>
        <br>
        <p class="credits-category">${t('credits.category_special_thanks')}</p>
        <p>${t('credits.special_thanks_1')}</p>
        <p>${t('credits.special_thanks_2')}</p>
        <p>${t('credits.special_thanks_3')}</p>
        <p>${t('credits.special_thanks_4')}</p>
        <br>
        <p class="credits-thanks">${t('credits.final_thanks')}</p>
        <p>Xael - Alex</p>
        <br><br><br>
        <p>${t('credits.the_end')}</p>
    `;
    dom.creditsContent.innerHTML = creditsHtml;

    setTimeout(() => {
        creditsRollModal.classList.add('hidden');
        creditsAnimationContainer.innerHTML = '';
        creditsVideoContainer.innerHTML = '';

        finalVideoModal.classList.remove('hidden');
        finalVideoPlayer.src = './video5.mp4';
        finalVideoPlayer.play();

        finalVideoPlayer.onended = () => {
            finalVideoModal.classList.add('hidden');
            document.dispatchEvent(new Event('showSplashScreen'));
        };
    }, totalDuration);
}