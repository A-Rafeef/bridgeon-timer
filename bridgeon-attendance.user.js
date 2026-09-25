// ==UserScript==
// @name         Bridgeon Attendance
// @namespace    https://github.com/A-Rafeef/bridgeon-timer
// @version      1.0.9
// @description  Bridgeon attendance visualization tool
// @match        https://student.bridgeon.in/attendance
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
    // VERSION / UPDATE SYSTEM
    // =========================================================

    const CURRENT_VERSION =
        (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '1.0.9';

    const VERSION_URL =
        'https://raw.githubusercontent.com/A-Rafeef/bridgeon-timer/main/version.json';

    const SCRIPT_URL =
        'https://raw.githubusercontent.com/A-Rafeef/bridgeon-timer/main/bridgeon-attendance.user.js';

    let latestVersion = null;
    let updateAvailable = false;
    let updateMenuRegistered = false;

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
    const MAX_OUTSIDE = 90;       // 90 minutes

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

    function getAttendanceLogs() {
        const chips = document.querySelectorAll('.MuiChip-label');
        const logs = [];

        chips.forEach(el => {
            const text = (el.innerText || el.textContent || '').trim();
            const match = text.match(LOG_REGEX);
            if (!match) return;

            const type = match[1].toUpperCase();
            const time = match[2].trim();

            if (logs.length > 0 && logs[logs.length - 1].type === type) {
                // If consecutive punch of the same type:
                // For OUT, keep the latest punch time
                // For IN, preserve the earliest arrival time
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
    // CALCULATE ATTENDANCE DATA (WITH REAL-TIME TRACKING)
    // =========================================================

    function calculateData() {
        const logs = getAttendanceLogs();

        if (!logs.length) {
            return null;
        }

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        let officeMinutes = 0;
        let outsideMinutes = 0;

        // Completed IN -> OUT office sessions
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

        // Completed OUT -> IN outside sessions
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

        // Real-time tracking: active session up to current time
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
            statusColor = '#65e6a4';
        } else {
            statusText = `Late ${firstIn - OFFICE_START}m`;
            statusColor = '#ff7f96';
        }

        const lastAction = `${lastLog.type} ${lastLog.time}`;

        // OUTSIDE LIMIT & PROGRESS
        const remainingOutside = Math.max(0, MAX_OUTSIDE - outsideMinutes);
        const usagePercent = Math.min(100, (outsideMinutes / MAX_OUTSIDE) * 100);

        let outsideColor;
        if (outsideMinutes < 60) {
            outsideColor = '#65e6a4';
        } else if (outsideMinutes < 90) {
            outsideColor = '#f0c66b';
        } else {
            outsideColor = '#ff7f96';
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
            outsideColor
        };
    }

    // =========================================================
    // GLASS THEME
    // =========================================================

    const GLASS = {
        background: 'rgba(10, 14, 22, 0.58)',
        card: 'rgba(255, 255, 255, 0.035)',
        border: 'rgba(255, 255, 255, 0.09)',
        text: '#d7dde7',
        textMuted: '#8490a3',
        textDim: '#657184',
        accent: '#78a9ff',
        blur: 'blur(18px) saturate(135%)',
        shadow: '0 16px 40px rgba(0, 0, 0, 0.28)'
    };

    // =========================================================
    // CREATE BADGE DOM (ONCE)
    // =========================================================

    function createBadge() {
        if (document.getElementById('bridgeon-badge')) {
            return;
        }

        // Inject helper CSS for transitions and buttons
        if (!document.getElementById('bridgeon-styles')) {
            const style = document.createElement('style');
            style.id = 'bridgeon-styles';
            style.textContent = `
                #bridgeon-update-button:hover {
                    background: rgba(77, 128, 220, 0.13) !important;
                    border-color: rgba(120, 169, 255, 0.28) !important;
                    transform: translateY(-1px) !important;
                }
            `;
            document.head.appendChild(style);
        }

        const badge = document.createElement('div');
        badge.id = 'bridgeon-badge';

        Object.assign(badge.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            width: '220px',
            boxSizing: 'border-box',
            padding: '13px',
            zIndex: '999999',
            color: GLASS.text,
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            background: GLASS.background,
            border: `1px solid ${GLASS.border}`,
            borderRadius: '16px',
            backdropFilter: GLASS.blur,
            webkitBackdropFilter: GLASS.blur,
            boxShadow: GLASS.shadow,
            overflow: 'hidden',
            opacity: '0',
            visibility: 'hidden',
            transform: 'translateY(-8px) scale(.98)',
            transition: 'opacity .22s ease, transform .22s ease, visibility .22s ease'
        });

        badge.innerHTML = `
            <!-- GLASS HIGHLIGHT -->
            <div style="
                position:absolute;
                inset:0;
                pointer-events:none;
                border-radius:inherit;
                background: linear-gradient(135deg, rgba(255,255,255,.045), transparent 42%);
            "></div>

            <!-- HEADER -->
            <div style="
                position:relative;
                display:flex;
                align-items:center;
                justify-content:space-between;
                margin-bottom:11px;
            ">
                <div style="
                    display:flex;
                    align-items:center;
                    gap:7px;
                    font-size:12px;
                    font-weight:700;
                    color:#dce2eb;
                ">
                    <div id="bridgeon-status-dot" style="
                        width:7px;
                        height:7px;
                        border-radius:50%;
                        background:#65e6a4;
                        box-shadow: 0 0 8px #65e6a4;
                    "></div>
                    Attendance
                </div>

                <span style="
                    font-size:8px;
                    font-weight:600;
                    color:#7f8b9d;
                    background:rgba(255,255,255,.035);
                    border:1px solid rgba(255,255,255,.075);
                    padding:3px 6px;
                    border-radius:6px;
                    backdrop-filter:blur(8px);
                ">
                    v${CURRENT_VERSION}
                </span>
            </div>

            <!-- UPDATE BUTTON -->
            <button
                id="bridgeon-update-button"
                style="
                    display:none;
                    position:relative;
                    width:100%;
                    border:1px solid rgba(120,169,255,.18);
                    background:rgba(77,128,220,.075);
                    color:#87b2ff;
                    border-radius:11px;
                    padding:9px 10px;
                    margin-bottom:10px;
                    text-align:left;
                    cursor:pointer;
                    font-family:inherit;
                    backdrop-filter:blur(12px);
                    -webkit-backdrop-filter:blur(12px);
                    transition: background .2s ease, border-color .2s ease, transform .2s ease;
                "
            >
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <div>
                        <div style="font-size:9px; font-weight:700; margin-bottom:2px; color:#8db6ff;">
                            New update available
                        </div>
                        <div id="bridgeon-update-version-label" style="font-size:8px; color:#718fbd;">
                            Version ...
                        </div>
                    </div>
                    <span style="font-size:14px; font-weight:600; color:#82acff; opacity:.8;">→</span>
                </div>
            </button>

            <!-- STATUS -->
            <div style="
                position:relative;
                display:flex;
                align-items:center;
                justify-content:space-between;
                margin-bottom:10px;
            ">
                <span style="font-size:9px; color:${GLASS.textMuted};">Today's status</span>
                <span id="bridgeon-status-val" style="font-size:10px; font-weight:700; color:#65e6a4;">On Time</span>
            </div>

            <!-- LAST ACTION -->
            <div id="bridgeon-last-action" style="
                position:relative;
                font-size:8px;
                color:${GLASS.textDim};
                margin-bottom:9px;
            ">
                Last action · --
            </div>

            <!-- STATS -->
            <div style="
                position:relative;
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:6px;
                margin-bottom:10px;
            ">
                <!-- OFFICE -->
                <div style="
                    background:${GLASS.card};
                    border:1px solid rgba(255,255,255,.065);
                    border-radius:10px;
                    padding:9px;
                    backdrop-filter:blur(10px);
                    -webkit-backdrop-filter:blur(10px);
                ">
                    <div style="font-size:8px; color:${GLASS.textMuted}; margin-bottom:4px;">Office</div>
                    <div id="bridgeon-office-val" style="font-size:12px; font-weight:700; color:#cdd5e0;">0m</div>
                </div>

                <!-- OUTSIDE -->
                <div style="
                    background:${GLASS.card};
                    border:1px solid rgba(255,255,255,.065);
                    border-radius:10px;
                    padding:9px;
                    backdrop-filter:blur(10px);
                    -webkit-backdrop-filter:blur(10px);
                ">
                    <div style="font-size:8px; color:${GLASS.textMuted}; margin-bottom:4px;">Outside</div>
                    <div id="bridgeon-outside-val" style="font-size:12px; font-weight:700; color:#65e6a4;">0m</div>
                </div>
            </div>

            <!-- OUTSIDE LIMIT -->
            <div style="
                position:relative;
                display:flex;
                justify-content:space-between;
                align-items:center;
                margin-bottom:6px;
            ">
                <span style="font-size:8px; color:${GLASS.textMuted};">Outside limit</span>
                <span id="bridgeon-outside-left-val" style="font-size:8px; font-weight:600; color:#9aa5b5;">1h 30m left</span>
            </div>

            <!-- PROGRESS -->
            <div style="
                position:relative;
                width:100%;
                height:4px;
                background:rgba(255,255,255,.055);
                border-radius:20px;
                overflow:hidden;
                margin-bottom:11px;
            ">
                <div id="bridgeon-progress-bar" style="
                    width:0%;
                    height:100%;
                    background:#65e6a4;
                    border-radius:20px;
                    transition:width .3s ease;
                    box-shadow: 0 0 8px #65e6a4;
                "></div>
            </div>

            <!-- CURRENT STATUS -->
            <div style="
                position:relative;
                display:flex;
                align-items:center;
                justify-content:space-between;
                padding-top:9px;
                border-top:1px solid rgba(255,255,255,.065);
            ">
                <span style="font-size:8px; color:${GLASS.textMuted};">Current status</span>
                <span id="bridgeon-current-status-val" style="
                    font-size:8px;
                    font-weight:700;
                    color:#65e6a4;
                    background:rgba(101,230,164,.08);
                    border:1px solid rgba(255,255,255,.045);
                    padding:4px 7px;
                    border-radius:6px;
                    backdrop-filter:blur(8px);
                ">
                    --
                </span>
            </div>
        `;

        document.body.appendChild(badge);

        const updateBtn = document.getElementById('bridgeon-update-button');
        if (updateBtn) {
            updateBtn.onclick = installUpdate;
        }
    }

    // =========================================================
    // SHOW / HIDE BADGE
    // =========================================================

    function showBadge() {
        const badge = document.getElementById('bridgeon-badge');
        if (!badge) return;
        badge.style.visibility = 'visible';
        badge.style.opacity = '1';
        badge.style.transform = 'translateY(0) scale(1)';
    }

    function hideBadge() {
        const badge = document.getElementById('bridgeon-badge');
        if (!badge) return;
        badge.style.opacity = '0';
        badge.style.transform = 'translateY(-8px) scale(.98)';
        setTimeout(() => {
            badge.style.visibility = 'hidden';
        }, 220);
    }

    // =========================================================
    // UPDATE BADGE CONTENT (HIGH PERFORMANCE, NO INNERHTML CHURN)
    // =========================================================

    function updateBadge() {
        createBadge();

        // Update banner display
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
        const currentStatusColor = isInside ? '#65e6a4' : '#8d98aa';
        const currentStatusBackground = isInside ? 'rgba(101,230,164,.08)' : 'rgba(141,152,170,.07)';

        const statusDot = document.getElementById('bridgeon-status-dot');
        const statusVal = document.getElementById('bridgeon-status-val');
        const lastActionEl = document.getElementById('bridgeon-last-action');
        const officeVal = document.getElementById('bridgeon-office-val');
        const outsideVal = document.getElementById('bridgeon-outside-val');
        const outsideLeftVal = document.getElementById('bridgeon-outside-left-val');
        const progressBar = document.getElementById('bridgeon-progress-bar');
        const currentStatusVal = document.getElementById('bridgeon-current-status-val');

        if (statusDot) {
            statusDot.style.background = data.statusColor;
            statusDot.style.boxShadow = `0 0 8px ${data.statusColor}`;
        }
        if (statusVal) {
            statusVal.textContent = data.statusText;
            statusVal.style.color = data.statusColor;
        }
        if (lastActionEl) {
            lastActionEl.textContent = `Last action · ${data.lastAction}`;
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
            progressBar.style.boxShadow = `0 0 8px ${data.outsideColor}`;
        }
        if (currentStatusVal) {
            currentStatusVal.textContent = data.currentStatus;
            currentStatusVal.style.color = currentStatusColor;
            currentStatusVal.style.background = currentStatusBackground;
        }
    }

    // =========================================================
    // VISIBILITY HANDLING
    // =========================================================

    function handleVisibility() {
        const expandedIcon = document.querySelector('[data-testid="ExpandLessIcon"]');
        const collapsedIcon = document.querySelector('[data-testid="ExpandMoreIcon"]');

        if (expandedIcon) {
            showBadge();
        } else if (collapsedIcon) {
            hideBadge();
        } else {
            // Fallback: If neither accordion icon is detected, show badge whenever attendance chips exist
            const hasChips = document.querySelector('.MuiChip-label');
            if (hasChips) {
                showBadge();
            }
        }
    }

    // =========================================================
    // INITIALIZATION & REAL-TIME TICKER
    // =========================================================

    createBadge();
    updateBadge();
    handleVisibility();

    // Live real-time tick every 1000ms
    setInterval(() => {
        updateBadge();
        handleVisibility();
    }, 1000);

})();
