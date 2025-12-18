if (!location.search) {
  location.search = '?focus';
} else {
  document.getElementById('main-search-input').focus();
}

// ============================================
// NOTES FUNCTIONALITY
// ============================================

let notes = JSON.parse(localStorage.getItem('notes')) || [];

function renderNotes() {
  const list = document.getElementById('notes-list');
  list.innerHTML = '';

  notes.forEach((note, index) => {
    const li = document.createElement('li');
    li.classList.add('note-item');

    const tick = document.createElement('span');
    tick.textContent = '✓';
    tick.classList.add('tick');
    tick.setAttribute('title', 'Complete note');
    tick.onclick = () => completeNote(index);

    const text = document.createElement('span');
    text.textContent = note;
    text.classList.add('note-text');

    const trash = document.createElement('span');
    trash.textContent = '🗑';
    trash.classList.add('trash');
    trash.setAttribute('title', 'Delete note');
    trash.onclick = () => deleteNote(index);

    li.appendChild(tick);
    li.appendChild(text);
    li.appendChild(trash);
    list.appendChild(li);
  });
}

document.getElementById('add-note').addEventListener('click', (e) => {
  e.preventDefault(); // Prevent page refresh
  addNote();
});

document.getElementById('note-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addNote();
  }
});

function addNote() {
  const input = document.getElementById('note-input');
  const value = input.value.trim();

  if (value) {
    notes.push(value);
    localStorage.setItem('notes', JSON.stringify(notes));
    input.value = '';
    renderNotes();
  }
}

function completeNote(index) {
  const noteItems = document.querySelectorAll('.note-text');
  if (noteItems[index]) {
    noteItems[index].classList.add('strike');
    setTimeout(() => {
      notes.splice(index, 1);
      localStorage.setItem('notes', JSON.stringify(notes));
      renderNotes();
    }, 500);
  }
}

function deleteNote(index) {
  const noteItems = document.querySelectorAll('.note-item');
  if (noteItems[index]) {
    noteItems[index].style.transform = 'translateX(-100%)';
    noteItems[index].style.opacity = '0';
    setTimeout(() => {
      notes.splice(index, 1);
      localStorage.setItem('notes', JSON.stringify(notes));
      renderNotes();
    }, 300);
  }
}

renderNotes();

// ============================================
// TIME AND DATE DISPLAY
// ============================================

function updateTimeDate() {
  const now = new Date();

  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  document.getElementById('time').textContent = timeStr;

  const options = {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  };
  const dateStr = now.toLocaleDateString('en-US', options).replace(/(\d{1,2}),/, '$1');

  const offset = -now.getTimezoneOffset() / 60;
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const tz = `${sign}${absOffset.toString().padStart(2, '0')}:00`;

  document.getElementById('date').textContent = `${dateStr} (GMT${tz})`;
}

updateTimeDate();
setInterval(updateTimeDate, 1000);

// ============================================
// WEEKLY REMINDERS WITH SLIDE-IN PANEL
// ============================================

let reminders = JSON.parse(localStorage.getItem('reminders')) || [];
let pendingReminders = [];
let isPanelOpen = false;

const panel = document.getElementById('reminder-panel');
const addBtn = document.getElementById('add-reminder-btn');
const addToListBtn = document.getElementById('add-to-list');
const reminderTextInput = document.getElementById('reminder-text');
const reminderDaySelect = document.getElementById('reminder-day');
const pendingContainer = document.getElementById('pending-reminders');

// Render main reminders list - ONLY TODAY'S REMINDERS
function renderReminders() {
  const list = document.getElementById('reminders-list');
  const today = new Date().getDay();

  list.innerHTML = '';

  // Filter to show only today's reminders
  const todaysReminders = reminders.filter(r => parseInt(r.day) === today);

  if (todaysReminders.length === 0) {
    list.innerHTML = '<p style="color: rgba(255,255,255,0.5); text-align: center; padding: 2rem 0;">No reminders for today</p>';
    return;
  }

  todaysReminders.forEach((reminder) => {
    const index = reminders.indexOf(reminder);
    const li = document.createElement('li');
    li.classList.add('reminder-item');
    li.classList.add('today');

    const header = document.createElement('div');
    header.classList.add('reminder-header');

    const text = document.createElement('span');
    text.classList.add('reminder-text');
    text.textContent = reminder.text;

    const actions = document.createElement('div');
    actions.classList.add('reminder-actions');

    const del = document.createElement('span');
    del.classList.add('reminder-delete');
    del.textContent = '🗑';
    del.onclick = () => deleteReminder(index);

    actions.appendChild(del);
    header.appendChild(text);
    header.appendChild(actions);

    const dayText = document.createElement('div');
    dayText.classList.add('reminder-day');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    dayText.textContent = days[reminder.day];

    li.appendChild(header);
    li.appendChild(dayText);
    list.appendChild(li);
  });
}

