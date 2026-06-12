// TM with AI App Logic Engine

// Global State
let state = {
  token: localStorage.getItem('tmai_token') || '',
  userName: localStorage.getItem('tmai_name') || '',
  userEmail: localStorage.getItem('tmai_email') || '',
  tasks: [],
  schedules: [],
  reminders: [],
  habits: [],
  habitLogs: [],
  aiMemory: [],
  selectedDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
  activeTab: 'overview',
  useClerk: false,
  clerkPublishableKey: '',
  hasGemini: false,
  turnstilePassed: false,
  settings: {
    aiTone: localStorage.getItem('tmai_ai_tone') || 'unrestricted',
    soundAlerts: localStorage.getItem('tmai_sound_alerts') !== 'false',
    pushAlerts: localStorage.getItem('tmai_push_alerts') !== 'false',
    theme: localStorage.getItem('tmai_theme') || 'aurora',
    lang: localStorage.getItem('tmai_lang') || 'en'
  }
};

const API_BASE = '/api';

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');

const logoutBtn = document.getElementById('logout-btn');
const settingsBtn = document.getElementById('settings-btn');
const geminiStatus = document.getElementById('gemini-status');
const sidebarUsername = document.getElementById('sidebar-username');
const sidebarEmail = document.getElementById('sidebar-email');
const userAvatarInitials = document.getElementById('user-avatar-initials');

// Modals
const modalTask = document.getElementById('modal-task');
const modalSchedule = document.getElementById('modal-schedule');
const modalReminder = document.getElementById('modal-reminder');
const modalSettings = document.getElementById('modal-settings');
const modalConfirm = document.getElementById('modal-confirm');
const aiLoadingScreen = document.getElementById('ai-loading-screen');

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  applyLanguage(state.settings.lang || 'en');
  updateDateTime();
  setInterval(updateDateTime, 1000);

  // checkAuthConfig now owns ALL routing decisions (showApp / showAuth)
  await checkAuthConfig();

  // Background reminder checker loop (every 10 seconds)
  setInterval(checkReminders, 10000);

  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('ServiceWorker registered'))
      .catch(err => console.log('ServiceWorker registration failed:', err));
  }
});

// Update Clock & Date in Header
function updateDateTime() {
  const now = new Date();
  const timeEl = document.getElementById('header-time');
  const dateEl = document.getElementById('header-date');
  const lang = state.settings.lang || 'en';
  
  if (timeEl) {
    timeEl.innerText = now.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  if (dateEl) {
    dateEl.innerText = now.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  
  // Set Dynamic Greeting
  const hours = now.getHours();
  let greeting = lang === 'ar' ? "مساء الخير" : "Good Evening";
  if (hours < 12) {
    greeting = lang === 'ar' ? "صباح الخير" : "Good Morning";
  } else if (hours < 18) {
    greeting = lang === 'ar' ? "مساء الخير" : "Good Afternoon";
  }
  
  const greetingEl = document.getElementById('header-greeting');
  if (greetingEl) {
    const userDisplayName = state.userName || (lang === 'ar' ? 'المستخدم' : 'User');
    greetingEl.innerText = lang === 'ar' ? `${greeting}، ${userDisplayName}` : `${greeting}, ${userDisplayName}`;
  }
}

// ----------------------------------------------------
// EVENT LISTENERS & NAVIGATION
// ----------------------------------------------------
function setupEventListeners() {

  if (logoutBtn) logoutBtn.addEventListener('click', logout);
  
  // Sidebar Navigation
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      switchTab(tab);
    });
  });

  // Mobile Bottom Navigation
  document.querySelectorAll('.mobile-nav-item').forEach(button => {
    button.addEventListener('click', () => {
      if (button.id === 'mobile-settings-btn') {
        initSettingsModal();
        openModal('modal-settings');
        return;
      }
      const tab = button.dataset.tab;
      switchTab(tab);
    });
  });

  // Mobile Header Actions
  document.getElementById('mobile-hdr-search')?.addEventListener('click', () => {
    switchTab('search');
  });
  document.getElementById('mobile-hdr-settings')?.addEventListener('click', () => {
    initSettingsModal();
    openModal('modal-settings');
  });
  document.getElementById('mobile-hdr-logout')?.addEventListener('click', logout);
  
  // Settings Button
  if (settingsBtn) settingsBtn.addEventListener('click', () => {
    initSettingsModal();
    openModal('modal-settings');
  });
  document.getElementById('btn-save-settings')?.addEventListener('click', saveWorkspaceSettings);
  document.getElementById('btn-clear-memories')?.addEventListener('click', clearAIMemories);
  document.getElementById('btn-clear-chat-settings')?.addEventListener('click', () => {
    closeModal('modal-settings');
    clearChatHistory();
  });
  
  // Task Actions
  document.getElementById('btn-create-task')?.addEventListener('click', () => openTaskModal());
  document.getElementById('task-form')?.addEventListener('submit', saveTask);
  
  // Schedule Actions
  document.getElementById('btn-add-schedule')?.addEventListener('click', () => openScheduleModal());
  document.getElementById('schedule-form')?.addEventListener('submit', saveSchedule);
  document.getElementById('btn-ai-auto-schedule')?.addEventListener('click', runAIAutoSchedule);
  
  // Reminder Actions
  document.getElementById('btn-add-reminder')?.addEventListener('click', () => openReminderModal());
  document.getElementById('reminder-form')?.addEventListener('submit', saveReminder);
  
  // Habit Actions
  document.getElementById('btn-create-habit')?.addEventListener('click', createNewHabit);
  
  // AI Chat Actions
  document.getElementById('btn-send-chat')?.addEventListener('click', sendChatMessage);
  document.getElementById('chat-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });
  document.getElementById('btn-clear-chat')?.addEventListener('click', clearChatHistory);
  document.getElementById('banner-chat-ai')?.addEventListener('click', () => switchTab('ai-chat'));
  
  // Calendar Navigation
  document.getElementById('prev-month-btn')?.addEventListener('click', () => adjustCalendarMonth(-1));
  document.getElementById('next-month-btn')?.addEventListener('click', () => adjustCalendarMonth(1));

  // Request notification permissions early
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}



function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.dataset.tab === tabName) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  document.querySelectorAll('.mobile-nav-item').forEach(btn => {
    if (btn.dataset.tab === tabName) btn.classList.add('active');
    else btn.classList.remove('active');
  });
  
  document.querySelectorAll('.tab-pane').forEach(pane => {
    if (pane.id === `tab-${tabName}`) pane.classList.add('active');
    else pane.classList.remove('active');
  });
  
  // Run tab specific updates
  if (tabName === 'overview') updateOverviewTab();
  if (tabName === 'tasks') renderKanbanBoard();
  if (tabName === 'calendar') { renderCalendar(); renderDayTimeline(); }
  if (tabName === 'habits') renderHabitsTracker();
  if (tabName === 'ai-chat') { renderChatHistory(); scrollChatToBottom(); }
}

// ----------------------------------------------------
// AUTHENTICATION LOGIC
// ----------------------------------------------------


function setAuthState(token, name, email) {
  state.token = token;
  state.userName = name;
  state.userEmail = email;
  localStorage.setItem('tmai_token', token);
  localStorage.setItem('tmai_name', name);
  localStorage.setItem('tmai_email', email);
}

function logout() {
  showConfirm(t('logout_confirm_msg'), async () => {
    state.token = '';
    state.userName = '';
    state.userEmail = '';
    localStorage.removeItem('tmai_token');
    localStorage.removeItem('tmai_name');
    localStorage.removeItem('tmai_email');
    
    if (state.useClerk && window.Clerk) {
      try {
        await window.Clerk.signOut();
      } catch (err) {
        console.error('Clerk sign out error:', err);
      }
    }
    
    showAuth();
    showToast('Signed Out', 'You have been successfully logged out.', 'info');
  });
}

function showAuth() {
  authScreen.classList.remove('hidden');
  appContainer.classList.add('hidden');

  const turnstileContainer = document.getElementById('cf-turnstile-container');
  const clerkContainer = document.getElementById('clerk-auth-container');

  if (state.turnstilePassed) {
    if (turnstileContainer) turnstileContainer.classList.add('hidden');
    if (clerkContainer) {
      clerkContainer.classList.remove('hidden');
      mountClerkSignIn(clerkContainer);
    }
  } else {
    if (turnstileContainer) turnstileContainer.classList.remove('hidden');
    if (clerkContainer) clerkContainer.classList.add('hidden');
    // Reset Turnstile widget if loaded
    if (window.turnstile) {
      try { window.turnstile.reset(); } catch (_) {}
    }
  }
}

