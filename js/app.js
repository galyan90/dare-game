// ===== APP INITIALIZATION =====

/**
 * Initialize the game when DOM is ready
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎮 Couple Challenge Game - מתחיל...');
    
    initializeGame();
    setupEventListeners();
    setupKeyboardShortcuts();
    checkAPIConfiguration();
    
    console.log('✅ המשחק מוכן לשימוש!');
});

/**
 * Initialize game state and UI
 */
function initializeGame() {
    // Reset game data to initial state
    resetGameData();
    
    // Setup UI enhancements
    enhanceUI();
    
    // Setup service worker for offline support (if available)
    setupServiceWorker();
    
    // Setup error handling
    setupGlobalErrorHandler();
    
    // Preload critical resources
    preloadResources();
}

/**
 * Reset game data to initial state
 */
function resetGameData() {
    gameData.player1 = '';
    gameData.player2 = '';
    gameData.relationship = '';
    gameData.goal = '';
    gameData.intimacy = '';
    gameData.currentType = '';
    gameData.currentPlayer = 0;
    gameData.usedPrompts = [];
    gameData.gameStarted = false;
    gameData.promptCache.clear();
    
    console.log('🔄 נתוני המשחק אופסו');
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Input field enhancements
    setupInputFieldListeners();
    
    // Button hover effects
    setupButtonEffects();
    
    // Form submission handlers
    setupFormHandlers();
    
    // Window event handlers
    setupWindowHandlers();
    
    console.log('🎧 Event listeners הוגדרו');
}

/**
 * Setup input field event listeners
 */
function setupInputFieldListeners() {
    const inputs = document.querySelectorAll('input[type="text"]');
    
    inputs.forEach(input => {
        // Enter key submission
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const activeScreen = document.querySelector('.screen.active');
                const nextBtn = activeScreen.querySelector('.btn:not(:disabled)');
                if (nextBtn) {
                    nextBtn.click();
                }
            }
        });
        
        // Real-time validation
        input.addEventListener('input', function(e) {
            validateInput(e.target);
        });
        
        // Enhanced focus/blur effects
        input.addEventListener('focus', function(e) {
            e.target.parentElement.classList.add('focused');
        });
        
        input.addEventListener('blur', function(e) {
            e.target.parentElement.classList.remove('focused');
        });
    });
}

/**
 * Setup button hover and click effects
 */
function setupButtonEffects() {
    const buttons = document.querySelectorAll('.btn, .option-btn, .intimacy-card, .player-card');
    
    buttons.forEach(button => {
        // Add ripple effect on click
        button.addEventListener('click', function(e) {
            createRippleEffect(e);
        });
        
        // Add sound feedback (visual)
        button.addEventListener('mouseenter', function() {
            if (!button.disabled) {
                button.style.transform = 'translateY(-2px)';
            }
        });
        
        button.addEventListener('mouseleave', function() {
            if (!button.disabled) {
                button.style.transform = '';
            }
        });
    });
}

/**
 * Setup form submission handlers
 */
function setupFormHandlers() {
    // Prevent actual form submission if any forms exist
    document.addEventListener('submit', function(e) {
        e.preventDefault();
    });
    
    // Handle input validation on form fields
    const requiredInputs = document.querySelectorAll('input[required]');
    requiredInputs.forEach(input => {
        input.addEventListener('invalid', function(e) {
            e.preventDefault();
            showInputError(e.target, 'שדה זה הוא חובה');
        });
    });
}

/**
 * Setup window-level event handlers
 */
function setupWindowHandlers() {
    // Handle window resize
    window.addEventListener('resize', debounce(handleResize, 250));
    
    // Handle visibility change (tab switching)
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Handle online/offline status
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOfflineStatus);
    
    // Handle beforeunload (leaving page)
    window.addEventListener('beforeunload', handleBeforeUnload);
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        const activeScreen = document.querySelector('.screen.active');
        
        if (!activeScreen) return;
        
        // Global shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case 'r':
                    e.preventDefault();
                    if (confirm('האם תרצה להתחיל את המשחק מחדש?')) {
                        location.reload();
                    }
                    break;
                case 'h':
                    e.preventDefault();
                    showHelp();
                    break;
            }
            return;
        }
        
        // Screen-specific shortcuts
        const screenId = activeScreen.id;
        
        switch(screenId) {
            case 'menu-screen':
                handleMenuKeyboard(e);
                break;
            case 'player-selection-screen':
                handlePlayerSelectionKeyboard(e);
                break;
            case 'prompt-screen':
                handlePromptKeyboard(e);
                break;
        }
    });
    
    console.log('⌨️ קיצורי מקלדת הוגדרו');
}

/**
 * Handle keyboard shortcuts in menu screen
 */
function handleMenuKeyboard(e) {
    switch(e.key) {
        case '1':
            e.preventDefault();
            startPrompt('question');
            break;
        case '2':
            e.preventDefault();
            startPrompt('dare');
            break;
        case 'Escape':
            e.preventDefault();
            if (gameData.gameStarted) {
                showScreen('intimacy-screen');
            }
            break;
    }
}

