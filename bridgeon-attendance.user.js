```javascript
// ==UserScript==
// @name         Bridgeon Attendance
// @namespace    https://github.com/A-Rafeef/bridgeon-timer
// @version      1.0.4
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

    const CURRENT_VERSION = '1.0.3';

    const VERSION_URL =
        'https://raw.githubusercontent.com/A-Rafeef/bridgeon-timer/main/version.json';

    const SCRIPT_URL =
        'https://raw.githubusercontent.com/A-Rafeef/bridgeon-timer/main/bridgeon-attendance.user.js';


    function compareVersions(v1, v2) {

        const a = v1.split('.').map(Number);
        const b = v2.split('.').map(Number);

        const length = Math.max(a.length, b.length);

        for (let i = 0; i < length; i++) {

            const num1 = a[i] || 0;
            const num2 = b[i] || 0;

            if (num1 > num2) return 1;
            if (num1 < num2) return -1;
        }

        return 0;
    }


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


    function checkForUpdate(showMessage = false) {

        GM_xmlhttpRequest({

            method: 'GET',

            url: VERSION_URL + '?t=' + Date.now(),

            onload: function (response) {

                if (response.status !== 200) {

                    if (showMessage) {
                        alert(
                            'Unable to check for updates.\n\n' +
                            'GitHub HTTP status: ' +
                            response.status
                        );
                    }

                    return;
                }


                try {

                    const data =
                        JSON.parse(response.responseText);

                    const latestVersion =
                        String(data.version || '').trim();


                    if (!latestVersion) {

                        if (showMessage) {
                            alert(
                                'Invalid version.json'
                            );
                        }

                        return;
                    }


                    const result =
                        compareVersions(
                            latestVersion,
                            CURRENT_VERSION
                        );


                    if (result > 0) {

                        GM_registerMenuCommand(
                            `🆕 Update available: v${latestVersion}`,
                            installUpdate
                        );


                        if (showMessage) {

                            const update =
                                confirm(
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

                        if (showMessage) {

                            alert(
                                'You are already using the latest version.\n\n' +
                                `Version: v${CURRENT_VERSION}`
                            );
                        }
                    }

                } catch (error) {

                    console.error(
                        '[Bridgeon] Invalid version.json',
                        error
                    );

                    if (showMessage) {
                        alert(
                            'Could not read version.json'
                        );
                    }
                }
            },


            onerror: function () {

                if (showMessage) {

                    alert(
                        'Could not connect to GitHub.'
                    );
                }
            }

        });
    }


    GM_registerMenuCommand(
        '🔄 Check for Updates',
        function () {
            checkForUpdate(true);
        }
    );


    checkForUpdate(false);


    // =========================================================
    // ATTENDANCE SETTINGS
    // =========================================================

    const OFFICE_START = 9 * 60;
    const OFFICE_END = 17 * 60;
    const MAX_OUTSIDE = 90;


    // =========================================================
    // TIME
    // =========================================================

    function parseTime(timeString) {

        const [time, period] =
            timeString.trim().split(' ');

        let [hours, minutes] =
            time.split(':').map(Number);

        if (period === 'PM' && hours !== 12) {
            hours += 12;
        }

        if (period === 'AM' && hours === 12) {
            hours = 0;
        }

        return hours * 60 + minutes;
    }


    function formatMinutes(minutes) {

        const h = Math.floor(minutes / 60);
        const m = minutes % 60;

        if (h > 0 && m > 0) {
            return `${h}h ${m}m`;
        }

        if (h > 0) {
            return `${h}h`;
        }

        return `${m}m`;
    }


    // =========================================================
    // ATTENDANCE LOGS
    // =========================================================

    function getAttendanceLogs() {

        const rawLogs =
            [...document.querySelectorAll('.MuiChip-label')]
                .map(el => el.innerText.trim());

        const logs = [];


        rawLogs.forEach(log => {

            const type =
                log.startsWith('In - ')
                    ? 'IN'
                    : 'OUT';


            const time =
                log
                    .replace('In - ', '')
                    .replace('Out - ', '')
                    .trim();


            if (
                logs.length > 0 &&
                logs[logs.length - 1].type === type
            ) {

                logs[logs.length - 1] = {
                    type,
                    time
                };

            } else {

                logs.push({
                    type,
                    time
                });
            }

        });


        return logs;
    }


    // =========================================================
    // CALCULATE DATA
    // =========================================================

    function calculateData() {

        const logs = getAttendanceLogs();

        if (!logs.length) {
            return null;
        }


        let officeMinutes = 0;
        let outsideMinutes = 0;


        // Office time

        for (let i = 0; i < logs.length - 1; i++) {

            if (
                logs[i].type === 'IN' &&
                logs[i + 1].type === 'OUT'
            ) {

                let start =
                    parseTime(logs[i].time);

                let end =
                    parseTime(logs[i + 1].time);


                start =
                    Math.max(
                        start,
                        OFFICE_START
                    );

                end =
                    Math.min(
                        end,
                        OFFICE_END
                    );


                if (end > start) {

                    officeMinutes +=
                        end - start;
                }
            }
        }


        // Outside time

        for (let i = 0; i < logs.length - 1; i++) {

            if (
                logs[i].type === 'OUT' &&
                logs[i + 1].type === 'IN'
            ) {

                let out =
                    parseTime(logs[i].time);

                let nextIn =
                    parseTime(logs[i + 1].time);


                if (
                    out >= OFFICE_END ||
                    nextIn <= OFFICE_START
                ) {
                    continue;
                }


                out =
                    Math.max(
                        out,
                        OFFICE_START
                    );

                nextIn =
                    Math.min(
                        nextIn,
                        OFFICE_END
                    );


                if (nextIn > out) {

                    outsideMinutes +=
                        nextIn - out;
                }
            }
        }


        // Late status

        const firstInLog =
            logs.find(
                log => log.type === 'IN'
            );


        const firstIn =
            firstInLog
                ? parseTime(firstInLog.time)
                : OFFICE_START;


        let statusText;
        let statusColor;


        if (firstIn <= OFFICE_START) {

            statusText = 'On Time';

            // TEST COLOR
            statusColor = '#38bdf8';

        } else {

            statusText =
                `Late ${firstIn - OFFICE_START}m`;

            // TEST COLOR
            statusColor = '#fb7185';
        }


        const currentStatus =
            logs[logs.length - 1].type === 'IN'
                ? 'IN'
                : 'OUT';


        const lastLog =
            logs[logs.length - 1];


        const lastAction =
            `${lastLog.type} ${lastLog.time}`;


        const remainingOutside =
            Math.max(
                0,
                MAX_OUTSIDE - outsideMinutes
            );


        const usagePercent =
            Math.min(
                100,
                (outsideMinutes / MAX_OUTSIDE) * 100
            );


        // TEST COLORS

        const outsideColor =
            outsideMinutes < 60
                ? '#34d399'
                : outsideMinutes < 90
                    ? '#fbbf24'
                    : '#f87171';


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
    // CREATE BADGE
    // =========================================================

    function createBadge() {

        if (
            document.getElementById(
                'bridgeon-badge'
            )
        ) {
            return;
        }


        const badge =
            document.createElement('div');


        badge.id =
            'bridgeon-badge';


        // =====================================================
        // TEST NEW APPEARANCE
        // =====================================================

        badge.style.position = 'fixed';
        badge.style.top = '20px';
        badge.style.right = '20px';

        badge.style.width = '190px';

        badge.style.background =
            'linear-gradient(145deg, #111827, #1e293b)';

        badge.style.border =
            '1px solid rgba(56,189,248,.35)';

        badge.style.borderRadius =
            '22px';

        badge.style.padding =
            '15px';

        badge.style.zIndex =
            '999999';

        badge.style.color =
            '#f8fafc';

        badge.style.fontFamily =
            'Inter, system-ui, sans-serif';

        badge.style.boxShadow =
            '0 12px 35px rgba(0,0,0,.35)';

        badge.style.backdropFilter =
            'blur(12px)';


        // Hidden initially

        badge.style.opacity = '0';

        badge.style.visibility =
            'hidden';

        badge.style.transform =
            'translateY(-25px) scale(.92)';

        badge.style.transition =
            'opacity .35s ease, ' +
            'transform .35s ease, ' +
            'visibility .35s ease';


        document.body.appendChild(
            badge
        );
    }


    function showBadge() {

        const badge =
            document.getElementById(
                'bridgeon-badge'
            );


        if (!badge) return;


        badge.style.visibility =
            'visible';

        badge.style.opacity =
            '1';

        badge.style.transform =
            'translateY(0) scale(1)';
    }


    function hideBadge() {

        const badge =
            document.getElementById(
                'bridgeon-badge'
            );


        if (!badge) return;


        badge.style.opacity =
            '0';

        badge.style.transform =
            'translateY(-25px) scale(.92)';


        setTimeout(() => {

            badge.style.visibility =
                'hidden';

        }, 350);
    }


    // =========================================================
    // UPDATE BADGE
    // =========================================================

    function updateBadge() {

        const data =
            calculateData();


        if (!data) return;


        const badge =
            document.getElementById(
                'bridgeon-badge'
            );


        if (!badge) return;


        badge.innerHTML = `

            <div style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                margin-bottom:12px;
            ">

                <div style="
                    display:flex;
                    align-items:center;
                    gap:7px;
                    font-size:13px;
                    font-weight:800;
                    color:${data.statusColor};
                ">

                    <div style="
                        width:9px;
                        height:9px;
                        border-radius:50%;
                        background:${data.statusColor};
                        box-shadow:0 0 10px ${data.statusColor};
                    "></div>

                    ${data.statusText}

                </div>

                <span style="
                    font-size:9px;
                    padding:3px 6px;
                    border-radius:6px;
                    background:rgba(56,189,248,.12);
                    color:#38bdf8;
                    font-weight:700;
                ">
                    v${CURRENT_VERSION}
                </span>

            </div>


            <div style="
                font-size:10px;
                color:#94a3b8;
                margin-bottom:13px;
            ">

                ${data.lastAction}

            </div>


            <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                padding:8px 9px;
                margin-bottom:7px;
                border-radius:10px;
                background:rgba(255,255,255,.05);
            ">

                <span style="
                    font-size:11px;
                    color:#94a3b8;
                ">
                    🏢 Office
                </span>

                <b style="
                    font-size:12px;
                    color:#f8fafc;
                ">
                    ${formatMinutes(
                        data.officeMinutes
                    )}
                </b>

            </div>


            <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                padding:8px 9px;
                margin-bottom:10px;
                border-radius:10px;
                background:rgba(255,255,255,.05);
            ">

                <span style="
                    font-size:11px;
                    color:#94a3b8;
                ">
                    🚶 Outside
                </span>

                <b style="
                    font-size:12px;
                    color:${data.outsideColor};
                ">
                    ${formatMinutes(
                        data.outsideMinutes
                    )}
                </b>

            </div>


            <div style="
                width:100%;
                height:6px;
                background:#334155;
                border-radius:50px;
                overflow:hidden;
                margin:9px 0;
            ">

                <div style="
                    width:${data.usagePercent}%;
                    height:100%;
                    background:${data.outsideColor};
                    border-radius:50px;
                    box-shadow:0 0 8px ${data.outsideColor};
                    transition:.3s;
                "></div>

            </div>


            <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                font-size:10px;
                color:#94a3b8;
                margin-bottom:10px;
            ">

                <span>
                    Outside limit
                </span>

                <b style="
                    color:#e2e8f0;
                ">
                    ${formatMinutes(
                        data.remainingOutside
                    )} left
                </b>

            </div>


            <div style="
                border-top:1px solid rgba(255,255,255,.08);
                padding-top:10px;
                display:flex;
                justify-content:space-between;
                align-items:center;
                font-size:10px;
            ">

                <span style="
                    color:#64748b;
                ">
                    Current status
                </span>

                <span style="
                    padding:4px 8px;
                    border-radius:7px;
                    background:${data.currentStatus === 'IN'
                        ? 'rgba(52,211,153,.12)'
                        : 'rgba(248,113,113,.12)'};
                    color:${data.currentStatus === 'IN'
                        ? '#34d399'
                        : '#f87171'};
                    font-weight:800;
                ">
                    ${data.currentStatus}
                </span>

            </div>

        `;
    }


    // =========================================================
    // VISIBILITY
    // =========================================================

    function handleVisibility() {

        const expandedIcon =
            document.querySelector(
                '[data-testid="ExpandLessIcon"]'
            );


        if (expandedIcon) {

            showBadge();

        } else {

            hideBadge();
        }
    }


    // =========================================================
    // START
    // =========================================================

    createBadge();


    setInterval(() => {

        updateBadge();

        handleVisibility();

    }, 1000);

})();
```
