// ===== AUTHENTICATION MODULE =====
const Auth = (() => {
    const ACCESS_TOKEN_KEY = 'streakies_access_token';
    const REFRESH_TOKEN_KEY = 'streakies_refresh_token';
    const EMAIL_KEY = 'streakies_email';

    const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY);
    const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY);
    const getEmail = () => localStorage.getItem(EMAIL_KEY);

    const decodeJwtPayload = (token) => {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
            return JSON.parse(atob(padded));
        } catch (e) {
            return null;
        }
    };

    const getUsername = () => {
        const token = getAccessToken();
        if (!token) return null;
        const payload = decodeJwtPayload(token);
        return (payload && payload.username) || null;
    };

    const isLoggedIn = () => {
        const token = getAccessToken();
        if (!token) return false;
        const payload = decodeJwtPayload(token);
        if (!payload || !payload.exp) return false;
        return payload.exp * 1000 > Date.now();
    };

    const setTokens = (accessToken, refreshToken, email) => {
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        localStorage.setItem(EMAIL_KEY, email);
    };

    const getToken = () => getAccessToken();

    const refreshAccessToken = async () => {
        const refreshToken = getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token available');

        const res = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });

        if (!res.ok) {
            logout();
            throw new Error('Failed to refresh token');
        }

        const { data } = await res.json();
        localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
        return data.accessToken;
    };

    const login = async (email, password) => {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (!res.ok) throw new Error('Login failed');
        const { data } = await res.json();
        setTokens(data.accessToken, data.refreshToken, email);
        return data.accessToken;
    };

    const register = async (email, password) => {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (!res.ok) throw new Error('Registration failed');
        const { data } = await res.json();
        setTokens(data.accessToken, data.refreshToken, email);
        return data.accessToken;
    };

    const logout = async () => {
        const refreshToken = getRefreshToken();
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });
        } catch (err) {
            console.error('Logout error:', err);
        }
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(EMAIL_KEY);
    };

    return { getToken, getAccessToken, getRefreshToken, getEmail, getUsername, setTokens, isLoggedIn, login, register, logout, refreshAccessToken };
})();

const deepClone = (obj) =>
    typeof structuredClone === 'function'
        ? structuredClone(obj)
        : JSON.parse(JSON.stringify(obj));

const fetchWithAuth = async (path, options = {}) => {
    const doFetch = async () => {
        const token = Auth.getAccessToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(path, { ...options, headers });
        const body = await res.json().catch(() => null);
        return { res, body };
    };

    let { res, body } = await doFetch();

    if (res.status === 401) {
        try {
            await Auth.refreshAccessToken();
        } catch (refreshErr) {
            await Auth.logout();
            window.location.href = '/login';
            throw new Error('Session ended');
        }

        ({ res, body } = await doFetch());

        if (res.status === 401) {
            await Auth.logout();
            window.location.href = '/login';
            throw new Error('Session ended');
        }
    }

    if (!res.ok) {
        throw new Error((body && body.message) || `Request failed with status ${res.status}`);
    }

    return body && body.data !== undefined ? body.data : body;
};

