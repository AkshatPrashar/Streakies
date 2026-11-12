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

function formatStreakAnalysis(streakData) {
  if (!streakData || streakData.length === 0) {
    return "📊 You haven't created any streaks yet! Start by adding a habit to track.";
  }
  let analysis = "📊 Your Streak Analysis\n\n";
  streakData.forEach(streak => {
    analysis += `✓ ${streak.name || 'Unnamed'}\n  Current: ${streak.currentStreak || 0} days | Best: ${streak.longestStreak || 0} days\n\n`;
  });
  return analysis;
}

function formatLackingHabits(streakData) {
  if (!streakData || streakData.length === 0) {
    return "🎯 No habits yet. Create your first habit to start tracking!";
  }
  const lacking = streakData.filter(s => (s.currentStreak || 0) < 3);
  if (lacking.length === 0) {
    return "🔥 Amazing! All your habits are going strong. Keep the momentum!";
  }
  let message = "⚠️ Habits That Need Attention\n\n";
  lacking.forEach(streak => {
    message += `• ${streak.name || 'Unnamed'} (${streak.currentStreak || 0} days)\n`;
  });
  message += "\n💪 Focus on these and get them back on track!";
  return message;
}

function formatStats(streakData) {
  if (!streakData || streakData.length === 0) {
    return "📈 No stats yet. Create a habit and start tracking!";
  }
  const totalStreaks = streakData.length;
  const activeStreaks = streakData.filter(s => (s.currentStreak || 0) > 0).length;
  const bestStreak = Math.max(...streakData.map(s => s.longestStreak || 0));
  const totalDays = streakData.reduce((sum, s) => sum + (s.currentStreak || 0), 0);
  return `📈 Your Habit Statistics\n\n` +
    `Total Habits: ${totalStreaks}\n` +
    `Active Streaks: ${activeStreaks}\n` +
    `Best Streak Ever: ${bestStreak} days\n` +
    `Total Active Days: ${totalDays}\n\n` +
    `Keep building momentum! 🚀`;
}

async function handleChatRequest(body) {
  const messages = body.messages || [];
  const streakData = body.streakData || [];
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  const userText = lastUserMessage?.text?.toLowerCase().trim() || '';

  const greetings = ['hi', 'hello', 'hey', 'start', 'help', 'menu', 'what can you do'];
  if (greetings.some(g => userText.includes(g))) {
    return {
      reply: `Hey there! 👋 I'm your Streak Coach. What would you like to know?\n\n📊 Streaks Analysis - See all your habits and their current streaks\n🎯 Where You Lack - Find habits that need attention\n📈 Your Stats - View detailed streak statistics\n🏆 Motivation - Get an inspiring message\n💡 Tips - Get habit-building tips`
    };
  }

  if (userText.includes('streaks') || userText.includes('analysis')) {
    return { reply: formatStreakAnalysis(streakData) };
  }

  if (userText.includes('lack') || userText.includes('attention')) {
    return { reply: formatLackingHabits(streakData) };
  }

  if (userText.includes('stats') || userText.includes('statistics')) {
    return { reply: formatStats(streakData) };
  }

  if (userText.includes('motivation') || userText.includes('inspiring')) {
    const motivations = [
      "🔥 Every day is a new opportunity to build momentum. Keep that streak alive!",
      "💪 You're crushing it! Consistency is the secret to success.",
      "⚡ Small steps lead to big wins. Keep going!",
      "🎯 Focus on today. That's all that matters.",
      "🏅 You've got this! Your future self will thank you."
    ];
    const motivation = motivations[Math.floor(Math.random() * motivations.length)];
    return { reply: motivation };
  }

  if (userText.includes('tip') || userText.includes('advice')) {
    const tips = [
      "💡 Start small: Don't try to change everything at once. Pick one habit and master it.",
      "📅 Track consistently: Record your progress daily. Visual progress is powerful!",
      "🔄 Make it automatic: Link your habit to an existing routine (habit stacking).",
      "📊 Celebrate wins: Every streak milestone deserves recognition!",
      "⏰ Pick a time: Do your habit at the same time daily for better results."
    ];
    const tip = tips[Math.floor(Math.random() * tips.length)];
    return { reply: tip };
  }

  return {
    reply: "I didn't quite understand that. Try asking about Streaks Analysis, Where You Lack, Your Stats, Motivation, or Tips!"
  };
}

// Chatbot routes
app.post('/api/chat', async (req, res) => {
  try {
    const reply = await handleChatRequest(req.body);
    res.json(reply);
  } catch (err) {
    console.error('Chat API error:', err);
    res.status(500).json({ reply: 'Something went wrong. Please try again!' });
  }
});

app.post('/api/coach', (req, res) => {
  const motivations = [
    "🔥 Every day is a new opportunity to build momentum. Keep that streak alive!",
    "💪 You're crushing it! Consistency is the secret to success.",
    "⚡ Small steps lead to big wins. Keep going!",
    "🎯 Focus on today. That's all that matters.",
    "🏅 You've got this! Your future self will thank you."
  ];
  const message = motivations[Math.floor(Math.random() * motivations.length)];
  res.json({ message });
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
