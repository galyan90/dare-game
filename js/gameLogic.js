// ===== API FUNCTIONS =====

/**
 * Call local Gemini API endpoint
 */
async function callLocalGeminiAPI(prompt, gameContext) {
    try {
        const response = await fetch('/api/claude', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: prompt,
                gameContext: gameContext
            })
        });

        const data = await response.json();

        if (!response.ok) {
            // Handle specific error types from the API
            throw new Error(data.error || 'api_error');
        }

        return data.response;

    } catch (error) {
        console.error('Local API Error:', error);
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('network_error');
        }
        
        throw error;
    }
}

/**
 * Build game context for API call
 */
function buildGameContext(targetPlayer, promptType) {
    return {
        player1: gameData.player1,
        player2: gameData.player2,
        relationship: gameData.relationship,
        goal: gameData.goal,
        intimacy: gameData.intimacy,
        currentPlayer: targetPlayer,
        promptType: promptType,
        usedPrompts: gameData.usedPrompts.slice(-5), // Last 5 prompts only
        sessionId: gameData.sessionId,
        timestamp: new Date().toISOString()
    };
}

/**
 * Build prompt for Gemini based on game context
 */
function buildGeminiPrompt(type, targetPlayer) {
    const playerName = targetPlayer === 1 ? gameData.player1 : gameData.player2;
    const otherPlayerName = targetPlayer === 1 ? gameData.player2 : gameData.player1;
    
    let prompt = '';
    
    if (type === 'question') {
        prompt = `צור שאלה מעניינת ואישית עבור ${playerName}.`;
        
        // Add specific context based on intimacy level
        if (gameData.intimacy === 'היכרות ראשונית') {
            prompt += ' השאלה צריכה להיות נעימה ומתאימה להכרות ראשונית.';
        } else if (gameData.intimacy === 'פלפל בינוני') {
            prompt += ' השאלה יכולה להיות קצת יותר אישית, אבל עדיין נוחה.';
        } else if (gameData.intimacy === 'נועזים ופתוחים') {
            prompt += ' השאלה יכולה להיות עמוקה ואישית יותר.';
        }
        
    } else if (type === 'dare') {
        prompt = `צור אתגר או משימה מהנה ש${playerName} יכול לעשות עכשיו.`;
        
        // Add specific context based on intimacy level
        if (gameData.intimacy === 'היכרות ראשונית') {
            prompt += ' האתגר צריך להיות פשוט, חמוד ומתאים לדייטים ראשונים.';
        } else if (gameData.intimacy === 'פלפל בינוני') {
            prompt += ' האתגר יכול להיות קצת יותר אינטימי, אבל עדיין נוח.';
        } else if (gameData.intimacy === 'נועזים ופתוחים') {
            prompt += ' האתגר יכול להיות רומנטי ואינטימי יותר.';
        }
    }
    
    return prompt;
}

/**
 * Generate prompt using API or fallback
 */
async function generatePromptWithAPI(type, targetPlayer) {
    const cacheKey = getCacheKey(type, targetPlayer, gameData.intimacy, gameData.relationship, gameData.goal);
    
    // Check cache first
    if (shouldUseCache(cacheKey)) {
        const cached = gameData.promptCache.get(cacheKey);
        console.log('Using cached prompt');
        return cached.prompt;
    }
    
    try {
        // Validate game data
        if (!validateGameData()) {
            throw new Error('Invalid game data');
        }
        
        // Build prompt and context
        const prompt = buildGeminiPrompt(type, targetPlayer);
        const gameContext = buildGameContext(targetPlayer, type);
        
        // Call API
        const generatedContent = await callLocalGeminiAPI(prompt, gameContext);
        
        // Validate response
        if (!generatedContent || generatedContent.length < 10) {
            throw new Error('Generated content too short');
        }
        
        // Check if we already used this prompt
        if (isPromptUsed(generatedContent)) {
            console.log('Prompt already used, trying again...');
            
            // Try one more time with additional context
            const retryPrompt = prompt + ' תן לי משהו אחר לגמרי, יצירתי ושונה מהקודם.';
            const retryContent = await callLocalGeminiAPI(retryPrompt, gameContext);
            
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
        console.warn('API failed, falling back to local content:', error.message);
        
        // Show appropriate error message
        if (error.message === 'rate_limit') {
            showError('יותר מדי בקשות. חכו רגע ונסו שוב!');
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else if (error.message === 'network_error') {
            showError('בעיה בחיבור. בואו ננסה עם שאלה מקומית.');
        } else if (error.message === 'api_key_invalid') {
            showError('בעיה בהגדרות API. עובר לשאלות מקומיות.');
        }
        
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
        console.log('All prompts used, resetting history');
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
        const minDelay = 1500;
        const maxDelay = 3000;
        const delay = Math.random() * (maxDelay - minDelay) + minDelay;
        
        const [prompt] = await Promise.all([
            generatePromptWithAPI(gameData.currentType, gameData.currentPlayer),
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
    if (nextBtn) {
        nextBtn.innerHTML = `<span class="btn-icon">🔁</span><span>תור ${otherPlayerName}</span>`;
    }
    
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
        max-width: 90%;
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
