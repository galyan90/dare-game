
// ===== GEMINI API FUNCTIONS =====

/**
 * Call Gemini API to generate content
 */
async function callGeminiAPI(prompt) {
    if (!validateApiKey()) {
        throw new Error('API key not configured');
    }

    const url = `${GEMINI_CONFIG.baseURL}/models/${GEMINI_CONFIG.model}:generateContent?key=${GEMINI_CONFIG.apiKey}`;
    
    const requestBody = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }],
        generationConfig: {
            temperature: GEMINI_CONFIG.temperature,
            topK: GEMINI_CONFIG.topK,
            topP: GEMINI_CONFIG.topP,
            maxOutputTokens: GEMINI_CONFIG.maxTokens,
        },
        safetySettings: [
            {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
        ]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('rate_limit');
            } else if (response.status >= 500) {
                throw new Error('api_error');
            } else {
                throw new Error('network_error');
            }
        }

        const data = await response.json();
        
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('invalid_response');
        }

        const generatedText = data.candidates[0].content.parts[0].text;
        return generatedText.trim();

    } catch (error) {
        console.error('Gemini API Error:', error);
        
        if (error.message === 'rate_limit' || 
            error.message === 'api_error' || 
            error.message === 'network_error' || 
            error.message === 'invalid_response') {
            throw error;
        }
        
        throw new Error('general_error');
    }
}

/**
 * Build prompt for Gemini based on game context
 */
function buildGeminiPrompt(type, targetPlayer) {
    const playerName = targetPlayer === 1 ? gameData.player1 : gameData.player2;
    const otherPlayerName = targetPlayer === 1 ? gameData.player2 : gameData.player1;
    
    // Get context strings
    const relationshipContext = CONTEXT_BUILDERS.relationship[gameData.relationship] || '';
    const goalContext = CONTEXT_BUILDERS.goal[gameData.goal] || '';
    const intimacyContext = PROMPT_TEMPLATES[type].intimacyLevels[gameData.intimacy] || '';
    
    // Build the prompt
    let prompt = PROMPT_TEMPLATES.system + '\n\n';
    
    prompt += PROMPT_TEMPLATES[type].base
        .replace('{relationship_context}', relationshipContext)
        .replace('{target_player}', playerName)
        .replace('{intimacy_level}', intimacyContext)
        .replace('{evening_goal}', goalContext);
    
    // Add specific context based on type
    if (type === 'question') {
        prompt += `\n\nהשאלה צריכה להיות מופנית ישירות ל${playerName} ולעזור ל${otherPlayerName} להכיר אותו/אותה טוב יותר.`;
    } else if (type === 'dare') {
        prompt += `\n\nהאתגר צריך להיות משהו ש${playerName} יכול לעשות עכשיו, במקום, ושיהיה מהנה לשניהם.`;
    }
    
    // Add history context to avoid repetition
    if (gameData.usedPrompts.length > 0) {
        prompt += '\n\nאל תחזור על השאלות/אתגרים הבאים:\n';
        prompt += gameData.usedPrompts.slice(-5).map(p => `- ${p}`).join('\n');
    }
    
    // Add goal-specific instructions
    if (gameData.goal === 'לשבור את השגרה') {
        prompt += '\n\nהיה יצירתי ומפתיע!';
    } else if (gameData.goal === 'להעמיק קשר') {
        prompt += '\n\nמטרת השאלה היא ליצור חיבור עמוק יותר.';
    } else if (gameData.goal === 'להתחמם קצת') {
        prompt += '\n\nהשאלה צריכה להיות רומנטית ומחממת.';
    } else if (gameData.goal === 'רגש') {
        prompt += '\n\nהשאלה צריכה לעורר רגשות ולהיות משמעותית.';
    }
    
    return prompt;
}

/**
 * Generate prompt using Gemini API or fallback
 */
