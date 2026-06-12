const path = require('path');

const usePostgres = !!process.env.DATABASE_URL;
let db;

async function initDb() {
  if (usePostgres) {
    const { Pool } = require('pg');
    db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });

    const client = await db.connect();
    console.log('Connected to Supabase PostgreSQL database successfully.');
    client.release();

    // Create Tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'todo',
        priority VARCHAR(50) DEFAULT 'medium',
        category VARCHAR(100),
        due_date VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        start_time VARCHAR(100) NOT NULL,
        end_time VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
        message VARCHAR(255) NOT NULL,
        remind_time VARCHAR(100) NOT NULL,
        is_sent INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS habit_logs (
        id SERIAL PRIMARY KEY,
        habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        date VARCHAR(100) NOT NULL,
        status INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT habit_date_unique UNIQUE(habit_id, date)
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ai_memory (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key VARCHAR(255) NOT NULL,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT user_key_unique UNIQUE(user_id, key)
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sender VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

  } else {
    const sqlite3 = require('sqlite3');
    const { open } = require('sqlite');
    const dbPath = path.join(__dirname, 'database.db');
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    await db.run('PRAGMA foreign_keys = ON');

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'todo',
        priority TEXT DEFAULT 'medium',
        category TEXT,
        due_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        task_id INTEGER,
        title TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        task_id INTEGER,
        message TEXT NOT NULL,
        remind_time TEXT NOT NULL,
        is_sent INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS habits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS habit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        habit_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        status INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(habit_id, date),
        FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS ai_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, key),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        sender TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }
  console.log('Database initialized successfully.');
}

// SQL translator for placeholders (? -> $1, $2, etc.)
function translateSql(sql) {
  if (!usePostgres) return sql;
  let idx = 1;
  return sql.replace(/\?/g, () => `$${idx++}`);
}

async function getOne(sql, params = []) {
  if (usePostgres) {
    const res = await db.query(translateSql(sql), params);
    return res.rows[0];
  } else {
    return await db.get(sql, params);
  }
}

async function getAll(sql, params = []) {
  if (usePostgres) {
    const res = await db.query(translateSql(sql), params);
    return res.rows;
  } else {
    return await db.all(sql, params);
  }
}

async function runCmd(sql, params = []) {
  if (usePostgres) {
    const res = await db.query(translateSql(sql), params);
    return { changes: res.rowCount };
  } else {
    const res = await db.run(sql, params);
    return { changes: res.changes };
  }
}

async function insert(sql, params = []) {
  if (usePostgres) {
    const pgSql = translateSql(sql) + ' RETURNING id';
    const res = await db.query(pgSql, params);
    return res.rows[0].id;
  } else {
    const res = await db.run(sql, params);
    return res.lastID;
  }
}

// User helper methods
async function getUserByEmail(email) {
  return await getOne('SELECT * FROM users WHERE email = ?', [email]);
}

async function getUserById(id) {
  return await getOne('SELECT id, email, name, created_at FROM users WHERE id = ?', [id]);
}

async function createUser(email, passwordHash, name) {
  return await insert(
    'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
    [email, passwordHash, name]
  );
}

// Task helper methods
async function getTasks(userId) {
  return await getAll('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC', [userId]);
}