// Render ALL reminders in panel (not just pending)
function renderAllRemindersInPanel() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  pendingContainer.innerHTML = '<h4 style="font-size: 0.9rem; margin-bottom: 0.75rem; color: rgba(255,255,255,0.7);">All Reminders:</h4>';

  if (reminders.length === 0 && pendingReminders.length === 0) {
    pendingContainer.innerHTML += '<p style="color: rgba(255,255,255,0.5); font-size: 0.85rem;">No reminders yet</p>';
    return;
  }

  // Show all existing reminders
  reminders.forEach((reminder, index) => {
    const div = document.createElement('div');
    div.classList.add('pending-item');

    const text = document.createElement('span');
    text.classList.add('pending-item-text');
    text.textContent = `${reminder.text} (${days[reminder.day]})`;

    const remove = document.createElement('span');
    remove.classList.add('pending-item-remove');
    remove.textContent = '🗑';
    remove.onclick = () => {
      deleteReminder(index);
      renderAllRemindersInPanel();
    };

    div.appendChild(text);
    div.appendChild(remove);
    pendingContainer.appendChild(div);
  });

  // Show pending reminders with different styling
  if (pendingReminders.length > 0) {
    const separator = document.createElement('h4');
    separator.style.cssText = 'font-size: 0.9rem; margin: 1rem 0 0.75rem 0; color: rgba(255,255,255,0.7);';
    separator.textContent = 'New (unsaved):';
    pendingContainer.appendChild(separator);

    pendingReminders.forEach((reminder, index) => {
      const div = document.createElement('div');
      div.classList.add('pending-item');
      div.style.background = 'rgba(255, 255, 255, 0.12)';

      const text = document.createElement('span');
      text.classList.add('pending-item-text');
      text.textContent = `${reminder.text} (${days[reminder.day]})`;

      const remove = document.createElement('span');
      remove.classList.add('pending-item-remove');
      remove.textContent = '✕';
      remove.onclick = () => {
        pendingReminders.splice(index, 1);
        renderAllRemindersInPanel();
      };

      div.appendChild(text);
      div.appendChild(remove);
      pendingContainer.appendChild(div);
    });
  }
}

// Toggle panel
addBtn.onclick = (e) => {
  e.preventDefault(); // Prevent page refresh
  
  if (!isPanelOpen) {
    // Open panel
    panel.classList.add('active');
    addBtn.classList.add('active');
    isPanelOpen = true;
    pendingReminders = [];
    renderAllRemindersInPanel();
    reminderTextInput.focus();
  } else {
    // Close and save
    if (pendingReminders.length > 0) {
      reminders = [...reminders, ...pendingReminders];
      localStorage.setItem('reminders', JSON.stringify(reminders));
      renderReminders(); // Refresh main page list
    }
    panel.classList.remove('active');
    addBtn.classList.remove('active');
    isPanelOpen = false;
    pendingReminders = [];
  }
};


// Close panel when clicking outside
document.addEventListener('click', (e) => {
    if (isPanelOpen) {
        // Check if click is outside both panel and button
        const clickedInsidePanel = panel.contains(e.target);
        const clickedButton = addBtn.contains(e.target);

        if (!clickedInsidePanel && !clickedButton) {
            // Close and save if there are pending reminders
            if (pendingReminders.length > 0) {
                reminders = [...reminders, ...pendingReminders];
                localStorage.setItem('reminders', JSON.stringify(reminders));
                renderReminders(); // Refresh main page list
            }
            panel.classList.remove('active');
            addBtn.classList.remove('active');
            isPanelOpen = false;
            pendingReminders = [];
        }
    }
});

// Add to pending list
addToListBtn.onclick = (e) => {
  e.preventDefault(); // Prevent page refresh
  
  const text = reminderTextInput.value.trim();
  const day = reminderDaySelect.value;

  if (!text) return;

  pendingReminders.push({ text, day });
  reminderTextInput.value = '';
  renderAllRemindersInPanel();
  reminderTextInput.focus();
};

// Enter key to add
reminderTextInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addToListBtn.click();
  }
});

// Delete reminder
function deleteReminder(index) {
  reminders.splice(index, 1);
  localStorage.setItem('reminders', JSON.stringify(reminders));
  renderReminders(); // Refresh main page list
}

// Initial render
renderReminders();