export default async function handler(req, res) {
  // הגדר CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // טיפול ב-OPTIONS request (preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // רק POST requests מותרים
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, gameContext } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // בדיקה שיש Gemini API Key
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: 'Gemini API Key not configured' 
      });
    }

    // בניית URL ל-Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    // הכנת הפרומפט המלא עם הקשר המשחק
    const fullPrompt = buildContextualPrompt(prompt, gameContext);
    
    // הכנת הבקשה ל-Gemini
    const requestBody = {
      contents: [{
        parts: [{
          text: fullPrompt
        }]
      }],
      generationConfig: {
        temperature: 0.9,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 200,
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

    // קריאה ל-Gemini API
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', errorText);
      
      // טיפול בשגיאות ספציפיות
      if (response.status === 429) {
        return res.status(429).json({ 
          error: 'rate_limit',
          message: 'יותר מדי בקשות. נסו שוב בעוד כמה שניות.'
        });
      } else if (response.status === 400) {
        return res.status(400).json({ 
          error: 'invalid_request',
          message: 'בקשה לא תקינה ל-API.'
        });
      } else if (response.status === 403) {
        return res.status(403).json({ 
          error: 'api_key_invalid',
          message: 'מפתח API לא תקין.'
        });
      } else {
        return res.status(500).json({ 
          error: 'api_error',
          message: 'שגיאה ב-Gemini API.'
        });
      }
    }

    const data = await response.json();
    
    // בדיקה שהתשובה תקינה
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('Invalid Gemini response:', data);
      return res.status(500).json({ 
        error: 'invalid_response',
        message: 'תשובה לא תקינה מה-API.'
      });
    }

    // חילוץ התוכן
    const generatedText = data.candidates[0].content.parts[0].text;
    const cleanedText = cleanAndValidateResponse(generatedText);
    
    if (!cleanedText) {
      return res.status(500).json({ 
        error: 'empty_response',
        message: 'התשובה ריקה או לא תקינה.'
      });
    }

    // החזרת התשובה
    res.status(200).json({ 
      response: cleanedText,
      metadata: {
        model: 'gemini-pro',
        timestamp: new Date().toISOString(),
        promptLength: fullPrompt.length,
        responseLength: cleanedText.length
      }
    });

  } catch (error) {
    console.error('Server Error:', error);
    
    // טיפול בשגיאות רשת
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        error: 'network_error',
        message: 'בעיה בחיבור לאינטרנט.'
      });
    }
    
    res.status(500).json({ 
      error: 'internal_error',
      message: 'שגיאה פנימית בשרת.'
    });
  }
}

/**
 * בניית פרומפט מלא עם הקשר המשחק
 */
function buildContextualPrompt(basePrompt, gameContext) {
  if (!gameContext) {
    return basePrompt;
  }

  const {
    player1,
    player2, 
    relationship,
    goal,
    intimacy,
    currentPlayer,
    promptType,
    usedPrompts
  } = gameContext;

  const playerName = currentPlayer === 1 ? player1 : player2;
  const otherPlayerName = currentPlayer === 1 ? player2 : player1;

  let contextualPrompt = `אתה מנוע יצירתי שמייצר ${promptType === 'question' ? 'שאלות' : 'אתגרים'} לזוגות בעברית.

פרטי הזוג:
- שם ראשון: ${player1}
- שם שני: ${player2}
- זמן יחד: ${relationship}
- מטרת הערב: ${goal}
- רמת פתיחות: ${intimacy}

${promptType === 'question' ? 
  `צור שאלה מעניינת ואישית עבור ${playerName} שתעזור ל${otherPlayerName} להכיר אותו/אותה טוב יותר.` :
  `צור אתגר או משימה מהנה ש${playerName} יכול לעשות עכשיו, במקום, ושיהיה מהנה לשניהם.`
}

הקפד על:
- תשובה בעברית בלבד
- מתאים לרמת הפתיחות שצוינה
- קצר ומדויק (1-2 משפטים)
- אל תוסיף הקדמות או הסברים
- ישיר ומעניין

${basePrompt}`;

  // הוספת רשימת שאלות שכבר נשאלו (למניעת חזרה)
  if (usedPrompts && usedPrompts.length > 0) {
    contextualPrompt += `\n\nאל תחזור על השאלות/אתגרים הבאים:\n${usedPrompts.slice(-5).join('\n')}`;
  }

  // הוספות ספציפיות לפי מטרת הערב
  if (goal === 'לשבור את השגרה') {
    contextualPrompt += '\n\nהיה יצירתי ומפתיע!';
  } else if (goal === 'להעמיק קשר') {
    contextualPrompt += '\n\nמטרת השאלה היא ליצור חיבור עמוק יותר.';
  } else if (goal === 'להתחמם קצת') {
    contextualPrompt += '\n\nהשאלה צריכה להיות רומנטית ומחממת.';
  } else if (goal === 'רגש') {
    contextualPrompt += '\n\nהשאלה צריכה לעורר רגשות ולהיות משמעותית.';
  }

  return contextualPrompt;
}

/**
 * ניקוי ואימות התשובה מGemini
 */
function cleanAndValidateResponse(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // ניקוי התשובה
  let cleaned = text.trim();
  
  // הסרת הקדמות נפוצות
  const prefixesToRemove = [
    'הנה שאלה:',
    'שאלה:',
    'אתגר:',
    'הנה אתגר:',
    'זה אתגר:',
    'זו שאלה:',
    'השאלה היא:',
    'האתגר הוא:'
  ];
  
  prefixesToRemove.forEach(prefix => {
    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.substring(prefix.length).trim();
    }
  });

  // הסרת מרכאות מיותרות
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // בדיקה שהתשובה לא קצרה מדי או ארוכה מדי
  if (cleaned.length < 10 || cleaned.length > 500) {
    return null;
  }

  // בדיקה שהתשובה בעברית (בדיקה פשוטה)
  const hebrewPattern = /[\u0590-\u05FF]/;
  if (!hebrewPattern.test(cleaned)) {
    return null;
  }

  return cleaned;
}
