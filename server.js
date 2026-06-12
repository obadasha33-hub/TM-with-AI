const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClerkClient, verifyToken } = require('@clerk/backend');

// Load environment variables
dotenv.config();

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tmai_super_secret_key_12345';

let clerkClient;
if (process.env.CLERK_SECRET_KEY) {
  clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
}

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.userId = user.userId;
    next();
  });
}

// ----------------------------------------------------
// AUTHENTICATION ENDPOINTS
// ----------------------------------------------------

// GET Auth Config
app.get('/api/auth/config', (req, res) => {
  res.json({
    useClerk: !!process.env.CLERK_SECRET_KEY,
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '',
    hasGemini: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '')
  });
});

// POST Clerk Auth Sync
app.post('/api/auth/clerk-sync', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Clerk token is required' });

    if (!process.env.CLERK_SECRET_KEY) {
      return res.status(500).json({ error: 'Clerk is not configured on the server' });
    }

    // Verify Clerk Token
    const decoded = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    });

    const clerkUserId = decoded.sub;
    
    // Fetch user details from Clerk
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const email = clerkUser.emailAddresses[0].emailAddress;
    const name = clerkUser.firstName ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim() : clerkUser.username || 'Clerk User';

    // Sync with local database
    let user = await db.getUserByEmail(email);
    let userId;
    if (!user) {
      const dummyPassword = Math.random().toString(36).substring(2, 15);
      const passwordHash = await bcrypt.hash(dummyPassword, 10);
      userId = await db.createUser(email, passwordHash, name);
    } else {
      userId = user.id;
    }

    // Generate local JWT
    const localToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token: localToken, name, email });
  } catch (error) {
    console.error('Clerk token sync failed:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// Sign Up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields (email, password, name) are required' });
    }

    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = await db.createUser(email, passwordHash, name);
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });

    res.status(214).json({ token, name, email }); // Using 201 Created or 200
  } catch (error) {
    console.error('Sign up error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Sign In
app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, name: user.name, email: user.email });
  } catch (error) {
    console.error('Sign in error:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
});

// Google OAuth Mock Sign In/Up
app.post('/api/auth/google', async (req, res) => {
  try {
    const { email, name, googleId } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'Google authentication details incomplete' });
    }

    let user = await db.getUserByEmail(email);
    if (!user) {
      // Create user with a dummy hashed password since they sign in via Google
      const dummyPassword = Math.random().toString(36).substring(2, 15);
      const passwordHash = await bcrypt.hash(dummyPassword, 10);
      const userId = await db.createUser(email, passwordHash, name);
      user = { id: userId, email, name };
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, name: user.name, email: user.email });
  } catch (error) {
    console.error('Google Auth error:', error);
    res.status(500).json({ error: 'Internal server error during Google Authentication' });
  }
});