/**
 * Handle keyboard shortcuts in player selection screen
 */
function handlePlayerSelectionKeyboard(e) {
    switch(e.key) {
        case '1':
            e.preventDefault();
            choosePlayer(1);
            break;
        case '2':
            e.preventDefault();
            choosePlayer(2);
            break;
        case 'r':
        case 'R':
            e.preventDefault();
            randomPlayer();
            break;
        case 'Escape':
            e.preventDefault();
            backToMenu();
            break;
    }
}

/**
 * Handle keyboard shortcuts in prompt screen
 */
function handlePromptKeyboard(e) {
    switch(e.key) {
        case 'Enter':
            e.preventDefault();
            finishRound();
            break;
        case ' ':
            e.preventDefault();
            nextPlayer();
            break;
        case 'Escape':
            e.preventDefault();
            backToMenu();
            break;
    }
}

/**
 * Check API configuration on startup
 */
function checkAPIConfiguration() {
    if (!validateApiKey()) {
        console.warn('⚠️ מפתח Gemini API לא הוגדר - המשחק יעבוד עם שאלות מקומיות');
        showApiWarning();
    } else {
        console.log('✅ Gemini API מוגדר');
        testApiConnection();
    }
}

/**
 * Test API connection
 */
async function testApiConnection() {
    try {
        // Simple test call to verify API is working
        const testPrompt = 'אמר שלום בעברית';
        await callGeminiAPI(testPrompt);
        console.log('✅ חיבור ל-Gemini API עובד');
    } catch (error) {
        console.warn('⚠️ בעיה בחיבור ל-Gemini API:', error.message);
        showApiError(error.message);
    }
}

/**
 * Enhance UI with additional features
 */
function enhanceUI() {
    // Add loading states to buttons
    addButtonLoadingStates();
    
    // Add progress indicators
    addProgressIndicators();
    
    // Add tooltips to elements
    addTooltips();
    
    // Add theme switching (if needed)
    setupThemeSystem();
    
    console.log('🎨 UI הוגבר');
}

/**
 * Add loading states to interactive buttons
 */
function addButtonLoadingStates() {
    const buttons = document.querySelectorAll('.btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            if (!button.disabled && !button.classList.contains('btn-ghost')) {
                button.style.position = 'relative';
                button.style.pointerEvents = 'none';
                
                setTimeout(() => {
                    button.style.pointerEvents = '';
                }, 500);
            }
        });
    });
}

/**
 * Add progress indicators
 */
function addProgressIndicators() {
    const screens = ['welcome-screen', 'relationship-screen', 'intimacy-screen'];
    
    screens.forEach((screenId, index) => {
        const screen = document.getElementById(screenId);
        if (screen) {
            const progress = document.createElement('div');
            progress.className = 'progress-indicator';
            progress.style.cssText = `
                position: absolute;
                top: 15px;
                left: 20px;
                color: #e91e63;
                font-size: 12px;
                font-weight: bold;
            `;
            progress.textContent = `${index + 1}/3`;
            screen.appendChild(progress);
        }
    });
}

/**
 * Add tooltips to elements
 */
function addTooltips() {
    const tooltipElements = [
        { selector: '.random-btn', text: 'לחץ R לבחירה אקראית' },
        { selector: '.question-btn', text: 'לחץ 1 למקש מהיר' },
        { selector: '.dare-btn', text: 'לחץ 2 למקש מהיר' }
    ];
    
    tooltipElements.forEach(({ selector, text }) => {
        const element = document.querySelector(selector);
        if (element) {
            element.setAttribute('title', text);
        }
    });
}

/**
 * Setup theme system (light/dark mode support)
 */
function setupThemeSystem() {
    // Check for system dark mode preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        // Could add dark mode support here in the future
        console.log('🌙 מצב כהה זוהה (לא מיושם כרגע)');
    }
}

/**
 * Setup service worker for offline support
 */
function setupServiceWorker() {
    if ('serviceWorker' in navigator) {
        // Service worker could be added for offline support
        console.log('🔧 Service Worker זמין (לא מיושם כרגע)');
    }
}

/**
 * Setup global error handler
 */
function setupGlobalErrorHandler() {
    window.addEventListener('error', function(e) {
        console.error('❌ שגיאה כללית:', e.error);
        
        // Don't show errors in production for network/API issues
        if (e.error && e.error.message && 
            (e.error.message.includes('fetch') || e.error.message.includes('API'))) {
            return;
        }
        
        showError('אירעה שגיאה בלתי צפויה. אנא רענן את הדף.');
    });
    
    window.addEventListener('unhandledrejection', function(e) {
        console.error('❌ Promise נדחה:', e.reason);
        
        // Handle API promise rejections gracefully
        if (e.reason && typeof e.reason === 'object' && 
            (e.reason.message === 'api_error' || e.reason.message === 'network_error')) {
            e.preventDefault(); // Prevent unhandled rejection error
        }
    });
}

/**
 * Preload critical resources
 */
function preloadResources() {
    // Preload could include fonts, images, etc.
    // For now, just ensure all scripts are loaded
    console.log('📦 משאבים נטענו');
}

