// ==UserScript==
// @name         Bridgeon Attendance
// @namespace    https://github.com/A-Rafeef/bridgeon-timer
// @version      1.2.0
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
        (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '1.2.0';

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
                width: 284px;
                box-sizing: border-box;
                padding: 15px 15px 14px 15px;
                z-index: 999999;
                color: #1C1C1E;
                text-shadow: none;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif;
                
                /* APPLE VISIONOS SPATIAL GLASS MATERIAL */
                background:
                    radial-gradient(120% 120% at 20% 0%, rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0.12) 60%, transparent 100%),
                    linear-gradient(135deg, rgba(255, 255, 255, 0.55) 0%, rgba(245, 248, 255, 0.35) 100%);
                border: 1.5px solid rgba(255, 255, 255, 0.85);
                border-radius: 28px;
                backdrop-filter: blur(45px) saturate(190%) brightness(102%);
                -webkit-backdrop-filter: blur(45px) saturate(190%) brightness(102%);

                /* SPATIAL SPECULAR REFRACTION & SOFT AMBIENT GLOW */
                box-shadow:
                    0 20px 50px -10px rgba(0, 0, 0, 0.12),
                    0 6px 18px -2px rgba(0, 0, 0, 0.05),
                    inset 0 1.5px 2px 0 #FFFFFF,
                    inset 0 -1.5px 1.5px 0 rgba(255, 255, 255, 0.5),
                    inset 1.5px 0 1.5px 0 rgba(255, 255, 255, 0.6),
                    inset -1.5px 0 1.5px 0 rgba(255, 255, 255, 0.6);
                
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
                    0 24px 60px -10px rgba(0, 0, 0, 0.15),
                    0 8px 22px -2px rgba(0, 0, 0, 0.07),
                    inset 0 1.5px 2px 0 #FFFFFF,
                    inset 0 -1.5px 1.5px 0 rgba(255, 255, 255, 0.6);
            }

            #bridgeon-badge.bridgeon-visible {
                opacity: 1 !important;
                visibility: visible !important;
                transform: translateY(0) scale(1) !important;
            }

            /* VISIONOS DYNAMIC ISLAND (MINIMIZED STATE) */
            #bridgeon-badge.bridgeon-minimized {
                width: auto !important;
                min-width: 152px;
                padding: 7px 14px !important;
                border-radius: 999px !important;
                cursor: pointer;
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.75) 0%, rgba(246, 248, 252, 0.65) 100%) !important;
                border: 1.5px solid rgba(255, 255, 255, 0.9) !important;
                box-shadow:
                    0 8px 24px -2px rgba(0, 0, 0, 0.08),
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
                background: rgba(255, 255, 255, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.75);
                color: #3A3A3C;
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                box-shadow: inset 0 1px 1px #FFFFFF, 0 2px 6px rgba(0, 0, 0, 0.04);
                transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .bridgeon-btn-action:hover {
                background: rgba(255, 255, 255, 0.85);
                border-color: #FFFFFF;
                color: #1C1C1E;
                transform: scale(1.06);
            }

            .bridgeon-btn-action:active {
                transform: scale(0.95);
            }

            #bridgeon-discussions-bar:hover {
                background: rgba(255, 255, 255, 0.85) !important;
                border-color: #FFFFFF !important;
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06), inset 0 1px 1px #FFFFFF !important;
                transform: translateY(-1px);
            }

            #bridgeon-update-button:hover {
                background: rgba(0, 122, 255, 0.16) !important;
                border-color: rgba(0, 122, 255, 0.4) !important;
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

            <!-- DYNAMIC ISLAND (MINIMIZED VIEW) -->
            <div id="bridgeon-island-view">
                <div style="position:relative; width:8px; height:8px; display:flex; align-items:center; justify-content:center;">
                    <div id="bridgeon-island-pulse" class="bridgeon-pulse-ring" style="
                        position:absolute;
                        inset:-3px;
                        border-radius:50%;
                        background:#10B981;
                    "></div>
                    <div id="bridgeon-island-dot" style="
                        position:relative;
                        width:8px;
                        height:8px;
                        border-radius:50%;
                        background:#10B981;
                        box-shadow:0 0 8px rgba(16, 185, 129, 0.5);
                    "></div>
                </div>
                <span id="bridgeon-island-label" style="color:#1C1C1E; font-weight:600;">Attendance</span>
                <span style="font-size:10px; color:#8E8E93; margin-left:auto;">↗</span>
            </div>

            <!-- FULL WIDGET VIEW (VISIONOS SPATIAL GLASS) -->
            <div id="bridgeon-full-view">

                <!-- TOP ROW: STATUS CAPSULE, ON TIME CHIP, MINIMIZE BUTTON -->
                <div style="
                    position:relative;
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:6px;
                ">
                    <!-- GLOWING STATUS CAPSULE -->
                    <div id="bridgeon-status-capsule" style="
                        display:inline-flex;
                        align-items:center;
                        gap:7px;
                        padding:6px 13px 6px 9px;
                        border-radius:999px;
                        background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                        box-shadow: 0 0 16px rgba(16, 185, 129, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.35);
                        transition: all 0.3s ease;
                    ">
                        <div style="position:relative; width:8px; height:8px; display:flex; align-items:center; justify-content:center;">
                            <div id="bridgeon-beacon-ring" class="bridgeon-pulse-ring" style="
                                position:absolute;
                                inset:-3px;
                                border-radius:50%;
                                background:#FFFFFF;
                            "></div>
                            <div id="bridgeon-status-dot" style="
                                position:relative;
                                width:8px;
                                height:8px;
                                border-radius:50%;
                                background:#FFFFFF;
                                box-shadow:0 0 8px #FFFFFF;
                            "></div>
                        </div>
                        <span id="bridgeon-header-punch" style="
                            font-size:10px;
                            font-weight:800;
                            letter-spacing:0.04em;
                            text-transform:uppercase;
                            color:#FFFFFF;
                        ">
                            PUNCHED IN
                        </span>
                    </div>

                    <!-- ON TIME GLASS PILL -->
                    <div id="bridgeon-header-ontime" style="
                        display:inline-flex;
                        align-items:center;
                        padding:6px 13px;
                        border-radius:999px;
                        background: rgba(255, 255, 255, 0.5);
                        border: 1px solid rgba(255, 255, 255, 0.75);
                        box-shadow: inset 0 1px 1px #FFFFFF;
                        font-size:10.5px;
                        font-weight:600;
                        color:#1C1C1E;
                    ">
                        On Time
                    </div>

                    <!-- CIRCULAR GLASS MINIMIZE BUTTON -->
                    <button id="bridgeon-minimize-btn" class="bridgeon-btn-action" title="Minimize" style="
                        width:26px;
                        height:26px;
                        font-size:13px;
                        line-height:1;
                        margin-left:auto;
                    ">
                        −
                    </button>
                </div>

                <!-- UPDATE BANNER (SHOWN ONLY WHEN NEW SCRIPT VERSION IS AVAILABLE) -->
                <button
                    id="bridgeon-update-button"
                    style="
                        display:none;
                        position:relative;
                        width:100%;
                        border:1px solid rgba(0, 122, 255, 0.22);
                        background: linear-gradient(135deg, rgba(0, 122, 255, 0.08) 0%, rgba(0, 122, 255, 0.03) 100%);
                        color:#007AFF;
                        border-radius:14px;
                        padding:7px 9px;
                        margin-top:8px;
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
                            <div id="bridgeon-update-version-label" style="font-size:8px; color:rgba(0, 122, 255, 0.8);">
                                Version ...
                            </div>
                        </div>
                        <span style="font-size:11px; font-weight:700; color:#007AFF;">→</span>
                    </div>
                </button>

                <!-- CENTER ROW: TWIN FLOATING FROSTED GLASS BUBBLES -->
                <div style="
                    position:relative;
                    display:grid;
                    grid-template-columns:1fr 1.15fr;
                    gap:9px;
                    margin:12px 0 12px 0;
                ">
                    <!-- LEFT CARD: OFFICE -->
                    <div style="
                        position:relative;
                        background: rgba(255, 255, 255, 0.88);
                        border: 1px solid rgba(255, 255, 255, 0.95);
                        border-radius: 20px;
                        padding: 12px 10px 10px 10px;
                        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04), inset 0 1.5px 1px #FFFFFF;
                        display:flex;
                        flex-direction:column;
                        align-items:center;
                        justify-content:center;
                    ">
                        <div style="display:flex; align-items:center; gap:5px;">
                            <span style="font-size:14px; line-height:1;">🏢</span>
                            <span id="bridgeon-office-val" style="
                                font-size:18px;
                                font-weight:800;
                                color:#1C1C1E;
                                letter-spacing:-0.02em;
                            ">0m</span>
                        </div>
                        <span style="
                            font-size:10px;
                            font-weight:600;
                            color:#636366;
                            margin-top:4px;
                        ">Office Time</span>
                    </div>

                    <!-- RIGHT CARD: BREAK & CIRCULAR MICRO-GAUGE -->
                    <div style="
                        position:relative;
                        background: rgba(255, 255, 255, 0.88);
                        border: 1px solid rgba(255, 255, 255, 0.95);
                        border-radius: 20px;
                        padding: 10px 8px 9px 11px;
                        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04), inset 0 1.5px 1px #FFFFFF;
                        display:flex;
                        align-items:center;
                        justify-content:space-between;
                    ">
                        <div>
                            <div style="display:flex; align-items:center; gap:5px;">
                                <span style="font-size:13px; line-height:1;">☕</span>
                                <span id="bridgeon-outside-val" style="
                                    font-size:18px;
                                    font-weight:800;
                                    color:#1C1C1E;
                                    letter-spacing:-0.02em;
                                ">0m</span>
                            </div>
                            <span style="
                                font-size:10px;
                                font-weight:600;
                                color:#636366;
                                display:block;
                                margin-top:4px;
                            ">Break</span>
                        </div>

                        <!-- CIRCULAR MICRO-RING GAUGE -->
                        <div style="position:relative; width:44px; height:44px; display:flex; align-items:center; justify-content:center;">
                            <svg width="44" height="44" viewBox="0 0 44 44" style="transform: rotate(-90deg);">
                                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(0, 0, 0, 0.06)" stroke-width="3"></circle>
                                <circle id="bridgeon-ring-progress" cx="22" cy="22" r="18" fill="none" stroke="#10B981" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="113.1" stroke-dashoffset="113.1" style="transition: stroke-dashoffset 0.4s ease, stroke 0.3s ease;"></circle>
                            </svg>
                            <div style="
                                position:absolute;
                                inset:0;
                                display:flex;
                                flex-direction:column;
                                align-items:center;
                                justify-content:center;
                                text-align:center;
                                line-height:1.05;
                                pointer-events:none;
                            ">
                                <span id="bridgeon-outside-left-val" style="
                                    font-size:8px;
                                    font-weight:800;
                                    color:#1C1C1E;
                                    letter-spacing:-0.02em;
                                ">1h 30m</span>
                                <span style="
                                    font-size:7px;
                                    font-weight:600;
                                    color:#8E8E93;
                                ">left</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- BOTTOM ROW: DEDICATED SPATIAL GLASS DISCUSSIONS PILL -->
                <a
                    id="bridgeon-discussions-bar"
                    href="https://github.com/A-Rafeef/bridgeon-timer/discussions"
                    target="_blank"
                    rel="noopener noreferrer"
                    onclick="event.stopPropagation();"
                    title="Open GitHub Discussions to share ideas or feedback"
                    style="
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        gap:7px;
                        width:100%;
                        box-sizing:border-box;
                        padding:9px 14px;
                        background: rgba(255, 255, 255, 0.52);
                        border: 1.2px solid rgba(255, 255, 255, 0.85);
                        border-radius: 999px;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03), inset 0 1px 1px #FFFFFF;
                        text-decoration:none;
                        color:#1C1C1E;
                        cursor:pointer;
                        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                    "
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        <circle cx="8" cy="10" r="0.8" fill="currentColor"></circle>
                        <circle cx="12" cy="10" r="0.8" fill="currentColor"></circle>
                        <circle cx="16" cy="10" r="0.8" fill="currentColor"></circle>
                    </svg>
                    <span style="font-size:10px; font-weight:600; letter-spacing:-0.01em;">
                        Join GitHub Discussions →
                    </span>
                </a>

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
        const statusCapsule = document.getElementById('bridgeon-status-capsule');
        const beaconRing = document.getElementById('bridgeon-beacon-ring');
        const statusDot = document.getElementById('bridgeon-status-dot');
        const headerPunch = document.getElementById('bridgeon-header-punch');
        const headerOntime = document.getElementById('bridgeon-header-ontime');
        const islandPulse = document.getElementById('bridgeon-island-pulse');
        const islandDot = document.getElementById('bridgeon-island-dot');
        const islandLabel = document.getElementById('bridgeon-island-label');

        const officeVal = document.getElementById('bridgeon-office-val');
        const outsideVal = document.getElementById('bridgeon-outside-val');
        const outsideLeftVal = document.getElementById('bridgeon-outside-left-val');
        const ringProgress = document.getElementById('bridgeon-ring-progress');

        // Status Capsule & Punch state
        if (statusCapsule) {
            if (isInside) {
                statusCapsule.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
                statusCapsule.style.boxShadow = '0 0 16px rgba(16, 185, 129, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.35)';
            } else {
                statusCapsule.style.background = 'linear-gradient(135deg, #8E8E93 0%, #636366 100%)';
                statusCapsule.style.boxShadow = 'inset 0 1px 1px rgba(255, 255, 255, 0.35)';
            }
        }
        if (headerPunch) {
            headerPunch.textContent = isInside ? 'PUNCHED IN' : 'PUNCHED OUT';
        }
        if (headerOntime) {
            headerOntime.textContent = data.statusText;
            headerOntime.style.color = data.statusColor === '#34C759' ? '#059669' : data.statusColor;
        }

        // Beacon updates — pulse ring only animates when user is currently IN
        if (beaconRing) {
            beaconRing.style.animationName = isInside ? 'bridgeon-pulse' : 'none';
        }
        if (islandPulse) {
            islandPulse.style.background = currentStatusColor;
            islandPulse.style.animationName = isInside ? 'bridgeon-pulse' : 'none';
        }
        if (islandDot) {
            islandDot.style.background = currentStatusColor;
            islandDot.style.boxShadow = isInside ? '0 0 8px rgba(16, 185, 129, 0.5)' : 'none';
        }
        if (islandLabel) {
            islandLabel.textContent = `${data.currentStatus} · ${formatMinutes(isInside ? data.officeMinutes : data.outsideMinutes)}`;
        }

        // Floating glass bubbles updates
        if (officeVal) {
            officeVal.textContent = formatMinutes(data.officeMinutes);
        }
        if (outsideVal) {
            outsideVal.textContent = formatMinutes(data.outsideMinutes);
        }
        if (outsideLeftVal) {
            outsideLeftVal.textContent = formatMinutes(data.remainingOutside);
        }

        // Circular Micro-Ring Gauge (Circumference of r=18 is 113.1)
        if (ringProgress) {
            const circumference = 113.1;
            const percentUsed = Math.min(100, Math.max(0, data.usagePercent));
            const offset = circumference - (circumference * percentUsed / 100);
            ringProgress.style.strokeDashoffset = offset;
            ringProgress.style.stroke = data.outsideColor;
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