// Get Current User Info
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------
// TASK ENDPOINTS
// ----------------------------------------------------
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const tasks = await db.getTasks(req.userId);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const task = await db.createTask(req.userId, req.body);
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const task = await db.updateTask(req.userId, req.params.id, req.body);
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const success = await db.deleteTask(req.userId, req.params.id);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// SCHEDULE ENDPOINTS
// ----------------------------------------------------
app.get('/api/schedules', authenticateToken, async (req, res) => {
  try {
    const schedules = await db.getSchedules(req.userId);
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/schedules', authenticateToken, async (req, res) => {
  try {
    const schedule = await db.createSchedule(req.userId, req.body);
    res.status(201).json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/schedules/:id', authenticateToken, async (req, res) => {
  try {
    const schedule = await db.updateSchedule(req.userId, req.params.id, req.body);
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/schedules/:id', authenticateToken, async (req, res) => {
  try {
    const success = await db.deleteSchedule(req.userId, req.params.id);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// REMINDER ENDPOINTS
// ----------------------------------------------------
app.get('/api/reminders', authenticateToken, async (req, res) => {
  try {
    const reminders = await db.getReminders(req.userId);
    res.json(reminders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reminders', authenticateToken, async (req, res) => {
  try {
    const reminder = await db.createReminder(req.userId, req.body);
    res.status(201).json(reminder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/reminders/:id/sent', authenticateToken, async (req, res) => {
  try {
    await db.markReminderSent(req.userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/reminders/:id', authenticateToken, async (req, res) => {
  try {
    await db.deleteReminder(req.userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// HABIT ENDPOINTS
// ----------------------------------------------------
app.get('/api/habits', authenticateToken, async (req, res) => {
  try {
    const habits = await db.getHabits(req.userId);
    res.json(habits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/habits', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const habit = await db.createHabit(req.userId, name);
    res.status(201).json(habit);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/habits/:id', authenticateToken, async (req, res) => {
  try {
    const success = await db.deleteHabit(req.userId, req.params.id);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/habits/logs', authenticateToken, async (req, res) => {
  try {
    const logs = await db.getHabitLogs(req.userId);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/habits/log', authenticateToken, async (req, res) => {
  try {
    const { habit_id, date, status } = req.body;
    if (!habit_id || !date || status === undefined) {
      return res.status(400).json({ error: 'Missing parameters' });
    }
    const log = await db.logHabit(habit_id, date, status);
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// AI AGENT ENDPOINTS
// ----------------------------------------------------

// Get chat history
app.get('/api/ai/history', authenticateToken, async (req, res) => {
  try {
    const history = await db.getChatHistory(req.userId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear chat history
app.delete('/api/ai/history', authenticateToken, async (req, res) => {
  try {
    await db.clearChatHistory(req.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear AI Memory
app.delete('/api/ai/memory', authenticateToken, async (req, res) => {
  try {
    await db.clearAIMemory(req.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Chat logic with agentic actions
app.post('/api/ai/chat', authenticateToken, async (req, res) => {
  try {
    const { message, tone } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    // Save user message in database
    await db.saveChatMessage(req.userId, 'user', message);

    // Fetch context
    const tasks = await db.getTasks(req.userId);
    const schedules = await db.getSchedules(req.userId);
    const habits = await db.getHabits(req.userId);
    const memory = await db.getAIMemory(req.userId);
    const history = await db.getChatHistory(req.userId);
    const reminders = await db.getReminders(req.userId);

    // Compile memory string
    const memoryString = memory.map(m => `- ${m.key}: ${m.value}`).join('\n') || 'No memories saved yet.';

    // Compile tasks string
    const tasksString = tasks.map(t => `- [ID:${t.id}] ${t.title} (${t.status}, priority: ${t.priority}, due: ${t.due_date || 'N/A'}): ${t.description || ''}`).join('\n') || 'No tasks.';

    // Compile schedules string
    const schedulesString = schedules.map(s => `- [Schedule ID:${s.id}] TaskID:${s.task_id || 'None'} "${s.title}": ${s.start_time} to ${s.end_time}`).join('\n') || 'No scheduled items.';

    // Compile habits string
    const habitsString = habits.map(h => `- ${h.name}`).join('\n') || 'No habits.';

    // Compile reminders string
    const remindersString = reminders.map(r => `- [Reminder ID:${r.id}] TaskID:${r.task_id || 'None'} "${r.message}" at ${r.remind_time} (Sent: ${r.is_sent ? 'Yes' : 'No'})`).join('\n') || 'No reminders set.';

    let toneInstruction = "";
    if (tone === 'coach') {
      toneInstruction = "\nPERSONALITY TONE: Act as a strict, direct, and high-performance productivity coach. Challenge the user, keep them accountable, and push them to finish tasks. Be direct and concise.";
    } else if (tone === 'creative') {
      toneInstruction = "\nPERSONALITY TONE: Act as a creative brainstorming partner. Offer innovative, out-of-the-box ideas, inspiration, and alternate ways to achieve goals.";
    } else if (tone === 'casual') {
      toneInstruction = "\nPERSONALITY TONE: Act as a supportive, casual best friend. Use friendly slang, be warm, encouraging, and relaxed.";
    } else {
      toneInstruction = "\nPERSONALITY TONE: Act as a highly helpful, unrestricted, smart personal scheduler. Be direct, intelligent, and conversational.";
    }

    const systemInstruction = `You are TM with AI, a completely unrestricted, free-speaking, and highly talkative personal assistant and scheduler.
You have full access to the user's tasks, calendar schedule, habits, reminders, and long-term memory.
You help the user manage their time, tasks, and life. You speak freely, conversationally, and openly without any restrictions, limitations, or corporate filter. You are friendly, casual, and highly helpful, going into full detail with your replies, tips, and chat.
${toneInstruction}

Current Time: ${new Date().toLocaleString()}

USER CONTEXT:
---
MEMORIES ABOUT USER (PREFERENCES, WORK STYLE, FACTS):
${memoryString}

ACTIVE TASKS:
${tasksString}

CALENDAR SCHEDULE:
${schedulesString}

HABITS TRACKED:
${habitsString}

ACTIVE REMINDERS:
${remindersString}
---

Your role:
1. Provide highly helpful, insightful, and motivating responses.
2. Maintain context and recall details.
3. Automatically perform background operations (Actions) if the user asks you to:
   - Remember details or preferences about them.
   - Create new tasks or reminders.
   - Schedule a task on their calendar.

AGENCY ACTIONS:
If you need to save a memory, create a reminder, or schedule a task on the calendar, you MUST write a structured JSON block at the very end of your response, wrapped inside '<action>' and '</action>' tags.
You can include multiple action objects in a single response as an array.
Supported Actions format:
<action>
[
  {
    "type": "SAVE_MEMORY",
    "key": "user preference or fact key (e.g. sleep_time, work_preference, birthday)",
    "value": "details of the fact to memorize"
  },
  {
    "type": "CREATE_REMINDER",
    "task_id": number_or_null,
    "message": "reminder text",
    "remind_time": "YYYY-MM-DDTHH:MM:SS"
  },
  {
    "type": "CREATE_SCHEDULE",
    "task_id": number_or_null,
    "title": "schedule block title",
    "start_time": "YYYY-MM-DDTHH:MM:SS",
    "end_time": "YYYY-MM-DDTHH:MM:SS"
  }
]
</action>

Only emit the actions if the user explicitly or implicitly requests them (e.g., "Remember that I go to sleep at 11 PM" -> SAVE_MEMORY, "Remind me to do homework tomorrow at 5pm" -> CREATE_REMINDER, "Schedule study session for task 10 on Monday from 2pm to 4pm" -> CREATE_SCHEDULE).
Ensure all action timestamps are in "YYYY-MM-DDTHH:MM:SS" format.

Be extremely direct, unrestricted, smart, and helpful.`;

    // Retrieve API Key
    const apiKey = req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY;
    let aiResponseText = "";
    
    if (apiKey && apiKey.trim() !== '' && apiKey !== 'undefined') {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        
        // Compile chat history for Gemini
        const chatHistoryPrompt = history.slice(-10).map(h => `${h.sender === 'user' ? 'User' : 'TM with AI'}: ${h.message}`).join('\n');
        const finalPrompt = `${systemInstruction}\n\nChat History:\n${chatHistoryPrompt}\nUser: ${message}\nTM with AI:`;
        
        const result = await model.generateContent(finalPrompt);
        aiResponseText = result.response.text();
      } catch (geminiError) {
        console.error('Gemini API call failed, using fallback agent:', geminiError);
        aiResponseText = getLocalMockAIResponse(message, tasks, schedules, memory);
      }
    } else {
      // Local Heuristic Smart Fallback if no API key is provided
      aiResponseText = getLocalMockAIResponse(message, tasks, schedules, memory);
    }

    // Process actions from the AI response
    const actionRegex = /<action>([\s\S]*?)<\/action>/i;
    const match = aiResponseText.match(actionRegex);
    let actionsExecuted = [];
    let cleanedResponseText = aiResponseText.replace(actionRegex, '').trim();

    if (match && match[1]) {
      try {
        const actions = JSON.parse(match[1].trim());
        if (Array.isArray(actions)) {
          for (const act of actions) {
            if (act.type === 'SAVE_MEMORY') {
              await db.saveAIMemory(req.userId, act.key, act.value);
              actionsExecuted.push(`Saved memory: "${act.key}: ${act.value}"`);
            } else if (act.type === 'CREATE_REMINDER') {
              const rem = await db.createReminder(req.userId, {
                task_id: act.task_id,
                message: act.message,
                remind_time: act.remind_time
              });
              actionsExecuted.push(`Created reminder: "${act.message}" at ${act.remind_time}`);
            } else if (act.type === 'CREATE_SCHEDULE') {
              const sched = await db.createSchedule(req.userId, {
                task_id: act.task_id,
                title: act.title,
                start_time: act.start_time,
                end_time: act.end_time
              });
              actionsExecuted.push(`Added schedule: "${act.title}" (${act.start_time} - ${act.end_time})`);
            }
          }
        }
      } catch (err) {
        console.error('Failed to parse AI action:', err, match[1]);
      }
    }

    // Save AI response in chat history
    await db.saveChatMessage(req.userId, 'ai', cleanedResponseText);

    res.json({
      message: cleanedResponseText,
      actions: actionsExecuted
    });
  } catch (error) {
    console.error('AI chat endpoint error:', error);
    // Instead of crashing, return a friendly fallback so the client always gets a valid reply
    try {
      await db.saveChatMessage(req.userId, 'ai', 'AI assistant is temporarily unavailable. Please try again later.');
    } catch (_) {}
    res.json({ message: 'AI assistant is temporarily unavailable. Please try again later.', actions: [] });
  }
});

// Auto-scheduling scheduler
app.post('/api/ai/schedule', authenticateToken, async (req, res) => {
  try {
    const tasks = await db.getTasks(req.userId);
    const schedules = await db.getSchedules(req.userId);
    const memory = await db.getAIMemory(req.userId);

    const activeTasks = tasks.filter(t => t.status !== 'done');
    if (activeTasks.length === 0) {
      return res.status(400).json({ error: 'No active tasks to schedule!' });
    }

    const memoryString = memory.map(m => `- ${m.key}: ${m.value}`).join('\n') || 'No preferences.';
    const tasksString = activeTasks.map(t => `- [ID:${t.id}] ${t.title} (priority: ${t.priority}, due: ${t.due_date || 'N/A'}): ${t.description || ''}`).join('\n');

    const prompt = `You are an AI Time Auto-Scheduler.
Create an optimized schedule of time blocks for the user's tasks starting from today: ${new Date().toDateString()} (Current Time: ${new Date().toLocaleTimeString()}).
Each schedule block must associate with a Task ID (from the list below) or be general productivity blocks.
Do not schedule tasks during standard sleeping hours (11:00 PM to 7:00 AM) unless user memory says otherwise.
Ensure time blocks do not overlap.
Try to schedule 1 to 2-hour slots per task. Prioritize High priority and tasks with closer due dates.

USER MEMORY & PREFERENCES:
${memoryString}

ACTIVE TASKS TO SCHEDULE:
${tasksString}

Return ONLY a valid JSON array of schedule objects, nothing else. No explanation, no Markdown formatting, no tripple backticks. Just raw JSON like this:
[
  {
    "task_id": 1,
    "title": "Work on Project Alpha",
    "start_time": "YYYY-MM-DDTHH:MM:SS",
    "end_time": "YYYY-MM-DDTHH:MM:SS"
  }
]
`;

    const apiKey = req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY;
    let schedulesJsonString = "";

    if (apiKey && apiKey.trim() !== '' && apiKey !== 'undefined') {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(prompt);
        schedulesJsonString = result.response.text();
      } catch (err) {
        console.error('Gemini Auto-Schedule failed, using local generator:', err);
        schedulesJsonString = generateLocalMockSchedules(activeTasks);
      }
    } else {
      schedulesJsonString = generateLocalMockSchedules(activeTasks);
    }

    // Clean JSON markdown tags if the model returned them
    schedulesJsonString = schedulesJsonString.replace(/```json/i, '').replace(/```/g, '').trim();

    let newSchedules = [];
    try {
      newSchedules = JSON.parse(schedulesJsonString);
    } catch (parseErr) {
      console.error('Failed to parse scheduled JSON, generating mock:', parseErr);
      newSchedules = JSON.parse(generateLocalMockSchedules(activeTasks));
    }

    // Clear old schedules for the user and replace them, or append.
    // In our design, let's clear existing schedules and replace with the new optimized plan.
    await db.clearSchedules(req.userId);
    
    const savedSchedules = [];
    for (const item of newSchedules) {
      const saved = await db.createSchedule(req.userId, {
        task_id: item.task_id,
        title: item.title,
        start_time: item.start_time,
        end_time: item.end_time
      });
      savedSchedules.push(saved);
    }

    res.json({
      message: "AI has successfully optimized your calendar and scheduled your time blocks!",
      schedules: savedSchedules
    });

  } catch (error) {
    console.error('AI Auto-schedule error:', error);
    res.status(500).json({ error: 'Internal server error in Auto-Scheduler' });
  }
});

// Helper: Local Mock AI Responder
function getLocalMockAIResponse(message, tasks, schedules, memory) {
  const msgLower = message.toLowerCase();
  let actionBlock = "";

  const activeTasks = tasks.filter(t => t.status !== 'done');
  const activeCount = activeTasks.length;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  // 1. Mock SAVE_MEMORY
  if (msgLower.includes('remember') || msgLower.includes('memorize')) {
    const match = message.match(/(?:remember that|remember|memorize)\s+(.*)/i);
    if (match && match[1]) {
      const fact = match[1];
      const key = fact.split(' ')[0] || 'preference';
      actionBlock = `\n<action>[\n  {\n    "type": "SAVE_MEMORY",\n    "key": "${key}_preference",\n    "value": "${fact}"\n  }\n]</action>`;
      return `I will remember that: "${fact}". I have saved this configuration detail to my long-term memory. I'll use it to adapt your auto-schedules!${actionBlock}`;
    }
  }

  // 2. Mock CREATE_REMINDER
  if (msgLower.includes('remind') || msgLower.includes('reminder')) {
    const match = message.match(/(?:remind me to|remind me|create reminder to)\s+(.*?)(?:\s+at\s+(.*)|\s+tomorrow|\s+soon|$)/i);
    if (match && match[1]) {
      const taskText = match[1];
      let remindTime = new Date();
      remindTime.setHours(remindTime.getHours() + 1); // default 1 hour later
      const isoTime = remindTime.toISOString().substring(0, 19);

      actionBlock = `\n<action>[\n  {\n    "type": "CREATE_REMINDER",\n    "task_id": null,\n    "message": "${taskText}",\n    "remind_time": "${isoTime}"\n  }\n]</action>`;
      return `Sure! I have set a reminder for you to "${taskText}" scheduled for ${remindTime.toLocaleTimeString()}. You will hear an audio alarm and get a browser notification when it fires!${actionBlock}`;
    }
  }

  // 3. Mock CREATE_SCHEDULE
  if (msgLower.includes('schedule') && activeCount > 0) {
    const firstTask = activeTasks[0];
    let startTime = new Date();
    startTime.setHours(startTime.getHours() + 1);
    let endTime = new Date();
    endTime.setHours(endTime.getHours() + 2);
    
    actionBlock = `\n<action>[\n  {\n    "type": "CREATE_SCHEDULE",\n    "task_id": ${firstTask.id},\n    "title": "Focus: ${firstTask.title}",\n    "start_time": "${startTime.toISOString().substring(0, 19)}",\n    "end_time": "${endTime.toISOString().substring(0, 19)}"\n  }\n]</action>`;
    return `I've analyzed your agenda and auto-scheduled a focus block on your calendar tomorrow for task **"${firstTask.title}"** (Priority: ${firstTask.priority.toUpperCase()}) from ${startTime.toLocaleTimeString().substring(0,5)} to ${endTime.toLocaleTimeString().substring(0,5)}.${actionBlock}`;
  }

  // 4. Greetings
  if (msgLower.includes('hello') || msgLower.includes('hi') || msgLower.includes('hey') || msgLower.includes('greetings')) {
    return `Hello! I am **TM with AI**, your dedicated productivity partner. 😊\n\nI can help you review your Kanban board, block out calendar focus times, set manual reminders, or remember details about your workflow preferences. Currently, you have **${activeCount}** active tasks to work on. What should we tackle today?`;
  }

  // 5. Help / Capabilities
  if (msgLower.includes('help') || msgLower.includes('what can you do') || msgLower.includes('features') || msgLower.includes('capabilities')) {
    return `I am built to maximize your productivity! Here are some things you can ask me to do:\n\n` +
      `- **📋 Review Tasks**: *"What are my tasks?"* or *"List high priority tasks."*\n` +
      `- **📅 Schedule Focus**: *"Schedule a block for my first task."*\n` +
      `- **⏰ Set Reminders**: *"Remind me to submit the progress report."*\n` +
      `- **🧠 Store Memories**: *"Remember that I do my best coding before 12 PM."*\n\n` +
      `Just type your instructions and I will translate them into database actions!`;
  }

  // 6. Task Listing & Stats
  if (msgLower.includes('task') || msgLower.includes('todo') || msgLower.includes('list') || msgLower.includes('board')) {
    if (activeCount === 0) {
      return `Excellent work! Your Kanban board is completely clear. You have completed all **${doneCount}** tasks. 🎉\n\nWould you like to add a new habit to track or write a preference to help me schedule your time later?`;
    }
    
    const taskListString = activeTasks.map((t, idx) => `${idx + 1}. **[ID: ${t.id}] ${t.title}** (Priority: *${t.priority}*, Category: *${t.category}*)`).slice(0, 5).join('\n');
    return `You have **${activeCount}** pending tasks in your board and have completed **${doneCount}** tasks so far. Here are your top active tasks:\n\n${taskListString}\n\nI highly suggest starting with your highest priority items. Let me know if you want me to schedule calendar focus time for any of these!`;
  }

  // 7. Productivity Tip (Motivation)
  if (msgLower.includes('tip') || msgLower.includes('motivate') || msgLower.includes('inspiration') || msgLower.includes('quote')) {
    const tips = [
      "**Pomodoro Technique**: Work for 25 minutes, then take a 5-minute break. After four pomodoros, take a longer 15-30 minute break. This keeps your mind fresh and avoids burnout!",
      "**Eisenhower Matrix**: Categorize tasks into Urgent & Important, Important but Not Urgent, Urgent but Not Important, and Neither. Focus first on what is Important!",
      "**Eat the Frog**: Do your most challenging and critical task first thing in the morning. Once that's done, the rest of the day will feel easy!",
      "**Time Blocking**: Allocate specific slots in your calendar for specific tasks instead of working from a general list. This creates commitment and reduces decision fatigue."
    ];
    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    return `Here is a productivity tip for you:\n\n${randomTip}\n\nWould you like me to block out some time on your calendar right now to implement this?`;
  }

  const defaults = [
    activeCount > 0 
      ? `I'm here to support you! I see you have **${activeCount}** tasks remaining. Let me know if you would like me to prioritize them or help organize your day.`
      : `I'm here to support you! Your task list is currently clear. Let me know if you'd like to create a new task or habit together.`,
    `Focus is key. Currently, your top task is **"${activeTasks[0]?.title || 'none'}"**. I recommend dedicating a 1-hour calendar slot to it. Should I schedule that block?`,
    `Time management is the key to progress! Feel free to ask me: *"What are my tasks?"*, *"Remind me to take a break in 30 minutes"*, or *"What can you do?"* to get started.`,
    `Hello! Just checking in on your productivity. You have checked off **${doneCount}** habits and tasks today. Keep up the momentum!`
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

// Helper: Local Mock Scheduler generator
function generateLocalMockSchedules(activeTasks) {
  const list = [];
  const startDay = new Date();
  
  activeTasks.forEach((task, index) => {
    // Schedule tasks sequentially, e.g. 1 hour blocks starting today at 9:00 AM + index hours
    const blockStart = new Date(startDay);
    blockStart.setHours(9 + index * 2, 0, 0); // 9am, 11am, 1pm, etc.
    
    const blockEnd = new Date(blockStart);
    blockEnd.setHours(blockStart.getHours() + 1); // 1 hour duration
    
    list.push({
      task_id: task.id,
      title: `Focus Block: ${task.title}`,
      start_time: blockStart.toISOString().substring(0, 19),
      end_time: blockEnd.toISOString().substring(0, 19)
    });
  });

  return JSON.stringify(list);
}

// ----------------------------------------------------
// MCP INTEGRATION ROUTES
// ----------------------------------------------------

// POST /api/mcp/search  — Exa AI Web Search
app.post('/api/mcp/search', authenticateToken, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const EXA_API_KEY = process.env.EXA_API_KEY;
    if (!EXA_API_KEY || EXA_API_KEY.includes('placeholder')) {
      return res.status(503).json({ error: 'Exa API key not configured. Set EXA_API_KEY in .env' });
    }

    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_API_KEY
      },
      body: JSON.stringify({ query, num_results: 5, use_autoprompt: true })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Exa API error:', data);
      return res.status(response.status).json({ error: data.error || 'Exa search failed' });
    }

    res.json({ results: data.results || [] });
  } catch (error) {
    console.error('MCP search error:', error);
    res.status(500).json({ error: 'Internal server error during web search' });
  }
});

// POST /api/mcp/scrape  — Firecrawl Web Scraper
app.post('/api/mcp/scrape', authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
    if (!FIRECRAWL_API_KEY || FIRECRAWL_API_KEY.includes('placeholder')) {
      return res.status(503).json({ error: 'Firecrawl API key not configured. Set FIRECRAWL_API_KEY in .env' });
    }

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`
      },
      body: JSON.stringify({ url, formats: ['markdown'] })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Firecrawl API error:', data);
      return res.status(response.status).json({ error: data.error || 'Firecrawl scrape failed' });
    }

    // Firecrawl returns data.data.markdown for v1
    const content = (data.data && data.data.markdown) || data.markdown || data.content || '';
    res.json({ content });
  } catch (error) {
    console.error('MCP scrape error:', error);
    res.status(500).json({ error: 'Internal server error during web scraping' });
  }
});

// GET /api/mcp/memories  — Mem0 Fetch Memories
app.get('/api/mcp/memories', authenticateToken, async (req, res) => {
  try {
    const MEM0_API_KEY = process.env.MEM0_API_KEY;
    if (!MEM0_API_KEY || MEM0_API_KEY.includes('placeholder')) {
      return res.status(503).json({ error: 'Mem0 API key not configured. Set MEM0_API_KEY in .env' });
    }

    const userId = req.userId;
    const response = await fetch(`https://api.mem0.ai/v1/memories/?user_id=${userId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${MEM0_API_KEY}`
      }
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Mem0 GET error:', data);
      return res.status(response.status).json({ error: data.error || data.detail || 'Mem0 fetch failed' });
    }

    res.json({ memories: data });
  } catch (error) {
    console.error('MCP memories GET error:', error);
    res.status(500).json({ error: 'Internal server error fetching memories' });
  }
});

// POST /api/mcp/memories  — Mem0 Store Memory
app.post('/api/mcp/memories', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    const MEM0_API_KEY = process.env.MEM0_API_KEY;
    if (!MEM0_API_KEY || MEM0_API_KEY.includes('placeholder')) {
      return res.status(503).json({ error: 'Mem0 API key not configured. Set MEM0_API_KEY in .env' });
    }

    const userId = String(req.userId);
    const response = await fetch('https://api.mem0.ai/v1/memories/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${MEM0_API_KEY}`
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content }],
        user_id: userId
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Mem0 POST error:', data);
      return res.status(response.status).json({ error: data.error || data.detail || 'Mem0 store failed' });
    }

    res.json({ success: true, result: data });
  } catch (error) {
    console.error('MCP memories POST error:', error);
    res.status(500).json({ error: 'Internal server error storing memory' });
  }
});

// ----------------------------------------------------
// SERVER LISTEN / EXPORT
// ----------------------------------------------------
module.exports = app;

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  db.initDb().then(() => {
    app.listen(PORT, () => {
      console.log(`TM with AI Server running on http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('Database startup failed:', err);
  });
} else {
  // In serverless environment, initialize DB immediately
  db.initDb().catch(err => {
    console.error('Database initialization failed:', err);
  });
}