async function generatePromptWithGemini(type, targetPlayer) {
    const cacheKey = getCacheKey(type, targetPlayer, gameData.intimacy, gameData.relationship, gameData.goal);
    
    // Check cache first
    if (shouldUseCache(cacheKey)) {
        const cached = gameData.promptCache.get(cacheKey);
        return cached.prompt;
    }
    
    try {
        // Validate game data
        if (!validateGameData()) {
            throw new Error('Invalid game data');
        }
        
        // Build and send prompt to Gemini
        const prompt = buildGeminiPrompt(type, targetPlayer);
        const generatedContent = await callGeminiAPI(prompt);
        
        // Validate response
        if (!generatedContent || generatedContent.length < 10) {
            throw new Error('Generated content too short');
        }
        
        // Check if we already used this prompt
        if (isPromptUsed(generatedContent)) {
            // Try one more time with additional context
            const retryPrompt = prompt + '\n\nתן לי משהו אחר לגמרי, יצירתי ושונה.';
            const retryContent = await callGeminiAPI(retryPrompt);
            
            if (retryContent && retryContent.length >= 10 && !isPromptUsed(retryContent)) {
                addToCache(cacheKey, retryContent);
                addToHistory(retryContent);
                return retryContent;
            }
        }
        
        // Cache and return the result
        addToCache(cacheKey, generatedContent);
        addToHistory(generatedContent);
        return generatedContent;
        
    } catch (error) {
        console.warn('Falling back to local content:', error.message);
        
        // Fallback to local content
        return getFallbackPrompt(type, gameData.intimacy);
    }
}

/**
 * Get fallback prompt from local content
 */
function getFallbackPrompt(type, intimacyLevel) {
    const prompts = FALLBACK_CONTENT[type][intimacyLevel] || FALLBACK_CONTENT[type]['היכרות ראשונית'];
    const availablePrompts = prompts.filter(p => !isPromptUsed(p));
    
    let selectedPrompt;
    if (availablePrompts.length > 0) {
        selectedPrompt = availablePrompts[Math.floor(Math.random() * availablePrompts.length)];
    } else {
        // If all prompts used, reset history and pick randomly
        gameData.usedPrompts = [];
        selectedPrompt = prompts[Math.floor(Math.random() * prompts.length)];
    }
    
    addToHistory(selectedPrompt);
    return selectedPrompt;
}

// ===== GAME LOGIC FUNCTIONS =====

/**
 * Navigate between screens with animation
 */
function showScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Show target screen with delay for animation
    setTimeout(() => {
        document.getElementById(screenId).classList.add('active');
    }, 100);
}

/**
 * Move to relationship screen
 */
function goToRelationship() {
    const player1 = document.getElementById('player1').value.trim();
    const player2 = document.getElementById('player2').value.trim();
    
    if (!player1 || !player2) {
        showError('אנא מלאו את שני השמות');
        return;
    }
    
    if (player1.length < 2 || player2.length < 2) {
        showError('השמות צריכים להיות לפחות 2 תווים');
        return;
    }
    
    gameData.player1 = player1;
    gameData.player2 = player2;
    showScreen('relationship-screen');
}

/**
 * Select relationship stage
 */
function selectRelationship(element, value) {
    // Remove selection from other relationship options
    document.querySelectorAll('#relationship-screen .option-btn').forEach(btn => {
        if (btn.textContent.includes('דייטים') || btn.textContent.includes('חודשים') || btn.textContent.includes('זמן')) {
            btn.classList.remove('selected');
        }
    });
    
    element.classList.add('selected');
    gameData.relationship = value;
    checkRelationshipComplete();
}

/**
 * Select evening goal
 */
function selectGoal(element, value) {
    // Remove selection from other goal options
    document.querySelectorAll('#relationship-screen .option-btn').forEach(btn => {
        if (btn.textContent.includes('שגרה') || btn.textContent.includes('קשר') || 
            btn.textContent.includes('התחמם') || btn.textContent.includes('רגש')) {
            btn.classList.remove('selected');
        }
    });
    
    element.classList.add('selected');
    gameData.goal = value;
    checkRelationshipComplete();
}

/**
 * Check if relationship screen is complete
 */
function checkRelationshipComplete() {
    const nextBtn = document.getElementById('relationship-next');
    if (gameData.relationship && gameData.goal) {
        nextBtn.disabled = false;
        nextBtn.classList.add('success-glow');
    }
}

/**
 * Move to intimacy level screen
 */
function goToIntimacy() {
    showScreen('intimacy-screen');
}

/**
 * Select intimacy level
 */