// ===== EVENT HANDLER FUNCTIONS =====

/**
 * Handle window resize
 */
function handleResize() {
    // Adjust layout for different screen sizes
    const container = document.querySelector('.game-container');
    if (window.innerWidth < 480) {
        container.style.margin = '10px';
    } else {
        container.style.margin = '';
    }
}

/**
 * Handle visibility change (tab switching)
 */
function handleVisibilityChange() {
    if (document.hidden) {
        console.log('🙈 המשחק הוסתר');
    } else {
        console.log('👀 המשחק נראה שוב');
    }
}

/**
 * Handle online status
 */
function handleOnlineStatus() {
    console.log('🌐 חזרה למצב מקוון');
    showMessage('חזרתם למצב מקוון! 🌐');
}

/**
 * Handle offline status
 */
function handleOfflineStatus() {
    console.log('📴 מצב לא מקוון');
    showMessage('אתם במצב לא מקוון - המשחק ימשיך עם שאלות מקומיות 📴');
}

/**
 * Handle before page unload
 */
function handleBeforeUnload(e) {
    // Only show warning if game is in progress
    if (gameData.gameStarted && gameData.usedPrompts.length > 0) {
        e.preventDefault();
        e.returnValue = 'האם אתם בטוחים שתרצו לעזוב? המשחק שלכם יאבד.';
        return e.returnValue;
    }
}

// ===== UTILITY FUNCTIONS =====

/**
 * Validate input field
 */
function validateInput(input) {
    const value = input.value.trim();
    const minLength = 2;
    
    if (value.length === 0) {
        showInputError(input, 'שדה זה הוא חובה');
        return false;
    } else if (value.length < minLength) {
        showInputError(input, `לפחות ${minLength} תווים נדרשים`);
        return false;
    } else {
        clearInputError(input);
        return true;
    }
}

/**
 * Show input validation error
 */
function showInputError(input, message) {
    clearInputError(input);
    
    input.style.borderColor = '#f44336';
    input.classList.add('shake');
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'input-error';
    errorDiv.style.cssText = `
        color: #f44336;
        font-size: 12px;
        margin-top: 5px;
        text-align: right;
    `;
    errorDiv.textContent = message;
    
    input.parentElement.appendChild(errorDiv);
    
    setTimeout(() => {
        input.classList.remove('shake');
    }, 600);
}

/**
 * Clear input validation error
 */
function clearInputError(input) {
    input.style.borderColor = '';
    const existingError = input.parentElement.querySelector('.input-error');
    if (existingError) {
        existingError.remove();
    }
}

/**
 * Create ripple effect on button click
 */
function createRippleEffect(e) {
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    const ripple = document.createElement('div');
    ripple.style.cssText = `
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        transform: scale(0);
        animation: ripple 0.6s linear;
        left: ${x}px;
        top: ${y}px;
        width: ${size}px;
        height: ${size}px;
    `;
    
    button.style.position = 'relative';
    button.style.overflow = 'hidden';
    button.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

/**
 * Show API warning
 */
function showApiWarning() {
    const warning = document.createElement('div');
    warning.style.cssText = `
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #ff9800, #ffb74d);
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: bold;
        z-index: 3000;
        text-align: center;
        box-shadow: 0 4px 12px rgba(255, 152, 0, 0.3);
    `;
    warning.innerHTML = `
        ⚠️ Gemini API לא מוגדר<br>
        <small>המשחק יעבוד עם שאלות מקומיות</small>
    `;
    document.body.appendChild(warning);
    
    setTimeout(() => {
        warning.remove();
    }, 5000);
}

/**
 * Show API error
 */
function showApiError(errorType) {
    console.warn(`API Error: ${errorType}`);
    // Could show specific error messages based on error type
}

/**
 * Show help dialog
 */
function showHelp() {
    const helpText = `
    קיצורי מקלדת:
    
    📱 בתפריט הראשי:
    • 1 - שאלה
    • 2 - אתגר
    
    👤 בבחירת שחקן:
    • 1 - שחקן ראשון
    • 2 - שחקן שני
    • R - בחירה אקראית
    
    💬 במסך השאלה:
    • Enter - סיימנו
    • רווח - תור השני
    • Escape - חזרה לתפריט
    
    🔧 כללי:
    • Ctrl+R - התחל מחדש
    • Ctrl+H - עזרה זו
    `;
    
    alert(helpText);
}

/**
 * Debounce function for performance
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ===== CSS ANIMATIONS (Added via JS) =====

// Add ripple animation to document
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
    @keyframes ripple {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    .input-error {
        animation: fadeInUp 0.3s ease-out;
    }
    
    .focused {
        transform: scale(1.02);
        transition: transform 0.2s ease;
    }
    
    .progress-indicator {
        animation: fadeIn 0.5s ease-out;
    }
`;
document.head.appendChild(rippleStyle);

// ===== INITIALIZATION COMPLETE =====
console.log('🎯 App.js loaded successfully');

// Export essential functions for external access
window.resetGameData = resetGameData;
window.showHelp = showHelp;
