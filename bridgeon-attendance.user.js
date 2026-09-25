// ==UserScript==
// @name         Bridgeon Attendance
// @namespace    https://github.com/A-Rafeef/bridgeon-timer
// @version      1.1.7
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
        (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '1.1.7';

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
            statusColor = '#34C759'; // Apple Light Mode Green
        } else {
            statusText = `Late ${firstIn - OFFICE_START}m`;
            statusColor = '#FF3B30'; // Apple Light Mode Red
        }

        const lastAction = `${lastLog.type} · ${lastLog.time}`;
        const remainingOutside = Math.max(0, MAX_OUTSIDE - outsideMinutes);
        const usagePercent = Math.min(100, (outsideMinutes / MAX_OUTSIDE) * 100);

        // Detect if we're viewing today or a past date
        const activeDate = getActiveDateLabel();

        let outsideColor;
        if (outsideMinutes < 60) {
            outsideColor = '#34C759'; // Vibrant Green
        } else if (outsideMinutes < 90) {
            outsideColor = '#FF9500'; // Amber Warning
        } else {
            outsideColor = '#FF3B30'; // Coral Red Limit Exceeded
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
                top: 20px;
                right: 20px;
                width: 242px;
                box-sizing: border-box;
                padding: 15px 14px 13px 14px;
                z-index: 999999;
                color: #1C1C1E;
                text-shadow: none;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif;
                
                /* VERY LIGHT WHITE THEME - CRISP FROSTED GLASS */
                background: linear-gradient(145deg, rgba(255, 255, 255, 0.94) 0%, rgba(246, 248, 252, 0.88) 100%);
                border: 1px solid rgba(255, 255, 255, 0.95);
                border-radius: 24px;
                backdrop-filter: blur(35px) saturate(180%);
                -webkit-backdrop-filter: blur(35px) saturate(180%);

                /* LIGHT ELEVATION & POLISHED SPECULAR HIGHLIGHT */
                box-shadow:
                    0 10px 32px -4px rgba(0, 0, 0, 0.08),
                    0 2px 8px -1px rgba(0, 0, 0, 0.04),
                    inset 0 1.5px 1.5px 0 #FFFFFF,
                    inset 0 -1px 1px 0 rgba(0, 0, 0, 0.03);
                
                overflow: hidden;
                user-select: none;
                opacity: 0;
                visibility: hidden;
                transform: translateY(-8px) scale(0.97);
                transition:
                    opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                    visibility 0.3s ease,
                    width 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                    padding 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                    border-radius 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                    box-shadow 0.3s ease;
            }

            #bridgeon-badge:hover {
                box-shadow:
                    0 14px 40px -4px rgba(0, 0, 0, 0.11),
                    0 4px 12px -1px rgba(0, 0, 0, 0.05),
                    inset 0 1.5px 1.5px 0 #FFFFFF,
                    inset 0 -1px 1px 0 rgba(0, 0, 0, 0.03);
            }

            #bridgeon-badge.bridgeon-visible {
                opacity: 1 !important;
                visibility: visible !important;
                transform: translateY(0) scale(1) !important;
            }

            /* LIGHT THEME DYNAMIC ISLAND (MINIMIZED STATE) */
            #bridgeon-badge.bridgeon-minimized {
                width: auto !important;
                min-width: 152px;
                padding: 7px 14px !important;
                border-radius: 999px !important;
                cursor: pointer;
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(246, 248, 252, 0.90) 100%) !important;
                border: 1px solid rgba(255, 255, 255, 0.95) !important;
                box-shadow:
                    0 6px 20px -2px rgba(0, 0, 0, 0.08),
                    0 2px 6px -1px rgba(0, 0, 0, 0.04),
                    inset 0 1px 1px 0 #FFFFFF !important;
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
                gap: 8px;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: -0.01em;
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
                background: rgba(0, 0, 0, 0.04);
                border: 1px solid rgba(0, 0, 0, 0.07);
                color: #48484A;
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                box-shadow: inset 0 1px 1px #FFFFFF;
                transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .bridgeon-btn-action:hover {
                background: rgba(0, 0, 0, 0.08);
                border-color: rgba(0, 0, 0, 0.12);
                color: #1C1C1E;
                transform: scale(1.06);
            }

            .bridgeon-btn-action:active {
                transform: scale(0.95);
            }

            #bridgeon-update-button:hover {
                background: rgba(0, 122, 255, 0.12) !important;
                border-color: rgba(0, 122, 255, 0.32) !important;
                transform: translateY(-1px);
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
            <!-- SURFACE SPECULAR SHEEN -->
            <div style="
                position:absolute;
                inset:0;
                pointer-events:none;
                border-radius:inherit;
                background:
                    radial-gradient(circle at 15% 10%, rgba(255,255,255,0.7) 0%, transparent 40%),
                    linear-gradient(135deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.02) 40%, transparent 60%);
            "></div>

            <!-- SOFT AMBIENT REACTION GLOW -->
            <div style="
                position:absolute;
                bottom:-30px;
                right:-30px;
                width:130px;
                height:130px;
                border-radius:50%;
                pointer-events:none;
                background: radial-gradient(circle, rgba(160, 205, 255, 0.12) 0%, transparent 70%);
                filter: blur(28px);
            "></div>

            <!-- DYNAMIC ISLAND (MINIMIZED VIEW) -->
            <div id="bridgeon-island-view">
                <div style="position:relative; width:8px; height:8px; display:flex; align-items:center; justify-content:center;">
                    <div id="bridgeon-island-pulse" class="bridgeon-pulse-ring" style="
                        position:absolute;
                        inset:-3px;
                        border-radius:50%;
                        background:#34C759;
                    "></div>
                    <div id="bridgeon-island-dot" style="
                        position:relative;
                        width:8px;
                        height:8px;
                        border-radius:50%;
                        background:#34C759;
                        box-shadow:0 0 8px rgba(52, 199, 89, 0.5);
                    "></div>
                </div>
                <span id="bridgeon-island-label" style="color:#1C1C1E; font-weight:600;">Attendance</span>
                <span style="font-size:10px; color:#8E8E93; margin-left:auto;">↗</span>
            </div>

            <!-- FULL WIDGET VIEW -->
            <div id="bridgeon-full-view">

                <!-- HEADER ROW -->
                <div style="
                    position:relative;
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    margin-bottom:11px;
                ">
                    <!-- LOGO & PULSE BEACON -->
                    <div style="
                        display:flex;
                        align-items:center;
                        gap:7px;
                        font-size:12px;
                        font-weight:700;
                        color:#1C1C1E;
                        letter-spacing:-0.015em;
                    ">
                        <div style="position:relative; width:8px; height:8px; display:flex; align-items:center; justify-content:center;">
                            <div id="bridgeon-beacon-ring" class="bridgeon-pulse-ring" style="
                                position:absolute;
                                inset:-3px;
                                border-radius:50%;
                                background:#34C759;
                            "></div>
                            <div id="bridgeon-status-dot" style="
                                position:relative;
                                width:8px;
                                height:8px;
                                border-radius:50%;
                                background:#34C759;
                                box-shadow:0 0 8px rgba(52, 199, 89, 0.5);
                            "></div>
                        </div>
                        Attendance
                    </div>

                    <!-- ACTIONS: LIGHT PILL & MINIMIZE BUTTON -->
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span style="
                            font-size:8.5px;
                            font-weight:600;
                            color:#636366;
                            background: rgba(0, 0, 0, 0.04);
                            border: 1px solid rgba(0, 0, 0, 0.06);
                            box-shadow: inset 0 1px 1px #FFFFFF;
                            padding: 2px 7px;
                            border-radius: 999px;
                        ">
                            v${CURRENT_VERSION}
                        </span>

                        <button id="bridgeon-minimize-btn" class="bridgeon-btn-action" title="Minimize to Island" style="
                            width:19px;
                            height:19px;
                            font-size:10px;
                            line-height:1;
                        ">
                            −
                        </button>
                    </div>
                </div>

                <!-- UPDATE BANNER (LIGHT NOTIFICATION STYLE) -->
                <button
                    id="bridgeon-update-button"
                    style="
                        display:none;
                        position:relative;
                        width:100%;
                        border:1px solid rgba(0, 122, 255, 0.22);
                        background: linear-gradient(135deg, rgba(0, 122, 255, 0.08) 0%, rgba(0, 122, 255, 0.03) 100%);
                        color:#007AFF;
                        border-radius:15px;
                        padding:8px 10px;
                        margin-bottom:10px;
                        text-align:left;
                        cursor:pointer;
                        font-family:inherit;
                        box-shadow: inset 0 1px 1px #FFFFFF, 0 2px 6px rgba(0, 122, 255, 0.08);
                        backdrop-filter:blur(16px);
                        -webkit-backdrop-filter:blur(16px);
                        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                    "
                >
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                        <div>
                            <div style="font-size:9.5px; font-weight:700; color:#007AFF; margin-bottom:1px;">
                                Update Available
                            </div>
                            <div id="bridgeon-update-version-label" style="font-size:8.5px; color:rgba(0, 122, 255, 0.8);">
                                Version ...
                            </div>
                        </div>
                        <span style="font-size:12px; font-weight:700; color:#007AFF;">→</span>
                    </div>
                </button>

                <!-- DATE LABEL ROW -->
                <div style="
                    position:relative;
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    margin-bottom:8px;
                ">
                    <span style="font-size:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:#8E8E93;">Date</span>
                    <span id="bridgeon-date-label" style="
                        font-size:9px;
                        font-weight:600;
                        color:#3A3A3C;
                        background: rgba(0, 0, 0, 0.04);
                        border: 1px solid rgba(0, 0, 0, 0.06);
                        padding: 2px 8px;
                        border-radius: 999px;
                        font-variant-numeric: tabular-nums;
                    ">--</span>
                </div>

                <!-- STATUS ROW -->
                <div style="
                    position:relative;
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    margin-bottom:10px;
                ">
                    <span id="bridgeon-status-label" style="font-size:9.5px; font-weight:500; color:#8E8E93;">Status</span>
                    <span id="bridgeon-status-val" style="
                        font-size:10.5px;
                        font-weight:700;
                        color:#34C759;
                        letter-spacing:-0.01em;
                    ">
                        On Time
                    </span>
                </div>

                <!-- HERO STAT TILES (CRISP WHITE CARDS) -->
                <div style="
                    position:relative;
                    display:grid;
                    grid-template-columns:1fr 1fr;
                    gap:7px;
                    margin-bottom:11px;
                ">
                    <!-- OFFICE TILE -->
                    <div style="
                        position:relative;
                        background: rgba(255, 255, 255, 0.88);
                        border: 1px solid rgba(0, 0, 0, 0.05);
                        border-radius: 16px;
                        padding: 10px 10px 9px 10px;
                        box-shadow:
                            inset 0 1px 1px #FFFFFF,
                            0 2px 6px rgba(0, 0, 0, 0.04);
                    ">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:5px;">
                            <span style="font-size:9.5px; font-weight:500; color:#8E8E93;">Office</span>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                        </div>
                        <div id="bridgeon-office-val" style="
                            font-size:15px;
                            font-weight:700;
                            color:#1C1C1E;
                            letter-spacing:-0.02em;
                        ">
                            0m
                        </div>
                    </div>

                    <!-- OUTSIDE TILE -->
                    <div style="
                        position:relative;
                        background: rgba(255, 255, 255, 0.88);
                        border: 1px solid rgba(0, 0, 0, 0.05);
                        border-radius: 16px;
                        padding: 10px 10px 9px 10px;
                        box-shadow:
                            inset 0 1px 1px #FFFFFF,
                            0 2px 6px rgba(0, 0, 0, 0.04);
                    ">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:5px;">
                            <span style="font-size:9.5px; font-weight:500; color:#8E8E93;">Outside</span>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
                                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
                                <line x1="6" y1="1" x2="6" y2="4"></line>
                                <line x1="10" y1="1" x2="10" y2="4"></line>
                                <line x1="14" y1="1" x2="14" y2="4"></line>
                            </svg>
                        </div>
                        <div id="bridgeon-outside-val" style="
                            font-size:15px;
                            font-weight:700;
                            color:#34C759;
                            letter-spacing:-0.02em;
                        ">
                            0m
                        </div>
                    </div>
                </div>

                <!-- PROGRESS & REMAINING LIMIT -->
                <div style="
                    position:relative;
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    margin-bottom:6px;
                ">
                    <span style="font-size:9px; font-weight:500; color:#8E8E93;">Break allowance</span>
                    <span id="bridgeon-outside-left-val" style="font-size:9px; font-weight:600; color:#3A3A3C; font-variant-numeric:tabular-nums;">
                        1h 30m left
                    </span>
                </div>

                <!-- LIGHT PROGRESS TRACK -->
                <div style="
                    position:relative;
                    width:100%;
                    height:6px;
                    background:rgba(0, 0, 0, 0.06);
                    border:1px solid rgba(0, 0, 0, 0.04);
                    border-radius:99px;
                    overflow:hidden;
                    margin-bottom:12px;
                ">
                    <div id="bridgeon-progress-bar" style="
                        width:0%;
                        height:100%;
                        background: linear-gradient(90deg, #34C759, #30D158);
                        border-radius:99px;
                        transition:width 0.4s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.3s ease;
                        box-shadow:0 0 8px rgba(52, 199, 89, 0.35);
                    "></div>
                </div>

                <!-- BOTTOM LIVE ACTIVITY / LIGHT CAPSULE -->
                <div style="
                    position:relative;
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    padding-top:10px;
                    border-top:1px solid rgba(0, 0, 0, 0.06);
                ">
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <span style="font-size:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:#8E8E93;">
                            Activity
                        </span>
                        <span id="bridgeon-last-action" style="font-size:9px; font-weight:500; color:#3A3A3C;">
                            --
                        </span>
                    </div>

                    <span id="bridgeon-current-status-val" style="
                        font-size:9px;
                        font-weight:700;
                        letter-spacing:0.04em;
                        text-transform:uppercase;
                        color:#28CD41;
                        background: rgba(52, 199, 89, 0.12);
                        border: 1px solid rgba(52, 199, 89, 0.28);
                        padding:4px 10px;
                        border-radius:999px;
                        box-shadow: 0 1px 3px rgba(52, 199, 89, 0.15);
                    ">
                        --
                    </span>
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
        const currentStatusColor = isInside ? '#34C759' : '#8E8E93';
        const currentStatusBackground = isInside
            ? 'rgba(52, 199, 89, 0.12)'
            : 'rgba(142, 142, 147, 0.10)';
        const currentStatusBorder = isInside ? 'rgba(52, 199, 89, 0.28)' : 'rgba(142, 142, 147, 0.2)';
        const currentStatusShadow = isInside
            ? '0 1px 3px rgba(52, 199, 89, 0.15)'
            : 'none';

        // Elements
        const beaconRing = document.getElementById('bridgeon-beacon-ring');
        const statusDot = document.getElementById('bridgeon-status-dot');
        const islandPulse = document.getElementById('bridgeon-island-pulse');
        const islandDot = document.getElementById('bridgeon-island-dot');
        const islandLabel = document.getElementById('bridgeon-island-label');

        const statusVal = document.getElementById('bridgeon-status-val');
        const lastActionEl = document.getElementById('bridgeon-last-action');
        const officeVal = document.getElementById('bridgeon-office-val');
        const outsideVal = document.getElementById('bridgeon-outside-val');
        const outsideLeftVal = document.getElementById('bridgeon-outside-left-val');
        const progressBar = document.getElementById('bridgeon-progress-bar');
        const currentStatusVal = document.getElementById('bridgeon-current-status-val');
        const dateLabelEl = document.getElementById('bridgeon-date-label');
        const statusLabelEl = document.getElementById('bridgeon-status-label');

        // Beacon updates — pulse ring only animates when user is currently IN
        const pulseAnimation = isInside ? '' : 'none';
        if (beaconRing) {
            beaconRing.style.background = currentStatusColor;
            beaconRing.style.animationName = isInside ? 'bridgeon-pulse' : 'none';
        }
        if (statusDot) {
            statusDot.style.background = currentStatusColor;
            statusDot.style.boxShadow = isInside ? '0 0 8px rgba(52, 199, 89, 0.5)' : 'none';
        }
        if (islandPulse) {
            islandPulse.style.background = currentStatusColor;
            islandPulse.style.animationName = isInside ? 'bridgeon-pulse' : 'none';
        }
        if (islandDot) {
            islandDot.style.background = currentStatusColor;
            islandDot.style.boxShadow = isInside ? '0 0 8px rgba(52, 199, 89, 0.5)' : 'none';
        }
        if (islandLabel) {
            islandLabel.textContent = `${data.currentStatus} · ${formatMinutes(isInside ? data.officeMinutes : data.outsideMinutes)}`;
        }

        // Date label — shows the active accordion date (e.g. "25 Sep 2026")
        if (dateLabelEl) {
            dateLabelEl.textContent = data.activeDate || 'Today';
        }
        if (statusLabelEl) {
            statusLabelEl.textContent = data.activeDate ? 'Status' : "Today's status";
        }

        // Full view updates
        if (statusVal) {
            statusVal.textContent = data.statusText;
            statusVal.style.color = data.statusColor;
        }
        if (lastActionEl) {
            lastActionEl.textContent = data.lastAction;
        }
        if (officeVal) {
            officeVal.textContent = formatMinutes(data.officeMinutes);
        }
        if (outsideVal) {
            outsideVal.textContent = formatMinutes(data.outsideMinutes);
            outsideVal.style.color = data.outsideColor;
        }
        if (outsideLeftVal) {
            outsideLeftVal.textContent = `${formatMinutes(data.remainingOutside)} left`;
        }
        if (progressBar) {
            progressBar.style.width = `${data.usagePercent}%`;
            progressBar.style.background = data.outsideColor;
            const glowMap = {
                '#34C759': 'rgba(52, 199, 89, 0.35)',
                '#FF9500': 'rgba(255, 149, 0, 0.35)',
                '#FF3B30': 'rgba(255, 59, 48, 0.35)'
            };
            const glowColor = glowMap[data.outsideColor] || 'rgba(52, 199, 89, 0.35)';
            progressBar.style.boxShadow = `0 0 8px ${glowColor}`;
        }
        if (currentStatusVal) {
            currentStatusVal.textContent = data.currentStatus;
            currentStatusVal.style.color = currentStatusColor;
            currentStatusVal.style.background = currentStatusBackground;
            currentStatusVal.style.borderColor = currentStatusBorder;
            currentStatusVal.style.boxShadow = currentStatusShadow;
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
