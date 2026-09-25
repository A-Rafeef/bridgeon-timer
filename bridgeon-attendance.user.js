// ==UserScript==
// @name         Bridgeon Attendance
// @namespace    https://github.com/A-Rafeef/bridgeon-timer
// @version      1.0.1
// @description  Bridgeon attendance visualization tool
// @match        https://student.bridgeon.in/attendance
// @updateURL    https://raw.githubusercontent.com/A-Rafeef/bridgeon-timer/main/bridgeon-attendance.user.js
// @downloadURL  https://raw.githubusercontent.com/A-Rafeef/bridgeon-timer/main/bridgeon-attendance.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const OFFICE_START = 9 * 60; // 09:00 AM
    const OFFICE_END = 17 * 60; // 05:00 PM
    const MAX_OUTSIDE = 90; // 90 minutes

    function parseTime(timeString) {
        const [time, period] = timeString.trim().split(' ');
        let [hours, minutes] = time.split(':').map(Number);

        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;

        return hours * 60 + minutes;
    }

    function formatMinutes(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;

        if (h > 0 && m > 0) return `${h}h ${m}m`;
        if (h > 0) return `${h}h`;
        return `${m}m`;
    }

    function getAttendanceLogs() {

        const rawLogs = [...document.querySelectorAll('.MuiChip-label')]
            .map(el => el.innerText.trim());

        const logs = [];

        rawLogs.forEach(log => {

            const type = log.startsWith('In -') ? 'IN' : 'OUT';

            const time = log
                .replace('In - ', '')
                .replace('Out - ', '')
                .trim();

            // Consecutive same action -> keep only latest one
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

    function calculateData() {

        const logs = getAttendanceLogs();

        if (!logs.length) return null;

        let officeMinutes = 0;
        let outsideMinutes = 0;

        // Office Time
        for (let i = 0; i < logs.length - 1; i++) {

            if (
                logs[i].type === 'IN' &&
                logs[i + 1].type === 'OUT'
            ) {

                let start = parseTime(logs[i].time);
                let end = parseTime(logs[i + 1].time);

                start = Math.max(start, OFFICE_START);
                end = Math.min(end, OFFICE_END);

                if (end > start) {
                    officeMinutes += end - start;
                }
            }
        }

        // Outside Time
        for (let i = 0; i < logs.length - 1; i++) {

            if (
                logs[i].type === 'OUT' &&
                logs[i + 1].type === 'IN'
            ) {

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

        // Late Status
        const firstInLog = logs.find(log => log.type === 'IN');

        const firstIn = firstInLog
            ? parseTime(firstInLog.time)
            : OFFICE_START;

        let statusText;
        let statusColor;

        if (firstIn <= OFFICE_START) {
            statusText = "On Time";
            statusColor = "#16a34a";
        } else {
            statusText = `Late ${firstIn - OFFICE_START}m`;
            statusColor = "#d97706";
        }

        const currentStatus =
            logs.length &&
            logs[logs.length - 1].type === 'IN'
                ? 'IN'
                : 'OUT';

        const lastLog = logs[logs.length - 1];

        const lastAction =
            `${lastLog.type} ${lastLog.time}`;

        const remainingOutside =
            Math.max(0, MAX_OUTSIDE - outsideMinutes);

        const usagePercent =
            Math.min(100, (outsideMinutes / MAX_OUTSIDE) * 100);

        const outsideColor =
            outsideMinutes < 60
                ? "#16a34a"
                : outsideMinutes < 90
                    ? "#d97706"
                    : "#dc2626";

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

    function createBadge() {

        if (document.getElementById('bridgeon-badge')) return;

        const badge = document.createElement('div');

        badge.id = 'bridgeon-badge';

        badge.style.position = 'fixed';
        badge.style.top = '18px';
        badge.style.right = '18px';
        badge.style.width = '165px';

        // LIGHT THEME
        badge.style.background = '#ffffff';
        badge.style.border = '1px solid #e2e8f0';
        badge.style.borderRadius = '18px';
        badge.style.padding = '12px';
        badge.style.zIndex = '999999';

        badge.style.color = '#172033';
        badge.style.fontFamily = 'Inter, sans-serif';

        badge.style.boxShadow =
            '0 8px 25px rgba(15, 23, 42, 0.12)';

        // Hidden initially
        badge.style.opacity = '0';
        badge.style.visibility = 'hidden';
        badge.style.transform =
            'translateY(-20px) scale(.95)';

        badge.style.transition =
            'opacity .35s ease, transform .35s ease, visibility .35s ease';

        document.body.appendChild(badge);
    }

    function showBadge() {

        const badge =
            document.getElementById('bridgeon-badge');

        badge.style.visibility = 'visible';
        badge.style.opacity = '1';
        badge.style.transform =
            'translateY(0) scale(1)';
    }

    function hideBadge() {

        const badge =
            document.getElementById('bridgeon-badge');

        badge.style.opacity = '0';
        badge.style.transform =
            'translateY(-20px) scale(.95)';

        setTimeout(() => {
            badge.style.visibility = 'hidden';
        }, 350);
    }

    function updateBadge() {

        const data = calculateData();

        if (!data) return;

        const badge =
            document.getElementById('bridgeon-badge');

        badge.innerHTML = `

            <!-- STATUS -->
            <div style="
                display:flex;
                align-items:center;
                gap:6px;
                margin-bottom:8px;
                font-size:12px;
                font-weight:700;
                color:${data.statusColor};
            ">

                <div style="
                    width:9px;
                    height:9px;
                    border-radius:50%;
                    background:${data.statusColor};
                "></div>

                ${data.statusText}

            </div>


            <!-- LAST ACTION -->
            <div style="
                font-size:11px;
                color:#64748b;
                margin-bottom:10px;
            ">
                ${data.lastAction}
            </div>


            <!-- OFFICE TIME -->
            <div style="
                display:flex;
                justify-content:space-between;
                margin-bottom:6px;
                color:#334155;
                font-size:12px;
            ">
                <span>🏢</span>

                <b style="color:#172033;">
                    ${formatMinutes(data.officeMinutes)}
                </b>
            </div>


            <!-- OUTSIDE TIME -->
            <div style="
                display:flex;
                justify-content:space-between;
                margin-bottom:6px;
                color:#334155;
                font-size:12px;
            ">
                <span>🚶</span>

                <b style="color:${data.outsideColor}">
                    ${formatMinutes(data.outsideMinutes)}
                </b>
            </div>


            <!-- PROGRESS BAR -->
            <div style="
                width:100%;
                height:5px;
                background:#e2e8f0;
                border-radius:50px;
                overflow:hidden;
                margin:8px 0;
            ">

                <div style="
                    width:${data.usagePercent}%;
                    height:100%;
                    background:${data.outsideColor};
                    transition:.3s;
                "></div>

            </div>


            <!-- REMAINING -->
            <div style="
                font-size:11px;
                color:#64748b;
                margin-bottom:8px;
            ">
                ${formatMinutes(data.remainingOutside)} left
            </div>


            <!-- CURRENT STATUS -->
            <div style="
                border-top:1px solid #e2e8f0;
                padding-top:8px;
                display:flex;
                justify-content:space-between;
                font-size:11px;
                color:#64748b;
            ">

                <span>Status</span>

                <b style="color:#172033;">
                    ${data.currentStatus}
                </b>

            </div>
        `;
    }

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

    createBadge();

    setInterval(() => {
        updateBadge();
        handleVisibility();
    }, 1000);

})();
