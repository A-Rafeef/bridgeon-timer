// ==UserScript==
// @name         Bridgeon Attendance
// @namespace    https://github.com/A-Rafeef/bridgeon-timer
// @version      1.1.4
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
        (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '1.1.4';

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

    // Returns the currently expanded accordion section element (active date panel),
    // or falls back to the full document if none can be identified.
    function getActiveSection() {
        // The expanded accordion icon lives inside the accordion summary.
        // Walk up from it to find the MuiAccordion root, then read its details panel.
        const expandIcon = document.querySelector('[data-testid="ExpandLessIcon"]');
        if (expandIcon) {
            // Go up until we hit the Accordion root (has MuiAccordion-root class)
            let node = expandIcon.parentElement;
            while (node && node !== document.body) {
                if (
                    node.classList.contains('MuiAccordion-root') ||
                    node.classList.contains('MuiPaper-root')
                ) {
                    return node;
                }
                node = node.parentElement;
            }
        }
        // Fallback: return document so caller can still attempt a search
        return document;
    }

    // Returns the date label text for the currently active accordion section.
    function getActiveDateLabel() {
        const section = getActiveSection();
        if (!section || section === document) return null;

        // Try to find a date heading inside the accordion summary
        // Bridgeon typically shows the date as plain text inside the summary bar
        const summaryEl = section.querySelector('.MuiAccordionSummary-content');
        if (summaryEl) {
            // Find first non-empty text node or span that is NOT an icon
            const candidates = summaryEl.querySelectorAll('p, span, div');
            for (const el of candidates) {
                const txt = (el.innerText || el.textContent || '').trim();
                // A date string will contain a digit and be reasonably short
                if (txt && txt.length < 40 && /\d/.test(txt) && el.children.length === 0) {
                    return txt;
                }
            }
            // Last resort: whole summary text
            const raw = (summaryEl.innerText || summaryEl.textContent || '').trim();
            if (raw) return raw.split('\n')[0].trim();
        }
        return null;
    }

    function getAttendanceLogs() {
        if (!isAttendancePage()) return [];

        // Only read chips inside the CURRENTLY ACTIVE (expanded) date section
        const scope = getActiveSection();
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
            statusColor = '#30D158'; // iOS Liquid Emerald
        } else {
            statusText = `Late ${firstIn - OFFICE_START}m`;
            statusColor = '#FF453A'; // iOS Liquid Coral
        }

        const lastAction = `${lastLog.type} · ${lastLog.time}`;
        const remainingOutside = Math.max(0, MAX_OUTSIDE - outsideMinutes);
        const usagePercent = Math.min(100, (outsideMinutes / MAX_OUTSIDE) * 100);

        // Detect if we're viewing today or a past date
        const activeDate = getActiveDateLabel();

        let outsideColor;
        if (outsideMinutes < 60) {
            outsideColor = '#30D158'; // Liquid Emerald Green
        } else if (outsideMinutes < 90) {
            outsideColor = '#FF9F0A'; // Liquid Amber
        } else {
            outsideColor = '#FF453A'; // Liquid Coral Red
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
                color: #F5F5F7;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif;
                
                /* LIQUID GLASS TRANSLUCENT INTERFACE MATERIAL */
                background:
                    radial-gradient(130% 120% at 20% 0%, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.03) 45%, transparent 75%),
                    radial-gradient(90% 90% at 85% 100%, rgba(77, 128, 220, 0.14) 0%, transparent 60%),
                    linear-gradient(145deg, rgba(22, 26, 38, 0.72) 0%, rgba(12, 15, 23, 0.82) 100%);
                
                border: 1px solid rgba(255, 255, 255, 0.22);
                border-radius: 24px;
                backdrop-filter: blur(36px) saturate(210%) brightness(108%) contrast(106%);
                -webkit-backdrop-filter: blur(36px) saturate(210%) brightness(108%) contrast(106%);
                
                /* LIQUID GLASS SPECULAR REFRACTION */
                box-shadow:
                    0 24px 54px -10px rgba(0, 0, 0, 0.72),
                    0 8px 24px -4px rgba(0, 0, 0, 0.45),
                    inset 0 1.5px 1.5px 0 rgba(255, 255, 255, 0.42),
                    inset 0 -1.5px 2px 0 rgba(0, 0, 0, 0.4),
                    inset 1px 0 2px 0 rgba(255, 255, 255, 0.16),
                    inset -1px 0 2px 0 rgba(255, 255, 255, 0.08);
                
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
                    0 28px 64px -10px rgba(0, 0, 0, 0.78),
                    0 12px 28px -4px rgba(0, 0, 0, 0.5),
                    inset 0 1.5px 2px 0 rgba(255, 255, 255, 0.52),
                    inset 0 -1.5px 2px 0 rgba(0, 0, 0, 0.45),
                    inset 1px 0 2px 0 rgba(255, 255, 255, 0.22);
            }

            #bridgeon-badge.bridgeon-visible {
                opacity: 1 !important;
                visibility: visible !important;
                transform: translateY(0) scale(1) !important;
            }

            /* LIQUID GLASS DYNAMIC ISLAND (MINIMIZED STATE) */
            #bridgeon-badge.bridgeon-minimized {
                width: auto !important;
                min-width: 152px;
                padding: 7px 14px !important;
                border-radius: 999px !important;
                cursor: pointer;
                background:
                    radial-gradient(110% 110% at 20% 0%, rgba(255, 255, 255, 0.24) 0%, transparent 60%),
                    linear-gradient(145deg, rgba(16, 20, 28, 0.86) 0%, rgba(10, 13, 19, 0.94) 100%) !important;
                border: 1px solid rgba(255, 255, 255, 0.26) !important;
                box-shadow:
                    0 18px 40px -4px rgba(0, 0, 0, 0.8),
                    inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.45) !important;
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
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.14);
                color: rgba(235, 235, 245, 0.75);
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.2);
                transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .bridgeon-btn-action:hover {
                background: rgba(255, 255, 255, 0.16);
                border-color: rgba(255, 255, 255, 0.25);
                color: #FFFFFF;
                transform: scale(1.06);
            }

            .bridgeon-btn-action:active {
                transform: scale(0.95);
            }

            #bridgeon-update-button:hover {
                background: rgba(10, 132, 255, 0.2) !important;
                border-color: rgba(10, 132, 255, 0.42) !important;
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
            <!-- LIQUID GLASS SURFACE CAUSTIC SHEEN -->
            <div style="
                position:absolute;
                inset:0;
                pointer-events:none;
                border-radius:inherit;
                background:
                    radial-gradient(circle at 15% 10%, rgba(255,255,255,0.2) 0%, transparent 35%),
                    linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.01) 40%, transparent 60%);
            "></div>

            <!-- LIQUID AMBIENT BACKLIGHT GLOW -->
            <div style="
                position:absolute;
                bottom:-30px;
                right:-30px;
                width:130px;
                height:130px;
                border-radius:50%;
                pointer-events:none;
                background: radial-gradient(circle, rgba(90, 160, 255, 0.16) 0%, transparent 70%);
                filter: blur(28px);
            "></div>

            <!-- DYNAMIC ISLAND (MINIMIZED VIEW) -->
            <div id="bridgeon-island-view">
                <div style="position:relative; width:8px; height:8px; display:flex; align-items:center; justify-content:center;">
                    <div id="bridgeon-island-pulse" class="bridgeon-pulse-ring" style="
                        position:absolute;
                        inset:-3px;
                        border-radius:50%;
                        background:#30D158;
                    "></div>
                    <div id="bridgeon-island-dot" style="
                        position:relative;
                        width:8px;
                        height:8px;
                        border-radius:50%;
                        background:#30D158;
                        box-shadow:0 0 12px #30D158;
                    "></div>
                </div>
                <span id="bridgeon-island-label" style="color:#F5F5F7;">Attendance</span>
                <span style="font-size:10px; color:rgba(235, 235, 245, 0.5); margin-left:auto;">↗</span>
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
                        color:#F5F5F7;
                        letter-spacing:-0.015em;
                    ">
                        <div style="position:relative; width:8px; height:8px; display:flex; align-items:center; justify-content:center;">
                            <div id="bridgeon-beacon-ring" class="bridgeon-pulse-ring" style="
                                position:absolute;
                                inset:-3px;
                                border-radius:50%;
                                background:#30D158;
                            "></div>
                            <div id="bridgeon-status-dot" style="
                                position:relative;
                                width:8px;
                                height:8px;
                                border-radius:50%;
                                background:#30D158;
                                box-shadow:0 0 12px #30D158;
                            "></div>
                        </div>
                        Attendance
                    </div>

                    <!-- ACTIONS: LIQUID PILL & MINIMIZE BUTTON -->
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span style="
                            font-size:8.5px;
                            font-weight:600;
                            color:rgba(235, 235, 245, 0.65);
                            background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.03) 100%);
                            border: 1px solid rgba(255, 255, 255, 0.14);
                            box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.18);
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

                <!-- UPDATE BANNER (LIQUID NOTIFICATION STYLE) -->
                <button
                    id="bridgeon-update-button"
                    style="
                        display:none;
                        position:relative;
                        width:100%;
                        border:1px solid rgba(10, 132, 255, 0.32);
                        background: linear-gradient(135deg, rgba(10, 132, 255, 0.18) 0%, rgba(10, 132, 255, 0.08) 100%);
                        color:#0A84FF;
                        border-radius:15px;
                        padding:8px 10px;
                        margin-bottom:10px;
                        text-align:left;
                        cursor:pointer;
                        font-family:inherit;
                        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.2), 0 4px 12px rgba(10, 132, 255, 0.15);
                        backdrop-filter:blur(16px);
                        -webkit-backdrop-filter:blur(16px);
                        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                    "
                >
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                        <div>
                            <div style="font-size:9.5px; font-weight:700; color:#5AC8FA; margin-bottom:1px;">
                                Update Available
                            </div>
                            <div id="bridgeon-update-version-label" style="font-size:8.5px; color:rgba(90, 200, 250, 0.85);">
                                Version ...
                            </div>
                        </div>
                        <span style="font-size:12px; font-weight:700; color:#5AC8FA;">→</span>
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
                    <span style="font-size:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:rgba(235, 235, 245, 0.38);">Date</span>
                    <span id="bridgeon-date-label" style="
                        font-size:9px;
                        font-weight:600;
                        color:rgba(235, 235, 245, 0.72);
                        background: rgba(255,255,255,0.055);
                        border: 1px solid rgba(255,255,255,0.1);
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
                    <span id="bridgeon-status-label" style="font-size:9.5px; font-weight:500; color:rgba(235, 235, 245, 0.55);">Status</span>
                    <span id="bridgeon-status-val" style="
                        font-size:10.5px;
                        font-weight:700;
                        color:#30D158;
                        letter-spacing:-0.01em;
                    ">
                        On Time
                    </span>
                </div>

                <!-- HERO STAT TILES (LIQUID TRANSLUCENT CARDS) -->
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
                        background: linear-gradient(145deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%);
                        border: 1px solid rgba(255, 255, 255, 0.12);
                        border-radius: 16px;
                        padding: 10px 10px 9px 10px;
                        box-shadow:
                            inset 0 1px 1px rgba(255, 255, 255, 0.16),
                            0 4px 14px rgba(0, 0, 0, 0.18);
                    ">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:5px;">
                            <span style="font-size:9.5px; font-weight:500; color:rgba(235, 235, 245, 0.55);">Office</span>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(235, 235, 245, 0.45)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                        </div>
                        <div id="bridgeon-office-val" style="
                            font-size:15px;
                            font-weight:700;
                            color:#F5F5F7;
                            letter-spacing:-0.02em;
                        ">
                            0m
                        </div>
                    </div>

                    <!-- OUTSIDE TILE -->
                    <div style="
                        position:relative;
                        background: linear-gradient(145deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%);
                        border: 1px solid rgba(255, 255, 255, 0.12);
                        border-radius: 16px;
                        padding: 10px 10px 9px 10px;
                        box-shadow:
                            inset 0 1px 1px rgba(255, 255, 255, 0.16),
                            0 4px 14px rgba(0, 0, 0, 0.18);
                    ">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:5px;">
                            <span style="font-size:9.5px; font-weight:500; color:rgba(235, 235, 245, 0.55);">Outside</span>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(235, 235, 245, 0.45)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
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
                            color:#30D158;
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
                    <span style="font-size:9px; font-weight:500; color:rgba(235, 235, 245, 0.5);">Break allowance</span>
                    <span id="bridgeon-outside-left-val" style="font-size:9px; font-weight:600; color:rgba(235, 235, 245, 0.85); font-variant-numeric:tabular-nums;">
                        1h 30m left
                    </span>
                </div>

                <!-- LIQUID PROGRESS TRACK -->
                <div style="
                    position:relative;
                    width:100%;
                    height:6px;
                    background:rgba(255, 255, 255, 0.07);
                    border:1px solid rgba(255, 255, 255, 0.08);
                    border-radius:99px;
                    overflow:hidden;
                    margin-bottom:12px;
                    box-shadow:inset 0 1px 2px rgba(0, 0, 0, 0.3);
                ">
                    <div id="bridgeon-progress-bar" style="
                        width:0%;
                        height:100%;
                        background: linear-gradient(90deg, #30D158, #34C759);
                        border-radius:99px;
                        transition:width 0.4s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.3s ease;
                        box-shadow:0 0 10px rgba(48, 209, 88, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.3);
                    "></div>
                </div>

                <!-- BOTTOM LIVE ACTIVITY / LIQUID CAPSULE -->
                <div style="
                    position:relative;
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    padding-top:10px;
                    border-top:1px solid rgba(255, 255, 255, 0.08);
                ">
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <span style="font-size:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:rgba(235, 235, 245, 0.42);">
                            Activity
                        </span>
                        <span id="bridgeon-last-action" style="font-size:9px; font-weight:500; color:rgba(235, 235, 245, 0.78);">
                            --
                        </span>
                    </div>

                    <span id="bridgeon-current-status-val" style="
                        font-size:9px;
                        font-weight:700;
                        letter-spacing:0.04em;
                        text-transform:uppercase;
                        color:#30D158;
                        background: linear-gradient(145deg, rgba(48, 209, 88, 0.18) 0%, rgba(48, 209, 88, 0.08) 100%);
                        border:1px solid rgba(48, 209, 88, 0.32);
                        padding:4px 10px;
                        border-radius:999px;
                        box-shadow:0 0 14px rgba(48, 209, 88, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.2);
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
        const currentStatusColor = isInside ? '#30D158' : '#8E8E93';
        const currentStatusBackground = isInside
            ? 'linear-gradient(145deg, rgba(48, 209, 88, 0.18) 0%, rgba(48, 209, 88, 0.08) 100%)'
            : 'linear-gradient(145deg, rgba(142, 142, 147, 0.15) 0%, rgba(142, 142, 147, 0.06) 100%)';
        const currentStatusBorder = isInside ? 'rgba(48, 209, 88, 0.32)' : 'rgba(142, 142, 147, 0.22)';
        const currentStatusShadow = isInside
            ? '0 0 14px rgba(48, 209, 88, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.2)'
            : 'inset 0 1px 1px rgba(255, 255, 255, 0.1)';

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
            statusDot.style.boxShadow = isInside ? `0 0 12px ${currentStatusColor}` : 'none';
        }
        if (islandPulse) {
            islandPulse.style.background = currentStatusColor;
            islandPulse.style.animationName = isInside ? 'bridgeon-pulse' : 'none';
        }
        if (islandDot) {
            islandDot.style.background = currentStatusColor;
            islandDot.style.boxShadow = isInside ? `0 0 12px ${currentStatusColor}` : 'none';
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
            // Use rgba() for the glow instead of 8-digit hex suffix for broader compatibility
            const glowMap = { '#30D158': 'rgba(48,209,88,0.45)', '#FF9F0A': 'rgba(255,159,10,0.45)', '#FF453A': 'rgba(255,69,58,0.45)' };
            const glowColor = glowMap[data.outsideColor] || 'rgba(48,209,88,0.45)';
            progressBar.style.boxShadow = `0 0 10px ${glowColor}, inset 0 1px 1px rgba(255, 255, 255, 0.3)`;
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

        const expandedIcon = document.querySelector('[data-testid="ExpandLessIcon"]');
        const collapsedIcon = document.querySelector('[data-testid="ExpandMoreIcon"]');

        if (expandedIcon) {
            showBadge();
        } else if (collapsedIcon) {
            hideBadge();
        } else {
            const hasChips = document.querySelector('.MuiChip-label');
            if (hasChips) {
                showBadge();
            } else {
                hideBadge();
            }
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
