// ===== ENHANCED API FUNCTIONS WITH PRIORITY =====

/**
 * Call local Gemini API endpoint with enhanced retry logic
 */
async function callLocalGeminiAPI(prompt, gameContext, retryCount = 0) {
    const maxRetries = 3;
    const retryDelay = 1000 * (retryCount + 1); // Increasing delay
    
    try {
        console.log(`🤖 Calling Gemini API (attempt ${retryCount + 1}/${maxRetries + 1})`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
        
        const response = await fetch('/api/claude', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: prompt,
                gameContext: gameContext
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await response.json();

        if (!response.ok) {
            console.warn(`⚠️ API Error ${response.status}:`, data.error);
            
            // Specific retry logic for different errors
            if (response.status === 429 && retryCount < maxRetries) {
                console.log(`⏳ Rate limited, retrying in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return callLocalGeminiAPI(prompt, gameContext, retryCount + 1);
            }
            
            if (response.status >= 500 && retryCount < maxRetries) {
                console.log(`🔄 Server error, retrying in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return callLocalGeminiAPI(prompt, gameContext, retryCount + 1);
            }
            
            // Throw specific error for proper handling
            throw new Error(data.error || 'api_error');
        }

        console.log('✅ API call successful');
        updateStatistics(gameContext.promptType, 'api');
        return data.response;

    } catch (error) {
        console.error(`❌ API call failed (attempt ${retryCount + 1}):`, error);
        
        // Handle network/timeout errors with retry
        if ((error.name === 'AbortError' || error.name === 'TypeError') && retryCount < maxRetries) {
            console.log(`🔄 Network error, retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return callLocalGeminiAPI(prompt, gameContext, retryCount + 1);
        }
        
        // After all retries failed, throw appropriate error
        if (error.name === 'AbortError') {
            throw new Error('timeout_error');
        } else if (error.name === 'TypeError') {
            throw new Error('network_error');
        }
        
        throw error;
    }
}

/**
 * Generate prompt using API with aggressive retry and fallback only as last resort
 */
async function generatePromptWithAPI(type, targetPlayer) {
    const cacheKey = getCacheKey(type, targetPlayer, gameData.intimacy, gameData.relationship, gameData.goal);
    
    // Check cache first
    if (shouldUseCache(cacheKey)) {
        const cached = gameData.promptCache.get(cacheKey);
        console.log('📦 Using cached prompt');
        return cached.prompt;
    }
    
    // Validate game data
    if (!validateGameData()) {
        throw new Error('Invalid game data');
    }
    
    // Build context for API call
    const gameContext = buildGameContext(targetPlayer, type);
    
    // Try multiple different prompts before giving up
    const promptVariations = [
        buildGeminiPrompt(type, targetPlayer),
        buildAlternativePrompt(type, targetPlayer, 1),
        buildAlternativePrompt(type, targetPlayer, 2)
    ];
    
    let lastError = null;
    
    for (let i = 0; i < promptVariations.length; i++) {
        try {
            console.log(`🎯 Trying prompt variation ${i + 1}/${promptVariations.length}`);
            
            const generatedContent = await callLocalGeminiAPI(promptVariations[i], gameContext);
            
            // Validate response quality
            if (!generatedContent || generatedContent.length < 10) {
                console.warn('⚠️ Generated content too short, trying next variation');
                continue;
            }
            
            // Check if we already used this prompt
            if (isPromptUsed(generatedContent)) {
                console.log('🔄 Prompt already used, trying next variation');
                continue;
            }
            
            // Success! Cache and return
            console.log('🎉 Successfully generated unique prompt via API');
            addToCache(cacheKey, generatedContent);
            addToHistory(generatedContent);
            return generatedContent;
            
        } catch (error) {
            console.warn(`❌ Prompt variation ${i + 1} failed:`, error.message);
            lastError = error;
            
            // If it's a rate limit, wait a bit longer before next attempt
            if (error.message === 'rate_limit') {
                console.log('⏳ Rate limited, waiting before next variation...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }
    
    // All API attempts failed - show error and ask user preference
    console.error('💥 All API attempts failed, last error:', lastError?.message);
    
    const shouldUseFallback = await askUserForFallback(lastError?.message);
    
    if (shouldUseFallback) {
        console.log('👤 User chose fallback - using local content');
        updateStatistics(type, 'fallback');
        return getFallbackPrompt(type, gameData.intimacy);
    } else {
        // User wants to retry API
        console.log('👤 User chose to retry API');
        throw lastError || new Error('api_error');
    }
}

/**
 * Build alternative prompts for better variety
 */
function buildAlternativePrompt(type, targetPlayer, variation) {
    const playerName = targetPlayer === 1 ? gameData.player1 : gameData.player2;
    const basePrompt = buildGeminiPrompt(type, targetPlayer);
    
    const variations = {
        1: {
            question: `${basePrompt} תן לי שאלה יצירתית ושונה לגמרי מהרגיל.`,
            dare: `${basePrompt} תן לי אתגר מקורי ומפתיע.`
        },
        2: {
            question: `${basePrompt} תן לי שאלה עמוקה שתפתיע את ${playerName}.`,
            dare: `${basePrompt} תן לי אתגר כיפי שיגרום לשניהם לצחוק.`
        }
    };
    
    return variations[variation][type] || basePrompt;
}

/**
 * Ask user whether to use fallback or retry API
 */
async function askUserForFallback(errorType) {
    return new Promise((resolve) => {
        const errorMessages = {
            'rate_limit': 'יותר מדי בקשות ל-API. האם תרצו לנסות עם שאלות מקומיות או לחכות ולנסות שוב?',
            'network_error': 'בעיה בחיבור לאינטרנט. האם תרצו לנסות עם שאלות מקומיות או לנסות שוב?',
            'api_error': 'שגיאה ב-API. האם תרצו לנסות עם שאלות מקומיות או לנסות שוב?',
            'default': 'לא הצלחנו ליצור שאלה דרך ה-API. האם תרצו לנסות עם שאלות מקומיות או לנסות שוב?'
        };
        
        const message = errorMessages[errorType] || errorMessages.default;
        
        // Create custom dialog
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 3000;
            direction: rtl;
        `;
        
        dialog.innerHTML = `
            <div style="
                background: white;
                padding: 30px;
                border-radius: 20px;
                max-width: 400px;
                text-align: center;
                box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            ">
                <h3 style="color: #e91e63; margin-bottom: 20px;">🤖 בעיה ב-API</h3>
                <p style="margin-bottom: 25px; line-height: 1.5;">${message}</p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="retry-api" style="
                        background: #e91e63;
                        color: white;
                        border: none;
                        padding: 12px 20px;
                        border-radius: 10px;
                        cursor: pointer;
                        font-weight: bold;
                    ">🔄 נסה שוב עם API</button>
                    <button id="use-fallback" style="
                        background: #666;
                        color: white;
                        border: none;
                        padding: 12px 20px;
                        border-radius: 10px;
                        cursor: pointer;
                        font-weight: bold;
                    ">📚 השתמש בשאלות מקומיות</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        document.getElementById('retry-api').onclick = () => {
            dialog.remove();
            resolve(false); // Don't use fallback, retry API
        };
        
        document.getElementById('use-fallback').onclick = () => {
            dialog.remove();
            resolve(true); // Use fallback
        };
    });
}

/**
 * Enhanced fallback with user notification
 */
function getFallbackPrompt(type, intimacyLevel) {
    console.log('📚 Using fallback content');
    
    // Show notification that we're using local content
    showFallbackNotification();
    
    const prompts = FALLBACK_CONTENT[type][intimacyLevel] || FALLBACK_CONTENT[type]['היכרות ראשונית'];
    const availablePrompts = prompts.filter(p => !isPromptUsed(p));
    
    let selectedPrompt;
    if (availablePrompts.length > 0) {
        selectedPrompt = availablePrompts[Math.floor(Math.random() * availablePrompts.length)];
    } else {
        // If all prompts used, reset history and pick randomly
        console.log('🔄 All local prompts used, resetting history');
        gameData.usedPrompts = [];
        selectedPrompt = prompts[Math.floor(Math.random() * prompts.length)];
    }
    
    addToHistory(selectedPrompt);
    return selectedPrompt;
}

/**
 * Show notification when using fallback
 */
function showFallbackNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #ff9800, #ffb74d);
        color: white;
        padding: 12px 20px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: bold;
        z-index: 2500;
        text-align: center;
        box-shadow: 0 4px 12px rgba(255, 152, 0, 0.3);
        animation: slideInDown 0.3s ease-out;
    `;
    notification.innerHTML = `
        📚 משתמש בשאלות מקומיות<br>
        <small>ה-API לא זמין כרגע</small>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideInUp 0.3s ease-in forwards reverse';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// ===== ENHANCED LOADING WITH API STATUS =====

/**
 * Generate and display prompt with enhanced API priority
 */
async function generateAndShowPrompt() {
    showScreen('prompt-screen');
    
    // Show loading state
    const loading = document.getElementById('loading');
    const content = document.getElementById('prompt-content');
    const loadingText = document.querySelector('.loading-text');
    
    loading.classList.add('active');
    content.style.display = 'none';
    
    // Update loading message to indicate API usage
    loadingText.textContent = '🤖 יוצר שאלה חכמה עם Gemini AI...';
    
    try {
        // Show API loading indicator
        updateLoadingProgress();
        
        const [prompt] = await Promise.all([
            generatePromptWithAPI(gameData.currentType, gameData.currentPlayer),
            new Promise(resolve => setTimeout(resolve, 1500)) // Minimum loading time
        ]);
        
        displayPrompt(prompt);
        
    } catch (error) {
        console.error('Error generating prompt:', error);
        
        // Show specific error message
        const errorMessage = ERROR_MESSAGES[error.message] || ERROR_MESSAGES.general_error;
        showError(errorMessage);
        
        // Ask user if they want to try again or use fallback
        setTimeout(async () => {
            try {
                const useAPI = await askUserForFallback(error.message);
                if (useAPI) {
                    // User wants to try API again
                    generateAndShowPrompt();
                } else {
                    // User chose fallback
                    const fallbackPrompt = getFallbackPrompt(gameData.currentType, gameData.intimacy);
                    displayPrompt(fallbackPrompt);
                }
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
                backToMenu();
            }
        }, 1000);
    }
}

/**
 * Update loading progress to show API activity
 */
function updateLoadingProgress() {
    const loadingText = document.querySelector('.loading-text');
    const messages = [
        '🤖 מתחבר ל-Gemini AI...',
        '🧠 מנתח את הפרופיל שלכם...',
        '✨ יוצר תוכן מותאם אישית...',
        '🎯 כמעט סיימתי...'
    ];
    
    let currentIndex = 0;
    const interval = setInterval(() => {
        if (currentIndex < messages.length) {
            loadingText.textContent = messages[currentIndex];
            currentIndex++;
        } else {
            clearInterval(interval);
        }
    }, 800);
    
    // Clear interval after 4 seconds
    setTimeout(() => clearInterval(interval), 4000);
}

// Replace the existing functions with enhanced versions
window.generatePromptWithAPI = generatePromptWithAPI;
window.generateAndShowPrompt = generateAndShowPrompt;