function selectIntimacy(element, value) {
    document.querySelectorAll('#intimacy-screen .intimacy-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    element.classList.add('selected');
    gameData.intimacy = value;
    
    const nextBtn = document.getElementById('intimacy-next');
    nextBtn.disabled = false;
    nextBtn.classList.add('success-glow');
}

/**
 * Move to main menu
 */
function goToMenu() {
    const welcomeMsg = document.getElementById('welcome-message');
    welcomeMsg.textContent = `שלום ${gameData.player1} ו${gameData.player2}! 👋`;
    showScreen('menu-screen');
    
    // Show floating hearts effect
    createFloatingHearts();
}

/**
 * Start prompt generation process
 */
function startPrompt(type) {
    gameData.currentType = type;
    
    // If game hasn't started yet, show player selection
    if (!gameData.gameStarted) {
        showPlayerSelection(type);
    } else {
        // Switch to other player automatically
        gameData.currentPlayer = gameData.currentPlayer === 1 ? 2 : 1;
        generateAndShowPrompt();
    }
}

/**
 * Show player selection screen
 */
function showPlayerSelection(type) {
    document.getElementById('player1-name-display').textContent = gameData.player1;
    document.getElementById('player2-name-display').textContent = gameData.player2;
    
    const typeText = type === 'question' ? 'השאלה' : 'האתגר';
    document.getElementById('selection-subtitle').textContent = `בחרו מי יקבל את ${typeText}`;
    
    showScreen('player-selection-screen');
}

/**
 * Choose specific player
 */
function choosePlayer(playerNum) {
    gameData.currentPlayer = playerNum;
    gameData.gameStarted = true;
    generateAndShowPrompt();
}

/**
 * Choose random player
 */
function randomPlayer() {
    const randomBtn = document.querySelector('.random-btn');
    randomBtn.textContent = '🎲 בוחר...';
    randomBtn.disabled = true;
    
    // Add suspense animation
    randomBtn.classList.add('wiggle');
    
    setTimeout(() => {
        gameData.currentPlayer = Math.random() < 0.5 ? 1 : 2;
        gameData.gameStarted = true;
        
        randomBtn.textContent = '🎲 בחירה אקראית';
        randomBtn.disabled = false;
        randomBtn.classList.remove('wiggle');
        
        generateAndShowPrompt();
    }, 1500);
}

/**
 * Generate and display prompt
 */
async function generateAndShowPrompt() {
    showScreen('prompt-screen');
    
    // Show loading state
    const loading = document.getElementById('loading');
    const content = document.getElementById('prompt-content');
    const loadingText = document.querySelector('.loading-text');
    
    loading.classList.add('active');
    content.style.display = 'none';
    
    // Update loading message
    loadingText.textContent = getRandomLoadingMessage();
    
    try {
        // Generate prompt with random delay for suspense
        const minDelay = 2000;
        const maxDelay = 4000;
        const delay = Math.random() * (maxDelay - minDelay) + minDelay;
        
        const [prompt] = await Promise.all([
            generatePromptWithGemini(gameData.currentType, gameData.currentPlayer),
            new Promise(resolve => setTimeout(resolve, delay))
        ]);
        
        displayPrompt(prompt);
        
    } catch (error) {
        console.error('Error generating prompt:', error);
        
        // Show error and fallback
        const errorMessage = ERROR_MESSAGES[error.message] || ERROR_MESSAGES.general_error;
        showError(errorMessage);
        
        // Try fallback
        setTimeout(() => {
            try {
                const fallbackPrompt = getFallbackPrompt(gameData.currentType, gameData.intimacy);
                displayPrompt(fallbackPrompt);
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
                backToMenu();
            }
        }, 2000);
    }
}

/**
 * Display generated prompt
 */
function displayPrompt(prompt) {
    const icons = { question: '🎲', dare: '🎯' };
    const typeNames = { question: 'שאלה', dare: 'אתגר' };
    
    const currentPlayerName = gameData.currentPlayer === 1 ? gameData.player1 : gameData.player2;
    const otherPlayerName = gameData.currentPlayer === 1 ? gameData.player2 : gameData.player1;
    
    // Format prompt with player name if not already included
    let formattedPrompt = prompt;
    if (!prompt.includes(currentPlayerName)) {
        formattedPrompt = `${currentPlayerName}, ${prompt}`;
    }
    
    // Update UI elements
    document.getElementById('prompt-icon').textContent = icons[gameData.currentType];
    document.getElementById('prompt-type').textContent = `${typeNames[gameData.currentType]} עבור ${currentPlayerName}`;
    document.getElementById('prompt-text').textContent = formattedPrompt;
    
    // Update next player button
    const nextBtn = document.getElementById('next-player-btn');
    nextBtn.innerHTML = `<span class="btn-icon">🔁</span><span>תור ${otherPlayerName}</span>`;
    
    // Hide loading and show content
    document.getElementById('loading').classList.remove('active');
    document.getElementById('prompt-content').style.display = 'block';
    
    // Add celebration effect
    showCelebration('✨');
}

/**
 * Switch to next player
 */
function nextPlayer() {
    gameData.currentPlayer = gameData.currentPlayer === 1 ? 2 : 1;
    generateAndShowPrompt();
}

/**
 * Finish current round
 */
function finishRound() {
    showCelebration('💖');
    
    setTimeout(() => {
        const completionMessages = [
            'מעולה! איך הרגשתם? 😊',
            'יפה מאוד! נהנתם? 💕',
            'כל הכבוד! עוד אחת? 🌟',
            'נפלא! אתם מדהימים יחד! ✨',
            'איזה כיף! בואו נמשיך 🎉'
        ];
        
        const randomMessage = completionMessages[Math.floor(Math.random() * completionMessages.length)];
        showMessage(randomMessage);
        
        setTimeout(() => {
            showScreen('menu-screen');
        }, 2000);
    }, 1500);
}

/**
 * Go back to main menu
 */
function backToMenu() {
    showScreen('menu-screen');
}

// ===== UTILITY FUNCTIONS =====

/**
 * Show error message
 */
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #f44336, #e57373);
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        font-weight: bold;
        z-index: 2000;
        text-align: center;
        box-shadow: 0 4px 12px rgba(244, 67, 54, 0.3);
        animation: slideInDown 0.3s ease-out;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.style.animation = 'slideInUp 0.3s ease-in forwards reverse';
        setTimeout(() => errorDiv.remove(), 300);
    }, 4000);
}