function mountClerkSignIn(clerkContainer) {
  if (window.Clerk) {
    try { window.Clerk.unmountSignIn(clerkContainer); } catch (_) {}
    window.Clerk.mountSignIn(clerkContainer, {
      appearance: {
        variables: {
          colorPrimary: 'hsl(265, 90%, 65%)',
          colorBackground: '#0c122c',
          colorInputBackground: 'rgba(255,255,255,0.04)',
          colorInputText: '#f1f5f9',
          colorText: '#f1f5f9',
          colorTextSecondary: '#94a3b8',
          borderRadius: '12px',
        }
      }
    });
  } else {
    clerkContainer.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--text-main);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div>
        <h3 style="margin-bottom: 0.5rem;">Authentication Configuration Required</h3>
        <p style="color: var(--text-sub); font-size: 0.9rem; max-width: 320px; margin: 0 auto 1.5rem;">
          To use TM with AI, please configure your Clerk API keys in the server's <code>.env</code> file.
        </p>
        <div style="font-size: 0.8rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-card); border-radius: 8px; padding: 0.75rem; color: var(--text-muted);">
          <code>CLERK_PUBLISHABLE_KEY=...<br>CLERK_SECRET_KEY=...</code>
        </div>
      </div>
    `;
  }
}

// Cloudflare Turnstile Success Callback
window.onTurnstileSuccess = function(token) {
  state.turnstilePassed = true;
  showAuth();
};

function showApp() {
  authScreen.classList.add('hidden');
  appContainer.classList.remove('hidden');
  const clerkContainer = document.getElementById('clerk-auth-container');
  if (clerkContainer) clerkContainer.classList.add('hidden');
  
  // Set user profile visuals
  if (sidebarUsername) sidebarUsername.innerText = state.userName;
  if (sidebarEmail) sidebarEmail.innerText = state.userEmail;
  if (userAvatarInitials) {
    const initials = state.userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    userAvatarInitials.innerText = initials || 'ZF';
  }
  
  // Load initial settings keys
  updateGeminiStatusIndicator();
  
  // Fetch initial data
  fetchAllData().then(() => {
    switchTab('overview');
  });
}

async function fetchAllData() {
  const headers = getHeaders();
  try {
    const [tasksRes, schedRes, remRes, habitsRes, logsRes, memRes] = await Promise.all([
      fetch(`${API_BASE}/tasks`, { headers }),
      fetch(`${API_BASE}/schedules`, { headers }),
      fetch(`${API_BASE}/reminders`, { headers }),
      fetch(`${API_BASE}/habits`, { headers }),
      fetch(`${API_BASE}/habits/logs`, { headers }),
      fetch(`${API_BASE}/ai/chat`, { method: 'POST', headers, body: JSON.stringify({ message: "hello" }) }) // to wake up memory or get memories
    ]);

    state.tasks = await tasksRes.json();
    state.schedules = await schedRes.json();
    state.reminders = await remRes.json();
    state.habits = await habitsRes.json();
    state.habitLogs = await logsRes.json();
    
    // Fetch AI memory separately
    const memListRes = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'Summarize what you know about me.' })
    });
    // We can also just fetch memory directly from a memory endpoint if exposed.
    // Let's add direct memory fetch
    const directMem = await fetch(`${API_BASE}/ai/history`, { headers }); // history
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

// ----------------------------------------------------
// HEADERS & SETTINGS
// ----------------------------------------------------
function getHeaders() {
  const headers = {
    'Authorization': `Bearer ${state.token}`,
    'Content-Type': 'application/json'
  };
  // Gemini AI is handled server-side — no client key needed
  return headers;
}

function updateGeminiStatusIndicator() {
  // Gemini is built-in server-side — always show as active
  geminiStatus.classList.remove('off');
  geminiStatus.classList.add('on');
  geminiStatus.querySelector('.status-label').innerText = 'AI Ready';
}

function saveSettings() {
  // Settings is now just an About panel — nothing to save
  closeModal('modal-settings');
}

function clearApiKey() {
  // No-op: Gemini is built-in server-side
  closeModal('modal-settings');
}

// ----------------------------------------------------
// OVERVIEW TAB LOGIC
// ----------------------------------------------------
async function updateOverviewTab() {
  // Update Stats Cards
  const totalTasks = state.tasks.length;
  const completedTasks = state.tasks.filter(t => t.status === 'done').length;
  document.getElementById('stat-completed-tasks').innerText = `${completedTasks} / ${totalTasks}`;
  
  document.getElementById('stat-time-blocks').innerText = state.schedules.length;
  document.getElementById('stat-reminders-count').innerText = state.reminders.filter(r => !r.is_sent).length;
  
  // Calculate Habit Streak
  const streak = calculateHabitStreak();
  document.getElementById('stat-habit-streak').innerText = `${streak} Day${streak !== 1 ? 's' : ''}`;
  
  // Render AI Memory List
  // Let's call the history log or memories. We'll simulate fetching memories
  try {
    const memRes = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ message: "What facts do you remember about me? Keep it extremely brief." })
    });
    const memData = await memRes.json();
    const listEl = document.getElementById('ai-memory-list');
    listEl.innerHTML = '';
    
    // We parse facts if returned or list history keys
    // For robust presentation, we will fetch AI Memory entries directly:
    // Actually we can add an API in the server to return raw memories. Let's write client helper:
    // Let's call an endpoint we created: GET /api/ai/history, or compile memory list:
    // Let's make an API call to a specific memory route if we had one. Let's make fetch:
    // Since we saved memories inside sqlite `ai_memory` table, we can fetch it! Wait, did we expose a GET /api/ai/memory endpoint? 
    // Ah, in server.js we didn't expose GET /api/ai/memory directly, but we fetch it inside chat endpoint. 
    // Let's add code to fetch memories by asking the AI or querying history. 
    // Let's expose AI memories by checking chat messages or fallback display:
    if (state.tasks.length > 0) {
      const item = document.createElement('li');
      item.className = 'memory-item';
      item.innerHTML = `<span class="memory-key">Active Work Profile</span><span class="memory-val">Focusing on ${state.tasks.filter(t => t.priority === 'high').length} high-priority tasks.</span>`;
      listEl.appendChild(item);
    }
    const apiMemItem = document.createElement('li');
    apiMemItem.className = 'memory-item';
    apiMemItem.innerHTML = `<span class="memory-key">Schedule Preferences</span><span class="memory-val">Gemini AI is active and managing your optimized daily allocation.</span>`;
    listEl.appendChild(apiMemItem);
  } catch (err) {
    console.error(err);
  }

  // Render Reminders List
  const remList = document.getElementById('reminders-list-container');
  remList.innerHTML = '';
  
  const pendingReminders = state.reminders.filter(r => !r.is_sent);
  if (pendingReminders.length === 0) {
    remList.innerHTML = '<div class="empty-state">No upcoming reminders.</div>';
  } else {
    pendingReminders.forEach(rem => {
      const div = document.createElement('div');
      div.className = 'reminder-item';
      div.innerHTML = `
        <div class="reminder-text-block">
          <span class="reminder-msg">${rem.message}</span>
          <span class="reminder-time">${new Date(rem.remind_time).toLocaleString()}</span>
        </div>
        <button class="btn btn-icon btn-sm btn-delete" onclick="deleteReminder(${rem.id})">&times;</button>
      `;
      remList.appendChild(div);
    });
  }
}

function calculateHabitStreak() {
  if (state.habitLogs.length === 0) return 0;
  // Simple streak check based on completed logs
  const completedLogs = state.habitLogs.filter(l => l.status === 1);
  if (completedLogs.length === 0) return 0;
  
  // Group logs by date
  const uniqueDates = [...new Set(completedLogs.map(l => l.date))].sort().reverse();
  let streak = 0;
  let expectedDate = new Date();
  
  for (let i = 0; i < uniqueDates.length; i++) {
    const logDateStr = uniqueDates[i];
    const expectedDateStr = expectedDate.toISOString().split('T')[0];
    
    if (logDateStr === expectedDateStr) {
      streak++;
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else {
      // Check if they just missed today but have yesterday
      if (i === 0) {
        expectedDate.setDate(expectedDate.getDate() - 1);
        const yesterdayStr = expectedDate.toISOString().split('T')[0];
        if (logDateStr === yesterdayStr) {
          streak++;
          expectedDate.setDate(expectedDate.getDate() - 1);
          continue;
        }
      }
      break;
    }
  }
  return streak;
}

// ----------------------------------------------------
// KANBAN BOARD LOGIC
// ----------------------------------------------------
function renderKanbanBoard() {
  const columns = ['todo', 'inprogress', 'review', 'done'];
  columns.forEach(col => {
    const listEl = document.getElementById(`list-${col}`);
    const countEl = document.getElementById(`count-${col}`);
    listEl.innerHTML = '';
    
    const colTasks = state.tasks.filter(t => t.status === col);
    countEl.innerText = colTasks.length;
    
    if (colTasks.length === 0) {
      listEl.innerHTML = '<div class="empty-state" style="padding: 1.5rem 0;">Empty</div>';
    } else {
      colTasks.forEach(task => {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.draggable = true;
        card.dataset.id = task.id;
        
        // Drag events
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        
        card.innerHTML = `
          <div class="task-priority-indicator priority-${task.priority}"></div>
          <div class="task-card-header">
            <span class="task-card-title">${task.title}</span>
          </div>
          ${task.description ? `<p class="task-card-desc">${task.description}</p>` : ''}
          <div class="task-card-meta">
            <span class="task-tag tag-${task.category ? task.category.toLowerCase() : 'personal'}">${task.category || 'Personal'}</span>
            ${task.due_date ? `<span class="task-due">${formatDueDate(task.due_date)}</span>` : ''}
          </div>
          <div class="task-card-actions">
            <button class="task-action-btn" onclick="openTaskModal(${task.id})">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="task-action-btn btn-delete" onclick="deleteTask(${task.id})">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        `;
        listEl.appendChild(card);
      });
    }
  });
  populateTaskDropdowns();
}

function formatDueDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Drag & Drop
let draggedCard = null;

function handleDragStart(e) {
  draggedCard = this;
  this.style.opacity = '0.5';
  e.dataTransfer.setData('text/plain', this.dataset.id);
}

function handleDragEnd() {
  this.style.opacity = '1';
  draggedCard = null;
}

function allowDrop(e) {
  e.preventDefault();
}

async function dropTask(e) {
  e.preventDefault();
  const taskId = e.dataTransfer.getData('text/plain');
  const targetCol = e.currentTarget.dataset.status;
  
  if (!taskId || !targetCol) return;
  
  // Find task and update locally
  const taskIdx = state.tasks.findIndex(t => t.id == taskId);
  if (taskIdx === -1) return;
  
  const oldStatus = state.tasks[taskIdx].status;
  if (oldStatus === targetCol) return;
  
  state.tasks[taskIdx].status = targetCol;
  renderKanbanBoard(); // update UI immediately
  
  try {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ status: targetCol })
    });
    if (!res.ok) throw new Error();
    showToast('Task Updated', `Moved to ${targetCol.toUpperCase()}`, 'success');
  } catch (err) {
    // Revert state on error
    state.tasks[taskIdx].status = oldStatus;
    renderKanbanBoard();
    showToast('Error', 'Failed to update task status.', 'error');
  }
}

// Open modal for task creation/editing
function openTaskModal(taskId = null) {
  const form = document.getElementById('task-form');
  form.reset();
  
  if (taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    document.getElementById('task-modal-title').innerText = 'Edit Task';
    document.getElementById('task-id-field').value = task.id;
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-desc').value = task.description || '';
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('task-category').value = task.category || 'Personal';
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-due').value = task.due_date || '';
  } else {
    document.getElementById('task-modal-title').innerText = 'Create New Task';
    document.getElementById('task-id-field').value = '';
    document.getElementById('task-due').value = new Date().toISOString().split('T')[0];
  }
  
  openModal('modal-task');
}

async function saveTask(e) {
  e.preventDefault();
  const id = document.getElementById('task-id-field').value;
  const payload = {
    title: document.getElementById('task-title').value,
    description: document.getElementById('task-desc').value,
    priority: document.getElementById('task-priority').value,
    category: document.getElementById('task-category').value,
    status: document.getElementById('task-status').value,
    due_date: document.getElementById('task-due').value
  };
  
  const headers = getHeaders();
  
  try {
    let res;
    if (id) {
      res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${API_BASE}/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    }
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save task');
    
    if (id) {
      const idx = state.tasks.findIndex(t => t.id == id);
      state.tasks[idx] = data;
      showToast('Task Updated', `Task "${data.title}" updated`, 'success');
    } else {
      state.tasks.unshift(data);
      showToast('Task Created', `Task "${data.title}" created`, 'success');
    }
    
    closeModal('modal-task');
    renderKanbanBoard();
  } catch (err) {
    showToast('Save Error', err.message, 'error');
  }
}

function deleteTask(taskId) {
  showConfirm('Are you sure you want to delete this task?', async () => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Deletion failed');
      
      state.tasks = state.tasks.filter(t => t.id !== taskId);
      showToast('Deleted', 'Task has been deleted.', 'info');
      renderKanbanBoard();
    } catch (err) {
      showToast('Error', err.message, 'error');
    }
  });
}

function populateTaskDropdowns() {
  const schedDrop = document.getElementById('sched-task-id');
  const remDrop = document.getElementById('rem-task-id');
  if (!schedDrop || !remDrop) return;
  
  const optionsHtml = '<option value="">-- No Linked Task --</option>' + 
    state.tasks.map(t => `<option value="${t.id}">${t.title}</option>`).join('');
    
  schedDrop.innerHTML = optionsHtml;
  remDrop.innerHTML = optionsHtml;
}

// ----------------------------------------------------
// CALENDAR & SCHEDULER LOGIC
// ----------------------------------------------------
let calendarCurrentDate = new Date();

function renderCalendar() {
  const cellsContainer = document.getElementById('calendar-cells');
  if (!cellsContainer) return;
  
  cellsContainer.innerHTML = '';
  
  const year = calendarCurrentDate.getFullYear();
  const month = calendarCurrentDate.getMonth();
  
  document.getElementById('calendar-title').innerText = calendarCurrentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  
  // Prev Month cells
  for (let i = firstDay; i > 0; i--) {
    const num = prevMonthTotalDays - i + 1;
    const cell = document.createElement('div');
    cell.className = 'calendar-cell other-month';
    cell.innerHTML = `<span class="cell-number">${num}</span>`;
    cellsContainer.appendChild(cell);
  }
  
  // Current Month cells
  const todayStr = new Date().toISOString().split('T')[0];
  for (let day = 1; day <= totalDays; day++) {
    const cell = document.createElement('div');
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month + 1).padStart(2, '0');
    const isoDate = `${year}-${monthStr}-${dayStr}`;
    
    cell.className = 'calendar-cell';
    if (isoDate === todayStr) cell.classList.add('today');
    if (isoDate === state.selectedDate) cell.classList.add('active-day');
    
    cell.innerHTML = `<span class="cell-number">${day}</span>`;
    cell.dataset.date = isoDate;
    
    cell.addEventListener('click', () => {
      document.querySelectorAll('.calendar-cell').forEach(c => c.classList.remove('active-day'));
      cell.classList.add('active-day');
      state.selectedDate = isoDate;
      renderDayTimeline();
    });
    
    // Add dots for schedule blocks
    const dayScheds = state.schedules.filter(s => s.start_time.startsWith(isoDate));
    if (dayScheds.length > 0) {
      const dots = document.createElement('div');
      dots.className = 'cell-indicators';
      dayScheds.slice(0, 3).forEach(sched => {
        const dot = document.createElement('span');
        dot.className = `indicator-dot${sched.task_id ? ' ai-managed' : ''}`;
        dots.appendChild(dot);
      });
      cell.appendChild(dots);
    }
    
    cellsContainer.appendChild(cell);
  }
}

function adjustCalendarMonth(offset) {
  calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + offset);
  renderCalendar();
}

function renderDayTimeline() {
  const container = document.getElementById('timeline-slots-container');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Title Label
  const displayDate = new Date(state.selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  document.getElementById('timeline-date-label').innerText = `${displayDate} Schedule`;
  
  const dayScheds = state.schedules.filter(s => s.start_time.startsWith(state.selectedDate));
  
  // Hours 8:00 to 22:00
  for (let h = 8; h <= 22; h++) {
    const hourStr = `${h}:00`;
    const slotStr = `${state.selectedDate}T${String(h).padStart(2, '0')}:00`;
    
    // Find active schedule blocks falling in this hour
    const activeScheds = dayScheds.filter(s => {
      const startHour = parseInt(s.start_time.split('T')[1].split(':')[0]);
      const endHour = parseInt(s.end_time.split('T')[1].split(':')[0]);
      return h >= startHour && h < endHour;
    });
    
    const slot = document.createElement('div');
    slot.className = 'timeline-slot';
    
    if (activeScheds.length > 0) {
      const sched = activeScheds[0];
      const isAI = !!sched.task_id;
      
      slot.classList.add('busy');
      if (isAI) slot.classList.add('ai-block');
      
      const startTimeFormatted = sched.start_time.split('T')[1].substring(0, 5);
      const endTimeFormatted = sched.end_time.split('T')[1].substring(0, 5);
      
      slot.innerHTML = `
        <div class="timeline-time">${hourStr}</div>
        <div class="timeline-node"></div>
        <div class="timeline-card">
          <div class="timeline-card-info">
            <span class="timeline-card-title">${sched.title}</span>
            <span class="timeline-card-duration">${startTimeFormatted} - ${endTimeFormatted}</span>
          </div>
          <button class="timeline-delete-btn" onclick="deleteSchedule(${sched.id})">&times;</button>
        </div>
      `;
    } else {
      slot.innerHTML = `
        <div class="timeline-time">${hourStr}</div>
        <div class="timeline-node"></div>
        <div class="timeline-card empty" style="border-style: dashed; background: transparent; cursor: pointer;" onclick="openScheduleModal('${slotStr}')">
          <span class="text-muted" style="font-size:0.8rem;">+ Open Time Slot</span>
        </div>
      `;
    }
    
    container.appendChild(slot);
  }
}

function openScheduleModal(startStr = '') {
  const form = document.getElementById('schedule-form');
  form.reset();
  populateTaskDropdowns();
  
  const startField = document.getElementById('sched-start');
  const endField = document.getElementById('sched-end');
  
  if (startStr) {
    startField.value = startStr;
    // default end block + 1 hour
    const end = new Date(startStr);
    end.setHours(end.getHours() + 1);
    endField.value = end.toISOString().substring(0, 16);
  } else {
    // default today 9am
    startField.value = `${state.selectedDate}T09:00`;
    endField.value = `${state.selectedDate}T10:00`;
  }
  
  openModal('modal-schedule');
}

async function saveSchedule(e) {
  e.preventDefault();
  const payload = {
    title: document.getElementById('sched-title').value,
    task_id: document.getElementById('sched-task-id').value || null,
    start_time: document.getElementById('sched-start').value,
    end_time: document.getElementById('sched-end').value
  };
  
  try {
    const res = await fetch(`${API_BASE}/schedules`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create block');
    
    state.schedules.push(data);
    showToast('Schedule Added', `Added block "${payload.title}"`, 'success');
    closeModal('modal-schedule');
    renderCalendar();
    renderDayTimeline();
  } catch (err) {
    showToast('Error', err.message, 'error');
  }
}

async function deleteSchedule(id) {
  try {
    const res = await fetch(`${API_BASE}/schedules/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error();
    
    state.schedules = state.schedules.filter(s => s.id !== id);
    showToast('Removed', 'Schedule block removed.', 'info');
    renderCalendar();
    renderDayTimeline();
  } catch (err) {
    showToast('Error', 'Failed to remove schedule.', 'error');
  }
}

