# TM with AI: Intelligent Task & Time Planner

TM with AI is a premium, single-page personal productivity hub combining a **Kanban Task Manager**, a **Calendar Scheduler**, a **Habits Tracker**, and an **Agentic AI Assistant** powered by the Gemini API. 

The application is built on a full-stack architecture using **Vanilla HTML/CSS/JS** on the client, and **Node.js, Express, and SQLite** on the server.

---

## 🚀 Key Features

*   **Sleek Glassmorphic Design**: Customized dark slate theme with radial glow effects, Outfit & Inter typography, and micro-animations.
*   **Kanban Board**: Drag-and-drop workflow across columns (*To Do*, *In Progress*, *In Review*, *Done*) with task priorities and category labels.
*   **Calendar Scheduler**: Month-view grid and daily timeline slots tracking task allocations.
*   **AI Auto-Scheduler**: A feature that lets TM with AI automatically organize your calendar based on your active tasks, priorities, and preferences.
*   **Interactive AI Assistant Panel**: Chat with TM with AI to set reminders, memorize user habits, and optimize your schedule. The AI can perform direct SQLite operations in the background.
*   **Habit Tracker**: Weekly habit grid tracking streaks and consistency.
*   **Desktop & Audio Reminders**: Periodic checks that sound beep alarms and launch system alerts for upcoming items.
*   **Security & Database Auth**: Multi-user authentication supporting email sign-up/sign-in (hashed using bcrypt) and mock Google OAuth.

---

## 🛠️ Stack & Technologies

1.  **Frontend**: Vanilla HTML5, Custom CSS3, Modern ES6 JavaScript.
2.  **Backend**: Node.js & Express framework.
3.  **Database**: SQLite (`sqlite3` and `sqlite` promise wrappers).
4.  **AI Engine**: Google `@google/generative-ai` SDK (Gemini 1.5 Flash).

---

## 📋 Database Schema

*   `users`: ID, email, hashed password, name.
*   `tasks`: ID, user_id, title, description, status, priority, category, due date.
*   `schedules`: ID, user_id, task_id, title, start_time, end_time.
*   `reminders`: ID, user_id, task_id, message, remind_time, is_sent.
*   `habits`: ID, user_id, name.
*   `habit_logs`: ID, habit_id, date, status (checked/unchecked).
*   `ai_memory`: ID, user_id, preference_key, value.
*   `chat_history`: ID, user_id, sender (user/ai), message content.

---

## ⚙️ Getting Started

### 1. Requirements
*   Node.js (v18.0.0 or higher recommended)
*   npm

### 2. Startup
Navigate to the project folder and start the server:
```bash
npm start
```
By default, the server runs on **`http://localhost:3000`**.

### 3. Setting Up Your Gemini API Key
To unlock real AI features (auto-scheduling, chat memory, database integration):
1.  Open the web interface at `http://localhost:3000`.
2.  Register and sign in.
3.  Click **AI Key Setup** in the bottom-left corner of the sidebar.
4.  Paste your Gemini API key and click **Save Key**. The key is stored locally in your browser's secure cache (`localStorage`) and will be used on all requests.

Alternatively, you can edit the `.env` file and insert your API key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```
*(If no API key is provided, the application runs on a smart local heuristic parser so you can still preview the chat, scheduling, and memory functionalities.)*