const apiFetch = fetchWithAuth;

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.isLoggedIn()) {
        if (Auth.getRefreshToken()) {
            try {
                await Auth.refreshAccessToken();
            } catch (err) {
                console.warn('Silent refresh failed, redirecting to login', err);
                await Auth.logout();
                window.location.href = '/login';
                return;
            }
        } else {
            await Auth.logout();
            window.location.href = '/login';
            return;
        }
    }

    // --- State ---
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    let state = {
        selectedYear: currentYear,
        selectedMonth: currentDate.getMonth(), // Automatically fetches local system month
    };

    let currentScrollYear = state.selectedYear;
    let currentScrollMonth = state.selectedMonth;

    // --- DOM Elements ---
    const calendarGrid = document.getElementById('calendarGrid');
    const selectedDateTitle = document.getElementById('selectedDateTitle');
    const tasksList = document.getElementById('tasksList');
    const addTaskBtn = document.getElementById('addTaskBtn');
    const dailyNotes = document.getElementById('dailyNotes');

    // New DOM Elements
    const monthYearDisplay = document.getElementById('currentMonthYearDisplay');
    const detailsPanel = document.getElementById('detailsPanel');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const panelOverlay = document.getElementById('panelOverlay');

    // New Daily Flow Elements
    const timelineContainer = document.getElementById('timelineContainer');
    const planDayBtn = document.getElementById('planDayBtn');
    const dayActionsView = document.getElementById('dayActionsView');
    const backToCalendarBtn = document.getElementById('backToCalendarBtn');
    const dayActionsDateTitle = document.getElementById('dayActionsDateTitle');
    const dayActionsTaskInput = document.getElementById('dayActionsTaskInput');
    const dayActionsAddTaskBtn = document.getElementById('dayActionsAddTaskBtn');
    const dayActionsTasksList = document.getElementById('dayActionsTasksList');
    const dayActionsBlockTitleInput = document.getElementById('dayActionsBlockTitleInput');
    const dayActionsBlockStartInput = document.getElementById('dayActionsBlockStartInput');
    const dayActionsBlockEndInput = document.getElementById('dayActionsBlockEndInput');
    const dayActionsAddBlockBtn = document.getElementById('dayActionsAddBlockBtn');
    const dayActionsTimelineContainer = document.getElementById('dayActionsTimelineContainer');
    const dayActionsNotesInput = document.getElementById('dayActionsNotesInput');
    let dayActionsSelectedDateStr = null;
    const planDayModal = document.getElementById('planDayModal');
    const timeBlockTitleInput = document.getElementById('timeBlockTitleInput');
    const timeBlockStartInput = document.getElementById('timeBlockStartInput');
    const timeBlockEndInput = document.getElementById('timeBlockEndInput');
    const cancelPlanDayBtn = document.getElementById('cancelPlanDayBtn');
    const confirmPlanDayBtn = document.getElementById('confirmPlanDayBtn');

    let currentSelectedDateStr = null;

    let appData = {
        streaks: [],
        todos: [],
        timeBlocks: [],
        notes: "",
        calendarData: {}
    };


    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const getDateData = (dateStr) => {
        if (!appData.calendarData) appData.calendarData = {};
        if (!appData.calendarData[dateStr]) {
            appData.calendarData[dateStr] = { tasks: [], notes: '', timeBlocks: [] };
        }
        return appData.calendarData[dateStr];
    };

    // 2. Render Calendar
    const renderCalendar = (year, month, append = false) => {
        if (!append) {
            calendarGrid.innerHTML = '';
            monthYearDisplay.innerText = `${months[month]} ${year}`;
        } else {
            const monthHeader = document.createElement('div');
            monthHeader.classList.add('month-separator');
            monthHeader.style.gridColumn = '1 / -1';
            monthHeader.style.textAlign = 'left';
            monthHeader.style.padding = '20px 0 10px 10px';
            monthHeader.style.fontSize = '24px';
            monthHeader.style.fontWeight = 'bold';
            monthHeader.style.color = 'var(--text-primary)';
            monthHeader.innerText = `${months[month]} ${year}`;
            calendarGrid.appendChild(monthHeader);
        }

        const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Offset for Monday start
        const startingDayIndex = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

        for (let i = 0; i < startingDayIndex; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.classList.add('day-cell', 'empty-cell');
            calendarGrid.appendChild(emptyCell);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const cell = document.createElement('div');
            cell.classList.add('day-cell');

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            cell.dataset.date = dateStr;

            const dayNum = document.createElement('div');
            dayNum.classList.add('day-number');
            dayNum.textContent = day;

            cell.addEventListener('click', () => selectDay(dateStr));
            cell.addEventListener('dblclick', () => openDayActions(dateStr));

            cell.appendChild(dayNum);
            calendarGrid.appendChild(cell);
        }
    };

    // 3. Selection and UI updates
    const selectDay = (dateStr) => {
        currentSelectedDateStr = dateStr;

        document.querySelectorAll('.day-cell').forEach(c => c.classList.remove('active-day'));
        const activeCell = document.querySelector(`.day-cell[data-date="${dateStr}"]`);
        if (activeCell) activeCell.classList.add('active-day');

        // Extract date components safely
        const [y, m, d] = dateStr.split('-');
        selectedDateTitle.textContent = `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;

        refreshDetailsPanel();
    };

    const refreshDetailsPanel = () => {
        if (!currentSelectedDateStr) return;

        const data = getDateData(currentSelectedDateStr);

        tasksList.innerHTML = '';
        data.tasks.forEach((task, index) => {
            const taskItem = document.createElement('label');
            taskItem.classList.add('task-checkbox-wrap');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = task.done;
            checkbox.addEventListener('change', (e) => toggleTask(index, e.target.checked));

            const checkmark = document.createElement('div');
            checkmark.classList.add('checkmark');

            const taskText = document.createElement('span');
            taskText.classList.add('task-text');
            taskText.textContent = task.text;

            taskItem.appendChild(checkbox);
            taskItem.appendChild(checkmark);
            taskItem.appendChild(taskText);

            tasksList.appendChild(taskItem);
        });

        dailyNotes.value = data.notes || '';

        renderTimeline(data);
    };

    const formatTime12Hr = (timeStr) => {
        const [h, m] = timeStr.split(':');
        let hours = parseInt(h);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${hours}:${m} ${ampm}`;
    };

    const toggleTimeBlockDone = (id, isDone) => {
        if (!currentSelectedDateStr) return;
        const dateStr = currentSelectedDateStr;
        const data = getDateData(dateStr);
        const block = data.timeBlocks.find(b => b.id === id);
        if (block) {
            const snapshot = deepClone(data);

            block.completed = isDone;
            if (isDone) {
                const [sH, sM] = block.startTime.split(':').map(Number);
                const [eH, eM] = block.endTime.split(':').map(Number);
                block.plannedDuration = (eH * 60 + eM) - (sH * 60 + sM);
            } else {
                block.plannedDuration = 0;
            }
            renderTimeline(data);

            apiFetch(`/api/habits/calendar/${dateStr}`, {
                method: 'PUT',
                body: JSON.stringify({ tasks: data.tasks, notes: data.notes, timeBlocks: data.timeBlocks })
            }).then(serverResponse => {
                appData.calendarData[dateStr] = { tasks: serverResponse.tasks, notes: serverResponse.notes, timeBlocks: serverResponse.timeBlocks };
                renderTimeline(appData.calendarData[dateStr]);
            }).catch(err => {
                appData.calendarData[dateStr] = snapshot;
                renderTimeline(appData.calendarData[dateStr]);
                console.error('Failed to save time block:', err);
            });
        }
    };

    const renderTimeline = (data) => {
        if (!timelineContainer) return;
        timelineContainer.innerHTML = '';
        if (!data.timeBlocks || data.timeBlocks.length === 0) {
            timelineContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; text-align: center; margin-top: 10px;">No blocks planned yet.</p>';
            return;
        }

        data.timeBlocks.forEach(block => {
            const blockDiv = document.createElement('div');
            blockDiv.classList.add('time-block');
            blockDiv.dataset.id = block.id;
            if (block.completed) {
                blockDiv.classList.add('completed');
            }

            const timeStr = `${formatTime12Hr(block.startTime)} - ${formatTime12Hr(block.endTime)}`;

            const timeDiv = document.createElement('div');
            timeDiv.className = 'block-time';
            timeDiv.textContent = timeStr;
            blockDiv.appendChild(timeDiv);

            const titleDiv = document.createElement('div');
            titleDiv.className = 'block-title';
            titleDiv.textContent = block.title;
            blockDiv.appendChild(titleDiv);

            const checkboxWrap = document.createElement('label');
            checkboxWrap.classList.add('task-checkbox-wrap', 'block-checkbox-wrap');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = block.completed;
            checkbox.addEventListener('change', (e) => {
                toggleTimeBlockDone(block.id, e.target.checked);
            });

            const checkmark = document.createElement('div');
            checkmark.classList.add('checkmark');

            checkboxWrap.appendChild(checkbox);
            checkboxWrap.appendChild(checkmark);

            blockDiv.appendChild(checkboxWrap);
            timelineContainer.appendChild(blockDiv);
        });

        updateLiveTimeline();
    };

    let lastNotifiedBlockId = null;

    const updateLiveTimeline = () => {
        if (!currentSelectedDateStr || !timelineContainer || timelineContainer.innerHTML.includes('No blocks planned yet')) return;

        const currentRealDate = new Date();
        const todayStr = `${currentRealDate.getFullYear()}-${String(currentRealDate.getMonth() + 1).padStart(2, '0')}-${String(currentRealDate.getDate()).padStart(2, '0')}`;

        document.querySelectorAll('.active-block').forEach(el => el.classList.remove('active-block'));
        const existingLine = timelineContainer.querySelector('.live-time-indicator');
        if (existingLine) existingLine.remove();

        if (currentSelectedDateStr !== todayStr) return;

        const currentMins = currentRealDate.getHours() * 60 + currentRealDate.getMinutes();
        const data = getDateData(currentSelectedDateStr);
        if (!data.timeBlocks) return;

        let lineTopPosition = -1;
        const blocksDom = timelineContainer.querySelectorAll('.time-block');

        data.timeBlocks.forEach((block, index) => {
            const [sH, sM] = block.startTime.split(':').map(Number);
            const [eH, eM] = block.endTime.split(':').map(Number);
            const startMins = sH * 60 + sM;
            const endMins = eH * 60 + eM;

            if (startMins - currentMins === 10 && lastNotifiedBlockId !== block.id) {
                alert(`Wrap up! Next task "${block.title}" starting soon (${formatTime12Hr(block.startTime)})`);
                lastNotifiedBlockId = block.id;
            }

            if (currentMins >= startMins && currentMins < endMins) {
                const domNode = Array.from(blocksDom).find(el => el.dataset.id === block.id);
                if (domNode) {
                    domNode.classList.add('active-block');
                    const progress = (currentMins - startMins) / Math.max(1, endMins - startMins);
                    lineTopPosition = domNode.offsetTop + (domNode.offsetHeight * progress);
                }
            } else if (currentMins >= endMins && index < data.timeBlocks.length - 1) {
                const [nSH, nSM] = data.timeBlocks[index + 1].startTime.split(':').map(Number);
                if (currentMins < (nSH * 60 + nSM)) {
                    const domNode = Array.from(blocksDom).find(el => el.dataset.id === block.id);
                    if (domNode) {
                        lineTopPosition = domNode.offsetTop + domNode.offsetHeight + 5;
                    }
                }
            }
        });

        if (lineTopPosition >= 0) {
            const line = document.createElement('div');
            line.classList.add('live-time-indicator');
            line.style.top = `${lineTopPosition}px`;
            timelineContainer.appendChild(line);
        }
    };

    setInterval(() => {
        updateLiveTimeline();
    }, 60000);

    const toggleTask = (index, isDone) => {
        if (!currentSelectedDateStr) return;
        const dateStr = currentSelectedDateStr;
        const data = getDateData(dateStr);
        const snapshot = deepClone(data);

        data.tasks[index].done = isDone;

        apiFetch(`/api/habits/calendar/${dateStr}`, {
            method: 'PUT',
            body: JSON.stringify({ tasks: data.tasks, notes: data.notes, timeBlocks: data.timeBlocks })
        }).then(serverResponse => {
            appData.calendarData[dateStr] = { tasks: serverResponse.tasks, notes: serverResponse.notes, timeBlocks: serverResponse.timeBlocks };
            refreshDetailsPanel();
        }).catch(err => {
            appData.calendarData[dateStr] = snapshot;
            refreshDetailsPanel();
            console.error('Failed to save task:', err);
        });
    };

    // 4. Events
    const openDayActions = (dateStr) => {
        dayActionsSelectedDateStr = dateStr;
        calendarView.style.display = 'none';
        streaksView.style.display = 'none';
        if (messagesView) messagesView.style.display = 'none';
        if (dayActionsView) dayActionsView.style.display = 'flex';
        
        const [y, m, d] = dateStr.split('-');
        dayActionsDateTitle.textContent = `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
        refreshDayActionsCards();
    };

    if (backToCalendarBtn) {
        backToCalendarBtn.addEventListener('click', () => {
            if (dayActionsView) dayActionsView.style.display = 'none';
            calendarView.style.display = 'flex';
        });
    }

    const refreshDayActionsCards = () => {
        if (!dayActionsSelectedDateStr) return;
        const data = getDateData(dayActionsSelectedDateStr);

        dayActionsTasksList.innerHTML = '';
        data.tasks.forEach((task, index) => {
            const taskItem = document.createElement('label');
            taskItem.classList.add('task-checkbox-wrap');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = task.done;
            checkbox.addEventListener('change', (e) => {
                const dateStr = dayActionsSelectedDateStr;
                const dayData = getDateData(dateStr);
                const snapshot = deepClone(dayData);

                dayData.tasks[index].done = e.target.checked;
                refreshDetailsPanel();

                apiFetch(`/api/habits/calendar/${dateStr}`, {
                    method: 'PUT',
                    body: JSON.stringify({ tasks: dayData.tasks, notes: dayData.notes, timeBlocks: dayData.timeBlocks })
                }).then(serverResponse => {
                    appData.calendarData[dateStr] = { tasks: serverResponse.tasks, notes: serverResponse.notes, timeBlocks: serverResponse.timeBlocks };
                    refreshDetailsPanel();
                }).catch(err => {
                    appData.calendarData[dateStr] = snapshot;
                    refreshDayActionsCards();
                    refreshDetailsPanel();
                    console.error('Failed to save task:', err);
                });
            });
            const checkmark = document.createElement('div');
            checkmark.classList.add('checkmark');
            const taskText = document.createElement('span');
            taskText.classList.add('task-text');
            taskText.textContent = task.text;

            taskItem.appendChild(checkbox);
            taskItem.appendChild(checkmark);
            taskItem.appendChild(taskText);
            dayActionsTasksList.appendChild(taskItem);
        });

        if (dayActionsNotesInput) {
            dayActionsNotesInput.value = data.notes || '';
        }

        renderDayActionsTimeline(data);
    };

    const renderDayActionsTimeline = (data) => {
        dayActionsTimelineContainer.innerHTML = '';
        if (!data.timeBlocks || data.timeBlocks.length === 0) {
            dayActionsTimelineContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">No blocks planned yet.</p>';
            return;
        }

        data.timeBlocks.forEach(block => {
            const blockDiv = document.createElement('div');
            blockDiv.classList.add('time-block');
            if (block.completed) blockDiv.classList.add('completed');
            const timeStr = `${formatTime12Hr(block.startTime)} - ${formatTime12Hr(block.endTime)}`;

            const timeDiv = document.createElement('div');
            timeDiv.className = 'block-time';
            timeDiv.textContent = timeStr;
            blockDiv.appendChild(timeDiv);

            const titleDiv = document.createElement('div');
            titleDiv.className = 'block-title';
            titleDiv.textContent = block.title;
            blockDiv.appendChild(titleDiv);

            const checkboxWrap = document.createElement('label');
            checkboxWrap.classList.add('task-checkbox-wrap', 'block-checkbox-wrap');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = block.completed;
            checkbox.addEventListener('change', (e) => {
                const dateStr = dayActionsSelectedDateStr;
                const snapshot = deepClone(data);

                const b = data.timeBlocks.find(x => x.id === block.id);
                if (b) {
                    b.completed = e.target.checked;
                    if (e.target.checked) {
                        const [sH, sM] = b.startTime.split(':').map(Number);
                        const [eH, eM] = b.endTime.split(':').map(Number);
                        b.plannedDuration = (eH * 60 + eM) - (sH * 60 + sM);
                    } else {
                        b.plannedDuration = 0;
                    }
                }
                renderDayActionsTimeline(data);
                refreshDetailsPanel();

                apiFetch(`/api/habits/calendar/${dateStr}`, {
                    method: 'PUT',
                    body: JSON.stringify({ tasks: data.tasks, notes: data.notes, timeBlocks: data.timeBlocks })
                }).then(serverResponse => {
                    appData.calendarData[dateStr] = { tasks: serverResponse.tasks, notes: serverResponse.notes, timeBlocks: serverResponse.timeBlocks };
                    renderDayActionsTimeline(appData.calendarData[dateStr]);
                    refreshDetailsPanel();
                }).catch(err => {
                    appData.calendarData[dateStr] = snapshot;
                    renderDayActionsTimeline(appData.calendarData[dateStr]);
                    refreshDetailsPanel();
                    console.error('Failed to save time block:', err);
                });
            });
            const checkmark = document.createElement('div');
            checkmark.classList.add('checkmark');
            checkboxWrap.appendChild(checkbox);
            checkboxWrap.appendChild(checkmark);
            blockDiv.appendChild(checkboxWrap);
            dayActionsTimelineContainer.appendChild(blockDiv);
        });
    };

    if (dayActionsAddTaskBtn) {
        dayActionsAddTaskBtn.addEventListener('click', () => {
            if (!dayActionsSelectedDateStr) return;
            const text = dayActionsTaskInput.value;
            if (text && text.trim()) {
                const dateStr = dayActionsSelectedDateStr;
                const data = getDateData(dateStr);
                const snapshot = deepClone(data);

                data.tasks.push({ text: text.trim(), done: false });
                dayActionsTaskInput.value = '';
                refreshDayActionsCards();
                refreshDetailsPanel();

                apiFetch(`/api/habits/calendar/${dateStr}`, {
                    method: 'PUT',
                    body: JSON.stringify({ tasks: data.tasks, notes: data.notes, timeBlocks: data.timeBlocks })
                }).then(serverResponse => {
                    appData.calendarData[dateStr] = { tasks: serverResponse.tasks, notes: serverResponse.notes, timeBlocks: serverResponse.timeBlocks };
                    refreshDayActionsCards();
                    refreshDetailsPanel();
                }).catch(err => {
                    appData.calendarData[dateStr] = snapshot;
                    refreshDayActionsCards();
                    refreshDetailsPanel();
                    console.error('Failed to add task:', err);
                });
            }
        });
    }

    if (dayActionsAddBlockBtn) {
        dayActionsAddBlockBtn.addEventListener('click', () => {
            const title = dayActionsBlockTitleInput.value.trim();
            const start = dayActionsBlockStartInput.value;
            const end = dayActionsBlockEndInput.value;

            if (!title || !start || !end) {
                alert("Please fill out all fields.");
                return;
            }
            if (start >= end) {
                alert("End time must be after start time.");
                return;
            }
            if (!dayActionsSelectedDateStr) return;

            const dateStr = dayActionsSelectedDateStr;
            const data = getDateData(dateStr);
            const hasConflict = data.timeBlocks.some(block => {
                return (start < block.endTime && end > block.startTime);
            });
            if (hasConflict) {
                alert("⚠️ This overlaps with another time block!");
                return;
            }

            const snapshot = deepClone(data);

            data.timeBlocks.push({
                id: Date.now().toString(),
                title: title,
                startTime: start,
                endTime: end,
                completed: false,
                plannedDuration: 0
            });
            data.timeBlocks.sort((a, b) => a.startTime.localeCompare(b.startTime));

            dayActionsBlockTitleInput.value = '';
            dayActionsBlockStartInput.value = '';
            dayActionsBlockEndInput.value = '';

            refreshDayActionsCards();
            refreshDetailsPanel();

            apiFetch(`/api/habits/calendar/${dateStr}`, {
                method: 'PUT',
                body: JSON.stringify({ tasks: data.tasks, notes: data.notes, timeBlocks: data.timeBlocks })
            }).then(serverResponse => {
                appData.calendarData[dateStr] = { tasks: serverResponse.tasks, notes: serverResponse.notes, timeBlocks: serverResponse.timeBlocks };
                refreshDayActionsCards();
                refreshDetailsPanel();
            }).catch(err => {
                appData.calendarData[dateStr] = snapshot;
                refreshDayActionsCards();
                refreshDetailsPanel();
                console.error('Failed to add time block:', err);
            });
        });
    }

    if (planDayBtn) {
        planDayBtn.addEventListener('click', () => {
            planDayModal.style.display = 'flex';
            timeBlockTitleInput.value = '';
            timeBlockStartInput.value = '';
            timeBlockEndInput.value = '';
            timeBlockTitleInput.focus();
        });
    }

    if (cancelPlanDayBtn) {
        cancelPlanDayBtn.addEventListener('click', () => {
            planDayModal.style.display = 'none';
        });
    }

    if (confirmPlanDayBtn) {
        confirmPlanDayBtn.addEventListener('click', () => {
            const title = timeBlockTitleInput.value.trim();
            const start = timeBlockStartInput.value;
            const end = timeBlockEndInput.value;

            if (!title || !start || !end) {
                alert("Please fill out all fields.");
                return;
            }

            if (start >= end) {
                alert("End time must be after start time.");
                return;
            }

            if (!currentSelectedDateStr) return;

            const dateStr = currentSelectedDateStr;
            const data = getDateData(dateStr);

            const hasConflict = data.timeBlocks.some(block => {
                return (start < block.endTime && end > block.startTime);
            });

            if (hasConflict) {
                alert("⚠️ This overlaps with another time block!");
                return;
            }

            const snapshot = deepClone(data);

            data.timeBlocks.push({
                id: Date.now().toString(),
                title: title,
                startTime: start,
                endTime: end,
                completed: false,
                plannedDuration: 0
            });

            data.timeBlocks.sort((a, b) => a.startTime.localeCompare(b.startTime));

            planDayModal.style.display = 'none';

            detailsPanel.classList.add('open');
            if (window.innerWidth <= 768 && panelOverlay) panelOverlay.classList.add('show');
            refreshDetailsPanel();

            apiFetch(`/api/habits/calendar/${dateStr}`, {
                method: 'PUT',
                body: JSON.stringify({ tasks: data.tasks, notes: data.notes, timeBlocks: data.timeBlocks })
            }).then(serverResponse => {
                appData.calendarData[dateStr] = { tasks: serverResponse.tasks, notes: serverResponse.notes, timeBlocks: serverResponse.timeBlocks };
                refreshDetailsPanel();
            }).catch(err => {
                appData.calendarData[dateStr] = snapshot;
                refreshDetailsPanel();
                console.error('Failed to add time block:', err);
            });
        });
    }

    let notesDebounceTimer = null;

    if (dayActionsNotesInput) {
        dayActionsNotesInput.addEventListener('input', (e) => {
            if (!dayActionsSelectedDateStr) return;
            const dateStr = dayActionsSelectedDateStr;
            const data = getDateData(dateStr);
            data.notes = e.target.value;
            refreshDetailsPanel(); // Keep details panel synced if needed

            clearTimeout(notesDebounceTimer);
            notesDebounceTimer = setTimeout(() => {
                const snapshot = deepClone(data);
                apiFetch(`/api/habits/calendar/${dateStr}`, {
                    method: 'PUT',
                    body: JSON.stringify({ tasks: data.tasks, notes: data.notes, timeBlocks: data.timeBlocks })
                }).then(serverResponse => {
                    appData.calendarData[dateStr] = { tasks: serverResponse.tasks, notes: serverResponse.notes, timeBlocks: serverResponse.timeBlocks };
                }).catch(err => {
                    appData.calendarData[dateStr] = snapshot;
                    refreshDetailsPanel();
                    console.error('Failed to save notes:', err);
                });
            }, 500);
        });
    }

    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    sentinel.style.height = '10px';
    sentinel.style.gridColumn = '1 / -1';

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                currentScrollMonth++;
                if (currentScrollMonth > 11) {
                    currentScrollMonth = 0;
                    currentScrollYear++;
                }

                observer.unobserve(sentinel);
                if (sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);

                renderCalendar(currentScrollYear, currentScrollMonth, true);

                calendarGrid.appendChild(sentinel);
                observer.observe(sentinel);
            }
        });
    }, {
        root: calendarGrid,
        rootMargin: '100px',
        threshold: 0.1
    });

    addTaskBtn.addEventListener('click', () => {
        if (!currentSelectedDateStr) return;
        const input = document.getElementById('newTaskInput');
        const text = input.value;
        if (text && text.trim()) {
            const dateStr = currentSelectedDateStr;
            const data = getDateData(dateStr);
            const snapshot = deepClone(data);

            data.tasks.push({ text: text.trim(), done: false });
            input.value = '';
            refreshDetailsPanel();

            apiFetch(`/api/habits/calendar/${dateStr}`, {
                method: 'PUT',
                body: JSON.stringify({ tasks: data.tasks, notes: data.notes, timeBlocks: data.timeBlocks })
            }).then(serverResponse => {
                appData.calendarData[dateStr] = { tasks: serverResponse.tasks, notes: serverResponse.notes, timeBlocks: serverResponse.timeBlocks };
                refreshDetailsPanel();
            }).catch(err => {
                appData.calendarData[dateStr] = snapshot;
                refreshDetailsPanel();
                console.error('Failed to add task:', err);
            });
        }
    });

    document.getElementById('saveNotesBtn').addEventListener('click', () => {
        if (currentSelectedDateStr) {
            const dateStr = currentSelectedDateStr;
            const data = getDateData(dateStr);
            const snapshot = deepClone(data);

            data.notes = dailyNotes.value;
            alert(`Tasks & Notes Saved for ${selectedDateTitle.textContent}!`);

            apiFetch(`/api/habits/calendar/${dateStr}`, {
                method: 'PUT',
                body: JSON.stringify({ tasks: data.tasks, notes: data.notes, timeBlocks: data.timeBlocks })
            }).then(serverResponse => {
                appData.calendarData[dateStr] = { tasks: serverResponse.tasks, notes: serverResponse.notes, timeBlocks: serverResponse.timeBlocks };
            }).catch(err => {
                appData.calendarData[dateStr] = snapshot;
                refreshDetailsPanel();
                console.error('Failed to save notes:', err);
            });
        }
    });

    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', () => {
            detailsPanel.classList.remove('open');
            if (panelOverlay) panelOverlay.classList.remove('show');
        });
    }

    if (panelOverlay) {
        panelOverlay.addEventListener('click', () => {
            detailsPanel.classList.remove('open');
            panelOverlay.classList.remove('show');
        });
    }

    // Initialize
    const initializeApp = async () => {
        try {
            const data = await apiFetch('/api/habits', { method: 'GET' });
            appData.streaks = data.habits || [];
            appData.calendarData = data.calendarData || {};

            appData.streaks.forEach(streak => {
                if (!streak.history) streak.history = {};
                if (!streak.questionData) streak.questionData = {};
            });
        } catch (err) {
            console.error('Failed to load habits from server:', err);
            return;
        }

        renderCalendar(state.selectedYear, state.selectedMonth, false);
        calendarGrid.appendChild(sentinel);
        observer.observe(sentinel);

        // Auto-select today's precise local date rather than forcing the 1st
        const initialDateStr = `${state.selectedYear}-${String(state.selectedMonth + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
        selectDay(initialDateStr);
    };

    initializeApp();

    // --- STREAKS MODULE LOGIC ---

    const navCalendarBtn = document.getElementById('navCalendarBtn');
    const navStreaksBtn = document.getElementById('navStreaksBtn');
    const calendarView = document.getElementById('calendarView');
    const streaksView = document.getElementById('streaksView');
    const streaksContainer = document.getElementById('streaksContainer');

    const navMessagesBtn = document.getElementById('navMessagesBtn');
    const messagesView = document.getElementById('messagesView');
    const messagesContainer = document.getElementById('messagesContainer');
    const logoutBtn = document.getElementById('logoutBtn');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenuPanel = document.getElementById('mobileMenuPanel');
    const mobileMenuBackdrop = document.getElementById('mobileMenuBackdrop');
    const mobileSettingsBtn = document.getElementById('mobileSettingsBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    const logoutConfirmModal = document.getElementById('logoutConfirmModal');
    const logoutCancelBtn = document.getElementById('logoutCancelBtn');
    const logoutConfirmBtn = document.getElementById('logoutConfirmBtn');

    const navSettingsBtn = document.getElementById('navSettingsBtn');
    const settingsView = document.getElementById('settingsView');
    const settingsBackBtn = document.getElementById('settingsBackBtn');
    const openChangePasswordBtn = document.getElementById('openChangePasswordBtn');
    const changePasswordView = document.getElementById('changePasswordView');
    const changePasswordBackBtn = document.getElementById('changePasswordBackBtn');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const currentPasswordInput = document.getElementById('currentPasswordInput');
    const newPasswordInput = document.getElementById('newPasswordInput');
    const confirmNewPasswordInput = document.getElementById('confirmNewPasswordInput');
    const changePasswordError = document.getElementById('changePasswordError');
    const changePasswordSuccess = document.getElementById('changePasswordSuccess');
    const forgotCurrentPasswordBtn = document.getElementById('forgotCurrentPasswordBtn');

    const openContactBtn = document.getElementById('openContactBtn');
    const contactView = document.getElementById('contactView');
    const contactBackBtn = document.getElementById('contactBackBtn');
    const contactForm = document.getElementById('contactForm');
    const contactMessageInput = document.getElementById('contactMessageInput');
    const contactError = document.getElementById('contactError');
    const contactSuccess = document.getElementById('contactSuccess');

    const openInviteBtn = document.getElementById('openInviteBtn');
    const inviteView = document.getElementById('inviteView');
    const inviteBackBtn = document.getElementById('inviteBackBtn');
    const inviteCard = document.getElementById('inviteCard');
    const inviteNameHeading = document.getElementById('inviteNameHeading');
    const inviteCurrentStreak = document.getElementById('inviteCurrentStreak');
    const inviteLongestStreak = document.getElementById('inviteLongestStreak');
    const inviteHabitCount = document.getElementById('inviteHabitCount');
    const inviteDots = document.getElementById('inviteDots');
    const inviteShareBtn = document.getElementById('inviteShareBtn');
    const inviteCopyLinkBtn = document.getElementById('inviteCopyLinkBtn');
    const inviteFeedback = document.getElementById('inviteFeedback');

    const openChangeUsernameBtn = document.getElementById('openChangeUsernameBtn');
    const changeUsernameView = document.getElementById('changeUsernameView');
    const changeUsernameBackBtn = document.getElementById('changeUsernameBackBtn');
    const changeUsernameForm = document.getElementById('changeUsernameForm');
    const newUsernameInput = document.getElementById('newUsernameInput');
    const currentUsernamePasswordInput = document.getElementById('currentUsernamePasswordInput');
    const changeUsernameError = document.getElementById('changeUsernameError');
    const changeUsernameSuccess = document.getElementById('changeUsernameSuccess');
    const forgotCurrentPasswordFromUsernameBtn = document.getElementById('forgotCurrentPasswordFromUsernameBtn');

    const forgeNewStreakBtn = document.getElementById('forgeNewStreakBtn');
    const forgeModal = document.getElementById('forgeModal');
    const cancelForgeBtn = document.getElementById('cancelForgeBtn');
    const confirmForgeBtn = document.getElementById('confirmForgeBtn');
    const streakNameInput = document.getElementById('streakNameInput');
    const colorSwatches = document.querySelectorAll('.color-swatch');

    const deleteStreakModal = document.getElementById('deleteStreakModal');
    const cancelDeleteStreakBtn = document.getElementById('cancelDeleteStreakBtn');
    const confirmDeleteStreakBtn = document.getElementById('confirmDeleteStreakBtn');
    let streakToDeleteId = null;

    let selectedStreakColor = '#00E5FF';

    const hideAllViews = () => {
        if (calendarView) calendarView.style.display = 'none';
        if (streaksView) streaksView.style.display = 'none';
        if (messagesView) messagesView.style.display = 'none';
        if (dayActionsView) dayActionsView.style.display = 'none';
        if (typeof aiChatView !== 'undefined' && aiChatView) aiChatView.style.display = 'none';
        if (settingsView) settingsView.style.display = 'none';
        if (changePasswordView) changePasswordView.style.display = 'none';
        if (contactView) contactView.style.display = 'none';
        if (inviteView) inviteView.style.display = 'none';
        if (changeUsernameView) changeUsernameView.style.display = 'none';
        isPasswordViewVisible = false;
        isContactViewVisible = false;
        isInviteViewVisible = false;
        isChangeUsernameViewVisible = false;
        document.body.classList.remove('settings-mode');
    };

    if (navCalendarBtn && navStreaksBtn) {
        navCalendarBtn.addEventListener('click', () => {
            hideAllViews();
            navCalendarBtn.classList.add('active');
            navStreaksBtn.classList.remove('active');
            if (navMessagesBtn) navMessagesBtn.classList.remove('active');
            calendarView.style.display = 'flex';
        });

        navStreaksBtn.addEventListener('click', () => {
            hideAllViews();
            navStreaksBtn.classList.add('active');
            navCalendarBtn.classList.remove('active');
            if (navMessagesBtn) navMessagesBtn.classList.remove('active');
            streaksView.style.display = 'flex';
            detailsPanel.classList.remove('open');
            if (panelOverlay) panelOverlay.classList.remove('show');
            renderStreaks();
        });

        if (navMessagesBtn) {
            navMessagesBtn.addEventListener('click', () => {
                hideAllViews();
                navMessagesBtn.classList.add('active');
                navCalendarBtn.classList.remove('active');
                navStreaksBtn.classList.remove('active');
                if (messagesView) messagesView.style.display = 'flex';
                detailsPanel.classList.remove('open');
                if (panelOverlay) panelOverlay.classList.remove('show');
                renderMessages();
            });
        }
    }

    const showSettingsView = () => {
        hideAllViews();
        if (navCalendarBtn) navCalendarBtn.classList.remove('active');
        if (navStreaksBtn) navStreaksBtn.classList.remove('active');
        if (navMessagesBtn) navMessagesBtn.classList.remove('active');
        if (settingsView) settingsView.style.display = 'flex';
        document.body.classList.add('settings-mode');
    };

    if (navSettingsBtn) {
        navSettingsBtn.addEventListener('click', showSettingsView);
    }

    if (settingsBackBtn) {
        settingsBackBtn.addEventListener('click', () => {
            hideAllViews();
            calendarView.style.display = 'flex';
            if (navCalendarBtn) navCalendarBtn.classList.add('active');
        });
    }

    // --- Change Password view + login-style animated dot background ---
    let isPasswordViewVisible = false;
    let pwBgAnimationStarted = false;
    let startPwBgAnimation = null;
    const pwBgCanvas = document.getElementById('passwordBgCanvas');

    if (pwBgCanvas) {
        const pwBgCtx = pwBgCanvas.getContext('2d');
        let pwBgDots = [];

        const pwBgResize = () => {
            pwBgCanvas.width = window.innerWidth;
            pwBgCanvas.height = window.innerHeight;
        };
        window.addEventListener('resize', pwBgResize);

        const PW_BG_DOT_COLOR = '#bced1a';

        const pwBgMakeDot = () => ({
            x: Math.random() * pwBgCanvas.width,
            y: Math.random() * pwBgCanvas.height,
            r: Math.random() * 1.6 + 0.6,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            alpha: Math.random() * 0.5 + 0.3,
        });

        const pwBgTick = () => {
            if (!isPasswordViewVisible) {
                pwBgAnimationStarted = false;
                return;
            }

            pwBgCtx.clearRect(0, 0, pwBgCanvas.width, pwBgCanvas.height);

            for (const d of pwBgDots) {
                d.x += d.vx;
                d.y += d.vy;

                if (d.x < 0) d.x = pwBgCanvas.width;
                if (d.x > pwBgCanvas.width) d.x = 0;
                if (d.y < 0) d.y = pwBgCanvas.height;
                if (d.y > pwBgCanvas.height) d.y = 0;

                pwBgCtx.beginPath();
                pwBgCtx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
                pwBgCtx.fillStyle = PW_BG_DOT_COLOR;
                pwBgCtx.globalAlpha = d.alpha;
                pwBgCtx.fill();
            }
            pwBgCtx.globalAlpha = 1;
            requestAnimationFrame(pwBgTick);
        };

        startPwBgAnimation = () => {
            pwBgResize();
            const PW_BG_DOT_COUNT = Math.floor((window.innerWidth * window.innerHeight) / 9000);
            pwBgDots = [];
            for (let i = 0; i < PW_BG_DOT_COUNT; i++) pwBgDots.push(pwBgMakeDot());

            if (!pwBgAnimationStarted) {
                pwBgAnimationStarted = true;
                pwBgTick();
            }
        };
    }

    // --- Contact view + its own animated dot background (separate from
    // the change-password canvas — duplicated rather than shared to avoid
    // touching the working change-password animation code) ---
    let isContactViewVisible = false;
    let contactBgAnimationStarted = false;
    let startContactBgAnimation = null;
    const contactBgCanvas = document.getElementById('contactBgCanvas');

    if (contactBgCanvas) {
        const contactBgCtx = contactBgCanvas.getContext('2d');
        let contactBgDots = [];

        const contactBgResize = () => {
            contactBgCanvas.width = window.innerWidth;
            contactBgCanvas.height = window.innerHeight;
        };
        window.addEventListener('resize', contactBgResize);

        const CONTACT_BG_DOT_COLOR = '#bced1a';

        const contactBgMakeDot = () => ({
            x: Math.random() * contactBgCanvas.width,
            y: Math.random() * contactBgCanvas.height,
            r: Math.random() * 1.6 + 0.6,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            alpha: Math.random() * 0.5 + 0.3,
        });

        const contactBgTick = () => {
            if (!isContactViewVisible) {
                contactBgAnimationStarted = false;
                return;
            }

            contactBgCtx.clearRect(0, 0, contactBgCanvas.width, contactBgCanvas.height);

            for (const d of contactBgDots) {
                d.x += d.vx;
                d.y += d.vy;

                if (d.x < 0) d.x = contactBgCanvas.width;
                if (d.x > contactBgCanvas.width) d.x = 0;
                if (d.y < 0) d.y = contactBgCanvas.height;
                if (d.y > contactBgCanvas.height) d.y = 0;

                contactBgCtx.beginPath();
                contactBgCtx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
                contactBgCtx.fillStyle = CONTACT_BG_DOT_COLOR;
                contactBgCtx.globalAlpha = d.alpha;
                contactBgCtx.fill();
            }
            contactBgCtx.globalAlpha = 1;
            requestAnimationFrame(contactBgTick);
        };

        startContactBgAnimation = () => {
            contactBgResize();
            const CONTACT_BG_DOT_COUNT = Math.floor((window.innerWidth * window.innerHeight) / 9000);
            contactBgDots = [];
            for (let i = 0; i < CONTACT_BG_DOT_COUNT; i++) contactBgDots.push(contactBgMakeDot());

            if (!contactBgAnimationStarted) {
                contactBgAnimationStarted = true;
                contactBgTick();
            }
        };
    }

    const showContactView = () => {
        hideAllViews();
        if (contactView) contactView.style.display = 'flex';
        isContactViewVisible = true;
        if (startContactBgAnimation) startContactBgAnimation();
        document.body.classList.add('settings-mode');
    };

    if (openContactBtn) {
        openContactBtn.addEventListener('click', () => {
            if (mobileMenuPanel && mobileMenuPanel.classList.contains('open')) closeMobileMenu();
            showContactView();
        });
    }

    if (contactBackBtn) {
        contactBackBtn.addEventListener('click', () => {
            isContactViewVisible = false;
            if (contactView) contactView.style.display = 'none';
            showSettingsView();
        });
    }

    // --- Change Username view + its own animated dot background (mirrors
    // pwBg* exactly, duplicated rather than shared/refactored) ---
    let isChangeUsernameViewVisible = false;
    let unBgAnimationStarted = false;
    let startUnBgAnimation = null;
    const unBgCanvas = document.getElementById('unBgCanvas');

    if (unBgCanvas) {
        const unBgCtx = unBgCanvas.getContext('2d');
        let unBgDots = [];

        const unBgResize = () => {
            unBgCanvas.width = window.innerWidth;
            unBgCanvas.height = window.innerHeight;
        };
        window.addEventListener('resize', unBgResize);

        const UN_BG_DOT_COLOR = '#bced1a';

        const unBgMakeDot = () => ({
            x: Math.random() * unBgCanvas.width,
            y: Math.random() * unBgCanvas.height,
            r: Math.random() * 1.6 + 0.6,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            alpha: Math.random() * 0.5 + 0.3,
        });

        const unBgTick = () => {
            if (!isChangeUsernameViewVisible) {
                unBgAnimationStarted = false;
                return;
            }

            unBgCtx.clearRect(0, 0, unBgCanvas.width, unBgCanvas.height);

            for (const d of unBgDots) {
                d.x += d.vx;
                d.y += d.vy;

                if (d.x < 0) d.x = unBgCanvas.width;
                if (d.x > unBgCanvas.width) d.x = 0;
                if (d.y < 0) d.y = unBgCanvas.height;
                if (d.y > unBgCanvas.height) d.y = 0;

                unBgCtx.beginPath();
                unBgCtx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
                unBgCtx.fillStyle = UN_BG_DOT_COLOR;
                unBgCtx.globalAlpha = d.alpha;
                unBgCtx.fill();
            }
            unBgCtx.globalAlpha = 1;
            requestAnimationFrame(unBgTick);
        };

        startUnBgAnimation = () => {
            unBgResize();
            const UN_BG_DOT_COUNT = Math.floor((window.innerWidth * window.innerHeight) / 9000);
            unBgDots = [];
            for (let i = 0; i < UN_BG_DOT_COUNT; i++) unBgDots.push(unBgMakeDot());

            if (!unBgAnimationStarted) {
                unBgAnimationStarted = true;
                unBgTick();
            }
        };
    }

    const showChangeUsernameView = () => {
        hideAllViews();
        if (changeUsernameView) changeUsernameView.style.display = 'flex';
        isChangeUsernameViewVisible = true;
        if (startUnBgAnimation) startUnBgAnimation();
        document.body.classList.add('settings-mode');
    };

    if (openChangeUsernameBtn) {
        openChangeUsernameBtn.addEventListener('click', () => {
            if (mobileMenuPanel && mobileMenuPanel.classList.contains('open')) closeMobileMenu();
            showChangeUsernameView();
        });
    }

    if (changeUsernameBackBtn) {
        changeUsernameBackBtn.addEventListener('click', () => {
            isChangeUsernameViewVisible = false;
            if (changeUsernameView) changeUsernameView.style.display = 'none';
            showSettingsView();
        });
    }

    if (changeUsernameForm) {
        changeUsernameForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (changeUsernameError) changeUsernameError.style.display = 'none';
            if (changeUsernameSuccess) changeUsernameSuccess.style.display = 'none';

            const newUsername = newUsernameInput.value.trim();
            const currentPassword = currentUsernamePasswordInput.value;

            if (!newUsername || !currentPassword) {
                if (changeUsernameError) {
                    changeUsernameError.textContent = 'New username and current password are required';
                    changeUsernameError.style.display = 'block';
                }
                return;
            }

            if (newUsername.length < 3) {
                if (changeUsernameError) {
                    changeUsernameError.textContent = 'Username must be at least 3 characters';
                    changeUsernameError.style.display = 'block';
                }
                return;
            }

            const submitBtn = changeUsernameForm.querySelector('button[type="submit"]');

            try {
                if (submitBtn) submitBtn.disabled = true;
                const result = await fetchWithAuth('/api/auth/change-username', {
                    method: 'POST',
                    body: JSON.stringify({ newUsername, currentPassword }),
                });

                Auth.setTokens(result.accessToken, Auth.getRefreshToken(), Auth.getEmail());

                if (changeUsernameSuccess) {
                    changeUsernameSuccess.textContent = `Username updated. Your new username is ${result.username}.`;
                    changeUsernameSuccess.style.display = 'block';
                }
                newUsernameInput.disabled = true;
                currentUsernamePasswordInput.disabled = true;

                setTimeout(() => {
                    newUsernameInput.value = '';
                    currentUsernamePasswordInput.value = '';
                    newUsernameInput.disabled = false;
                    currentUsernamePasswordInput.disabled = false;
                    if (submitBtn) submitBtn.disabled = false;
                    if (changeUsernameSuccess) changeUsernameSuccess.style.display = 'none';
                    showSettingsView();
                }, 1500);
            } catch (err) {
                if (changeUsernameError) {
                    changeUsernameError.textContent = err.message || 'Failed to update username';
                    changeUsernameError.style.display = 'block';
                }
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    if (forgotCurrentPasswordFromUsernameBtn) {
        forgotCurrentPasswordFromUsernameBtn.addEventListener('click', async () => {
            if (!confirm('This will send a password reset link to your email. Continue?')) return;

            try {
                await fetchWithAuth('/api/auth/forgot-password', {
                    method: 'POST',
                    body: JSON.stringify({ email: Auth.getEmail() }),
                });
                forgotCurrentPasswordFromUsernameBtn.textContent = 'Reset link sent to your email.';
                forgotCurrentPasswordFromUsernameBtn.disabled = true;
            } catch (err) {
                if (changeUsernameError) {
                    changeUsernameError.textContent = err.message || 'Failed to send reset link';
                    changeUsernameError.style.display = 'block';
                }
            }
        });
    }

    // --- Invite a Friend view + its own animated dot background (mirrors
    // contactBg* exactly, duplicated rather than shared/refactored) ---
    let isInviteViewVisible = false;
    let inviteBgAnimationStarted = false;
    let startInviteBgAnimation = null;
    let inviteCountUpRunning = false;
    const inviteBgCanvas = document.getElementById('inviteBgCanvas');

    if (inviteBgCanvas) {
        const inviteBgCtx = inviteBgCanvas.getContext('2d');
        let inviteBgDots = [];

        const inviteBgResize = () => {
            inviteBgCanvas.width = window.innerWidth;
            inviteBgCanvas.height = window.innerHeight;
        };
        window.addEventListener('resize', inviteBgResize);

        const INVITE_BG_DOT_COLOR = '#bced1a';

        const inviteBgMakeDot = () => ({
            x: Math.random() * inviteBgCanvas.width,
            y: Math.random() * inviteBgCanvas.height,
            r: Math.random() * 1.6 + 0.6,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            alpha: Math.random() * 0.5 + 0.3,
        });

        const inviteBgTick = () => {
            if (!isInviteViewVisible) {
                inviteBgAnimationStarted = false;
                return;
            }

            inviteBgCtx.clearRect(0, 0, inviteBgCanvas.width, inviteBgCanvas.height);

            for (const d of inviteBgDots) {
                d.x += d.vx;
                d.y += d.vy;

                if (d.x < 0) d.x = inviteBgCanvas.width;
                if (d.x > inviteBgCanvas.width) d.x = 0;
                if (d.y < 0) d.y = inviteBgCanvas.height;
                if (d.y > inviteBgCanvas.height) d.y = 0;

                inviteBgCtx.beginPath();
                inviteBgCtx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
                inviteBgCtx.fillStyle = INVITE_BG_DOT_COLOR;
                inviteBgCtx.globalAlpha = d.alpha;
                inviteBgCtx.fill();
            }
            inviteBgCtx.globalAlpha = 1;
            requestAnimationFrame(inviteBgTick);
        };

        startInviteBgAnimation = () => {
            inviteBgResize();
            const INVITE_BG_DOT_COUNT = Math.floor((window.innerWidth * window.innerHeight) / 9000);
            inviteBgDots = [];
            for (let i = 0; i < INVITE_BG_DOT_COUNT; i++) inviteBgDots.push(inviteBgMakeDot());

            if (!inviteBgAnimationStarted) {
                inviteBgAnimationStarted = true;
                inviteBgTick();
            }
        };
    }

    const computeInviteStats = () => {
        const streaks = appData.streaks || [];
        const numHabits = streaks.length;
        const totalCheckins = streaks.reduce((sum, s) => {
            const history = s.history || {};
            return sum + Object.values(history).filter((v) => v >= 1).length;
        }, 0);
        const longestOverall = Math.max(...streaks.map((s) => s.longestStreak || 0), 0);
        const currentOverall = Math.max(...streaks.map((s) => s.currentStreak || 0), 0);
        return { numHabits, totalCheckins, longestOverall, currentOverall };
    };

    const runInviteCountUp = (el, target) => {
        if (!el) return;
        el.innerText = '0';
        if (!(target > 0)) {
            el.innerText = String(target);
            return;
        }
        inviteCountUpRunning = true;
        const speed = 500;
        const inc = target / (speed / 16);
        let c = 0;
        const step = () => {
            if (!isInviteViewVisible) {
                inviteCountUpRunning = false;
                return;
            }
            c += inc;
            if (c < target) {
                el.innerText = String(Math.ceil(c));
                requestAnimationFrame(step);
            } else {
                el.innerText = String(target);
                inviteCountUpRunning = false;
            }
        };
        step();
    };

    const renderInviteView = () => {
        const username = (typeof Auth !== 'undefined' && Auth.getUsername && Auth.getUsername()) || '';
        const email = (typeof Auth !== 'undefined' && Auth.getEmail && Auth.getEmail()) || '';
        const localPart = email.split('@')[0] || 'Your';
        const rawName = username || localPart;
        const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
        if (inviteNameHeading) inviteNameHeading.textContent = `${displayName}'s Journey`;

        const stats = computeInviteStats();
        if (inviteCurrentStreak) {
            inviteCurrentStreak.setAttribute('data-target', stats.currentOverall);
            runInviteCountUp(inviteCurrentStreak, stats.currentOverall);
        }
        if (inviteLongestStreak) {
            inviteLongestStreak.setAttribute('data-target', stats.longestOverall);
            runInviteCountUp(inviteLongestStreak, stats.longestOverall);
        }
        if (inviteHabitCount) {
            inviteHabitCount.setAttribute('data-target', stats.numHabits);
            runInviteCountUp(inviteHabitCount, stats.numHabits);
        }

        if (inviteDots) {
            inviteDots.innerHTML = '';
            (appData.streaks || []).forEach((s) => {
                const dot = document.createElement('span');
                dot.className = 'invite-dot';
                dot.style.background = s.color || 'var(--text-muted)';
                inviteDots.appendChild(dot);
            });
        }

        return stats;
    };

    const buildInviteShareText = (stats) => {
        return `I've tracked ${stats.numHabits} habit${stats.numHabits === 1 ? '' : 's'} with a ${stats.longestOverall}-day streak on Streakies — join me!`;
    };

    const showInviteFeedback = (message) => {
        if (!inviteFeedback) return;
        inviteFeedback.textContent = message;
        inviteFeedback.style.display = 'block';
        setTimeout(() => {
            inviteFeedback.style.display = 'none';
        }, 2500);
    };

    const showInviteView = () => {
        hideAllViews();
        if (inviteView) inviteView.style.display = 'flex';
        isInviteViewVisible = true;
        if (startInviteBgAnimation) startInviteBgAnimation();
        document.body.classList.add('settings-mode');
        renderInviteView();
        if (inviteCard) {
            inviteCard.classList.remove('invite-card-animate');
            void inviteCard.offsetWidth;
            inviteCard.classList.add('invite-card-animate');
        }
    };

    if (openInviteBtn) {
        openInviteBtn.addEventListener('click', () => {
            if (mobileMenuPanel && mobileMenuPanel.classList.contains('open')) closeMobileMenu();
            showInviteView();
        });
    }

    if (inviteBackBtn) {
        inviteBackBtn.addEventListener('click', () => {
            isInviteViewVisible = false;
            if (inviteView) inviteView.style.display = 'none';
            showSettingsView();
        });
    }

    if (inviteShareBtn) {
        inviteShareBtn.addEventListener('click', async () => {
            const stats = computeInviteStats();
            const text = buildInviteShareText(stats);
            const url = window.location.origin;

            if (navigator.share) {
                try {
                    await navigator.share({ title: 'Streakies', text, url });
                    return;
                } catch (err) {
                    if (err && err.name === 'AbortError') return;
                }
            }

            try {
                await navigator.clipboard.writeText(`${text} ${url}`);
                showInviteFeedback('Copied to clipboard!');
            } catch (err) {
                showInviteFeedback('Could not share. Please try again.');
            }
        });
    }

    if (inviteCopyLinkBtn) {
        inviteCopyLinkBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(window.location.origin);
                showInviteFeedback('Link copied!');
            } catch (err) {
                showInviteFeedback('Could not copy link.');
            }
        });
    }

    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (contactError) contactError.style.display = 'none';
            if (contactSuccess) contactSuccess.style.display = 'none';

            const message = contactMessageInput.value.trim();
            if (!message) {
                if (contactError) {
                    contactError.textContent = 'Please write a message before sending';
                    contactError.style.display = 'block';
                }
                return;
            }

            const submitBtn = contactForm.querySelector('button[type="submit"]');

            try {
                if (submitBtn) submitBtn.disabled = true;
                await fetchWithAuth('/api/contact', {
                    method: 'POST',
                    body: JSON.stringify({ message }),
                });

                if (contactSuccess) {
                    contactSuccess.textContent = "Message sent to the Streakies team. We'll get back to you soon.";
                    contactSuccess.style.display = 'block';
                }
                contactMessageInput.disabled = true;

                setTimeout(() => {
                    contactMessageInput.value = '';
                    contactMessageInput.disabled = false;
                    if (submitBtn) submitBtn.disabled = false;
                    if (contactSuccess) contactSuccess.style.display = 'none';
                }, 500);
            } catch (err) {
                if (contactError) {
                    contactError.textContent = err.message || 'Failed to send message';
                    contactError.style.display = 'block';
                }
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    const showChangePasswordView = () => {
        hideAllViews();
        if (changePasswordView) changePasswordView.style.display = 'flex';
        isPasswordViewVisible = true;
        if (startPwBgAnimation) startPwBgAnimation();
        document.body.classList.add('settings-mode');
    };

    if (openChangePasswordBtn) {
        openChangePasswordBtn.addEventListener('click', showChangePasswordView);
    }

    if (changePasswordBackBtn) {
        changePasswordBackBtn.addEventListener('click', () => {
            isPasswordViewVisible = false;
            if (changePasswordView) changePasswordView.style.display = 'none';
            if (settingsView) settingsView.style.display = 'flex';
        });
    }

    const openLogoutConfirm = () => {
        if (logoutConfirmModal) logoutConfirmModal.style.display = 'flex';
    };

    if (logoutBtn) {
        logoutBtn.addEventListener('click', openLogoutConfirm);
    }

    const openMobileMenu = () => {
        mobileMenuPanel.classList.add('open');
        mobileMenuBackdrop.classList.add('open');
    };
    const closeMobileMenu = () => {
        mobileMenuPanel.classList.remove('open');
        mobileMenuBackdrop.classList.remove('open');
    };

    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', () => {
            closeMobileMenu();
            openLogoutConfirm();
        });
    }

    if (mobileSettingsBtn) {
        mobileSettingsBtn.addEventListener('click', () => {
            closeMobileMenu();
            showSettingsView();
        });
    }

    if (logoutCancelBtn) {
        logoutCancelBtn.addEventListener('click', () => {
            logoutConfirmModal.style.display = 'none';
        });
    }

    if (logoutConfirmBtn) {
        logoutConfirmBtn.addEventListener('click', async () => {
            await Auth.logout();
            window.location.href = '/login';
        });
    }

    const setChangePasswordLockout = (locked) => {
        if (currentPasswordInput) currentPasswordInput.disabled = locked;
        if (newPasswordInput) newPasswordInput.disabled = locked;
        if (confirmNewPasswordInput) confirmNewPasswordInput.disabled = locked;
        if (changePasswordForm) {
            const submitBtn = changePasswordForm.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = locked;
        }
        if (forgotCurrentPasswordBtn) forgotCurrentPasswordBtn.disabled = locked;
    };

    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (changePasswordError) changePasswordError.style.display = 'none';
            if (changePasswordSuccess) changePasswordSuccess.style.display = 'none';

            const currentPassword = currentPasswordInput.value;
            const newPassword = newPasswordInput.value;
            const confirmNewPassword = confirmNewPasswordInput.value;

            if (newPassword.length < 8) {
                if (changePasswordError) {
                    changePasswordError.textContent = 'New password must be at least 8 characters';
                    changePasswordError.style.display = 'block';
                }
                return;
            }

            if (newPassword !== confirmNewPassword) {
                if (changePasswordError) {
                    changePasswordError.textContent = 'New passwords do not match';
                    changePasswordError.style.display = 'block';
                }
                return;
            }

            if (newPassword === currentPassword) {
                if (changePasswordError) {
                    changePasswordError.textContent = 'New password must be different from current password';
                    changePasswordError.style.display = 'block';
                }
                return;
            }

            try {
                await fetchWithAuth('/api/auth/change-password', {
                    method: 'POST',
                    body: JSON.stringify({ currentPassword, newPassword }),
                });

                if (changePasswordSuccess) {
                    changePasswordSuccess.textContent = 'Password changed successfully. Logging you out...';
                    changePasswordSuccess.style.display = 'block';
                }
                setChangePasswordLockout(true);

                setTimeout(async () => {
                    await Auth.logout();
                    window.location.href = '/login';
                }, 1500);
            } catch (err) {
                if (changePasswordError) {
                    changePasswordError.textContent = err.message || 'Failed to change password';
                    changePasswordError.style.display = 'block';
                }
            }
        });
    }

    if (forgotCurrentPasswordBtn) {
        forgotCurrentPasswordBtn.addEventListener('click', async () => {
            if (!confirm('This will send a password reset link to your email. Continue?')) return;

            try {
                await fetchWithAuth('/api/auth/forgot-password', {
                    method: 'POST',
                    body: JSON.stringify({ email: Auth.getEmail() }),
                });
                forgotCurrentPasswordBtn.textContent = 'Reset link sent to your email.';
                forgotCurrentPasswordBtn.disabled = true;
            } catch (err) {
                if (changePasswordError) {
                    changePasswordError.textContent = err.message || 'Failed to send reset link';
                    changePasswordError.style.display = 'block';
                }
            }
        });
    }

    if (mobileMenuBtn && mobileMenuPanel) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (mobileMenuPanel.classList.contains('open')) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        });

        if (mobileMenuBackdrop) {
            mobileMenuBackdrop.addEventListener('click', closeMobileMenu);
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mobileMenuPanel.classList.contains('open')) {
                closeMobileMenu();
            }
        });
    }

    forgeNewStreakBtn.addEventListener('click', () => {
        streakNameInput.value = '';
        forgeModal.style.display = 'flex';
        streakNameInput.focus();
    });

    cancelForgeBtn.addEventListener('click', () => {
        forgeModal.style.display = 'none';
    });

    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            colorSwatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            selectedStreakColor = swatch.dataset.color;
        });
    });

    confirmForgeBtn.addEventListener('click', () => {
        const name = streakNameInput.value.trim();
        const typeEl = document.querySelector('input[name="streakType"]:checked');
        const streakType = typeEl ? typeEl.value : 'habit';
        if (name) {
            const clientId = Date.now().toString();
            const newHabit = {
                id: clientId,
                name: name,
                type: streakType,
                color: selectedStreakColor,
                startDate: formatStreakDate(new Date()),
                history: {},
                questionData: {},
                currentStreak: 0,
                longestStreak: 0,
                lastCheckedDate: null,
                pending: true
            };

            appData.streaks.push(newHabit);
            forgeModal.style.display = 'none';
            renderStreaks();

            apiFetch('/api/habits', {
                method: 'POST',
                body: JSON.stringify({
                    id: clientId,
                    name: newHabit.name,
                    type: newHabit.type,
                    color: newHabit.color,
                    startDate: newHabit.startDate
                })
            }).then(serverResponse => {
                const index = appData.streaks.findIndex(s => s.id === clientId);
                if (index !== -1) {
                    appData.streaks[index] = serverResponse.habit;
                }
                renderStreaks();
            }).catch(err => {
                appData.streaks = appData.streaks.filter(s => s.id !== clientId);
                renderStreaks();
                console.error('Failed to create habit:', err);
            });
        }
    });

    if (cancelDeleteStreakBtn) {
        cancelDeleteStreakBtn.addEventListener('click', () => {
            deleteStreakModal.style.display = 'none';
            streakToDeleteId = null;
        });
    }

    if (confirmDeleteStreakBtn) {
        confirmDeleteStreakBtn.addEventListener('click', () => {
            if (streakToDeleteId) {
                const deletedId = streakToDeleteId;
                const habitToDelete = appData.streaks.find(s => s.id === deletedId);
                const snapshot = habitToDelete ? deepClone(habitToDelete) : null;
                const snapshotIndex = appData.streaks.findIndex(s => s.id === deletedId);

                appData.streaks = appData.streaks.filter(s => s.id !== deletedId);
                renderStreaks();
                deleteStreakModal.style.display = 'none';
                streakToDeleteId = null;

                if (habitToDelete && habitToDelete._id) {
                    apiFetch(`/api/habits/${habitToDelete._id}`, { method: 'DELETE' })
                        .catch(err => {
                            if (snapshot) {
                                appData.streaks.splice(snapshotIndex, 0, snapshot);
                                renderStreaks();
                            }
                            const statusMatch = err && typeof err.message === 'string'
                                ? err.message.match(/status (\d+)/)
                                : null;
                            const statusInfo = statusMatch ? ` (HTTP ${statusMatch[1]})` : '';
                            console.error(`Failed to delete habit from server${statusInfo}:`, err?.message || err);
                        });
                } else if (habitToDelete) {
                    if (snapshot) {
                        appData.streaks.splice(snapshotIndex, 0, snapshot);
                        renderStreaks();
                    }
                    console.warn('Delete skipped: habit has no _id yet (still syncing from server). Please wait a moment and try again.');
                }
            }
        });
    }

    const formatStreakDate = (date) => {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    const getStreakStats = (streak) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const history = streak.history || {};
        const questionData = streak.questionData || {};

        let currentStreak = 0;
        let longestStreak = 0;
        let activeDays = 0;
        let tempStreak = 0;

        const start = new Date(streak.startDate);
        start.setHours(0, 0, 0, 0);

        const totalDays = Math.max(1, Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 1);

        let checkDate = new Date(start);
        while (checkDate <= today) {
            const dateStr = formatStreakDate(checkDate);
            if (history[dateStr] > 0) {
                activeDays++;
                tempStreak++;
                longestStreak = Math.max(longestStreak, tempStreak);
            } else {
                if (checkDate.getTime() !== today.getTime()) {
                    tempStreak = 0;
                }
            }
            checkDate.setDate(checkDate.getDate() + 1);
        }

        currentStreak = tempStreak;
        const completionRate = Math.round((activeDays / totalDays) * 100);

        return { currentStreak, longestStreak, completionRate };
    };

    let streakCharts = {};
    let globalChart = null;

    const getStreakChartData = (streak, days = 14) => {
        const labels = [];
        const data = [];
        const today = new Date();
        today.setHours(0,0,0,0);
        
        for(let i = days - 1; i >= 0; i--) {
            const checkDate = new Date(today);
            checkDate.setDate(today.getDate() - i);
            const dateStr = formatStreakDate(checkDate);
            labels.push(checkDate.toLocaleDateString('en-US', { weekday: 'short' }));
            
            const startOfStreak = new Date(streak.startDate);
            startOfStreak.setHours(0,0,0,0);
            if (checkDate < startOfStreak) {
                data.push(0);
            } else {
                if (streak.type === 'study') {
                    data.push(streak.questionData && streak.questionData[dateStr] ? streak.questionData[dateStr] : 0);
                } else {
                    data.push((streak.history[dateStr] || 0) > 0 ? 1 : 0);
                }
            }
        }
        return { labels, data };
    };

    const analyzeOverallConsistency = (combinedHabits, combinedQuestions, hasStudy) => {
        const aiSummary = document.getElementById('aiSummary');
        if (!aiSummary) return;

        if (hasStudy) {
            const dataArray = combinedQuestions;
            const recent = dataArray.slice(-3).reduce((acc, val) => acc + val, 0);
            const previous = dataArray.slice(-6, -3).reduce((acc, val) => acc + val, 0);
            
            let text = "";
            if (recent > 120) {
                text = "🔥 High productivity today!";
            } else if (recent > previous && recent > 30) {
                text = "📈 You're improving!";
            } else if (recent < previous && recent > 0) {
                text = "📉 Your performance dropped today.";
            } else if (recent === 0 && previous > 0) {
                text = "⚠️ Try increasing your practice.";
            } else if (recent > 40) {
                text = "🔥 High productivity today!";
            } else {
                text = "⚠️ Try increasing your practice.";
            }
            aiSummary.innerText = text;
        } else {
            const dataArray = combinedHabits;
            const totalActive = dataArray.reduce((acc, val) => acc + val, 0);
            const possibleMax = dataArray.length * appData.streaks.length;
            const rate = possibleMax === 0 ? 0 : (totalActive / possibleMax);
            
            const recent = dataArray.slice(-3).reduce((acc, val) => acc + val, 0);
            const previous = dataArray.slice(-6, -3).reduce((acc, val) => acc + val, 0);

            let text = "";
            if (rate > 0.8) {
                text = "🔥 Momentum is soaring! You've been highly consistent across all habits.";
            } else if (rate > 0.4 && recent >= previous) {
                text = "📈 You're finding your groove. Stay focused.";
            } else if (rate > 0.4 && recent < previous) {
                text = "⚠️ Your discipline is slipping slightly compared to last week.";
            } else {
                text = "⚠️ You're missing several elements recently. Try narrowing your load.";
            }
            aiSummary.innerText = text;
        }
    };

    const renderGlobalAnalytics = () => {
        const globalPanel = document.getElementById('globalAnalyticsPanel');
        if (!globalPanel) return;

        if (!appData.streaks || appData.streaks.length === 0) {
            globalPanel.style.display = 'none';
            return;
        }
        
        globalPanel.style.display = 'block';

        const days = 14;
        const labels = [];
        const combinedHabits = new Array(days).fill(0);
        const combinedQuestions = new Array(days).fill(0);
        let hasStudy = false;
        
        const today = new Date();
        today.setHours(0,0,0,0);
        
        for(let i = days - 1; i >= 0; i--) {
            const checkDate = new Date(today);
            checkDate.setDate(today.getDate() - i);
            labels.push(checkDate.toLocaleDateString('en-US', { weekday: 'short' }));
            
            const dateStr = formatStreakDate(checkDate);
            appData.streaks.forEach(streak => {
                const startOfStreak = new Date(streak.startDate);
                startOfStreak.setHours(0,0,0,0);
                if (checkDate >= startOfStreak) {
                    if (streak.type === 'study') {
                        hasStudy = true;
                        if (streak.questionData && streak.questionData[dateStr]) {
                            combinedQuestions[days - 1 - i] += streak.questionData[dateStr];
                        }
                    } else {
                        if ((streak.history[dateStr] || 0) > 0) {
                            combinedHabits[days - 1 - i]++;
                        }
                    }
                }
            });
        }

        analyzeOverallConsistency(combinedHabits, combinedQuestions, hasStudy);

        const oc = document.getElementById('overallChart');
        if (globalChart) globalChart.destroy();

        const datasets = [];
        if (hasStudy) {
            datasets.push({
                label: 'Study Output (Questions)',
                data: combinedQuestions,
                backgroundColor: 'rgba(213, 0, 249, 0.5)',
                borderColor: '#D500F9',
                borderWidth: 1,
                borderRadius: 4
            });
        }
        
        datasets.push({
            label: 'Habits Clocked',
            data: combinedHabits,
            backgroundColor: 'rgba(0, 229, 255, 0.5)',
            borderColor: '#00E5FF',
            borderWidth: 1,
            borderRadius: 4
        });

        if (oc) {
            globalChart = new Chart(oc, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { 
                            beginAtZero: true, 
                            ticks: { precision: 0, color: 'rgba(255,255,255,0.5)' },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        x: { 
                            ticks: { color: 'rgba(255,255,255,0.5)' },
                            grid: { display: false },
                            stacked: true
                        }
                    },
                    plugins: {
                        legend: { display: true, labels: { color: 'white' } }
                    }
                }
            });
        }
    };

    const renderStreaks = (animId = null, runCountAnim = false) => {
        streaksContainer.innerHTML = '';

        if (appData.streaks.length === 0) {
            streaksContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-top: 50px;">No forging started yet. Begin your journey.</p>';
            return;
        }

        appData.streaks.forEach((streak, streakIndex) => {
            const stats = getStreakStats(streak);
            const todayStr = formatStreakDate(new Date());
            const isClockedToday = (streak.history[todayStr] || 0) > 0;

            const card = document.createElement('div');
            card.classList.add('streak-card');

            card.innerHTML = `
                <button class="delete-streak-btn" data-id="${streak.id}">
                    <span class="material-symbols-outlined" style="font-size: 20px;">delete</span>
                </button>
                <div class="streak-info">
                    <div class="streak-title">
                        <h2></h2>
                    </div>
                    ${streak.type === 'study' ? `
                        <div class="daily-questions">
                            Today: <span>${streak.questionData && streak.questionData[todayStr] ? streak.questionData[todayStr] : 0} questions</span>
                        </div>
                        <button class="clock-in-btn study-btn" style="background: transparent; color: ${streak.color}; border-color: ${streak.color} !important;">
                            SOLVED +1
                        </button>
                    ` : `
                        <button class="clock-in-btn ${isClockedToday ? 'clocked' : ''}" style="${!isClockedToday ? `background: ${streak.color}; color: #090a0f;` : ''}">
                            ${isClockedToday ? 'CLOCKED IN' : 'CLOCK IN TODAY'}
                        </button>
                    `}
                    <div class="streak-stats">
                        <div class="stat-row"><span class="stat-label">🔥 Current Streak</span><span class="stat-value count-up" data-target="${stats.currentStreak}">0 Days</span></div>
                        <div class="stat-row"><span class="stat-label">🏆 Longest</span><span class="stat-value count-up" data-target="${stats.longestStreak}">0 Days</span></div>
                        <div class="stat-row"><span class="stat-label">⚡ Completion</span><span class="stat-value count-up" data-postfix="%" data-target="${stats.completionRate}">0%</span></div>
                    </div>
                    <div class="streak-chart-container">
                        <canvas id="chart-${streak.id}"></canvas>
                    </div>
                </div>
                <div class="heatmap-wrapper">
                </div>
            `;
            streaksContainer.appendChild(card);

            const streakTitle = card.querySelector('.streak-title h2');
            streakTitle.textContent = streak.name;

            const heatmapWrapper = card.querySelector('.heatmap-wrapper');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const startOfStreak = new Date(streak.startDate);
            startOfStreak.setHours(0, 0, 0, 0);

            for (let mOffset = 2; mOffset >= 0; mOffset--) {
                const renderMonth = new Date(today.getFullYear(), today.getMonth() - mOffset, 1);
                const y = renderMonth.getFullYear();
                const m = renderMonth.getMonth();
                const monthName = months[m];

                const monthContainer = document.createElement('div');
                monthContainer.classList.add('streak-month-block');

                const monthTitle = document.createElement('div');
                monthTitle.classList.add('streak-month-title');
                monthTitle.innerText = `${monthName} ${y}`;
                monthContainer.appendChild(monthTitle);

                const weekdaysLabel = document.createElement('div');
                weekdaysLabel.classList.add('streak-weekdays');
                weekdaysLabel.innerHTML = '<span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>';
                monthContainer.appendChild(weekdaysLabel);

                const grid = document.createElement('div');
                grid.classList.add('streak-calendar-grid');

                const firstDayIndex = new Date(y, m, 1).getDay();
                const daysInMonth = new Date(y, m + 1, 0).getDate();

                for (let i = 0; i < firstDayIndex; i++) {
                    const empty = document.createElement('div');
                    grid.appendChild(empty);
                }

                for (let day = 1; day <= daysInMonth; day++) {
                    const currentLoopDate = new Date(y, m, day);
                    const dateStr = formatStreakDate(currentLoopDate);

                    const cell = document.createElement('div');
                    cell.classList.add('streak-cell');

                    if (currentLoopDate > today || currentLoopDate < startOfStreak) {
                        cell.classList.add('future');
                    } else {
                        if ((streak.history[dateStr] || 0) > 0) {
                            cell.classList.add('active');
                            if (streak.type === 'study') {
                                const count = streak.questionData ? (streak.questionData[dateStr] || 0) : 0;
                                let intensity = Math.min(count / 50, 1);
                                cell.style.background = `linear-gradient(135deg, ${streak.color}, rgba(255, 61, 0, ${intensity}))`;
                                if (count >= 30) {
                                    cell.style.boxShadow = `0 0 15px ${streak.color}`;
                                } else if (count >= 10) {
                                    cell.style.boxShadow = `0 0 5px ${streak.color}`;
                                } else {
                                    cell.style.opacity = '0.6';
                                    cell.style.boxShadow = 'none';
                                }
                                cell.dataset.tooltip = `${monthName} ${day}: ${count} Questions`;
                            } else {
                                cell.style.setProperty('--streak-color', streak.color);
                                cell.dataset.tooltip = `${monthName} ${day}: ${streak.name} Clocked`;
                            }
                            if (currentLoopDate.getTime() === today.getTime() && animId === streak.id) {
                                cell.classList.add('pop-anim');
                            }
                        } else {
                            cell.classList.add('missed');
                            cell.innerHTML = '✕';
                            cell.dataset.tooltip = `${monthName} ${day}: Missed`;
                        }
                    }
                    grid.appendChild(cell);
                }
                monthContainer.appendChild(grid);
                heatmapWrapper.appendChild(monthContainer);
            }

            // Scroll to current month with both rAF and setTimeout for reliability
            const scrollToEnd = () => { heatmapWrapper.scrollLeft = heatmapWrapper.scrollWidth; };
            requestAnimationFrame(() => requestAnimationFrame(scrollToEnd));
            setTimeout(scrollToEnd, 150);

            const canvasObj = card.querySelector('#chart-' + streak.id);
            if (streakCharts[streak.id]) {
                streakCharts[streak.id].destroy();
            }
            const chartData = getStreakChartData(streak);
            if (canvasObj) {
                streakCharts[streak.id] = new Chart(canvasObj, {
                    type: streak.type === 'study' ? 'bar' : 'line',
                    data: {
                        labels: chartData.labels,
                        datasets: [{
                            label: streak.type === 'study' ? 'Questions Solved Per Day' : 'Consistency',
                            data: chartData.data,
                            borderColor: streak.color,
                            backgroundColor: streak.color + '20',
                            borderWidth: 2,
                            tension: 0.4,
                            fill: true,
                            pointRadius: 2,
                            pointHitRadius: 10
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { display: false, min: 0, max: streak.type === 'study' ? undefined : 1.2 },
                            x: { display: false }
                        },
                        plugins: { legend: { display: false }, tooltip: { enabled: false } },
                        interaction: { mode: 'index', intersect: false }
                    }
                });
            }

            const deleteBtn = card.querySelector('.delete-streak-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    streakToDeleteId = streak.id;
                    deleteStreakModal.style.display = 'flex';
                });
            }

            const btn = card.querySelector('.clock-in-btn');

            if (streak.type === 'study') {
                btn.addEventListener('click', () => {
                    if (!streak._id) {
                        console.warn('Habit not yet synced; please retry in a moment.');
                        return;
                    }

                    const snapshot = deepClone(streak);
                    const habitId = streak.id;

                    streak.history[todayStr] = 1;
                    streak.questionData = streak.questionData || {};
                    streak.questionData[todayStr] = (streak.questionData[todayStr] || 0) + 1;
                    const newQuestionDataValue = streak.questionData[todayStr];
                    renderStreaks(habitId, false);

                    apiFetch(`/api/habits/${streak._id}/checkin`, {
                        method: 'POST',
                        body: JSON.stringify({ date: todayStr, questionDataValue: newQuestionDataValue })
                    }).then(serverResponse => {
                        const index = appData.streaks.findIndex(s => s.id === habitId);
                        if (index !== -1) appData.streaks[index] = serverResponse.habit;
                        renderStreaks(habitId, false);
                    }).catch(err => {
                        const index = appData.streaks.findIndex(s => s.id === habitId);
                        if (index !== -1) appData.streaks[index] = snapshot;
                        renderStreaks(habitId, false);
                        console.error('Failed to record check-in:', err);
                    });
                });
            } else {
                if (!isClockedToday) {
                    btn.addEventListener('click', () => {
                        if (!streak._id) {
                            console.warn('Habit not yet synced; please retry in a moment.');
                            return;
                        }

                        const snapshot = deepClone(streak);
                        const habitId = streak.id;

                        streak.history[todayStr] = 1;
                        renderStreaks(habitId, true);

                        apiFetch(`/api/habits/${streak._id}/checkin`, {
                            method: 'POST',
                            body: JSON.stringify({ date: todayStr })
                        }).then(serverResponse => {
                            const index = appData.streaks.findIndex(s => s.id === habitId);
                            if (index !== -1) appData.streaks[index] = serverResponse.habit;
                            renderStreaks(habitId, true);
                        }).catch(err => {
                            const index = appData.streaks.findIndex(s => s.id === habitId);
                            if (index !== -1) appData.streaks[index] = snapshot;
                            renderStreaks(habitId, true);
                            console.error('Failed to record check-in:', err);
                        });
                    });
                } else {
                    btn.addEventListener('click', () => {
                        if (!streak._id) {
                            console.warn('Habit not yet synced; please retry in a moment.');
                            return;
                        }

                        const snapshot = deepClone(streak);
                        const habitId = streak.id;

                        streak.history[todayStr] = 0;
                        renderStreaks(habitId, true);

                        apiFetch(`/api/habits/${streak._id}/checkin/${todayStr}`, { method: 'DELETE' })
                            .then(serverResponse => {
                                const index = appData.streaks.findIndex(s => s.id === habitId);
                                if (index !== -1) appData.streaks[index] = serverResponse.habit;
                                renderStreaks(habitId, true);
                            }).catch(err => {
                                const index = appData.streaks.findIndex(s => s.id === habitId);
                                if (index !== -1) appData.streaks[index] = snapshot;
                                renderStreaks(habitId, true);
                                console.error('Failed to remove check-in:', err);
                            });
                    });
                }
            }

            if (runCountAnim && animId === streak.id) {
                const counters = card.querySelectorAll('.count-up');
                counters.forEach(counter => {
                    counter.innerText = '0' + (counter.dataset.postfix || ' Days');
                    const target = +counter.getAttribute('data-target');
                    if (target > 0) {
                        const speed = 400;
                        const inc = target / (speed / 16);
                        let c = 0;
                        const updateCount = () => {
                            c += inc;
                            if (c < target) {
                                counter.innerText = Math.ceil(c) + (counter.dataset.postfix || ' Days');
                                requestAnimationFrame(updateCount);
                            } else {
                                counter.innerText = target + (counter.dataset.postfix || ' Days');
                            }
                        };
                        updateCount();
                    } else {
                        counter.innerText = '0' + (counter.dataset.postfix || ' Days');
                    }
                });
            } else {
                const counters = card.querySelectorAll('.count-up');
                counters.forEach(counter => {
                    counter.innerText = counter.getAttribute('data-target') + (counter.dataset.postfix || ' Days');
                });
            }
        });

        renderGlobalAnalytics();
    };

    const generateMessages = () => {
        const messages = [];
        const todayReal = new Date();
        const todayStr = formatStreakDate(todayReal);

        let yesterdayReal = new Date(todayReal);
        yesterdayReal.setDate(yesterdayReal.getDate() - 1);
        const yesterdayStr = formatStreakDate(yesterdayReal);

        // 1. Check Streaks
        if (appData.streaks && appData.streaks.length > 0) {
            appData.streaks.forEach(streak => {
                const clockedToday = (streak.history[todayStr] || 0) > 0;
                const clockedYesterday = (streak.history[yesterdayStr] || 0) > 0;
                const start = new Date(streak.startDate);
                start.setHours(0, 0, 0, 0);

                if (start <= yesterdayReal && !clockedYesterday) {
                    messages.push({
                        type: "warning",
                        title: "Streak Broken Risk",
                        text: `"${streak.name}" was missed yesterday.`,
                        action: "STREAKS"
                    });
                }

                if (start <= todayReal && !clockedToday) {
                    messages.push({
                        type: "warning",
                        title: "Streak Pending",
                        text: `You haven't clocked "${streak.name}" today.`,
                        action: "STREAKS"
                    });
                }
            });
        }

        // 2. Check Daily Plans
        const dataToday = getDateData(todayStr);
        if (!dataToday.timeBlocks || dataToday.timeBlocks.length === 0) {
            messages.push({
                type: "info",
                title: "Plan Your Day",
                text: "You haven't planned your day yet. Time blocking helps you focus.",
                action: "PLAN"
            });
        } else if (dataToday.timeBlocks.length > 8) {
            messages.push({
                type: "reminder",
                title: "Overloaded Day",
                text: "Your day looks overloaded with time blocks. Consider adding breaks.",
                action: "CALENDAR"
            });
        }

        return messages;
    };

    const renderMessages = async () => {
        if (!messagesContainer) return;
        messagesContainer.innerHTML = '';
        
        // --- AI Coach Card ---
        const todayStr = formatStreakDate(new Date());
        let coachMessage = null;
        
        try {
            const cache = JSON.parse(localStorage.getItem('aiCoachCache'));
            if (cache && cache.date === todayStr && cache.message) {
                coachMessage = cache.message;
            }
        } catch (e) {
            console.error("Failed to parse AI coach cache", e);
        }
        
        const aiCard = document.createElement('div');
        aiCard.classList.add('message-card', 'ai-coach');

        const h3 = document.createElement('h3');
        const iconSpan = document.createElement('span');
        iconSpan.className = 'material-symbols-outlined';
        iconSpan.style.color = '#00E5FF';
        iconSpan.textContent = 'auto_awesome';
        h3.appendChild(iconSpan);
        h3.appendChild(document.createTextNode(' Your Daily Coach ✨'));
        aiCard.appendChild(h3);

        const p = document.createElement('p');
        p.style.fontStyle = 'italic';
        p.style.color = 'var(--text-muted)';
        p.textContent = coachMessage ? coachMessage : "Thinking...";
        aiCard.appendChild(p);

        messagesContainer.appendChild(aiCard);

        if (!coachMessage) {
            try {
                const data = await fetchWithAuth("/api/coach", {
                    method: "POST",
                    body: JSON.stringify({ streaks: appData.streaks })
                });
                coachMessage = data.message || "Keep going — every day counts.";
                localStorage.setItem('aiCoachCache', JSON.stringify({ date: todayStr, message: coachMessage }));
                
                const p = aiCard.querySelector('p');
                p.textContent = coachMessage;
                p.style.fontStyle = "normal";
                p.style.color = "var(--text-primary)";
            } catch (err) {
                console.error("AI Coach fetch error:", err);
                coachMessage = "Keep going — every day counts.";
                const p = aiCard.querySelector('p');
                p.textContent = coachMessage;
                p.style.fontStyle = "normal";
                p.style.color = "var(--text-primary)";
            }
        } else {
            const p = aiCard.querySelector('p');
            p.style.fontStyle = "normal";
            p.style.color = "var(--text-primary)";
        }

        // --- Existing Messages ---
        const msgs = generateMessages();

        if (msgs.length === 0) {
            const noMsgs = document.createElement('p');
            noMsgs.style.color = 'var(--text-muted)';
            noMsgs.style.textAlign = 'center';
            noMsgs.style.marginTop = '50px';
            noMsgs.textContent = 'You are all caught up! No other messages right now.';
            messagesContainer.appendChild(noMsgs);
            return;
        }

        msgs.forEach(msg => {
            const card = document.createElement('div');
            card.classList.add('message-card', msg.type);

            let icon = 'notifications';
            if (msg.type === 'warning') icon = 'warning';
            if (msg.type === 'info') icon = 'lightbulb';
            if (msg.type === 'reminder') icon = 'schedule';

            const h3 = document.createElement('h3');
            const iconSpan = document.createElement('span');
            iconSpan.className = 'material-symbols-outlined';
            iconSpan.textContent = icon;
            h3.appendChild(iconSpan);
            const titleText = document.createTextNode(' ' + msg.title);
            h3.appendChild(titleText);
            card.appendChild(h3);

            const p = document.createElement('p');
            p.textContent = msg.text;
            card.appendChild(p);

            card.addEventListener('click', () => {
                if (msg.action === 'STREAKS') {
                    navStreaksBtn.click();
                } else if (msg.action === 'PLAN' || msg.action === 'CALENDAR') {
                    navCalendarBtn.click();
                    const currentRealDate = new Date();
                    const todayStr = formatStreakDate(currentRealDate);
                    selectDay(todayStr);
                    if (msg.action === 'PLAN') {
                        planDayModal.style.display = 'flex';
                        timeBlockTitleInput.value = '';
                        timeBlockStartInput.value = '';
                        timeBlockEndInput.value = '';
                        timeBlockTitleInput.focus();
                    }
                }
            });

            messagesContainer.appendChild(card);
        });
    };
    // --- AI Chat Logic ---
    const aiBubbleBtn = document.getElementById('aiBubbleBtn');
    const aiChatView = document.getElementById('aiChatView');
    const aiChatBackBtn = document.getElementById('aiChatBackBtn');
    const aiChatClearBtn = document.getElementById('aiChatClearBtn');
    const aiChatMessages = document.getElementById('aiChatMessages');
    const aiChatInput = document.getElementById('aiChatInput');
    const aiChatSendBtn = document.getElementById('aiChatSendBtn');
    
    let conversationHistory = [];
    let previousViewForChat = null;

    const renderChatMessages = () => {
        aiChatMessages.innerHTML = '';
        conversationHistory.forEach(msg => {
            const bubble = document.createElement('div');
            bubble.classList.add('chat-bubble', msg.role);

            const textDiv = document.createElement('div');
            const lines = msg.text.split('\n');
            lines.forEach((line, index) => {
                if (index > 0) {
                    textDiv.appendChild(document.createElement('br'));
                }
                textDiv.appendChild(document.createTextNode(line));
            });
            bubble.appendChild(textDiv);

            const timeSpan = document.createElement('span');
            timeSpan.className = 'chat-time';
            timeSpan.textContent = msg.time;
            bubble.appendChild(timeSpan);

            aiChatMessages.appendChild(bubble);
        });
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    };

    const addWelcomeMessage = () => {
        if (conversationHistory.length === 0) {
            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            conversationHistory.push({
                role: 'ai',
                text: "Hey! I'm your Streak Coach. Ask me anything — about your habits, streaks, or how to improve. I can see your data.",
                time: timeStr
            });
            renderChatMessages();
        }
    };

    const getActiveView = () => {
        if (calendarView.style.display !== 'none') return calendarView;
        if (streaksView.style.display !== 'none') return streaksView;
        if (messagesView && messagesView.style.display !== 'none') return messagesView;
        if (typeof dayActionsView !== 'undefined' && dayActionsView && dayActionsView.style.display !== 'none') return dayActionsView;
        return calendarView; // fallback
    };

    console.log('Bubble found:', aiBubbleBtn);
    if (aiBubbleBtn) {
        aiBubbleBtn.addEventListener('click', () => {
            console.log('Bubble clicked!');
            previousViewForChat = getActiveView();
            calendarView.style.display = 'none';
            streaksView.style.display = 'none';
            if (messagesView) messagesView.style.display = 'none';
            if (typeof dayActionsView !== 'undefined' && dayActionsView) dayActionsView.style.display = 'none';
            aiChatView.style.display = 'flex';
            document.body.classList.add('chat-open');
            addWelcomeMessage();
        });
    }

    if (aiChatBackBtn) {
        aiChatBackBtn.addEventListener('click', () => {
            aiChatView.style.display = 'none';
            document.body.classList.remove('chat-open');
            if (previousViewForChat) {
                previousViewForChat.style.display = 'flex';
            } else {
                calendarView.style.display = 'flex';
            }
        });
    }

    if (aiChatClearBtn) {
        aiChatClearBtn.addEventListener('click', () => {
            conversationHistory = [];
            addWelcomeMessage();
        });
    }

    const sendChatMessage = async () => {
        const text = aiChatInput.value.trim();
        if (!text) return;

        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        
        conversationHistory.push({ role: 'user', text, time: timeStr });
        aiChatInput.value = '';
        renderChatMessages();

        // Add typing indicator
        const typingIndicator = document.createElement('div');
        typingIndicator.classList.add('chat-typing');
        typingIndicator.innerHTML = '<span></span><span></span><span></span>';
        aiChatMessages.appendChild(typingIndicator);
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;

        try {
            const data = await fetchWithAuth("/api/chat", {
                method: "POST",
                body: JSON.stringify({ messages: conversationHistory, streakData: appData.streaks })
            });

            aiChatMessages.removeChild(typingIndicator);
            
            const aiNow = new Date();
            const aiTimeStr = aiNow.getHours().toString().padStart(2, '0') + ':' + aiNow.getMinutes().toString().padStart(2, '0');
            conversationHistory.push({ role: 'ai', text: data.reply || "Sorry, no response.", time: aiTimeStr });
            renderChatMessages();
        } catch (e) {
            aiChatMessages.removeChild(typingIndicator);
            const errNow = new Date();
            const errTimeStr = errNow.getHours().toString().padStart(2, '0') + ':' + errNow.getMinutes().toString().padStart(2, '0');
            conversationHistory.push({ role: 'ai', text: "Sorry, I couldn't connect right now. Try again in a moment.", time: errTimeStr });
            renderChatMessages();
        }
    };

    if (aiChatSendBtn) {
        aiChatSendBtn.addEventListener('click', sendChatMessage);
    }

    if (aiChatInput) {
        aiChatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }
    if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js');
    }

});