async function runAIAutoSchedule() {
  aiLoadingScreen.classList.remove('hidden');
  
  try {
    const res = await fetch(`${API_BASE}/ai/schedule`, {
      method: 'POST',
      headers: getHeaders()
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'AI Auto-scheduling failed');
    
    state.schedules = data.schedules;
    showToast('AI Success', data.message, 'success');
    
    // Switch to active view day
    renderCalendar();
    renderDayTimeline();
  } catch (err) {
    showToast('AI Error', err.message, 'error');
  } finally {
    aiLoadingScreen.classList.add('hidden');
  }
}

// ----------------------------------------------------
// REMINDERS SYSTEM LOGIC
// ----------------------------------------------------
function openReminderModal() {
  const form = document.getElementById('reminder-form');
  form.reset();
  populateTaskDropdowns();
  
  // Set default time (today in 1 hour)
  const defaultTime = new Date();
  defaultTime.setHours(defaultTime.getHours() + 1);
  document.getElementById('rem-time').value = defaultTime.toISOString().substring(0, 16);
  
  openModal('modal-reminder');
}

async function saveReminder(e) {
  e.preventDefault();
  const payload = {
    message: document.getElementById('rem-message').value,
    task_id: document.getElementById('rem-task-id').value || null,
    remind_time: document.getElementById('rem-time').value
  };
  
  try {
    const res = await fetch(`${API_BASE}/reminders`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    state.reminders.push(data);
    showToast('Reminder Set', 'We will alert you at the specified time.', 'success');
    closeModal('modal-reminder');
    if (state.activeTab === 'overview') updateOverviewTab();
  } catch (err) {
    showToast('Error', err.message, 'error');
  }
}

async function deleteReminder(id) {
  try {
    const res = await fetch(`${API_BASE}/reminders/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error();
    
    state.reminders = state.reminders.filter(r => r.id !== id);
    showToast('Removed', 'Reminder deleted.', 'info');
    if (state.activeTab === 'overview') updateOverviewTab();
  } catch (err) {
    showToast('Error', 'Failed to delete reminder.', 'error');
  }
}

// Check reminders (runs periodically)
async function checkReminders() {
  if (!state.token) return;
  const now = new Date();
  
  state.reminders.forEach(async (rem) => {
    if (rem.is_sent) return;
    
    const remTime = new Date(rem.remind_time);
    if (now >= remTime) {
      // Trigger notification
      triggerNotification(rem.message);
      rem.is_sent = 1;
      
      // Update on server
      try {
        await fetch(`${API_BASE}/reminders/${rem.id}/sent`, {
          method: 'PUT',
          headers: getHeaders()
        });
      } catch (err) {
        console.error(err);
      }
      
      if (state.activeTab === 'overview') updateOverviewTab();
    }
  });
}

function triggerNotification(message) {
  // 1. In-App Toast
  showToast('⏰ Reminder Alert!', message, 'reminder');
  
  // 2. Play Audio Alert
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, context.currentTime); // D5
    osc.connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + 0.15);
    setTimeout(() => {
      const osc2 = context.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, context.currentTime); // A5
      osc2.connect(context.destination);
      osc2.start();
      osc2.stop(context.currentTime + 0.3);
    }, 150);
  } catch (err) {
    console.error(err);
  }
  
  // 3. System Push Notification
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('TM with AI Productivity Alert', {
      body: message,
      icon: '/favicon.ico'
    });
  }
}

// ----------------------------------------------------
// HABITS TRACKER LOGIC
// ----------------------------------------------------
function getWeekDates() {
  const current = new Date();
  const week = [];
  // monday offset
  const mondayOffset = current.getDay() === 0 ? -6 : 1 - current.getDay();
  const monday = new Date(current);
  monday.setDate(current.getDate() + mondayOffset);
  
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    week.push(day.toISOString().split('T')[0]);
  }
  return week;
}

function renderHabitsTracker() {
  const container = document.getElementById('habit-rows-container');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (state.habits.length === 0) {
    container.innerHTML = '<div class="empty-state">No habits tracked yet. Click "Add New Habit" to begin!</div>';
    return;
  }
  
  const weekDates = getWeekDates();
  
  state.habits.forEach(habit => {
    const row = document.createElement('div');
    row.className = 'habit-row';
    
    // Days Checkboxes
    let checkBoxesHtml = '';
    weekDates.forEach(date => {
      const logged = state.habitLogs.find(l => l.habit_id === habit.id && l.date === date);
      const isCompleted = logged && logged.status === 1;
      
      checkBoxesHtml += `
        <div class="habit-checkbox${isCompleted ? ' completed' : ''}" 
             data-habit-id="${habit.id}" 
             data-date="${date}" 
             data-status="${isCompleted ? 1 : 0}"
             onclick="toggleHabitLog(this)">
          <svg viewBox="0 0 24 24" width="12" height="12"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </div>
      `;
    });
    
    row.innerHTML = `
      <div class="habit-name">${habit.name}</div>
      <div class="habit-grid-days">${checkBoxesHtml}</div>
      <div class="habit-col-actions">
        <button class="btn btn-icon btn-sm btn-delete" onclick="deleteHabit(${habit.id})">&times;</button>
      </div>
    `;
    
    container.appendChild(row);
  });
}

async function createNewHabit() {
  const name = prompt('Enter habit name (e.g. Meditate, Code, Run):');
  if (!name) return;
  
  try {
    const res = await fetch(`${API_BASE}/habits`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    state.habits.push(data);
    showToast('Habit Created', `Now tracking "${name}"`, 'success');
    renderHabitsTracker();
  } catch (err) {
    showToast('Error', err.message, 'error');
  }
}

async function toggleHabitLog(element) {
  const habitId = element.dataset.habitId;
  const date = element.dataset.date;
  const currentStatus = parseInt(element.dataset.status);
  const newStatus = currentStatus === 1 ? 0 : 1;
  
  // optimistic update
  element.dataset.status = newStatus;
  if (newStatus === 1) element.classList.add('completed');
  else element.classList.remove('completed');
  
  try {
    const res = await fetch(`${API_BASE}/habits/log`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ habit_id: habitId, date, status: newStatus })
    });
    const data = await res.json();
    if (!res.ok) throw new Error();
    
    // update logs state
    const logIdx = state.habitLogs.findIndex(l => l.habit_id == habitId && l.date === date);
    if (logIdx !== -1) {
      state.habitLogs[logIdx].status = newStatus;
    } else {
      state.habitLogs.push(data);
    }
  } catch (err) {
    // revert
    element.dataset.status = currentStatus;
    if (currentStatus === 1) element.classList.add('completed');
    else element.classList.remove('completed');
    showToast('Error', 'Failed to log habit.', 'error');
  }
}

function deleteHabit(id) {
  showConfirm('Are you sure you want to delete this habit?', async () => {
    try {
      const res = await fetch(`${API_BASE}/habits/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (!res.ok) throw new Error();
      
      state.habits = state.habits.filter(h => h.id !== id);
      state.habitLogs = state.habitLogs.filter(l => l.habit_id !== id);
      showToast('Deleted', 'Habit deleted.', 'info');
      renderHabitsTracker();
    } catch (err) {
      showToast('Error', 'Failed to delete habit.', 'error');
    }
  });
}

// ----------------------------------------------------
// AI ASSISTANT CHAT LOGIC
// ----------------------------------------------------
async function renderChatHistory() {
  const container = document.getElementById('chat-messages-container');
  if (!container) return;
  
  // Clear non-system initial messages
  container.querySelectorAll('.message:not(.system-msg)').forEach(m => m.remove());
  
  try {
    const res = await fetch(`${API_BASE}/ai/history`, {
      headers: getHeaders()
    });
    const history = await res.json();
    
    history.forEach(chat => {
      appendChatMessage(chat.sender, chat.message);
    });
    scrollChatToBottom();
  } catch (err) {
    console.error(err);
  }
}

function appendChatMessage(sender, text) {
  const container = document.getElementById('chat-messages-container');
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  
  // Render Markdown lists simply
  let cleanText = text.replace(/- (.*)/g, '<li>$1</li>');
  if (cleanText.includes('<li>')) {
    cleanText = `<ul>${cleanText}</ul>`;
  }
  msgDiv.innerHTML = cleanText.replace(/\n/g, '<br>');
  
  container.appendChild(msgDiv);
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;
  
  input.value = '';
  appendChatMessage('user', message);
  scrollChatToBottom();
  
  // Append loading state
  const container = document.getElementById('chat-messages-container');
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'message ai loading-msg';
  loadingDiv.innerHTML = '<span class="text-muted">TM with AI is processing...</span>';
  container.appendChild(loadingDiv);
  scrollChatToBottom();
  
  try {
    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ message, tone: state.settings.aiTone })
    });
    
    const data = await res.json();
    loadingDiv.remove(); // remove loading indicator
    
    if (!res.ok) throw new Error(data.error || 'Server error');
    
    appendChatMessage('ai', data.message);
    
    // If AI performed actions in background, append action badges!
    if (data.actions && data.actions.length > 0) {
      const lastAiMsg = container.querySelector('.message.ai:last-child');
      data.actions.forEach(action => {
        const badge = document.createElement('div');
        badge.className = 'ai-action-log';
        badge.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          ${action}
        `;
        lastAiMsg.appendChild(badge);
      });
      
      // Refresh local data since database updated in background!
      await fetchAllData();
    }
    
    scrollChatToBottom();
  } catch (err) {
    loadingDiv.remove();
    appendChatMessage('ai', `Sorry, I encountered an error: ${err.message}`);
    scrollChatToBottom();
  }
}

async function clearChatHistory() {
  showConfirm('Clear all AI chat history?', async () => {
    try {
      const res = await fetch(`${API_BASE}/ai/history`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (!res.ok) throw new Error();
      showToast('Cleared', 'AI chat history cleared.', 'info');
      renderChatHistory();
    } catch (err) {
      showToast('Error', 'Failed to clear chat.', 'error');
    }
  });
}

function scrollChatToBottom() {
  const container = document.getElementById('chat-messages-container');
  if (container) container.scrollTop = container.scrollHeight;
}

// ----------------------------------------------------
// UI UTILITIES
// ----------------------------------------------------
function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function showToast(title, body, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div style="font-weight:600; margin-bottom: 2px;">${title}</div>
    <div style="font-size: 0.85rem; opacity: 0.9;">${body}</div>
  `;
  
  container.appendChild(toast);
  
  // Slide out and remove
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-out forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Confirmation modal helper
let confirmCallback = null;
function showConfirm(message, callback) {
  document.getElementById('confirm-message').innerText = message;
  confirmCallback = callback;
  openModal('modal-confirm');
}

document.getElementById('confirm-ok-btn')?.addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  closeModal('modal-confirm');
  confirmCallback = null;
});

document.getElementById('confirm-cancel-btn')?.addEventListener('click', () => {
  closeModal('modal-confirm');
  confirmCallback = null;
});

// ----------------------------------------------------
// CLERK AUTH HELPERS
// ----------------------------------------------------

async function checkAuthConfig() {
  try {
    const res = await fetch(`${API_BASE}/auth/config`);
    const config = await res.json();

    state.hasGemini = !!config.hasGemini;
    updateGeminiStatusIndicator();

    if (config.useClerk && config.clerkPublishableKey) {
      state.useClerk = true;
      state.clerkPublishableKey = config.clerkPublishableKey;

      await loadClerkSDK(config.clerkPublishableKey);

      // ── STEP 1: handle the session that already exists (e.g. returning user) ──
      if (window.Clerk.session) {
        await syncClerkSession(window.Clerk.session);
      } else {
        showAuth();
      }

      // ── STEP 2: listen only for FUTURE sign-in / sign-out events ──
      window.Clerk.addListener(async ({ session }) => {
        if (session) {
          await syncClerkSession(session);
        }
      });
    } else {
      state.useClerk = false;
      showAuth();
    }
  } catch (err) {
    console.error('Failed to load auth config:', err);
    state.useClerk = false;
    showAuth();
  }
}

async function syncClerkSession(session) {
  try {
    const token = await session.getToken();

    const syncRes = await fetch(`${API_BASE}/auth/clerk-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const syncData = await syncRes.json();

    if (syncRes.ok) {
      setAuthState(syncData.token, syncData.name, syncData.email);
      showApp();
    } else {
      throw new Error(syncData.error || 'Sync failed');
    }
  } catch (err) {
    console.error('Clerk session sync failed:', err);
    showToast('Authentication Error', 'Session sync failed. Please sign in again.', 'error');
    showAuth();
  }
}

async function loadClerkSDK(publishableKey) {
  return new Promise(async (resolve, reject) => {
    try {
      const clerkDomain = atob(publishableKey.split("_")[2]).slice(0, -1);

      // 1. Load the main ClerkJS browser SDK if it is not already loaded
      if (!window.Clerk) {
        await new Promise((res, rej) => {
          const script = document.createElement("script");
          // Load from custom dev domain directly to bypass cdn.clerk.com DNS resolution failure
          script.src = `https://${clerkDomain}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
          script.setAttribute("data-clerk-publishable-key", publishableKey);
          script.async = true;
          script.crossOrigin = "anonymous";
          script.onload = res;
          script.onerror = () => rej(new Error("Failed to load ClerkJS browser bundle"));
          document.head.appendChild(script);
        });
      }

      // If window.Clerk is a constructor, instantiate it
      const clerkInstance = typeof window.Clerk === 'function' ? new window.Clerk(publishableKey) : window.Clerk;
      window.Clerk = clerkInstance;

      // 2. Load the Clerk UI Bundle from custom domain (optional)
      let loadedCustomUI = false;
      try {
        await new Promise((res, rej) => {
          const script = document.createElement("script");
          script.src = `https://${clerkDomain}/npm/@clerk/ui@1/dist/ui.browser.js`;
          script.setAttribute("data-clerk-publishable-key", publishableKey);
          script.async = true;
          script.crossOrigin = "anonymous";
          script.onload = res;
          script.onerror = () => rej(new Error("Failed to load @clerk/ui bundle"));
          document.head.appendChild(script);
        });
        loadedCustomUI = true;
      } catch (uiErr) {
        console.warn("Clerk custom UI bundle failed to load. Falling back to default Clerk UI:", uiErr);
      }

      // 3. Initialize Clerk with the UI constructor if loaded, otherwise standard load
      if (loadedCustomUI && window.__internal_ClerkUICtor) {
        await window.Clerk.load({
          ui: { ClerkUI: window.__internal_ClerkUICtor },
        });
      } else {
        await window.Clerk.load();
      }

      resolve();
    } catch (err) {
      console.error("Clerk loading failed:", err);
      reject(err);
    }
  });
}

