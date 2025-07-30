// ===== GEMINI API CONFIGURATION =====
const GEMINI_CONFIG = {
    apiKey: 'YOUR_GEMINI_API_KEY_HERE', // החלף עם המפתח שלך
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-pro',
    temperature: 0.9,
    maxTokens: 200,
    topP: 0.95,
    topK: 40
};

// ===== GAME STATE =====
let gameData = {
    player1: '',
    player2: '',
    relationship: '',
    goal: '',
    intimacy: '',
    currentType: '',
    currentPlayer: 0,
    usedPrompts: [],
    gameStarted: false,
    promptCache: new Map() // Cache for API responses
};

// ===== PROMPT TEMPLATES FOR GEMINI =====
const PROMPT_TEMPLATES = {
    system: `אתה מנוע יצירתי שמייצר שאלות ואתגרים לזוגות בעברית.
    החזר תמיד תשובה בעברית בלבד, ללא תרגום או הסבר.
    התשובה צריכה להיות קצרה ומדויקת - משפט או שניים בלבד.
    אל תוסיף הקדמות כמו "הנה שאלה" או "זה אתגר".`,
    
    question: {
        base: `צור שאלה מעניינת ומעמיקה לזוג {relationship_context}.
        השאלה מיועדת ל{target_player} ברמת פתיחות {intimacy_level}.
        מטרת הערב: {evening_goal}.
        
        הקפד על:
        - שאלה אישית ומעניינת
        - מתאימה לרמת הפתיחות
        - בעברית בלבד
        - ישירה וקצרה`,
        
        intimacyLevels: {
            'היכרות ראשונית': 'בסיסית ונעימה, מתאימה להכרות ראשונית',
            'פלפל בינוני': 'מעט יותר אישית, אבל עדיין נוחה',
            'נועזים ופתוחים': 'עמוקה ואישית, לזוגות שרוצים להעמיק'
        }
    },
    
    dare: {
        base: `צור אתגר או משימה מהנה לזוג {relationship_context}.
        האתגר מיועד ל{target_player} ברמת פתיחות {intimacy_level}.
        מטרת הערב: {evening_goal}.
        
        הקפד על:
        - משימה מהנה ומתאימה
        - לא מביכה או לא נוחה
        - ניתנת לביצוע במקום
        - בעברית בלבד
        - הוראה ברורה וקצרה`,
        
        intimacyLevels: {
            'היכרות ראשונית': 'פשוטה וחמודה, מתאימה לדייטים ראשונים',
            'פלפל בינוני': 'מעט יותר אינטימית, אבל עדיין נוחה',
            'נועזים ופתוחים': 'רומנטית ואינטימית יותר'
        }
    }
};

// ===== CONTEXT BUILDERS =====
const CONTEXT_BUILDERS = {
    relationship: {
        'דייטים ראשונים': 'שזה עוד בתחילת ההכרות',
        'כמה חודשים': 'שיש להם כבר קצת היסטוריה משותפת',
        'יותר מדי זמן': 'שמכירים זה את זה טוב ורוצים לרענן'
    },
    
    goal: {
        'לשבור את השגרה': 'השאלה צריכה להיות מפתיעה ויצירתית',
        'להעמיק קשר': 'השאלה צריכה לעזור להכיר זה את זה יותר לעומק',
        'להתחמם קצת': 'השאלה צריכה להיות רומנטית ומחממת',
        'רגש': 'השאלה צריכה להיות רגשית ומעוררת תחושות'
    }
};

// ===== FALLBACK QUESTIONS (אם Gemini לא זמין) =====
const FALLBACK_CONTENT = {
    question: {
        'היכרות ראשונית': [
            'מה הדבר הכי מעניין שקרה לך השבוע?',
            'איך נראה יום מושלם עבורך?',
            'מה התחביב שהכי מעניין אותך?',
            'איזה מקום בעולם הכי מעניין אותך לבקר?',
            'מה הדבר שהכי מצחיק אותך?'
        ],
        'פלפל בינוני': [
            'מה הדבר הכי רומנטי שמישהו עשה עבורך?',
            'איך אתה אוהב להראות חיבה?',
            'מה החלום הכי מוזר שזכרת?',
            'מה המחמאה הכי יפה שקיבלת?',
            'איזה רגע בחיים הכי גרם לך להרגיש בטוח?'
        ],
        'נועזים ופתוחים': [
            'מה הפחד הכי גדול שלך במערכות יחסים?',
            'איך אתה רוצה להרגיש אהוב?',
            'מה החלום הכי נועז שלך?',
            'איזה דבר על עצמך הכי קשה לך לקבל?',
            'מה הדבר שהכי חסר לך בחיים?'
        ]
    },
    
    dare: {
        'היכרות ראשונית': [
            'תן מחמאה כנה לבן/בת הזוג שלך',
            'חקה איך השני נראה כשהוא מרוכז',
            'ספר על הזיכרון הכי טוב מהשבוע',
            'עשו תמונה מצחיקה יחד',
            'שיר שיר שאתה אוהב'
        ],
        'פלפל בינוני': [
            'תן עיסוי קל לכתפיים',
            'תגיד מה הכי מעניין אותך בבן/בת הזוג',
            'שתף זיכרון מתוק מהילדות',
            'חבקו חיבוק של 30 שניות בדממה',
            'תתבוננו בעיניים זה של זה למשך דקה'
        ],
        'נועזים ופתוחים': [
            'שתף את החלום הכי גדול שלך',
            'תגיד מה הכי מושך אותך בבן/בת הזוג',
            'ספר על רגע שבו הרגשת הכי קרוב',
            'תאר איך אתה רואה את העתיד יחד',
            'שתף משהו שמעולם לא סיפרת לאיש'
        ]
    }
};

