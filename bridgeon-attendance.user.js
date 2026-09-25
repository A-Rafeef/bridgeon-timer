// ==UserScript==
// @name         Bridgeon Attendance
// @namespace    https://github.com/A-Rafeef/bridgeon-timer
// @version      1.2.1
// @description  Bridgeon attendance visualization tool featuring Apple-inspired Liquid Glass translucent material
// @match        https://student.bridgeon.in/*
// @updateURL    https://raw.githubusercontent.com/A-Rafeef/bridgeon-timer/main/bridgeon-attendance.user.js
// @downloadURL  https://raw.githubusercontent.com/A-Rafeef/bridgeon-timer/main/bridgeon-attendance.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================
    // PAGE ROUTE CHECK (ONLY SHOW ON /attendance)
    // =========================================================

    function isAttendancePage() {
        // Support both pathname-based and hash-based routing (React Router)
        const path = window.location.pathname.replace(/\/+$/, '');
        const hash = window.location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
        return path === '/attendance' || hash === 'attendance';
    }

    // =========================================================
    // VERSION / UPDATE SYSTEM
    // =========================================================

    const CURRENT_VERSION =
        (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '1.2.1';

    const VERSION_URL =
        'https://raw.githubusercontent.com/A-Rafeef/bridgeon-timer/main/version.json';

    const SCRIPT_URL =
        'https://raw.githubusercontent.com/A-Rafeef/bridgeon-timer/main/bridgeon-attendance.user.js';

    let latestVersion = null;
    let updateAvailable = false;
    let updateMenuRegistered = false;
    let isMinimized = false;

    // =========================================================
    // VERSION COMPARISON
    // =========================================================

    function compareVersions(v1, v2) {
        const a = (v1 || '').split('.').map(Number);
        const b = (v2 || '').split('.').map(Number);
        const length = Math.max(a.length, b.length);

        for (let i = 0; i < length; i++) {
            const num1 = a[i] || 0;
            const num2 = b[i] || 0;
            if (num1 > num2) return 1;
            if (num1 < num2) return -1;
        }

        return 0;
    }

    // =========================================================
    // INSTALL UPDATE
    // =========================================================

    function installUpdate() {
        GM_openInTab(
            SCRIPT_URL + '?update=' + Date.now(),
            {
                active: true,
                insert: true,
                setParent: true
            }
        );
    }

    // =========================================================
    // CHECK FOR UPDATE
    // =========================================================

    function checkForUpdate(showMessage = false) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: VERSION_URL + '?t=' + Date.now(),
            onload: function (response) {
                if (response.status !== 200) {
                    console.error('[Bridgeon] GitHub returned:', response.status);
                    if (showMessage) {
                        alert(
                            'Unable to check for updates.\n\n' +
                            'GitHub HTTP status: ' + response.status
                        );
                    }
                    return;
                }

                try {
                    const data = JSON.parse(response.responseText);
                    const version = String(data.version || '').trim();

                    if (!version) {
                        console.error('[Bridgeon] Invalid version.json');
                        if (showMessage) {
                            alert('version.json does not contain a valid version.');
                        }
                        return;
                    }

                    latestVersion = version;
                    const result = compareVersions(latestVersion, CURRENT_VERSION);

                    if (result > 0) {
                        updateAvailable = true;

                        if (!updateMenuRegistered) {
                            updateMenuRegistered = true;
                            GM_registerMenuCommand(
                                `🆕 Update available: v${latestVersion}`,
                                installUpdate
                            );
                        }

                        updateBadge();

                        if (showMessage) {
                            const update = confirm(
                                'Bridgeon Attendance Update\n\n' +
                                `Current: v${CURRENT_VERSION}\n` +
                                `Latest: v${latestVersion}\n\n` +
                                'Update now?'
                            );
                            if (update) {
                                installUpdate();
                            }
                        }
                    } else {
                        updateAvailable = false;
                        updateBadge();

                        if (showMessage) {
                            alert(
                                'You are using the latest version.\n\n' +
                                `Version: v${CURRENT_VERSION}`
                            );
                        }
                    }
                } catch (error) {
                    console.error('[Bridgeon] Invalid version.json:', error);
                    if (showMessage) {
                        alert('Unable to read version.json.');
                    }
                }
            },
            onerror: function (error) {
                console.error('[Bridgeon] Update check failed:', error);
                if (showMessage) {
                    alert(
                        'Failed to connect to GitHub.\n\n' +
                        'Please check your internet connection.'
                    );
                }
            }
        });
    }

    // =========================================================
    // TAMPERMONKEY MENU
    // =========================================================

    GM_registerMenuCommand(
        '🔄 Check for Updates',
        function () {
            checkForUpdate(true);
        }
    );

    // Initial update check
    checkForUpdate(false);

    // =========================================================
    // ATTENDANCE SETTINGS
    // =========================================================

    const OFFICE_START = 9 * 60; // 9:00 AM
    const OFFICE_END = 17 * 60;   // 5:00 PM
    const MAX_OUTSIDE = 90;       // 90 minutes allowance

    // =========================================================
    // TIME PARSER
    // =========================================================

    function parseTime(timeString) {
        if (!timeString) return 0;
        const clean = timeString.replace(/\s+/g, ' ').trim();
        const parts = clean.split(' ');
        if (parts.length < 2) return 0;

        const [time, period] = parts;
        const timeParts = time.split(':');
        if (timeParts.length < 2) return 0;

        let hours = Number(timeParts[0]);
        let minutes = Number(timeParts[1]);
        if (isNaN(hours) || isNaN(minutes)) return 0;

        const upperPeriod = (period || '').toUpperCase();
        if (upperPeriod === 'PM' && hours !== 12) {
            hours += 12;
        } else if (upperPeriod === 'AM' && hours === 12) {
            hours = 0;
        }

        return hours * 60 + minutes;
    }

    // =========================================================
    // FORMAT MINUTES
    // =========================================================

    function formatMinutes(minutes) {
        const safeMinutes = Math.max(0, Math.round(minutes || 0));
        const h = Math.floor(safeMinutes / 60);
        const m = safeMinutes % 60;

        if (h > 0 && m > 0) {
            return `${h}h ${m}m`;
        }
        if (h > 0) {
            return `${h}h`;
        }
        return `${m}m`;
    }

    // =========================================================
    // GET ATTENDANCE LOGS
    // =========================================================

    const LOG_REGEX = /^(in|out)\s*-\s*(\d{1,2}:\d{2}\s*(?:am|pm))$/i;

    // Returns the expanded MuiCollapse panel for the currently open date row.
    // The real DOM is a <table>: each date is a <tr>, followed by another <tr>
    // containing a MuiCollapse-root. When expanded, MuiCollapse-hidden is absent.
    function getActiveSection() {
        // An expanded panel does NOT have the MuiCollapse-hidden class
        const expanded = document.querySelector('.MuiCollapse-root:not(.MuiCollapse-hidden)');
        return expanded || null;
    }

    // Returns the date text (e.g. "25 Sep 2026") for the currently expanded row.
    // The ExpandLessIcon sits inside the date <tr>; first <td> of that row is the date.
    function getActiveDateLabel() {
        const expandLessIcon = document.querySelector('[data-testid="ExpandLessIcon"]');
        if (!expandLessIcon) return null;

        const tr = expandLessIcon.closest('tr');
        if (!tr) return null;

        const firstTd = tr.querySelector('td');
        if (!firstTd) return null;

        return (firstTd.innerText || firstTd.textContent || '').trim() || null;
    }

    function getAttendanceLogs() {
        if (!isAttendancePage()) return [];

        // Scope chip reading to the currently expanded collapse panel ONLY.
        // Chips exist in ALL rows (even collapsed ones are in the DOM),
        // so querying the whole document would sum up all dates.
        const scope = getActiveSection();
        if (!scope) return []; // no row expanded — nothing to show

        const chips = scope.querySelectorAll('.MuiChip-label');
        const logs = [];

        chips.forEach(el => {
            const text = (el.innerText || el.textContent || '').trim();
            const match = text.match(LOG_REGEX);
            if (!match) return;

            const type = match[1].toUpperCase();
            const time = match[2].trim();

            if (logs.length > 0 && logs[logs.length - 1].type === type) {
                if (type === 'OUT') {
                    logs[logs.length - 1] = { type, time };
                }
            } else {
                logs.push({ type, time });
            }
        });

        return logs;
    }

    // =========================================================
    // CALCULATE ATTENDANCE DATA (REAL-TIME TRACKING)
    // =========================================================

    function calculateData() {
        if (!isAttendancePage()) {
            return null;
        }

        const logs = getAttendanceLogs();

        if (!logs.length) {
            return null;
        }

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        let officeMinutes = 0;
        let outsideMinutes = 0;

        // Completed IN -> OUT
        for (let i = 0; i < logs.length - 1; i++) {
            if (logs[i].type === 'IN' && logs[i + 1].type === 'OUT') {
                let start = parseTime(logs[i].time);
                let end = parseTime(logs[i + 1].time);

                start = Math.max(start, OFFICE_START);
                end = Math.min(end, OFFICE_END);

                if (end > start) {
                    officeMinutes += end - start;
                }
            }
        }

        // Completed OUT -> IN
        for (let i = 0; i < logs.length - 1; i++) {
            if (logs[i].type === 'OUT' && logs[i + 1].type === 'IN') {
                let out = parseTime(logs[i].time);
                let nextIn = parseTime(logs[i + 1].time);

                if (out >= OFFICE_END || nextIn <= OFFICE_START) {
                    continue;
                }

                out = Math.max(out, OFFICE_START);
                nextIn = Math.min(nextIn, OFFICE_END);

                if (nextIn > out) {
                    outsideMinutes += nextIn - out;
                }
            }
        }

        const lastLog = logs[logs.length - 1];
        const currentStatus = lastLog.type === 'IN' ? 'IN' : 'OUT';

        // Real-time tracking of current active session
        if (currentStatus === 'IN') {
            let activeStart = Math.max(parseTime(lastLog.time), OFFICE_START);
            let activeEnd = Math.min(currentMinutes, OFFICE_END);
            if (activeEnd > activeStart) {
                officeMinutes += activeEnd - activeStart;
            }
        } else if (currentStatus === 'OUT') {
            let activeOut = Math.max(parseTime(lastLog.time), OFFICE_START);
            let activeEnd = Math.min(currentMinutes, OFFICE_END);
            if (activeEnd > activeOut) {
                outsideMinutes += activeEnd - activeOut;
            }
        }

        // LATE STATUS
        const firstInLog = logs.find(log => log.type === 'IN');
        const firstIn = firstInLog ? parseTime(firstInLog.time) : OFFICE_START;

        let statusText;
        let statusColor;

        if (firstIn <= OFFICE_START) {
            statusText = 'On Time';
            statusColor = '#22c55e';
        } else {
            statusText = `Late ${firstIn - OFFICE_START}m`;
            statusColor = '#facc15';
        }

        const lastAction = `${lastLog.type} ${lastLog.time}`;
        const remainingOutside = Math.max(0, MAX_OUTSIDE - outsideMinutes);
        const usagePercent = Math.min(100, (outsideMinutes / MAX_OUTSIDE) * 100);

        // Detect if we're viewing today or a past date
        const activeDate = getActiveDateLabel();

        let outsideColor;
        if (outsideMinutes < 60) {
            outsideColor = '#22c55e';
        } else if (outsideMinutes < 90) {
            outsideColor = '#facc15';
        } else {
            outsideColor = '#ef4444';
        }

        return {
            statusText,
            statusColor,
            officeMinutes,
            outsideMinutes,
            remainingOutside,
            currentStatus,
            lastAction,
            usagePercent,
            outsideColor,
            activeDate
        };
    }

    // =========================================================
    // INJECT STYLES (LIQUID GLASS TRANSLUCENT MATERIAL)
    // =========================================================

    function injectStyles() {
        if (document.getElementById('bridgeon-liquid-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'bridgeon-liquid-styles';
        style.textContent = `
            #bridgeon-badge {
                position: fixed;
                top: 18px;
                right: 18px;
                width: 168px;
                box-sizing: border-box;
                padding: 12px;
                z-index: 999999;
                background: #021633;
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 18px;
                color: #FFFFFF;
                font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.35);
                user-select: none;
                opacity: 0;
                visibility: hidden;
                transform: translateY(-20px) scale(0.95);
                transition: opacity 0.35s ease, transform 0.35s ease, visibility 0.35s ease;
            }

            #bridgeon-badge.bridgeon-visible {
                opacity: 1 !important;
                visibility: visible !important;
                transform: translateY(0) scale(1) !important;
            }

            /* MINIMIZED PILL STATE */
            #bridgeon-badge.bridgeon-minimized {
                width: auto !important;
                min-width: 110px;
                padding: 7px 12px !important;
                border-radius: 999px !important;
                cursor: pointer;
                background: #021633 !important;
                border: 1px solid rgba(255, 255, 255, 0.12) !important;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
            }

            #bridgeon-badge.bridgeon-minimized #bridgeon-full-view {
                display: none !important;
            }

            #bridgeon-badge.bridgeon-minimized #bridgeon-island-view {
                display: flex !important;
            }

            #bridgeon-island-view {
                display: none;
                align-items: center;
                gap: 7px;
                font-size: 11px;
                font-weight: 600;
            }

            @keyframes bridgeon-pulse {
                0%, 100% { transform: scale(1); opacity: 0.85; }
                50% { transform: scale(1.6); opacity: 0; }
            }

            .bridgeon-pulse-ring {
                animation: bridgeon-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
            }

            .bridgeon-btn-action {
                outline: none;
                cursor: pointer;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.12);
                color: #A8B6D8;
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }

            .bridgeon-btn-action:hover {
                background: rgba(255, 255, 255, 0.16);
                color: #FFFFFF;
                transform: scale(1.08);
            }

            #bridgeon-discussions-link:hover {
                color: #38BDF8 !important;
            }

            #bridgeon-update-button:hover {
                background: rgba(56, 189, 248, 0.2) !important;
                border-color: rgba(56, 189, 248, 0.5) !important;
            }
        `;
        document.head.appendChild(style);
    }

    // =========================================================
    // CREATE BADGE DOM
    // =========================================================

    function createBadge() {
        if (document.getElementById('bridgeon-badge')) {
            return;
        }

        injectStyles();

        const badge = document.createElement('div');
        badge.id = 'bridgeon-badge';

        badge.innerHTML = `
            <!-- MINIMIZED VIEW -->
            <div id="bridgeon-island-view">
                <div style="position:relative; width:8px; height:8px; display:flex; align-items:center; justify-content:center;">
                    <div id="bridgeon-island-pulse" class="bridgeon-pulse-ring" style="
                        position:absolute;
                        inset:-3px;
                        border-radius:50%;
                        background:#22c55e;
                    "></div>
                    <div id="bridgeon-island-dot" style="
                        position:relative;
                        width:8px;
                        height:8px;
                        border-radius:50%;
                        background:#22c55e;
                    "></div>
                </div>
                <span id="bridgeon-island-label" style="color:#FFFFFF; font-weight:600;">Attendance</span>
                <span style="font-size:10px; color:#A8B6D8; margin-left:auto;">↗</span>
            </div>

            <!-- FULL WIDGET VIEW (DARK NAVY THEME MATCHING SCREENSHOT) -->
            <div id="bridgeon-full-view">

                <!-- ROW 1: STATUS & CONTROLS -->
                <div style="
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    margin-bottom:8px;
                ">
                    <!-- STATUS BEACON & TEXT -->
                    <div style="
                        display:flex;
                        align-items:center;
                        gap:6px;
                        font-size:12px;
                        font-weight:700;
                    ">
                        <div id="bridgeon-status-dot" style="
                            width:10px;
                            height:10px;
                            border-radius:50%;
                            background:#22c55e;
                        "></div>
                        <span id="bridgeon-status-text" style="color:#22c55e;">
                            On Time
                        </span>
                    </div>

                    <!-- MINIMIZE & DISCUSSION BUTTONS -->
                    <div style="display:flex; align-items:center; gap:5px;">
                        <a
                            id="bridgeon-discussions-link"
                            href="https://github.com/A-Rafeef/bridgeon-timer/discussions"
                            target="_blank"
                            rel="noopener noreferrer"
                            onclick="event.stopPropagation();"
                            title="GitHub Discussions"
                            style="
                                color:#64748B;
                                text-decoration:none;
                                font-size:11px;
                                display:inline-flex;
                                align-items:center;
                                justify-content:center;
                                width:16px;
                                height:16px;
                                border-radius:50%;
                                background:rgba(255,255,255,0.06);
                                transition:all 0.2s;
                            "
                        >💬</a>
                        <button
                            id="bridgeon-minimize-btn"
                            class="bridgeon-btn-action"
                            title="Minimize"
                            style="
                                width:16px;
                                height:16px;
                                font-size:10px;
                                line-height:1;
                                color:#94A3B8;
                            "
                        >−</button>
                    </div>
                </div>

                <!-- UPDATE BANNER (WHEN SCRIPT UPDATE IS AVAILABLE) -->
                <button
                    id="bridgeon-update-button"
                    style="
                        display:none;
                        width:100%;
                        border:1px solid rgba(56, 189, 248, 0.35);
                        background: rgba(56, 189, 248, 0.12);
                        color:#38BDF8;
                        border-radius:8px;
                        padding:5px 8px;
                        margin-bottom:8px;
                        text-align:left;
                        cursor:pointer;
                        font-size:10px;
                        font-family:inherit;
                    "
                >
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                        <span style="font-weight:700;">Update Available</span>
                        <span style="font-size:11px;">→</span>
                    </div>
                    <div id="bridgeon-update-version-label" style="font-size:8.5px; opacity:0.85;">
                        Version ...
                    </div>
                </button>

                <!-- ROW 2: LAST ACTION TIME (e.g. IN 03:39 PM) -->
                <div id="bridgeon-last-action" style="
                    font-size:11px;
                    color:#A8B6D8;
                    margin-bottom:10px;
                    font-weight:500;
                ">
                    --
                </div>

                <!-- ROW 3: OFFICE TIME -->
                <div style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    margin-bottom:6px;
                ">
                    <span style="font-size:14px; line-height:1;">🏢</span>
                    <b id="bridgeon-office-val" style="
                        font-size:15px;
                        font-weight:700;
                        color:#FFFFFF;
                        letter-spacing:-0.01em;
                    ">0m</b>
                </div>

                <!-- ROW 4: OUTSIDE TIME -->
                <div style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    margin-bottom:6px;
                ">
                    <span style="font-size:14px; line-height:1;">🚶</span>
                    <b id="bridgeon-outside-val" style="
                        font-size:15px;
                        font-weight:700;
                        color:#22c55e;
                        letter-spacing:-0.01em;
                    ">0m</b>
                </div>

                <!-- ROW 5: PROGRESS BAR -->
                <div style="
                    width:100%;
                    height:5px;
                    background:#20385D;
                    border-radius:50px;
                    overflow:hidden;
                    margin:8px 0;
                ">
                    <div id="bridgeon-progress-bar" style="
                        width:0%;
                        height:100%;
                        background:#22c55e;
                        border-radius:50px;
                        transition:width 0.3s ease, background-color 0.3s ease;
                    "></div>
                </div>

                <!-- ROW 6: OUTSIDE TIME LEFT -->
                <div id="bridgeon-outside-left-val" style="
                    font-size:11px;
                    color:#A8B6D8;
                    margin-bottom:8px;
                    font-weight:500;
                ">
                    1h 30m left
                </div>

                <!-- ROW 7: DIVIDER & STATUS -->
                <div style="
                    border-top:1px solid rgba(255,255,255,0.08);
                    padding-top:8px;
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    font-size:11px;
                    color:#A8B6D8;
                ">
                    <span>Status</span>
                    <b id="bridgeon-current-status-val" style="
                        color:#FFFFFF;
                        font-weight:700;
                    ">IN</b>
                </div>

            </div>
        `;

        document.body.appendChild(badge);

        // Bind update button
        const updateBtn = document.getElementById('bridgeon-update-button');
        if (updateBtn) {
            updateBtn.onclick = installUpdate;
        }

        // Bind minimize toggle
        const minimizeBtn = document.getElementById('bridgeon-minimize-btn');
        if (minimizeBtn) {
            minimizeBtn.onclick = function (e) {
                e.stopPropagation();
                isMinimized = true;
                badge.classList.add('bridgeon-minimized');
            };
        }

        // Expand back when clicked while minimized
        badge.onclick = function () {
            if (isMinimized) {
                isMinimized = false;
                badge.classList.remove('bridgeon-minimized');
            }
        };
    }

    // =========================================================
    // SHOW / HIDE BADGE
    // =========================================================

    function showBadge() {
        if (!isAttendancePage()) {
            hideBadge();
            return;
        }
        const badge = document.getElementById('bridgeon-badge');
        if (!badge) return;
        badge.classList.add('bridgeon-visible');
    }

    function hideBadge() {
        const badge = document.getElementById('bridgeon-badge');
        if (!badge) return;
        badge.classList.remove('bridgeon-visible');
    }

    // =========================================================
    // UPDATE BADGE CONTENT (HIGH PERFORMANCE IN-PLACE UPDATES)
    // =========================================================

    function updateBadge() {
        if (!isAttendancePage()) {
            hideBadge();
            return;
        }

        createBadge();

        // Update banner
        const updateBtn = document.getElementById('bridgeon-update-button');
        const updateVerLabel = document.getElementById('bridgeon-update-version-label');
        if (updateBtn) {
            if (updateAvailable) {
                updateBtn.style.display = 'block';
                if (updateVerLabel) {
                    updateVerLabel.textContent = `Version ${latestVersion}`;
                }
            } else {
                updateBtn.style.display = 'none';
            }
        }

        const data = calculateData();
        if (!data) return;

        const isInside = data.currentStatus === 'IN';

        // Elements
        const statusDot = document.getElementById('bridgeon-status-dot');
        const statusText = document.getElementById('bridgeon-status-text');
        const lastActionEl = document.getElementById('bridgeon-last-action');
        const officeVal = document.getElementById('bridgeon-office-val');
        const outsideVal = document.getElementById('bridgeon-outside-val');
        const progressBar = document.getElementById('bridgeon-progress-bar');
        const outsideLeftVal = document.getElementById('bridgeon-outside-left-val');
        const currentStatusVal = document.getElementById('bridgeon-current-status-val');

        const islandPulse = document.getElementById('bridgeon-island-pulse');
        const islandDot = document.getElementById('bridgeon-island-dot');
        const islandLabel = document.getElementById('bridgeon-island-label');

        // Status beacon & text
        if (statusDot) {
            statusDot.style.background = data.statusColor;
        }
        if (statusText) {
            statusText.textContent = data.statusText;
            statusText.style.color = data.statusColor;
        }
        if (lastActionEl) {
            lastActionEl.textContent = data.lastAction;
        }

        // Office & Outside
        if (officeVal) {
            officeVal.textContent = formatMinutes(data.officeMinutes);
        }
        if (outsideVal) {
            outsideVal.textContent = formatMinutes(data.outsideMinutes);
            outsideVal.style.color = data.outsideColor;
        }

        // Progress track
        if (progressBar) {
            progressBar.style.width = `${data.usagePercent}%`;
            progressBar.style.background = data.outsideColor;
        }

        // Remaining outside limit
        if (outsideLeftVal) {
            outsideLeftVal.textContent = `${formatMinutes(data.remainingOutside)} left`;
        }

        // Current punch status
        if (currentStatusVal) {
            currentStatusVal.textContent = data.currentStatus;
        }

        // Island (minimized view)
        if (islandPulse) {
            islandPulse.style.background = isInside ? '#22c55e' : '#8E8E93';
            islandPulse.style.animationName = isInside ? 'bridgeon-pulse' : 'none';
        }
        if (islandDot) {
            islandDot.style.background = isInside ? '#22c55e' : '#8E8E93';
        }
        if (islandLabel) {
            islandLabel.textContent = `${data.currentStatus} · ${formatMinutes(isInside ? data.officeMinutes : data.outsideMinutes)}`;
        }
    }

    // =========================================================
    // VISIBILITY HANDLING (STRICTLY ON /attendance)
    // =========================================================

    function handleVisibility() {
        if (!isAttendancePage()) {
            hideBadge();
            return;
        }

        // Show badge ONLY when a date row is actually expanded (ExpandLessIcon present).
        // NOTE: MuiChip-labels exist in ALL rows (even collapsed), so we cannot use
        // chip presence as a fallback — it would always show the badge.
        const expandedIcon = document.querySelector('[data-testid="ExpandLessIcon"]');
        if (expandedIcon) {
            showBadge();
        } else {
            hideBadge();
        }
    }

    // Listen to client-side routing
    window.addEventListener('popstate', handleVisibility);
    window.addEventListener('hashchange', handleVisibility);

    // =========================================================
    // INITIALIZATION & REAL-TIME TICKER
    // =========================================================

    if (isAttendancePage()) {
        createBadge();
        updateBadge();
        handleVisibility();
    }

    // Live ticker: tracks route changes and active attendance
    setInterval(() => {
        if (!isAttendancePage()) {
            hideBadge();
            return;
        }
        updateBadge();
        handleVisibility();
    }, 1000);

})();