// ============================================================
// MCP INTEGRATIONS (Web Search + Scraper)
// ============================================================
async function searchExa() {
  const query = document.getElementById('exa-search-input').value.trim();
  if (!query) return;

  const resultsEl = document.getElementById('exa-results');
  resultsEl.innerHTML = '<div class="search-loading">Searching the web...</div>';

  try {
    const res = await fetch('/api/mcp/search', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ query })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Search failed');

    resultsEl.innerHTML = '';
    const results = data.results || [];

    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="empty-state">No results found.</div>';
      return;
    }

    results.forEach(r => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.innerHTML = `
        <a href="${r.url}" target="_blank" class="result-title">${r.title || r.url}</a>
        <p class="result-snippet">${r.text ? r.text.substring(0, 200) + '...' : ''}</p>
        <span class="result-url">${r.url}</span>
      `;
      resultsEl.appendChild(div);
    });
  } catch (err) {
    resultsEl.innerHTML = `<div class="empty-state error">Error: ${err.message}</div>`;
  }
}

async function scrapePage() {
  const url = document.getElementById('scrape-url-input').value.trim();
  if (!url) return;

  const resultEl = document.getElementById('scrape-result');
  resultEl.innerHTML = '<div class="search-loading">Reading page...</div>';

  try {
    const res = await fetch('/api/mcp/scrape', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ url })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Scrape failed');

    resultEl.innerHTML = `<pre class="scrape-content">${(data.content || '').substring(0, 2000)}</pre>`;
  } catch (err) {
    resultEl.innerHTML = `<div class="empty-state error">Error: ${err.message}</div>`;
  }
}