/**
 * Show success message
 */
function showMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #e91e63, #ff4081);
        color: white;
        padding: 20px 30px;
        border-radius: 15px;
        font-size: 18px;
        font-weight: bold;
        z-index: 2000;
        text-align: center;
        box-shadow: 0 10px 30px rgba(233, 30, 99, 0.4);
        animation: zoomIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    `;
    messageDiv.textContent = text;
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.animation = 'zoomIn 0.3s ease-in forwards reverse';
        setTimeout(() => messageDiv.remove(), 300);
    }, 2000);
}

/**
 * Show celebration effect
 */
function showCelebration(emoji) {
    const celebration = document.createElement('div');
    celebration.className = 'celebration';
    celebration.textContent = emoji;
    celebration.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        font-size: 100px;
        z-index: 1500;
        pointer-events: none;
        user-select: none;
    `;
    
    document.body.appendChild(celebration);
    
    setTimeout(() => {
        celebration.remove();
    }, 2000);
}

/**
 * Create floating hearts effect
 */
function createFloatingHearts() {
    const heartsContainer = document.getElementById('background-hearts');
    
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            const heart = document.createElement('div');
            heart.className = 'floating-heart';
            heart.textContent = ['💖', '💕', '💗', '💘'][Math.floor(Math.random() * 4)];
            heart.style.left = Math.random() * 100 + '%';
            heart.style.animationDelay = Math.random() * 2 + 's';
            heartsContainer.appendChild(heart);
            
            setTimeout(() => {
                heart.remove();
            }, 4000);
        }, i * 800);
    }
}

// ===== EXPORT FUNCTIONS FOR GLOBAL ACCESS =====
window.goToRelationship = goToRelationship;
window.selectRelationship = selectRelationship;
window.selectGoal = selectGoal;
window.goToIntimacy = goToIntimacy;
window.selectIntimacy = selectIntimacy;
window.goToMenu = goToMenu;
window.startPrompt = startPrompt;
window.choosePlayer = choosePlayer;
window.randomPlayer = randomPlayer;
window.nextPlayer = nextPlayer;
window.finishRound = finishRound;
window.backToMenu = backToMenu;
