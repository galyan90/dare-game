// ===== SCREENS, NAVIGATION AND TURN FLOW =====
// Loaded before gameLogic.js, which provides the API-backed prompt generation.

const API_CONFIG = {
    timeout: 20000 // ms per request to /api/claude
};

// Counts how many prompts came from the AI vs. the local list (shown in the console only).
const promptStats = { api: 0, fallback: 0 };
function updateStatistics(type, source) {
    promptStats[source] = (promptStats[source] || 0) + 1;
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
        // Same player keeps the turn: going back to the menu to switch category must not
        // pass the turn. The turn only passes in finishRound() or nextPlayer().
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
    // Done with this prompt – the other player is up next.
    gameData.currentPlayer = gameData.currentPlayer === 1 ? 2 : 1;
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
window.showScreen = showScreen;
window.displayPrompt = displayPrompt;
window.showError = showError;
window.showMessage = showMessage;
