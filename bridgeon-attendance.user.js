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

    let latestVersion = null;
    let updateAvailable = false;


    // =========================================================
    // VERSION COMPARISON
    // =========================================================

    function compareVersions(v1, v2) {

        const a = v1.split('.').map(Number);
        const b = v2.split('.').map(Number);

        const length =
            Math.max(a.length, b.length);

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

            url:
                VERSION_URL +
                '?t=' +
                Date.now(),

            onload: function (response) {

                if (response.status !== 200) {

                    console.error(
                        '[Bridgeon] GitHub returned:',
                        response.status
                    );

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
                        JSON.parse(
                            response.responseText
                        );

                    const version =
                        String(
                            data.version || ''
                        ).trim();


                    if (!version) {

                        console.error(
                            '[Bridgeon] Invalid version.json'
                        );

                        if (showMessage) {

                            alert(
                                'version.json does not contain a valid version.'
                            );
                        }

                        return;
                    }


                    latestVersion =
                        version;


                    const result =
                        compareVersions(
                            latestVersion,
                            CURRENT_VERSION
                        );


                    // =================================================
                    // UPDATE AVAILABLE
                    // =================================================

                    if (result > 0) {

                        updateAvailable = true;


                        GM_registerMenuCommand(
                            `🆕 Update available: v${latestVersion}`,
                            installUpdate
                        );


                        updateBadge();


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

                        updateAvailable = false;

                        updateBadge();


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


    // =========================================================
    // INITIAL UPDATE CHECK
    // =========================================================

    checkForUpdate(false);


    // =========================================================
    // ATTENDANCE SETTINGS
    // =========================================================

    const OFFICE_START =
        9 * 60;

    const OFFICE_END =
        17 * 60;

    const MAX_OUTSIDE =
        90;


    // =========================================================
    // TIME PARSER
    // =========================================================

    function parseTime(timeString) {

        const [time, period] =
            timeString
                .trim()
                .split(' ');

        let [hours, minutes] =
            time
                .split(':')
                .map(Number);


        if (
            period === 'PM' &&
            hours !== 12
        ) {

            hours += 12;
        }


        if (
            period === 'AM' &&
            hours === 12
        ) {

            hours = 0;
        }


        return (
            hours * 60 +
            minutes
        );
    }


    // =========================================================
    // FORMAT MINUTES
    // =========================================================

    function formatMinutes(minutes) {

        const h =
            Math.floor(
                minutes / 60
            );

        const m =
            minutes % 60;


        if (
            h > 0 &&
            m > 0
        ) {

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
            [
                ...document.querySelectorAll(
                    '.MuiChip-label'
                )
            ]
                .map(
                    el =>
                        el.innerText.trim()
                );


        const logs = [];


        rawLogs.forEach(log => {

            const type =
                log.startsWith('In - ')
                    ? 'IN'
                    : 'OUT';


            const time =
                log
                    .replace(
                        'In - ',
                        ''
                    )
                    .replace(
                        'Out - ',
                        ''
                    )
                    .trim();


            // Consecutive same action
            // -> keep latest

            if (
                logs.length > 0 &&
                logs[
                    logs.length - 1
                ].type === type
            ) {

                logs[
                    logs.length - 1
                ] = {

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
                    parseTime(
                        logs[i].time
                    );


                let end =
                    parseTime(
                        logs[i + 1].time
                    );


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
                    parseTime(
                        logs[i].time
                    );


                let nextIn =
                    parseTime(
                        logs[i + 1].time
                    );


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


                if (
                    nextIn > out
                ) {

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
                log =>
                    log.type === 'IN'
            );


        const firstIn =
            firstInLog
                ? parseTime(
                    firstInLog.time
                )
                : OFFICE_START;


        let statusText;

        let statusColor;


        if (
            firstIn <= OFFICE_START
        ) {

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
            logs[
                logs.length - 1
            ].type === 'IN'
                ? 'IN'
                : 'OUT';


        const lastLog =
            logs[
                logs.length - 1
            ];


        const lastAction =
            `${lastLog.type} ${lastLog.time}`;


        // =====================================================
        // OUTSIDE LIMIT
        // =====================================================

        const remainingOutside =
            Math.max(
                0,
                MAX_OUTSIDE -
                outsideMinutes
            );


        const usagePercent =
            Math.min(
                100,
                (
                    outsideMinutes /
                    MAX_OUTSIDE
                ) * 100
            );


        let outsideColor;


        if (
            outsideMinutes < 60
        ) {

            outsideColor =
                '#16a34a';

        }

        else if (
            outsideMinutes < 90
        ) {

            outsideColor =
                '#d97706';

        }

        else {

            outsideColor =
                '#dc2626';
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
            document.createElement(
                'div'
            );


        badge.id =
            'bridgeon-badge';


        // =====================================================
        // MINIMAL GLASSMORPHISM DESIGN
        // =====================================================

        badge.style.position =
            'fixed';

        badge.style.top =
            '20px';

        badge.style.right =
            '20px';

        badge.style.width =
            '215px';

        badge.style.boxSizing =
            'border-box';

        badge.style.background =
            'rgba(255, 255, 255, 0.72)';

        badge.style.border =
            '1px solid rgba(255, 255, 255, 0.75)';

        badge.style.borderRadius =
            '14px';

        badge.style.padding =
            '14px';

        badge.style.zIndex =
            '999999';

        badge.style.color =
            '#111827';

        badge.style.fontFamily =
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

        badge.style.backdropFilter =
            'blur(16px)';

        badge.style.webkitBackdropFilter =
            'blur(16px)';

        badge.style.boxShadow =
            '0 8px 24px rgba(15, 23, 42, 0.08)';


        // Hidden initially

        badge.style.opacity =
            '0';

        badge.style.visibility =
            'hidden';

        badge.style.transform =
            'translateY(-5px)';

        badge.style.transition =
            'opacity .18s ease, ' +
            'transform .18s ease, ' +
            'visibility .18s ease';


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
            'translateY(-5px)';


        setTimeout(() => {

            badge.style.visibility =
                'hidden';

        }, 180);
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
                ? 'rgba(240,253,244,0.75)'
                : 'rgba(243,244,246,0.75)';


        badge.innerHTML = `

            <!-- =========================================
                 HEADER
            ========================================== -->

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
                        width:7px;
                        height:7px;
                        border-radius:50%;
                        background:${data.statusColor};
                    "></div>

                    Attendance

                </div>


                <span style="
                    font-size:9px;
                    font-weight:600;
                    color:#64748b;
                    background:rgba(241,245,249,0.65);
                    border:1px solid rgba(148,163,184,0.15);
                    padding:3px 6px;
                    border-radius:5px;
                ">
                    v${CURRENT_VERSION}
                </span>

            </div>


            <!-- =========================================
                 UPDATE AVAILABLE
            ========================================== -->

            ${
                updateAvailable
                    ? `

                    <button
                        id="bridgeon-update-button"
                        style="
                            width:100%;
                            border:1px solid rgba(59,130,246,0.22);
                            background:rgba(239,246,255,0.65);
                            color:#1d4ed8;
                            border-radius:8px;
                            padding:9px 10px;
                            margin-bottom:11px;
                            text-align:left;
                            cursor:pointer;
                            font-family:inherit;
                            backdrop-filter:blur(8px);
                            -webkit-backdrop-filter:blur(8px);
                            transition:
                                background .15s ease,
                                border-color .15s ease;
                        "
                    >

                        <div style="
                            display:flex;
                            align-items:center;
                            justify-content:space-between;
                            gap:8px;
                        ">

                            <div>

                                <div style="
                                    font-size:10px;
                                    font-weight:700;
                                    margin-bottom:2px;
                                ">
                                    🆕 Update available
                                </div>

                                <div style="
                                    font-size:9px;
                                    color:#3b82f6;
                                ">
                                    New version v${latestVersion}
                                </div>

                            </div>


                            <span style="
                                font-size:14px;
                                font-weight:700;
                            ">
                                →
                            </span>

                        </div>

                    </button>

                    `
                    : ''
            }


            <!-- =========================================
                 STATUS
            ========================================== -->

            <div style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                margin-bottom:12px;
            ">

                <span style="
                    font-size:11px;
                    color:#64748b;
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


            <!-- =========================================
                 LAST ACTION
            ========================================== -->

            <div style="
                font-size:10px;
                color:#94a3b8;
                margin-bottom:10px;
            ">
                Last action: ${data.lastAction}
            </div>


            <!-- =========================================
                 STATS
            ========================================== -->

            <div style="
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:7px;
                margin-bottom:11px;
            ">


                <!-- OFFICE -->

                <div style="
                    background:rgba(248,250,252,0.55);
                    border:1px solid rgba(148,163,184,0.12);
                    border-radius:9px;
                    padding:9px;
                ">

                    <div style="
                        font-size:10px;
                        color:#64748b;
                        margin-bottom:4px;
                    ">
                        Office
                    </div>

                    <div style="
                        font-size:13px;
                        font-weight:700;
                        color:#111827;
                    ">
                        ${formatMinutes(
                            data.officeMinutes
                        )}
                    </div>

                </div>


                <!-- OUTSIDE -->

                <div style="
                    background:rgba(248,250,252,0.55);
                    border:1px solid rgba(148,163,184,0.12);
                    border-radius:9px;
                    padding:9px;
                ">

                    <div style="
                        font-size:10px;
                        color:#64748b;
                        margin-bottom:4px;
                    ">
                        Outside
                    </div>

                    <div style="
                        font-size:13px;
                        font-weight:700;
                        color:${data.outsideColor};
                    ">
                        ${formatMinutes(
                            data.outsideMinutes
                        )}
                    </div>

                </div>

            </div>


            <!-- =========================================
                 OUTSIDE LIMIT
            ========================================== -->

            <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                margin-bottom:6px;
            ">

                <span style="
                    font-size:10px;
                    color:#64748b;
                ">
                    Outside limit
                </span>

                <span style="
                    font-size:10px;
                    font-weight:600;
                    color:#374151;
                ">
                    ${formatMinutes(
                        data.remainingOutside
                    )} left
                </span>

            </div>


            <!-- =========================================
                 PROGRESS
            ========================================== -->

            <div style="
                width:100%;
                height:5px;
                background:rgba(226,232,240,0.7);
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


            <!-- =========================================
                 CURRENT STATUS
            ========================================== -->

            <div style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                padding-top:10px;
                border-top:1px solid rgba(148,163,184,0.16);
            ">

                <span style="
                    font-size:10px;
                    color:#64748b;
                ">
                    Current status
                </span>


                <span style="
                    font-size:10px;
                    font-weight:700;
                    color:${currentStatusColor};
                    background:${currentStatusBackground};
                    padding:4px 7px;
                    border-radius:6px;
                ">
                    ${data.currentStatus}
                </span>

            </div>

        `;


        // =====================================================
        // UPDATE BUTTON EVENT
        // =====================================================

        const updateButton =
            document.getElementById(
                'bridgeon-update-button'
            );


        if (updateButton) {

            updateButton.onclick =
                function () {

                    installUpdate();
                };


            updateButton.onmouseenter =
                function () {

                    this.style.background =
                        'rgba(219,234,254,0.8)';

                    this.style.borderColor =
                        'rgba(59,130,246,0.35)';
                };


            updateButton.onmouseleave =
                function () {

                    this.style.background =
                        'rgba(239,246,255,0.65)';

                    this.style.borderColor =
                        'rgba(59,130,246,0.22)';
                };
        }
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


    // Initial badge update
    updateBadge();


    // =========================================================
    // LIVE UPDATE
    // =========================================================

    setInterval(() => {

        updateBadge();

        handleVisibility();

    }, 1000);


})();
