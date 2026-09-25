// ==UserScript==
// @name         Bridgeon Attendance
// @namespace    https://github.com/A-Rafeef/bridgeon-timer
// @version      1.0.7
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

    const CURRENT_VERSION = '1.0.7';

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

            if (num1 > num2) {
                return 1;
            }

            if (num1 < num2) {
                return -1;
            }
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
                                'version.json does not contain a valid version.'
                            );
                        }

                        return;
                    }


                    const result =
                        compareVersions(
                            latestVersion,
                            CURRENT_VERSION
                        );


                    // =================================================
                    // UPDATE AVAILABLE
                    // =================================================

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

                    }


                    // =================================================
                    // ALREADY UP TO DATE
                    // =================================================

                    else {

                        if (showMessage) {

                            alert(
                                'You are using the latest version.\n\n' +
                                `Version: v${CURRENT_VERSION}`
                            );
                        }
                    }

                }


                catch (error) {

                    console.error(
                        '[Bridgeon] Invalid version.json:',
                        error
                    );


                    if (showMessage) {

                        alert(
                            'Unable to read version.json.'
                        );
                    }
                }
            },


            // =========================================================
            // CONNECTION ERROR
            // =========================================================

            onerror: function (error) {

                console.error(
                    '[Bridgeon] Update check failed:',
                    error
                );


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


    // Automatically check GitHub
    checkForUpdate(false);


    // =========================================================
    // ATTENDANCE SETTINGS
    // =========================================================

    const OFFICE_START = 9 * 60;
    const OFFICE_END = 17 * 60;
    const MAX_OUTSIDE = 90;


    // =========================================================
    // TIME PARSER
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


    // =========================================================
    // FORMAT MINUTES
    // =========================================================

    function formatMinutes(minutes) {

        const h =
            Math.floor(minutes / 60);

        const m =
            minutes % 60;


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


            // Consecutive same action -> keep latest

            if (
                logs.length > 0 &&
                logs[logs.length - 1].type === type
            ) {

                logs[logs.length - 1] = {
                    type,
                    time
                };

            }

            else {

                logs.push({
                    type,
                    time
                });
            }

        });


        return logs;
    }


    // =========================================================
    // CALCULATE ATTENDANCE DATA
    // =========================================================

    function calculateData() {

        const logs =
            getAttendanceLogs();


        if (!logs.length) {
            return null;
        }


        let officeMinutes = 0;
        let outsideMinutes = 0;


        // =====================================================
        // OFFICE TIME
        // =====================================================

        for (
            let i = 0;
            i < logs.length - 1;
            i++
        ) {

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


        // =====================================================
        // OUTSIDE TIME
        // =====================================================

        for (
            let i = 0;
            i < logs.length - 1;
            i++
        ) {

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


        // =====================================================
        // LATE STATUS
        // =====================================================

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

            statusText =
                'On Time';

            statusColor =
                '#2563eb';

        }

        else {

            statusText =
                `Late ${firstIn - OFFICE_START}m`;

            statusColor =
                '#dc2626';
        }


        // =====================================================
        // CURRENT STATUS
        // =====================================================

        const currentStatus =
            logs[logs.length - 1].type === 'IN'
                ? 'IN'
                : 'OUT';


        const lastLog =
            logs[logs.length - 1];


        const lastAction =
            `${lastLog.type} ${lastLog.time}`;


        // =====================================================
        // OUTSIDE LIMIT
        // =====================================================

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


        let outsideColor;

        if (outsideMinutes < 60) {
            outsideColor = '#16a34a';
        }

        else if (outsideMinutes < 90) {
            outsideColor = '#d97706';
        }

        else {
            outsideColor = '#dc2626';
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
        // MINIMAL LIGHT DESIGN
        // =====================================================

        badge.style.position =
            'fixed';

        badge.style.top =
            '20px';

        badge.style.right =
            '20px';

        badge.style.width =
            '210px';

        badge.style.boxSizing =
            'border-box';

        badge.style.background =
            '#ffffff';

        badge.style.border =
            '1px solid #e5e7eb';

        badge.style.borderRadius =
            '12px';

        badge.style.padding =
            '14px';

        badge.style.zIndex =
            '999999';

        badge.style.color =
            '#111827';

        badge.style.fontFamily =
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

        badge.style.boxShadow =
            '0 4px 14px rgba(15, 23, 42, 0.08)';


        // Hidden initially

        badge.style.opacity =
            '0';

        badge.style.visibility =
            'hidden';

        badge.style.transform =
            'translateY(-8px)';

        badge.style.transition =
            'opacity .2s ease, ' +
            'transform .2s ease, ' +
            'visibility .2s ease';


        document.body.appendChild(
            badge
        );
    }


    // =========================================================
    // SHOW BADGE
    // =========================================================

    function showBadge() {

        const badge =
            document.getElementById(
                'bridgeon-badge'
            );


        if (!badge) {
            return;
        }


        badge.style.visibility =
            'visible';

        badge.style.opacity =
            '1';

        badge.style.transform =
            'translateY(0)';
    }


    // =========================================================
    // HIDE BADGE
    // =========================================================

    function hideBadge() {

        const badge =
            document.getElementById(
                'bridgeon-badge'
            );


        if (!badge) {
            return;
        }


        badge.style.opacity =
            '0';

        badge.style.transform =
            'translateY(-8px)';


        setTimeout(() => {

            badge.style.visibility =
                'hidden';

        }, 200);
    }


    // =========================================================
    // UPDATE BADGE
    // =========================================================

    function updateBadge() {

        const data =
            calculateData();


        if (!data) {
            return;
        }


        const badge =
            document.getElementById(
                'bridgeon-badge'
            );


        if (!badge) {
            return;
        }


        const isInside =
            data.currentStatus === 'IN';


        const currentStatusColor =
            isInside
                ? '#16a34a'
                : '#6b7280';


        const currentStatusBackground =
            isInside
                ? '#f0fdf4'
                : '#f3f4f6';


        badge.innerHTML = `

            <!-- HEADER -->

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
                    font-weight:700;
                    color:#111827;
                ">

                    <div style="
                        width:8px;
                        height:8px;
                        border-radius:50%;
                        background:${data.statusColor};
                    "></div>

                    Attendance

                </div>


                <span style="
                    font-size:9px;
                    font-weight:600;
                    color:#6b7280;
                    background:#f3f4f6;
                    border:1px solid #e5e7eb;
                    padding:3px 6px;
                    border-radius:5px;
                ">
                    v${CURRENT_VERSION}
                </span>

            </div>


            <!-- STATUS -->

            <div style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                margin-bottom:12px;
            ">

                <span style="
                    font-size:11px;
                    color:#6b7280;
                ">
                    Today's status
                </span>

                <span style="
                    font-size:11px;
                    font-weight:700;
                    color:${data.statusColor};
                ">
                    ${data.statusText}
                </span>

            </div>


            <!-- LAST ACTION -->

            <div style="
                font-size:10px;
                color:#9ca3af;
                margin-bottom:10px;
            ">
                Last action: ${data.lastAction}
            </div>


            <!-- STATS -->

            <div style="
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:7px;
                margin-bottom:11px;
            ">


                <!-- OFFICE -->

                <div style="
                    background:#f8fafc;
                    border:1px solid #eef0f3;
                    border-radius:8px;
                    padding:9px;
                ">

                    <div style="
                        font-size:10px;
                        color:#6b7280;
                        margin-bottom:4px;
                    ">
                        Office
                    </div>

                    <div style="
                        font-size:13px;
                        font-weight:700;
                        color:#111827;
                    ">
                        ${formatMinutes(data.officeMinutes)}
                    </div>

                </div>


                <!-- OUTSIDE -->

                <div style="
                    background:#f8fafc;
                    border:1px solid #eef0f3;
                    border-radius:8px;
                    padding:9px;
                ">

                    <div style="
                        font-size:10px;
                        color:#6b7280;
                        margin-bottom:4px;
                    ">
                        Outside
                    </div>

                    <div style="
                        font-size:13px;
                        font-weight:700;
                        color:${data.outsideColor};
                    ">
                        ${formatMinutes(data.outsideMinutes)}
                    </div>

                </div>

            </div>


            <!-- OUTSIDE PROGRESS -->

            <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                margin-bottom:6px;
            ">

                <span style="
                    font-size:10px;
                    color:#6b7280;
                ">
                    Outside limit
                </span>

                <span style="
                    font-size:10px;
                    font-weight:600;
                    color:#374151;
                ">
                    ${formatMinutes(data.remainingOutside)} left
                </span>

            </div>


            <div style="
                width:100%;
                height:5px;
                background:#e5e7eb;
                border-radius:20px;
                overflow:hidden;
                margin-bottom:12px;
            ">

                <div style="
                    width:${data.usagePercent}%;
                    height:100%;
                    background:${data.outsideColor};
                    border-radius:20px;
                    transition:width .3s ease;
                "></div>

            </div>


            <!-- CURRENT STATUS -->

            <div style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                padding-top:10px;
                border-top:1px solid #f0f0f0;
            ">

                <span style="
                    font-size:10px;
                    color:#6b7280;
                ">
                    Current status
                </span>


                <span style="
                    font-size:10px;
                    font-weight:700;
                    color:${currentStatusColor};
                    background:${currentStatusBackground};
                    padding:4px 7px;
                    border-radius:5px;
                ">
                    ${data.currentStatus}
                </span>

            </div>


            <!-- GITHUB -->

            <a
                href="https://github.com/A-Rafeef"
                target="_blank"
                rel="noopener noreferrer"
                style="
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    gap:5px;
                    margin-top:10px;
                    padding-top:9px;
                    border-top:1px solid #f0f0f0;
                    color:#6b7280;
                    text-decoration:none;
                    font-size:9px;
                    font-weight:600;
                    transition:color .2s ease;
                "
                onmouseover="this.style.color='#111827'"
                onmouseout="this.style.color='#6b7280'"
            >

                <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >

                    <path d="
                        M12 .5
                        C5.65 .5 .5 5.65 .5 12
                        c0 5.08 3.29 9.39 7.86 10.91
                        .58 .11 .79-.25 .79-.55
                        v-2.16
                        c-3.2 .7-3.87-1.36-3.87-1.36
                        -.53-1.33-1.28-1.68-1.28-1.68
                        -1.04-.71 .08-.7 .08-.7
                        1.15 .08 1.76 1.18 1.76 1.18
                        1.02 1.75 2.68 1.25 3.33 .96
                        .1-.74 .4-1.25 .73-1.54
                        -2.55-.29-5.23-1.28-5.23-5.69
                        0-1.26 .45-2.29 1.18-3.1
                        -.12-.29-.51-1.47 .11-3.06
                        0 0 .96-.31 3.15 1.18
                        a10.9 10.9 0 0 1 5.74 0
                        c2.19-1.49 3.15-1.18 3.15-1.18
                        .62 1.59 .23 2.77 .11 3.06
                        .73 .81 1.18 1.84 1.18 3.1
                        0 4.42-2.69 5.39-5.25 5.68
                        .41 .35 .78 1.04 .78 2.1
                        v3.11
                        c0 .3 .21 .66 .8 .55
                        A11.51 11.51 0 0 0 23.5 12
                        C23.5 5.65 18.35 .5 12 .5Z
                    "/>

                </svg>


                <span>
                    A-Rafeef
                </span>


                <span style="
                    font-size:8px;
                    opacity:.6;
                ">
                    ↗
                </span>

            </a>

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

        }

        else {

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