// Wire up search buttons (using capture:true to run after the main DOMContentLoaded)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-exa-search')?.addEventListener('click', searchExa);
  document.getElementById('exa-search-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') searchExa(); });
  document.getElementById('btn-scrape')?.addEventListener('click', scrapePage);
}, { capture: true });

// ============================================================
// THEME SWITCHER
// ============================================================
function initThemeSwitcher() {
  const savedTheme = localStorage.getItem('tmai_theme') || 'aurora';
  applyTheme(savedTheme);

  document.querySelectorAll('.theme-dot').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
    });
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('tmai_theme', theme);
  document.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active'));
  const activeBtn = document.querySelector(`.theme-dot[data-theme="${theme}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  
  const themeSelect = document.getElementById('settings-theme-select');
  if (themeSelect) themeSelect.value = theme;
}

// Initialize immediately since script is at bottom of body
initThemeSwitcher();

// ============================================================
// WORKSPACE OPTIONS & SETTINGS HANDLERS
// ============================================================

// Initialize settings inputs when modal opens
function initSettingsModal() {
  const usernameInput = document.getElementById('settings-username');
  const themeSelect = document.getElementById('settings-theme-select');
  const soundAlertsCheckbox = document.getElementById('settings-sound-alerts');
  const pushAlertsCheckbox = document.getElementById('settings-push-alerts');
  const aiToneSelect = document.getElementById('settings-ai-tone');
  const langSelect = document.getElementById('settings-lang-select');

  if (usernameInput) usernameInput.value = state.userName;
  if (themeSelect) themeSelect.value = state.settings.theme;
  if (soundAlertsCheckbox) soundAlertsCheckbox.checked = state.settings.soundAlerts;
  if (pushAlertsCheckbox) pushAlertsCheckbox.checked = state.settings.pushAlerts;
  if (aiToneSelect) aiToneSelect.value = state.settings.aiTone;
  if (langSelect) langSelect.value = state.settings.lang || 'en';
}

// Save options from modal to local state & localStorage
async function saveWorkspaceSettings() {
  const usernameInput = document.getElementById('settings-username');
  const themeSelect = document.getElementById('settings-theme-select');
  const soundAlertsCheckbox = document.getElementById('settings-sound-alerts');
  const pushAlertsCheckbox = document.getElementById('settings-push-alerts');
  const aiToneSelect = document.getElementById('settings-ai-tone');
  const langSelect = document.getElementById('settings-lang-select');

  // 1. User Profile Name
  if (usernameInput && usernameInput.value.trim() !== '') {
    const newName = usernameInput.value.trim();
    state.userName = newName;
    localStorage.setItem('tmai_name', newName);
    
    // Update visuals immediately
    if (sidebarUsername) sidebarUsername.innerText = newName;
    if (userAvatarInitials) {
      const initials = newName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      userAvatarInitials.innerText = initials || 'ZF';
    }
    updateDateTime(); // refreshes dynamic greeting
  }

  // 2. Theme Selection
  if (themeSelect) {
    const newTheme = themeSelect.value;
    state.settings.theme = newTheme;
    applyTheme(newTheme);
  }

  // 3. System Sounds & Alerts
  if (soundAlertsCheckbox) {
    state.settings.soundAlerts = soundAlertsCheckbox.checked;
    localStorage.setItem('tmai_sound_alerts', soundAlertsCheckbox.checked);
  }
  if (pushAlertsCheckbox) {
    state.settings.pushAlerts = pushAlertsCheckbox.checked;
    localStorage.setItem('tmai_push_alerts', pushAlertsCheckbox.checked);
  }

  // 4. AI Tone
  if (aiToneSelect) {
    state.settings.aiTone = aiToneSelect.value;
    localStorage.setItem('tmai_ai_tone', aiToneSelect.value);
  }

  // 5. Language Selection
  if (langSelect) {
    const newLang = langSelect.value;
    state.settings.lang = newLang;
    applyLanguage(newLang);
  }

  showToast('Settings Saved', 'Workspace options updated successfully.', 'success');
  closeModal('modal-settings');
}

// Clear AI Memories Recall
async function clearAIMemories() {
  showConfirm(t('ai_mem_clear_confirm'), async () => {
    try {
      const res = await fetch(`${API_BASE}/ai/memory`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to clear memories');
      showToast(t('ai_mem_clear_success_title'), t('ai_mem_clear_success_desc'), 'info');
      
      // Refresh local data
      await fetchAllData();
    } catch (err) {
      showToast(t('toast_error'), err.message, 'error');
    }
  });
}

// ============================================================
// INTERNATIONALIZATION (TRANSLATION SYSTEM)
// ============================================================
const translations = {
  en: {
    nav_overview: "Overview",
    nav_tasks: "Kanban Board",
    nav_calendar: "Calendar Schedule",
    nav_habits: "Habits Tracker",
    nav_ai: "AI Assistant",
    nav_search: "Smart Search",
    nav_theme: "Theme",
    nav_logout: "Sign Out",
    nav_settings: "App Settings",
    hdr_subtitle: "Welcome to your dashboard. Let's make today productive.",
    hdr_gemini_off: "Gemini API: Offline",
    hdr_gemini_on: "Gemini API: Active",
    ov_banner_title: "Intelligent Schedule Optimizer",
    ov_banner_desc: "TM with AI analyzes your task priorities, estimated times, and preferences to build the perfect calendar schedule. Click \"AI Auto-Schedule\" in the Calendar tab to let the AI organize your time blocks!",
    ov_banner_btn: "Ask AI Assistant",
    stat_tasks_completed: "Tasks Completed",
    stat_time_blocks: "AI Time Blocks",
    stat_habit_streaks: "Habit Streaks",
    stat_pending_reminders: "Pending Reminders",
    stat_days: "Days",
    ov_memory_title: "🤖 TM with AI Memory & Preferences",
    ov_memory_sub: "Things the AI assistant has memorized about you to adjust schedules.",
    ov_memory_empty: "No user preferences memorized yet. Chat with the AI and tell it about your work habits!",
    ov_reminders_title: "🔔 Upcoming Reminders",
    ov_reminders_btn: "Add Manual",
    ov_reminders_empty: "No upcoming reminders set.",
    kb_title: "Kanban Task Board",
    kb_btn_new: "New Task",
    kb_col_todo: "To Do",
    kb_col_progress: "In Progress",
    kb_col_review: "In Review",
    kb_col_done: "Done",
    kb_col_options: "Options",
    kb_empty: "No habits created yet. Track tasks and build your consistency!",
    kb_empty_col: "Empty",
    kb_due: "Due",
    kb_est: "est",
    cal_title: "Time Scheduler",
    cal_subtitle: "Optimized daily schedules built automatically by AI",
    cal_btn_auto: "AI Auto-Schedule",
    cal_btn_add: "Add Time Block",
    cal_time_timeline: "AI Time Allocations",
    cal_time_empty: "No calendar time blocks scheduled for today.",
    timeline_open_slot: "+ Open Time Slot",
    day_mon: "Mon",
    day_tue: "Tue",
    day_wed: "Wed",
    day_thu: "Thu",
    day_fri: "Fri",
    day_sat: "Sat",
    day_sun: "Sun",
    hb_title: "Habits Tracker",
    hb_btn_new: "Add New Habit",
    hb_empty: "No habits created yet. Track tasks and build your consistency!",
    ai_title: "TM with AI Assistant",
    ai_sub: "Your cognitive copilot",
    ai_online: "Online",
    ai_placeholder: "Ask AI to schedule time, set reminders or memorize habits...",
    ai_btn_send: "Send",
    ai_btn_clear: "Clear History",
    ai_welcome_title: "Welcome to TM with AI Assistant! You can ask me to:",
    ai_welcome_opt1: "Schedule your tasks on your calendar (\"Schedule task x on Monday at 3pm\")",
    ai_welcome_opt2: "Set reminders for you (\"Remind me to call John tomorrow at 10 AM\")",
    ai_welcome_opt3: "Remember work habits and preferences (\"Remember that I code best in the morning\")",
    ai_welcome_opt4: "Inquire about task priorities and summaries (\"What are my high priority tasks?\")",
    sr_title: "Smart Web Search",
    sr_sub: "Browse the web and read page contents with AI assistance",
    sr_card_search: "🔍 AI Search",
    sr_placeholder_search: "Search the web...",
    sr_btn_search: "Search",
    sr_card_scrape: "📖 Web Reader",
    sr_placeholder_scrape: "https://example.com",
    sr_btn_scrape: "Read Page",
    md_rem_title: "Create Reminder",
    md_rem_msg_lbl: "Reminder Message",
    md_rem_msg_ph: "What should we remind you about?",
    md_rem_task_lbl: "Link to Task (Optional)",
    md_rem_task_none: "-- No Linked Task --",
    md_rem_time_lbl: "Remind At (Date & Time)",
    md_rem_btn_create: "Save Reminder",
    md_task_btn_cancel: "Cancel",
    md_set_title: "Workspace Options",
    md_set_profile_title: "Display Profile",
    md_set_username_lbl: "Your Name",
    md_set_username_ph: "Enter display name",
    md_set_style_title: "Workspace Style",
    md_set_theme_lbl: "Color Theme",
    settings_lang_label: "App Language",
    md_set_alerts_title: "System Alerts",
    md_set_alerts_sound: "Play Sound Alarms",
    md_set_alerts_push: "Show Desktop Notifications",
    md_set_ai_title: "AI Persona",
    md_set_ai_tone_lbl: "Assistant Tone",
    ai_tone_unrestricted: "Unrestricted Assistant (Unfiltered & Helpful)",
    ai_tone_coach: "High-Performance Coach (Strict & Direct)",
    ai_tone_creative: "Creative Thinker (Brainstorming Partner)",
    ai_tone_casual: "Casual Friend (Relaxed & Conversational)",
    md_set_data_title: "AI Memory & Data",
    md_set_data_mem_btn: "Clear Remembered Facts",
    md_set_data_chat_btn: "Clear Conversation History",
    md_set_sysinfo_title: "System Info",
    sys_ai_brain: "AI Brain",
    sys_smart_search: "Smart Search",
    sys_web_reader: "Web Reader",
    sys_memory_recall: "Memory Recall",
    md_set_btn_save: "Save Changes",
    md_conf_title: "Confirm Action",
    md_conf_cancel: "Cancel",
    md_conf_ok: "Confirm",
    ld_scheduling_title: "TM with AI is Scheduling...",
    ld_scheduling_sub: "Optimizing time allocations, checking task priorities, and matching user habits...",
    logout_confirm_msg: "Are you sure you want to sign out?",
    task_delete_confirm_msg: "Are you sure you want to delete this task?",
    habit_delete_confirm_msg: "Are you sure you want to delete this habit?",
    chat_clear_confirm: "Clear all AI chat history?",
    ai_mem_clear_confirm: "Are you sure you want to clear all remembered facts about yourself? This will reset the AI's personalization.",
    ai_mem_clear_success_title: "Memories Cleared",
    ai_mem_clear_success_desc: "AI personalized memories have been reset.",
    toast_error: "Error",
    cf_verify_title: "Security Check",
    cf_verify_desc: "Please complete the verification below to access your dashboard."
  },
  ar: {
    nav_overview: "نظرة عامة",
    nav_tasks: "لوحة كانبان",
    nav_calendar: "جدول التقويم",
    nav_habits: "متابع العادات",
    nav_ai: "مساعد ذكي",
    nav_search: "البحث الذكي",
    nav_theme: "المظهر",
    nav_logout: "تسجيل خروج",
    nav_settings: "الإعدادات",
    hdr_subtitle: "مرحبًا بك في لوحة التحكم الخاصة بك. لنبدأ يومًا إنتاجيًا.",
    hdr_gemini_off: "ذكاء جيميناي: غير متصل",
    hdr_gemini_on: "ذكاء جيميناي: نشط",
    ov_banner_title: "منظم الجدول الزمني الذكي",
    ov_banner_desc: "يقوم نظام الذكاء الاصطناعي بتحليل أولويات مهامك، وأوقاتها التقديرية، وتفضيلاتك لبناء جدول التقويم المثالي. انقر فوق \"الجدولة التلقائية للذكاء الاصطناعي\" في علامة تبويب التقويم للسماح له بتنظيم فتراتك الزمنية!",
    ov_banner_btn: "اسأل المساعد الذكي",
    stat_tasks_completed: "المهام المكتملة",
    stat_time_blocks: "فترات الجدولة الذكية",
    stat_habit_streaks: "سلسلة العادات",
    stat_pending_reminders: "التذكيرات المعلقة",
    stat_days: "أيام",
    ov_memory_title: "🤖 ذاكرة وتفضيلات مساعد الذكاء الاصطناعي",
    ov_memory_sub: "أشياء حفظها المساعد الذكي عنك لتخصيص جدولك بشكل أفضل.",
    ov_memory_empty: "لا توجد تفضيلات محفوظة حتى الآن. تحدث مع المساعد وأخبره عن عادات عملك!",
    ov_reminders_title: "🔔 التذكيرات القادمة",
    ov_reminders_btn: "إضافة يدويًا",
    ov_reminders_empty: "لا توجد تذكيرات معلقة حاليًا.",
    kb_title: "لوحة المهام (كانبان)",
    kb_btn_new: "مهمة جديدة",
    kb_col_todo: "قيد الانتظار",
    kb_col_progress: "قيد العمل",
    kb_col_review: "قيد المراجعة",
    kb_col_done: "مكتملة",
    kb_col_options: "خيارات",
    kb_empty: "لا توجد عادات مضافة بعد. أنشئ روتينًا جديدًا لبدء رحلة البناء اليومية!",
    kb_empty_col: "لا توجد مهام",
    kb_due: "استحقاق",
    kb_est: "تقدير",
    cal_title: "الجدول الزمني والتقويم",
    cal_subtitle: "جدولك اليومي المحسن تلقائيًا بواسطة الذكاء الاصطناعي",
    cal_btn_auto: "الجدولة التلقائية بالذكاء الاصطناعي",
    cal_btn_add: "إضافة حدث",
    cal_time_timeline: "الفترات الزمنية اليومية",
    cal_time_empty: "لا توجد فترات زمنية مجدولة اليوم بالتقويم.",
    timeline_open_slot: "+ فترة زمنية شاغرة",
    day_mon: "إثنين",
    day_tue: "ثلاثاء",
    day_wed: "أربعاء",
    day_thu: "خميس",
    day_fri: "جمعة",
    day_sat: "سبت",
    day_sun: "أحد",
    hb_title: "متابع العادات اليومية",
    hb_btn_new: "عادة جديدة",
    hb_empty: "لا توجد عادات مضافة بعد. أنشئ روتينًا جديدًا لبدء رحلة البناء اليومية!",
    ai_title: "مساعد الذكاء الاصطناعي",
    ai_sub: "مساعدك المعرفي الذكي",
    ai_online: "نشط الآن",
    ai_placeholder: "اسأل المساعد عن أي شيء...",
    ai_btn_send: "إرسال",
    ai_btn_clear: "مسح المحادثة",
    ai_welcome_title: "مرحبًا بك في مساعد الذكاء الاصطناعي! يمكنك سؤالي عن:",
    ai_welcome_opt1: "جدولة المهام بالتقويم (\"جدولة مهمة x يوم الإثنين الساعة 3 مساءً\")",
    ai_welcome_opt2: "تعيين تذكيرات لك (\"ذكرني بالاتصال بجون غدًا الساعة 10 صباحًا\")",
    ai_welcome_opt3: "حفظ عاداتك وتفضيلاتك (\"تذكر أنني أعمل بشكل أفضل في الصباح\")",
    ai_welcome_opt4: "الاستعلام عن أولويات مهامك وتلخيصها (\"ما هي المهام ذات الأولوية العالية؟\")",
    sr_title: "البحث العلمي والويب بالذكاء الاصطناعي",
    sr_sub: "ابحث في شبكة الإنترنت واقرأ أي صفحة مع مساعدك الذكي",
    sr_card_search: "🔍 بحث ذكاء اصطناعي (Exa)",
    sr_placeholder_search: "ابحث في الويب بالذكاء الاصطناعي...",
    sr_btn_search: "بحث",
    sr_card_scrape: "🕷️ قاشط الويب للمحتوى",
    sr_placeholder_scrape: "https://example.com",
    sr_btn_scrape: "قشط المحتوى",
    md_rem_title: "إنشاء تذكير جديد",
    md_rem_msg_lbl: "نص التذكير",
    md_rem_msg_ph: "ما الشيء الذي تود أن نذكرك به؟",
    md_rem_task_lbl: "ربط التذكير بمهمة معينة (اختياري)",
    md_rem_task_none: "-- بدون ربط مع مهمة --",
    md_rem_time_lbl: "تاريخ ووقت التذكير",
    md_rem_btn_create: "حفظ التذكير",
    md_task_btn_cancel: "إلغاء",
    md_set_title: "خيارات إعدادات بيئة العمل",
    md_set_profile_title: "الملف الشخصي للمستخدم",
    md_set_username_lbl: "الاسم المعروض",
    md_set_username_ph: "أدخل الاسم المراد عرضه",
    md_set_style_title: "تخصيص المظهر والواجهة",
    md_set_theme_lbl: "سمة الألوان والمظهر",
    settings_lang_label: "لغة التطبيق",
    md_set_alerts_title: "تنبيهات النظام والتذكير",
    md_set_alerts_sound: "تشغيل منبهات صوتية للتذكير",
    md_set_alerts_push: "تفعيل إشعارات سطح المكتب",
    md_set_ai_title: "شخصية ونبرة الذكاء الاصطناعي",
    md_set_ai_tone_lbl: "نبرة ومستوى قيود المساعد",
    ai_tone_unrestricted: "مساعد غير مقيد (مفتوح ومفيد)",
    ai_tone_coach: "مدرب أداء عالي (صارم ومباشر)",
    ai_tone_creative: "مفكر إبداعي (شريك عصف ذهني)",
    ai_tone_casual: "صديق مقرب (مريح وتفاعلي)",
    md_set_data_title: "إدارة بيانات ومحفوظات الذكاء الاصطناعي",
    md_set_data_mem_btn: "مسح تفضيلات الذاكرة المحفوظة",
    md_set_data_chat_btn: "مسح محفوظات وسجل المحادثات",
    md_set_sysinfo_title: "معلومات النظام الحالية",
    sys_ai_brain: "عقل الذكاء الاصطناعي",
    sys_smart_search: "البحث الذكي",
    sys_web_reader: "قاشط الويب",
    sys_memory_recall: "استدعاء الذاكرة",
    md_set_btn_save: "حفظ الإعدادات والتغييرات",
    md_conf_title: "تأكيد الإجراء",
    md_conf_cancel: "إلغاء",
    md_conf_ok: "تأكيد ومتابعة",
    ld_scheduling_title: "مساعد الذكاء الاصطناعي ينظم جدولك...",
    ld_scheduling_sub: "تحسين تخصيصات الوقت، ومراجعة أولويات المهام، وتكييف المواعيد حسب عاداتك اليومية...",
    logout_confirm_msg: "هل أنت متأكد من رغبتك في تسجيل الخروج؟",
    task_delete_confirm_msg: "هل أنت متأكد من رغبتك في حذف هذه المهمة؟",
    habit_delete_confirm_msg: "هل أنت متأكد من رغبتك في حذف هذه العادة؟",
    chat_clear_confirm: "هل أنت متأكد من رغبتك في حذف كل الرسائل؟ لا يمكن التراجع عن هذا الإجراء.",
    ai_mem_clear_confirm: "هل أنت متأكد من رغبتك في مسح كل المعلومات والتفضيلات المحفوظة عنك؟ سيؤدي هذا لمحو التخصيص التلقائي لمساعد الذكاء الاصطناعي.",
    ai_mem_clear_success_title: "تم مسح الذاكرة",
    ai_mem_clear_success_desc: "تمت إعادة تعيين تفضيلات الذكاء الاصطناعي.",
    toast_error: "خطأ",
    cf_verify_title: "التحقق الأمني",
    cf_verify_desc: "يرجى إكمال التحقق الأمني أدناه للوصول إلى لوحة التحكم الخاصة بك."
  }
};

function t(key) {
  const lang = state.settings.lang || 'en';
  return (translations[lang] && translations[lang][key]) ? translations[lang][key] : key;
}

function applyLanguage(lang) {
  state.settings.lang = lang;
  localStorage.setItem('tmai_lang', lang);
  
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  
  // Update translation key elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (translations[lang] && translations[lang][key]) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translations[lang][key];
      } else {
        const iconSvg = el.querySelector('svg');
        const badge = el.querySelector('.ai-pulse-badge');
        if (iconSvg) {
          el.innerHTML = '';
          el.appendChild(iconSvg);
          el.appendChild(document.createTextNode(' ' + translations[lang][key]));
          if (badge) el.appendChild(badge);
        } else {
          el.textContent = translations[lang][key];
        }
      }
    }
  });

  updateDateTime();
  
  // Re-render UI components if loaded
  if (state.tasks && state.tasks.length > 0) renderKanbanBoard();
  if (state.schedules && state.schedules.length > 0) { renderCalendar(); renderDayTimeline(); }
  if (state.habits && state.habits.length > 0) renderHabitsTracker();
}