// ===== LOADING MESSAGES =====
const LOADING_MESSAGES = [
    'מכין שאלה מיוחדת עבורכם...',
    'חושב על משהו מעניין...',
    'יוצר אתגר מותאם אישית...',
    'מחפש את השאלה המושלמת...',
    'כמה שניות ותקבלו משהו מדהים...',
    'עובד על משהו מיוחד בשבילכם...'
];

// ===== ERROR MESSAGES =====
const ERROR_MESSAGES = {
    api_error: 'אופס! היתה בעיה בהכנת השאלה. בואו ננסה שוב!',
    network_error: 'בעיה בחיבור לאינטרנט. בואו ננסה שוב!',
    rate_limit: 'יותר מדי בקשות. חכו רגע ונסו שוב!',
    invalid_response: 'התשובה לא ברורה. בואו ננסה שוב!',
    general_error: 'משהו השתבש. בואו ננסה עם שאלה אחרת!'
};

// ===== UTILITY FUNCTIONS =====
function getRandomLoadingMessage() {
    return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
}

function getCacheKey(type, player, intimacy, relationship, goal) {
    return `${type}_${player}_${intimacy}_${relationship}_${goal}`;
}

function shouldUseCache(cacheKey) {
    const cached = gameData.promptCache.get(cacheKey);
    if (!cached) return false;
    
    const now = Date.now();
    const cacheAge = now - cached.timestamp;
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    return cacheAge < maxAge;
}

function addToCache(cacheKey, prompt) {
    gameData.promptCache.set(cacheKey, {
        prompt: prompt,
        timestamp: Date.now()
    });
    
    // Limit cache size to 50 entries
    if (gameData.promptCache.size > 50) {
        const firstKey = gameData.promptCache.keys().next().value;
        gameData.promptCache.delete(firstKey);
    }
}

// ===== PROMPT HISTORY MANAGEMENT =====
function addToHistory(prompt) {
    gameData.usedPrompts.push(prompt);
    
    // Keep only last 20 prompts to avoid repetition
    if (gameData.usedPrompts.length > 20) {
        gameData.usedPrompts = gameData.usedPrompts.slice(-20);
    }
}

function isPromptUsed(prompt) {
    return gameData.usedPrompts.includes(prompt);
}

// ===== VALIDATION FUNCTIONS =====
function validateApiKey() {
    return GEMINI_CONFIG.apiKey && GEMINI_CONFIG.apiKey !== 'YOUR_GEMINI_API_KEY_HERE';
}

function validateGameData() {
    return gameData.player1 && 
           gameData.player2 && 
           gameData.relationship && 
           gameData.goal && 
           gameData.intimacy;
}

// ===== EXPORT FOR GLOBAL ACCESS =====
window.gameData = gameData;
window.GEMINI_CONFIG = GEMINI_CONFIG;
window.PROMPT_TEMPLATES = PROMPT_TEMPLATES;
window.CONTEXT_BUILDERS = CONTEXT_BUILDERS;
window.FALLBACK_CONTENT = FALLBACK_CONTENT;
window.ERROR_MESSAGES = ERROR_MESSAGES;

// Export utility functions
window.getRandomLoadingMessage = getRandomLoadingMessage;
window.getCacheKey = getCacheKey;
window.shouldUseCache = shouldUseCache;
window.addToCache = addToCache;
window.addToHistory = addToHistory;
window.isPromptUsed = isPromptUsed;
window.validateApiKey = validateApiKey;
window.validateGameData = validateGameData;