async function getTaskById(taskId, userId) {
  return await getOne('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [taskId, userId]);
}

async function createTask(userId, { title, description, status, priority, category, due_date }) {
  const insertId = await insert(
    `INSERT INTO tasks (user_id, title, description, status, priority, category, due_date) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, title, description, status || 'todo', priority || 'medium', category, due_date]
  );
  return await getTaskById(insertId, userId);
}

async function updateTask(userId, taskId, { title, description, status, priority, category, due_date }) {
  await runCmd(
    `UPDATE tasks 
     SET title = COALESCE(?, title),
         description = COALESCE(?, description),
         status = COALESCE(?, status),
         priority = COALESCE(?, priority),
         category = COALESCE(?, category),
         due_date = COALESCE(?, due_date),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
    [title, description, status, priority, category, due_date, taskId, userId]
  );
  return await getTaskById(taskId, userId);
}

async function deleteTask(userId, taskId) {
  const result = await runCmd('DELETE FROM tasks WHERE id = ? AND user_id = ?', [taskId, userId]);
  return result.changes > 0;
}

// Schedule helper methods
async function getSchedules(userId) {
  return await getAll('SELECT * FROM schedules WHERE user_id = ? ORDER BY start_time ASC', [userId]);
}

async function createSchedule(userId, { task_id, title, start_time, end_time }) {
  const insertId = await insert(
    `INSERT INTO schedules (user_id, task_id, title, start_time, end_time)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, task_id || null, title, start_time, end_time]
  );
  return { id: insertId, user_id: userId, task_id, title, start_time, end_time };
}

async function updateSchedule(userId, scheduleId, { title, start_time, end_time }) {
  await runCmd(
    `UPDATE schedules
     SET title = COALESCE(?, title),
         start_time = COALESCE(?, start_time),
         end_time = COALESCE(?, end_time)
     WHERE id = ? AND user_id = ?`,
    [title, start_time, end_time, scheduleId, userId]
  );
  return await getOne('SELECT * FROM schedules WHERE id = ? AND user_id = ?', [scheduleId, userId]);
}

async function deleteSchedule(userId, scheduleId) {
  const result = await runCmd('DELETE FROM schedules WHERE id = ? AND user_id = ?', [scheduleId, userId]);
  return result.changes > 0;
}

async function clearSchedules(userId) {
  await runCmd('DELETE FROM schedules WHERE user_id = ?', [userId]);
}

// Reminder helper methods
async function getReminders(userId) {
  return await getAll('SELECT * FROM reminders WHERE user_id = ? ORDER BY remind_time ASC', [userId]);
}

async function createReminder(userId, { task_id, message, remind_time }) {
  const insertId = await insert(
    `INSERT INTO reminders (user_id, task_id, message, remind_time)
     VALUES (?, ?, ?, ?)`,
    [userId, task_id || null, message, remind_time]
  );
  return { id: insertId, user_id: userId, task_id, message, remind_time, is_sent: 0 };
}

async function markReminderSent(userId, reminderId) {
  await runCmd('UPDATE reminders SET is_sent = 1 WHERE id = ? AND user_id = ?', [reminderId, userId]);
}

async function deleteReminder(userId, reminderId) {
  await runCmd('DELETE FROM reminders WHERE id = ? AND user_id = ?', [reminderId, userId]);
}

// Habit helper methods
async function getHabits(userId) {
  return await getAll('SELECT * FROM habits WHERE user_id = ? ORDER BY created_at DESC', [userId]);
}

async function createHabit(userId, name) {
  const insertId = await insert('INSERT INTO habits (user_id, name) VALUES (?, ?)', [userId, name]);
  return { id: insertId, user_id: userId, name };
}

async function deleteHabit(userId, habitId) {
  const result = await runCmd('DELETE FROM habits WHERE id = ? AND user_id = ?', [habitId, userId]);
  return result.changes > 0;
}

async function getHabitLogs(userId) {
  return await getAll(
    `SELECT hl.* FROM habit_logs hl
     JOIN habits h ON hl.habit_id = h.id
     WHERE h.user_id = ?`,
    [userId]
  );
}

async function logHabit(habitId, date, status) {
  if (usePostgres) {
    await runCmd(
      `INSERT INTO habit_logs (habit_id, date, status)
       VALUES (?, ?, ?)
       ON CONFLICT (habit_id, date) DO UPDATE SET status = EXCLUDED.status`,
      [habitId, date, status]
    );
  } else {
    await runCmd(
      `INSERT OR REPLACE INTO habit_logs (habit_id, date, status)
       VALUES (?, ?, ?)`,
      [habitId, date, status]
    );
  }
  return { habit_id: habitId, date, status };
}

// AI Memory helper methods
async function getAIMemory(userId) {
  return await getAll('SELECT * FROM ai_memory WHERE user_id = ?', [userId]);
}

async function saveAIMemory(userId, key, value) {
  if (usePostgres) {
    await runCmd(
      `INSERT INTO ai_memory (user_id, key, value, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [userId, key, value]
    );
  } else {
    await runCmd(
      `INSERT OR REPLACE INTO ai_memory (user_id, key, value, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [userId, key, value]
    );
  }
}

// Chat history helper methods
async function getChatHistory(userId) {
  return await getAll('SELECT * FROM chat_history WHERE user_id = ? ORDER BY created_at ASC LIMIT 100', [userId]);
}

async function saveChatMessage(userId, sender, message) {
  const insertId = await insert(
    'INSERT INTO chat_history (user_id, sender, message) VALUES (?, ?, ?)',
    [userId, sender, message]
  );
  return { id: insertId, user_id: userId, sender, message, created_at: new Date().toISOString() };
}

async function clearChatHistory(userId) {
  await runCmd('DELETE FROM chat_history WHERE user_id = ?', [userId]);
}

async function clearAIMemory(userId) {
  await runCmd('DELETE FROM ai_memory WHERE user_id = ?', [userId]);
}

module.exports = {
  initDb,
  getUserByEmail,
  getUserById,
  createUser,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  clearSchedules,
  getReminders,
  createReminder,
  markReminderSent,
  deleteReminder,
  getHabits,
  createHabit,
  deleteHabit,
  getHabitLogs,
  logHabit,
  getAIMemory,
  saveAIMemory,
  getChatHistory,
  saveChatMessage,
  clearChatHistory,
  clearAIMemory
};
