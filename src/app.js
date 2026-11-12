import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.routes.js';
import habitRoutes from './routes/habit.routes.js';
import contactRoutes from './routes/contact.routes.js';
import { ApiResponse } from './utils/ApiResponse.js';
import { ApiError } from './utils/ApiError.js';
import connectDB from './db/connectDB.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

let dbConnectionPromise = null;

const getDbConnection = () => {
  if (!dbConnectionPromise) {
    dbConnectionPromise = connectDB().catch((err) => {
      console.error('MongoDB connection error:', err);
      dbConnectionPromise = null; // allow the next request to retry fresh
      throw err;
    });
  }
  return dbConnectionPromise;
};

app.use(express.json());
app.use(cors());
app.use(cookieParser());

app.use('/api/auth', async (req, res, next) => {
  try {
    await getDbConnection();
    next();
  } catch (err) {
    return res.status(503).json({
      statusCode: 503,
      message: `Database connection failed: ${err?.message || 'unknown error'}`,
      success: false,
    });
  }
});

// Auth routes
app.use('/api/auth', authRoutes);

app.use('/api/habits', async (req, res, next) => {
  try {
    await getDbConnection();
    next();
  } catch (err) {
    return res.status(503).json({
      statusCode: 503,
      message: `Database connection failed: ${err?.message || 'unknown error'}`,
      success: false,
    });
  }
});

// Habit routes
app.use('/api/habits', habitRoutes);

app.use('/api/contact', async (req, res, next) => {
  try {
    await getDbConnection();
    next();
  } catch (err) {
    return res.status(503).json({
      statusCode: 503,
      message: `Database connection failed: ${err?.message || 'unknown error'}`,
      success: false,
    });
  }
});

// Contact routes
app.use('/api/contact', contactRoutes);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Gemini helper — raw REST call, no SDK dependency. Retries the SAME model
// with exponential backoff on 503 (high demand) / 429 (rate limit) before
// giving up; any other status (400/401/403/404/etc.) fails immediately
// since no amount of waiting fixes those.
const askGemini = async (systemPrompt, userPrompt, modelName) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const backoffDelaysMs = [1000, 2000, 4000, 8000, 16000];

  for (let attempt = 0; attempt <= backoffDelaysMs.length; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
      })
    });

    if (response.ok) {
      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    }

    const errText = await response.text();
    console.error('Gemini API Error:', errText);
    // Throw an error with the status code attached so we know if we should fallback
    const error = new Error(`Gemini API failed with status ${response.status}: ${errText}`);
    error.status = response.status;

    const isRetryable = response.status === 503 || response.status === 429;
    if (!isRetryable || attempt === backoffDelaysMs.length) {
      throw error;
    }

    const delay = backoffDelaysMs[attempt] + Math.random() * 500;
    console.warn(`Model ${modelName} returned ${response.status}. Retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${backoffDelaysMs.length})...`);
    await sleep(delay);
  }
};

// Tries each model in order. askGemini already exhausts backoff retries on
// 503/429 for a single model, so by the time an error reaches here, only a
// 404 (model renamed/removed) is worth trying the next model for — anything
// else (400/401/403, or a 503/429 that survived all retries) throws
// immediately instead of instantly jumping models.
const generateWithFallback = async (systemPrompt, userPrompt) => {
  const models = ['gemini-3.8-flash', 'gemini-flash-latest'];

  let lastError = null;

  for (const model of models) {
    try {
      console.log(`Attempting generation with ${model}...`);
      return await askGemini(systemPrompt, userPrompt, model);
    } catch (err) {
      lastError = err;

      if (err.status === 404) {
        console.warn(`Model ${model} not found. Trying next fallback...`, err.message);
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error('All models failed');
};

// Chatbot routes
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, streakData } = req.body;

    if (!messages || messages.length === 0) {
      return res.status(400).json({ reply: 'No messages provided.' });
    }

    // Format the conversation history for Gemini
    // The frontend uses role: 'user' or 'ai', and field 'text'
    const conversationString = messages.slice(-6).map(m =>
      `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`
    ).join('\n');

    const systemPrompt = `You are the Streakies AI Coach. You help users build habits. Here is the user's current habit data: ${JSON.stringify(streakData || [])}. Answer their questions concisely, motivationally, and directly. Keep responses under 3 paragraphs. Do not use markdown formatting.`;

    const aiResponse = await generateWithFallback(systemPrompt, conversationString);

    res.json({ reply: aiResponse });
  } catch (err) {
    console.error('Chat API error:', err);
    res.status(500).json({ reply: "I'm having trouble thinking right now. Please try again in a moment!" });
  }
});

app.post('/api/coach', async (req, res) => {
  const { streaks } = req.body;

  if (!streaks || streaks.length === 0) {
    return res.json({ message: "Create your first habit to get personalized AI coaching!" });
  }

  const systemPrompt = "You are the Streakies AI Coach. Analyze the user's habit data and give a short, encouraging, 2-sentence summary of their progress. Be motivational but brief. Do not use markdown.";
  const userPrompt = `Here is my current habit data: ${JSON.stringify(streaks)}`;

  try {
    const aiResponse = await generateWithFallback(systemPrompt, userPrompt);
    res.json({ message: aiResponse });
  } catch (err) {
    // Fallback to static motivation if API fails
    const motivations = [
      "🔥 Every day is a new opportunity to build momentum. Keep that streak alive!",
      "💪 You're crushing it! Consistency is the secret to success."
    ];
    res.json({ message: motivations[Math.floor(Math.random() * motivations.length)] });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/verify-email', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/verify-email.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/reset-password.html'));
});

// Serve static files from public folder
app.use(express.static(path.join(__dirname, '../public')));

// Error handling middleware (must come before SPA fallback)
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors,
      success: false,
    });
  }

  return res.status(500).json({
    statusCode: 500,
    message: err.message || 'Internal Server Error',
    success: false,
  });
});

// SPA fallback - serve login.html for all unmatched routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

export default app;
