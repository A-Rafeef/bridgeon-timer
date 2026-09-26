// ==UserScript==
// @name         Bridgeon Attendance
// @namespace    https://github.com/A-Rafeef/bridgeon-timer
// @version      1.3.0
// @description  Bridgeon attendance visualization widget featuring modern glassmorphism, customizable themes, compact mode, and release notes
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
        const path = window.location.pathname.replace(/\/+$/, '');
        const hash = window.location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
        return path === '/attendance' || hash === 'attendance';
    }

    // =========================================================
    // VERSION / UPDATE SYSTEM
    // =========================================================

    const CURRENT_VERSION =
        (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '1.3.0';

    const VERSION_URL =
        'https://raw.githubusercontent.com/A-Rafeef/bridgeon-timer/main/version.json';

    const SCRIPT_URL =
        'https://raw.githubusercontent.com/A-Rafeef/bridgeon-timer/main/bridgeon-attendance.user.js';

    let latestVersion = null;
    let updateAvailable = false;
    let updateMenuRegistered = false;

    // View state
    let isMinimized = false;
    let isSettingsOpen = false;

    // =========================================================
    // FIRST-TIME WHAT'S NEW SYSTEM
    // =========================================================

    const WHATS_NEW_KEY = 'bridgeon_whats_new_seen_v';

    function hasSeenWhatsNew() {
        try {
            return localStorage.getItem(WHATS_NEW_KEY) === CURRENT_VERSION;
        } catch (e) {
            return false;
        }
    }

    function markWhatsNewSeen() {
        try {
            localStorage.setItem(WHATS_NEW_KEY, CURRENT_VERSION);
        } catch (e) {}
    }

    // =========================================================
    // USER SETTINGS & PERSISTENCE
    // =========================================================

    const SETTINGS_KEY = 'bridgeon_attendance_settings_v2';

    const DEFAULT_SETTINGS = {
        theme: 'dark',          // 'dark' | 'light'
        accentColor: '#10B981', // Green
        cardOpacity: 90,        // 90%
        compactMode: false      // Show minimized pill by default
    };

    function loadSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return { ...DEFAULT_SETTINGS };
            return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
        } catch (e) {
            return { ...DEFAULT_SETTINGS };
        }
    }

    let userSettings = loadSettings();
    if (userSettings.compactMode) {
        isMinimized = true;
    }

    function saveSettings(newSettings) {
        userSettings = { ...userSettings, ...newSettings };
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(userSettings));
        } catch (e) {
            console.error('[Bridgeon] Could not save settings', e);
        }
        applyThemeAndStyles();
    }

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

    function installUpdate() {
        GM_openInTab(
            SCRIPT_URL + '?update=' + Date.now(),
            { active: true, insert: true, setParent: true }
        );
    }

    function checkForUpdate(showMessage = false) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: VERSION_URL + '?t=' + Date.now(),
            onload: function (response) {
                if (response.status !== 200) {
                    if (showMessage) alert('Unable to check for updates. HTTP: ' + response.status);
                    return;
                }
                try {
                    const data = JSON.parse(response.responseText);
                    const version = String(data.version || '').trim();
                    if (!version) return;

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
                            if (confirm(`Bridgeon Attendance Update\n\nCurrent: v${CURRENT_VERSION}\nLatest: v${latestVersion}\n\nUpdate now?`)) {
                                installUpdate();
                            }
                        }
                    } else {
                        updateAvailable = false;
                        updateBadge();
                        if (showMessage) {
                            alert(`You are using the latest version.\n\nVersion: v${CURRENT_VERSION}`);
                        }
                    }
                } catch (e) {
                    console.error('[Bridgeon] Invalid version.json:', e);
                }
            },
            onerror: function (error) {
                console.error('[Bridgeon] Update check failed:', error);
            }
        });
    }

    GM_registerMenuCommand('🔄 Check for Updates', () => checkForUpdate(true));
    checkForUpdate(false);

    // =========================================================
    // ATTENDANCE CALCULATION LOGIC
    // =========================================================

    const OFFICE_START = 9 * 60; // 9:00 AM
    const OFFICE_END = 17 * 60;   // 5:00 PM
    const MAX_OUTSIDE = 90;       // 90 minutes allowance

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

    function formatMinutes(minutes) {
        const safeMinutes = Math.max(0, Math.round(minutes || 0));
        const h = Math.floor(safeMinutes / 60);
        const m = safeMinutes % 60;

        if (h > 0 && m > 0) return `${h}h ${m}m`;
        if (h > 0) return `${h}h`;
        return `${m}m`;
    }

    const LOG_REGEX = /^(in|out)\s*-\s*(\d{1,2}:\d{2}\s*(?:am|pm))$/i;

    function getActiveSection() {
        return document.querySelector('.MuiCollapse-root:not(.MuiCollapse-hidden)') || null;
    }

    function getActiveDateLabel() {
        const expandedRow = document.querySelector('tr:has(.MuiCollapse-root:not(.MuiCollapse-hidden))');
        const triggerRow = expandedRow ? expandedRow.previousElementSibling : null;
        if (!triggerRow) return null;

        const firstCell = triggerRow.querySelector('td, th');
        if (!firstCell) return null;

        return firstCell.innerText.trim();
    }

    function isDateToday(dateText) {
        if (!dateText) return false;
        const now = new Date();
        const clean = dateText.trim().toLowerCase();

        const shortMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const fullMonths  = ['january', 'february', 'march', 'april', 'may', 'june',
                             'july', 'august', 'september', 'october', 'november', 'december'];

        const curDay = now.getDate();
        const curMon = now.getMonth();
        const curMonShort = shortMonths[curMon];
        const curMonFull  = fullMonths[curMon];

        const dayRegex = new RegExp(`\\b0?${curDay}\\b`);
        if (!dayRegex.test(clean)) return false;

        return clean.includes(curMonShort) || clean.includes(curMonFull);
    }

    function getAttendanceLogs() {
        const activeSection = getActiveSection();
        const rawElements = activeSection
            ? [...activeSection.querySelectorAll('.MuiChip-label')]
            : [...document.querySelectorAll('.MuiChip-label')];

        const rawLogs = rawElements
            .map(el => el.innerText.trim())
            .filter(t => LOG_REGEX.test(t));

        const logs = [];

        rawLogs.forEach(log => {
            const match = log.match(LOG_REGEX);
            if (!match) return;

            const type = match[1].toUpperCase();
            const time = match[2].toUpperCase().replace(/\s+/g, ' ');

            if (logs.length > 0 && logs[logs.length - 1].type === type) {
                logs[logs.length - 1] = { type, time };
            } else {
                logs.push({ type, time });
            }
        });

        return logs;
    }

    function calculateData() {
        const logs = getAttendanceLogs();
        if (logs.length === 0) return null;

        const activeDate = getActiveDateLabel();
        const activeIsToday = isDateToday(activeDate);

        let officeMinutes = 0;
        let outsideMinutes = 0;

        for (let i = 0; i < logs.length; i++) {
            const current = logs[i];
            const next = logs[i + 1];

            const currentMinutes = parseTime(current.time);
            let nextMinutes;

            if (next) {
                nextMinutes = parseTime(next.time);
            } else {
                if (activeIsToday) {
                    const now = new Date();
                    nextMinutes = now.getHours() * 60 + now.getMinutes();
                } else {
                    nextMinutes = currentMinutes;
                }
            }

            const diff = Math.max(0, nextMinutes - currentMinutes);

            if (current.type === 'IN') {
                officeMinutes += diff;
            } else {
                // Only calculate break between 9:00 AM (OFFICE_START) and 5:00 PM (OFFICE_END)
                const breakStart = Math.max(currentMinutes, OFFICE_START);
                const breakEnd = Math.min(nextMinutes, OFFICE_END);
                if (breakEnd > breakStart) {
                    outsideMinutes += (breakEnd - breakStart);
                }
            }
        }

        const firstIn = parseTime(logs[0].time);
        const lastLog = logs[logs.length - 1];
        const currentStatus = lastLog.type;

        let statusText;
        let statusColor;

        if (firstIn <= OFFICE_START) {
            statusText = 'On Time';
            statusColor = userSettings.accentColor || '#10B981';
        } else {
            const lateM = firstIn - OFFICE_START;
            statusText = `Late ${lateM}m`;
            statusColor = '#F59E0B';
        }

        const lastAction = `${lastLog.type} ${lastLog.time}`;
        const remainingOutside = Math.max(0, MAX_OUTSIDE - outsideMinutes);
        const usagePercent = Math.min(100, (outsideMinutes / MAX_OUTSIDE) * 100);

        let outsideColor;
        if (outsideMinutes < 60) {
            outsideColor = '#10B981';
        } else if (outsideMinutes < 90) {
            outsideColor = '#F59E0B';
        } else {
            outsideColor = '#EF4444';
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
    // INJECT ADVANCED STYLES & DYNAMIC VARIABLES
    // =========================================================

    function injectStyles() {
        if (document.getElementById('bridgeon-v2-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'bridgeon-v2-styles';
        style.textContent = `
            :root {
                --bridgeon-accent: #10B981;
                --bridgeon-opacity: 0.90;
                --bridgeon-bg: rgba(6, 17, 36, var(--bridgeon-opacity));
                --bridgeon-card-bg: rgba(14, 28, 54, 0.65);
                --bridgeon-text-primary: #FFFFFF;
                --bridgeon-text-secondary: #94A3B8;
                --bridgeon-border: rgba(255, 255, 255, 0.12);
                --bridgeon-glow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.1);
            }

            [data-bridgeon-theme="light"] {
                --bridgeon-bg: rgba(255, 255, 255, var(--bridgeon-opacity));
                --bridgeon-card-bg: rgba(241, 245, 249, 0.85);
                --bridgeon-text-primary: #0F172A;
                --bridgeon-text-secondary: #64748B;
                --bridgeon-border: rgba(0, 0, 0, 0.08);
                --bridgeon-glow: 0 16px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06);
            }

            #bridgeon-badge {
                position: fixed;
                top: 18px;
                right: 18px;
                width: 275px;
                box-sizing: border-box;
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, sans-serif;
                user-select: none;
                opacity: 0;
                visibility: hidden;
                transform: translateY(-20px) scale(0.92);
                transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                            transform 0.35s cubic-bezier(0.34, 1.3, 0.64, 1),
                            width 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                            visibility 0.35s;
            }

            #bridgeon-badge.bridgeon-visible {
                opacity: 1 !important;
                visibility: visible !important;
                transform: translateY(0) scale(1) !important;
            }

            /* Main Card Container */
            .bridgeon-glass-card {
                background: var(--bridgeon-bg);
                backdrop-filter: blur(24px) saturate(180%);
                -webkit-backdrop-filter: blur(24px) saturate(180%);
                border: 1px solid var(--bridgeon-border);
                border-radius: 24px;
                padding: 16px 18px;
                box-shadow: var(--bridgeon-glow);
                color: var(--bridgeon-text-primary);
                max-height: calc(100vh - 36px);
                overflow-y: auto;
                overflow-x: hidden;
                scrollbar-width: thin;
                scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
                transition: background 0.3s ease,
                            border 0.3s ease,
                            box-shadow 0.3s ease,
                            opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                            transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .bridgeon-glass-card::-webkit-scrollbar {
                width: 4px;
            }
            .bridgeon-glass-card::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 999px;
            }

            /* Top Header */
            .bridgeon-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 14px;
            }

            .bridgeon-status-group {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .bridgeon-beacon-wrapper {
                position: relative;
                width: 14px;
                height: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .bridgeon-beacon-pulse {
                position: absolute;
                inset: -5px;
                border-radius: 50%;
                background: var(--bridgeon-accent);
                opacity: 0.6;
                animation: bridgeon-radiate 2.8s cubic-bezier(0.2, 0.8, 0.4, 1) infinite;
                pointer-events: none;
            }

            .bridgeon-beacon-pulse-delayed {
                animation-delay: 1.4s !important;
            }

            .bridgeon-beacon-dot {
                position: relative;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: var(--bridgeon-accent);
                box-shadow: 0 0 12px var(--bridgeon-accent);
                transition: background 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            }

            @keyframes bridgeon-radiate {
                0% { transform: scale(0.85); opacity: 0.85; }
                50% { opacity: 0.3; }
                100% { transform: scale(2.2); opacity: 0; }
            }

            .bridgeon-status-info {
                display: flex;
                flex-direction: column;
            }

            .bridgeon-status-title {
                font-size: 15px;
                font-weight: 700;
                color: var(--bridgeon-accent);
                letter-spacing: -0.01em;
                line-height: 1.2;
                transition: color 0.3s ease;
            }

            .bridgeon-status-sub {
                font-size: 11.5px;
                font-weight: 500;
                color: var(--bridgeon-text-secondary);
                margin-top: 1px;
            }

            .bridgeon-icon-btn {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.12);
                color: var(--bridgeon-text-secondary);
                width: 28px;
                height: 28px;
                border-radius: 50%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1),
                            background 0.22s ease,
                            color 0.22s ease,
                            border-color 0.22s ease,
                            box-shadow 0.25s ease;
                font-size: 13px;
                outline: none;
                padding: 0;
            }

            [data-bridgeon-theme="light"] .bridgeon-icon-btn {
                background: rgba(0, 0, 0, 0.05);
                border-color: rgba(0, 0, 0, 0.08);
            }

            .bridgeon-icon-btn:hover {
                background: rgba(255, 255, 255, 0.2);
                color: var(--bridgeon-text-primary);
                transform: scale(1.15);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
            }

            #bridgeon-settings-btn:hover {
                transform: scale(1.15) rotate(45deg);
            }

            .bridgeon-icon-btn:active {
                transform: scale(0.9);
                transition-duration: 0.1s;
            }

            /* Dual Metric Tiles */
            .bridgeon-tiles-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin-bottom: 14px;
            }

            .bridgeon-tile {
                background: var(--bridgeon-card-bg);
                border: 1px solid var(--bridgeon-border);
                border-radius: 14px;
                padding: 10px 12px;
                display: flex;
                align-items: center;
                gap: 10px;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
                transition: transform 0.32s cubic-bezier(0.34, 1.4, 0.64, 1),
                            border-color 0.3s ease,
                            box-shadow 0.32s cubic-bezier(0.34, 1.4, 0.64, 1);
            }

            .bridgeon-tile:hover {
                transform: translateY(-3px) scale(1.02);
                box-shadow: 0 10px 24px -2px rgba(0, 0, 0, 0.35);
            }

            .bridgeon-tile:active {
                transform: translateY(0px) scale(0.98);
            }

            .bridgeon-tile-work {
                border-color: rgba(56, 189, 248, 0.2);
            }

            .bridgeon-tile-break {
                border-color: rgba(245, 158, 11, 0.2);
            }

            .bridgeon-tile-icon-box {
                width: 32px;
                height: 32px;
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                flex-shrink: 0;
                transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }

            .bridgeon-tile:hover .bridgeon-tile-icon-box {
                transform: scale(1.15) rotate(-6deg);
            }

            .bridgeon-tile-icon-work {
                background: linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(2, 132, 199, 0.15));
                box-shadow: 0 0 12px rgba(14, 165, 233, 0.25);
            }

            .bridgeon-tile-icon-break {
                background: linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.15));
                box-shadow: 0 0 12px rgba(245, 158, 11, 0.25);
            }

            .bridgeon-tile-texts {
                display: flex;
                flex-direction: column;
                min-width: 0;
            }

            .bridgeon-tile-label {
                font-size: 10.5px;
                font-weight: 500;
                color: var(--bridgeon-text-secondary);
                white-space: nowrap;
            }

            .bridgeon-tile-val {
                font-size: 14.5px;
                font-weight: 700;
                color: var(--bridgeon-text-primary);
                letter-spacing: -0.02em;
                line-height: 1.25;
            }

            /* Progress Section */
            .bridgeon-progress-section {
                margin-bottom: 14px;
            }

            .bridgeon-progress-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 11.5px;
                margin-bottom: 6px;
            }

            .bridgeon-progress-label-group {
                display: flex;
                align-items: center;
                gap: 5px;
                color: var(--bridgeon-text-secondary);
                font-weight: 500;
            }

            .bridgeon-progress-rem-val {
                font-weight: 700;
                color: var(--bridgeon-text-primary);
            }

            .bridgeon-progress-track {
                width: 100%;
                height: 7px;
                background: rgba(255, 255, 255, 0.08);
                border-radius: 999px;
                overflow: hidden;
                position: relative;
            }

            [data-bridgeon-theme="light"] .bridgeon-progress-track {
                background: rgba(0, 0, 0, 0.08);
            }

            .bridgeon-progress-fill {
                height: 100%;
                width: 0%;
                border-radius: 999px;
                background: linear-gradient(90deg, #F59E0B, #FBBF24);
                box-shadow: 0 0 10px rgba(245, 158, 11, 0.5);
                transition: width 0.8s cubic-bezier(0.34, 1.25, 0.64, 1),
                            background 0.4s ease,
                            box-shadow 0.4s ease;
                position: relative;
                overflow: hidden;
            }

            .bridgeon-progress-fill::after {
                content: "";
                position: absolute;
                inset: 0;
                background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0) 100%);
                animation: bridgeon-shimmer 2.6s ease-in-out infinite;
                border-radius: 999px;
            }

            @keyframes bridgeon-shimmer {
                0% { transform: translateX(-150%) skewX(-15deg); }
                100% { transform: translateX(250%) skewX(-15deg); }
            }

            /* Footer */
            .bridgeon-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding-top: 10px;
                border-top: 1px solid var(--bridgeon-border);
            }

            .bridgeon-footer-label {
                font-size: 12.5px;
                color: var(--bridgeon-text-secondary);
                font-weight: 500;
            }

            .bridgeon-footer-status {
                font-size: 17px;
                font-weight: 800;
                color: var(--bridgeon-accent);
                letter-spacing: 0.03em;
                text-shadow: 0 0 10px var(--bridgeon-accent);
                transition: color 0.3s ease, text-shadow 0.3s ease;
            }

            /* CARDS WRAPPER & SILKY SLIDING MORPH */
            #bridgeon-cards-wrapper {
                position: relative;
                width: 275px;
                transition: transform 0.4s cubic-bezier(0.34, 1.25, 0.64, 1),
                            opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                will-change: transform, opacity;
            }

            #bridgeon-badge.bridgeon-is-minimized #bridgeon-cards-wrapper {
                display: none !important;
                opacity: 0;
                transform: scale(0.65) translateY(-20px);
                pointer-events: none;
            }

            #bridgeon-badge.bridgeon-is-minimized #bridgeon-island-view {
                display: inline-flex !important;
                animation: bridgeon-spring-pill 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
            }

            #bridgeon-badge:not(.bridgeon-is-minimized) #bridgeon-island-view {
                display: none !important;
            }

            #bridgeon-badge:not(.bridgeon-is-minimized) #bridgeon-cards-wrapper {
                display: block;
                animation: bridgeon-card-bloom 0.42s cubic-bezier(0.34, 1.25, 0.64, 1);
            }

            /* Ultra-smooth cross-sliding between Main View and Settings View */
            #bridgeon-main-view,
            #bridgeon-settings-view {
                transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                            transform 0.38s cubic-bezier(0.2, 0.9, 0.3, 1),
                            filter 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                            visibility 0.35s;
                will-change: transform, opacity, filter;
                backface-visibility: hidden;
            }

            .bridgeon-show-main #bridgeon-main-view {
                opacity: 1 !important;
                transform: translate3d(0, 0, 0) scale(1) !important;
                filter: blur(0px) !important;
                pointer-events: auto !important;
                visibility: visible !important;
                position: relative !important;
                display: block !important;
            }

            .bridgeon-show-main #bridgeon-settings-view {
                opacity: 0 !important;
                transform: translate3d(24px, 0, 0) scale(0.96) !important;
                filter: blur(3px) !important;
                pointer-events: none !important;
                visibility: hidden !important;
                position: absolute !important;
                top: 0; left: 0; right: 0;
            }

            .bridgeon-show-settings #bridgeon-main-view {
                opacity: 0 !important;
                transform: translate3d(-24px, 0, 0) scale(0.96) !important;
                filter: blur(3px) !important;
                pointer-events: none !important;
                visibility: hidden !important;
                position: absolute !important;
                top: 0; left: 0; right: 0;
            }

            .bridgeon-show-settings #bridgeon-settings-view {
                opacity: 1 !important;
                transform: translate3d(0, 0, 0) scale(1) !important;
                filter: blur(0px) !important;
                pointer-events: auto !important;
                visibility: visible !important;
                position: relative !important;
                display: block !important;
            }

            @keyframes bridgeon-card-bloom {
                0% {
                    opacity: 0;
                    transform: scale(0.86) translateY(-14px);
                    filter: blur(5px);
                }
                60% {
                    transform: scale(1.02) translateY(1px);
                    filter: blur(0px);
                }
                100% {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                    filter: blur(0px);
                }
            }

            @keyframes bridgeon-spring-pill {
                0% {
                    opacity: 0;
                    transform: scale(0.68) translateY(-10px);
                    filter: blur(4px);
                }
                65% {
                    transform: scale(1.06) translateY(1px);
                    filter: blur(0px);
                }
                100% {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                    filter: blur(0px);
                }
            }

            .bridgeon-beacon-pulse-delayed {
                animation-delay: 1.4s !important;
            }

            .bridgeon-settings-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 14px;
            }

            .bridgeon-settings-title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 15px;
                font-weight: 700;
                color: var(--bridgeon-text-primary);
            }

            .bridgeon-setting-row {
                margin-bottom: 14px;
            }

            .bridgeon-setting-label {
                font-size: 11.5px;
                font-weight: 600;
                color: var(--bridgeon-text-secondary);
                margin-bottom: 7px;
                display: block;
            }

            /* Theme segmented buttons */
            .bridgeon-theme-picker {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px;
                background: rgba(0, 0, 0, 0.2);
                padding: 3px;
                border-radius: 12px;
                border: 1px solid var(--bridgeon-border);
            }

            [data-bridgeon-theme="light"] .bridgeon-theme-picker {
                background: rgba(0, 0, 0, 0.04);
            }

            .bridgeon-theme-btn {
                background: transparent;
                border: 1px solid transparent;
                color: var(--bridgeon-text-secondary);
                padding: 6px 0;
                font-size: 11.5px;
                font-weight: 600;
                border-radius: 9px;
                cursor: pointer;
                transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
            }

            .bridgeon-theme-btn:hover:not(.active) {
                background: rgba(255, 255, 255, 0.08);
                color: var(--bridgeon-text-primary);
                transform: translateY(-1px);
            }

            .bridgeon-theme-btn.active {
                background: rgba(56, 189, 248, 0.15);
                border-color: #38BDF8;
                color: #38BDF8;
            }

            .bridgeon-theme-btn:active {
                transform: scale(0.96);
            }

            /* Color swatches */
            .bridgeon-colors-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 2px 4px;
            }

            .bridgeon-color-dot {
                width: 22px;
                height: 22px;
                border-radius: 50%;
                cursor: pointer;
                border: 2px solid transparent;
                transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1),
                            border-color 0.2s ease,
                            box-shadow 0.2s ease;
                outline: none;
                padding: 0;
            }

            .bridgeon-color-dot:hover {
                transform: scale(1.24);
            }

            .bridgeon-color-dot:active {
                transform: scale(0.92);
            }

            .bridgeon-color-dot.active {
                border-color: #FFFFFF;
                box-shadow: 0 0 0 2px var(--bridgeon-accent), 0 0 12px var(--bridgeon-accent);
                transform: scale(1.12);
            }

            /* Slider */
            .bridgeon-slider-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 6px;
            }

            .bridgeon-range-slider {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 5px;
                background: rgba(255, 255, 255, 0.15);
                border-radius: 999px;
                outline: none;
                transition: background 0.2s ease;
            }

            [data-bridgeon-theme="light"] .bridgeon-range-slider {
                background: rgba(0, 0, 0, 0.12);
            }

            .bridgeon-range-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #38BDF8;
                box-shadow: 0 0 8px #38BDF8;
                cursor: pointer;
                transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s ease;
            }

            .bridgeon-range-slider::-webkit-slider-thumb:hover {
                transform: scale(1.25);
                box-shadow: 0 0 12px #38BDF8;
            }

            /* Toggle switch */
            .bridgeon-toggle-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .bridgeon-switch {
                position: relative;
                display: inline-block;
                width: 38px;
                height: 22px;
            }

            .bridgeon-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }

            .bridgeon-switch-slider {
                position: absolute;
                cursor: pointer;
                inset: 0;
                background: rgba(255, 255, 255, 0.18);
                border-radius: 999px;
                transition: 0.3s cubic-bezier(0.34, 1.2, 0.64, 1);
            }

            [data-bridgeon-theme="light"] .bridgeon-switch-slider {
                background: rgba(0, 0, 0, 0.15);
            }

            .bridgeon-switch-slider:before {
                position: absolute;
                content: "";
                height: 16px;
                width: 16px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                border-radius: 50%;
                transition: 0.3s cubic-bezier(0.34, 1.4, 0.64, 1);
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            }

            .bridgeon-switch input:checked + .bridgeon-switch-slider {
                background-color: #38BDF8;
            }

            .bridgeon-switch input:checked + .bridgeon-switch-slider:before {
                transform: translateX(16px);
            }

            /* Link Button in Settings */
            .bridgeon-action-link-btn {
                width: 100%;
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid var(--bridgeon-border);
                color: var(--bridgeon-text-primary);
                border-radius: 10px;
                padding: 8px 12px;
                font-size: 11.5px;
                font-weight: 600;
                cursor: pointer;
                transition: transform 0.24s cubic-bezier(0.34, 1.3, 0.64, 1),
                            background 0.24s ease,
                            border-color 0.24s ease,
                            box-shadow 0.24s ease;
                display: flex;
                align-items: center;
                justify-content: space-between;
                outline: none;
                margin-top: 10px;
                font-family: inherit;
            }

            .bridgeon-action-link-btn:hover {
                background: rgba(255, 255, 255, 0.14);
                border-color: rgba(255, 255, 255, 0.25);
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
            }

            .bridgeon-action-link-btn:active {
                transform: translateY(0) scale(0.98);
            }

            /* MINIMIZED PILL ("ISLAND") */
            #bridgeon-island-view {
                display: none;
                align-items: center;
                gap: 10px;
                background: var(--bridgeon-bg);
                backdrop-filter: blur(24px) saturate(180%);
                -webkit-backdrop-filter: blur(24px) saturate(180%);
                border: 1px solid var(--bridgeon-border);
                border-radius: 999px;
                padding: 7px 12px;
                box-shadow: var(--bridgeon-glow);
                color: var(--bridgeon-text-primary);
                cursor: pointer;
                transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
                            box-shadow 0.25s ease,
                            background 0.3s ease;
            }

            #bridgeon-island-view:hover {
                transform: translateY(-2px) scale(1.03);
                box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
            }

            .bridgeon-island-text {
                font-size: 12px;
                font-weight: 600;
                letter-spacing: -0.01em;
            }

            .bridgeon-island-expand-btn {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: var(--bridgeon-text-secondary);
                width: 20px;
                height: 20px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                margin-left: auto;
                cursor: pointer;
                transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            }

            #bridgeon-island-view:hover .bridgeon-island-expand-btn {
                transform: scale(1.15);
                color: var(--bridgeon-text-primary);
            }

            @keyframes bridgeon-pop-in {
                0% { transform: scale(0.8); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
            }

            /* Update banner */
            #bridgeon-update-banner {
                display: none;
                margin-bottom: 10px;
                border: 1px solid rgba(56, 189, 248, 0.35);
                background: rgba(56, 189, 248, 0.12);
                color: #38BDF8;
                border-radius: 10px;
                padding: 6px 10px;
                font-size: 11px;
                cursor: pointer;
                text-align: left;
                width: 100%;
                box-sizing: border-box;
                transition: all 0.2s ease;
            }

            #bridgeon-update-banner:hover {
                background: rgba(56, 189, 248, 0.2);
                transform: translateY(-1px);
            }

            /* ===================================================
               WHAT'S NEW CENTERED MODAL OVERLAY
               =================================================== */
            #bridgeon-whats-new-overlay {
                position: fixed;
                inset: 0;
                z-index: 10000000;
                background: rgba(2, 8, 20, 0.72);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.36s cubic-bezier(0.16, 1, 0.3, 1),
                            visibility 0.36s;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
                box-sizing: border-box;
            }

            #bridgeon-whats-new-overlay.bridgeon-modal-show {
                opacity: 1 !important;
                visibility: visible !important;
            }

            .bridgeon-wn-modal {
                width: 100%;
                max-width: 420px;
                background: rgba(8, 22, 48, 0.96);
                border: 1px solid rgba(255, 255, 255, 0.16);
                border-radius: 26px;
                padding: 24px;
                box-shadow: 0 25px 60px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.1);
                color: #FFFFFF;
                transform: scale(0.85) translateY(22px);
                opacity: 0;
                transition: transform 0.42s cubic-bezier(0.34, 1.32, 0.64, 1),
                            opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1);
                position: relative;
                user-select: none;
                box-sizing: border-box;
            }

            #bridgeon-whats-new-overlay.bridgeon-modal-show .bridgeon-wn-modal {
                transform: scale(1) translateY(0);
                opacity: 1;
            }

            [data-bridgeon-theme="light"] .bridgeon-wn-modal {
                background: rgba(255, 255, 255, 0.98);
                color: #0F172A;
                border-color: rgba(0, 0, 0, 0.1);
                box-shadow: 0 25px 60px rgba(0, 0, 0, 0.25);
            }

            .bridgeon-wn-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                margin-bottom: 18px;
            }

            .bridgeon-wn-badge-tag {
                display: inline-block;
                padding: 4px 10px;
                background: linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(14, 165, 233, 0.15));
                border: 1px solid rgba(56, 189, 248, 0.4);
                color: #38BDF8;
                font-size: 11px;
                font-weight: 700;
                border-radius: 999px;
                margin-bottom: 6px;
                letter-spacing: 0.04em;
                text-transform: uppercase;
            }

            .bridgeon-wn-title {
                font-size: 20px;
                font-weight: 800;
                letter-spacing: -0.02em;
                line-height: 1.25;
            }

            .bridgeon-wn-close-btn {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: #94A3B8;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 13px;
                transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, color 0.2s ease;
                outline: none;
                flex-shrink: 0;
            }

            [data-bridgeon-theme="light"] .bridgeon-wn-close-btn {
                background: rgba(0, 0, 0, 0.05);
                border-color: rgba(0, 0, 0, 0.1);
            }

            .bridgeon-wn-close-btn:hover {
                background: rgba(255, 255, 255, 0.22);
                color: #FFFFFF;
                transform: scale(1.12);
            }

            .bridgeon-wn-features {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin-bottom: 22px;
            }

            .bridgeon-wn-item {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.06);
                padding: 10px 12px;
                border-radius: 14px;
                transition: transform 0.2s ease;
            }

            .bridgeon-modal-show .bridgeon-wn-item:nth-child(1) { animation: bridgeon-slide-up 0.4s 0.06s cubic-bezier(0.16, 1, 0.3, 1) both; }
            .bridgeon-modal-show .bridgeon-wn-item:nth-child(2) { animation: bridgeon-slide-up 0.4s 0.12s cubic-bezier(0.16, 1, 0.3, 1) both; }
            .bridgeon-modal-show .bridgeon-wn-item:nth-child(3) { animation: bridgeon-slide-up 0.4s 0.18s cubic-bezier(0.16, 1, 0.3, 1) both; }
            .bridgeon-modal-show .bridgeon-wn-item:nth-child(4) { animation: bridgeon-slide-up 0.4s 0.24s cubic-bezier(0.16, 1, 0.3, 1) both; }
            .bridgeon-modal-show .bridgeon-wn-item:nth-child(5) { animation: bridgeon-slide-up 0.4s 0.30s cubic-bezier(0.16, 1, 0.3, 1) both; }

            @keyframes bridgeon-slide-up {
                0% { opacity: 0; transform: translateY(16px) scale(0.97); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }

            [data-bridgeon-theme="light"] .bridgeon-wn-item {
                background: rgba(0, 0, 0, 0.03);
                border-color: rgba(0, 0, 0, 0.06);
            }

            .bridgeon-wn-item-icon {
                font-size: 18px;
                width: 32px;
                height: 32px;
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.08);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .bridgeon-wn-item-content {
                display: flex;
                flex-direction: column;
            }

            .bridgeon-wn-item-title {
                font-size: 13px;
                font-weight: 700;
                margin-bottom: 2px;
            }

            .bridgeon-wn-item-desc {
                font-size: 11px;
                color: #94A3B8;
                line-height: 1.4;
            }

            [data-bridgeon-theme="light"] .bridgeon-wn-item-desc {
                color: #64748B;
            }

            .bridgeon-wn-action-btn {
                width: 100%;
                background: linear-gradient(135deg, #10B981, #059669);
                border: none;
                color: #FFFFFF;
                font-size: 13.5px;
                font-weight: 700;
                padding: 12px;
                border-radius: 14px;
                cursor: pointer;
                box-shadow: 0 4px 18px rgba(16, 185, 129, 0.4);
                transition: transform 0.24s cubic-bezier(0.34, 1.4, 0.64, 1),
                            box-shadow 0.24s ease,
                            filter 0.24s ease;
                outline: none;
                font-family: inherit;
            }

            .bridgeon-wn-action-btn:hover {
                transform: translateY(-2px) scale(1.01);
                box-shadow: 0 8px 24px rgba(16, 185, 129, 0.55);
                filter: brightness(1.08);
            }

            .bridgeon-wn-action-btn:active {
                transform: translateY(0) scale(0.98);
            }

            #bridgeon-whats-new-overlay.bridgeon-modal-show .bridgeon-wn-modal {
                transform: scale(1) translateY(0);
            }

            [data-bridgeon-theme="light"] .bridgeon-wn-modal {
                background: rgba(255, 255, 255, 0.98);
                color: #0F172A;
                border-color: rgba(0, 0, 0, 0.1);
                box-shadow: 0 25px 60px rgba(0, 0, 0, 0.25);
            }

            .bridgeon-wn-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                margin-bottom: 18px;
            }

            .bridgeon-wn-badge-tag {
                display: inline-block;
                padding: 4px 10px;
                background: linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(14, 165, 233, 0.15));
                border: 1px solid rgba(56, 189, 248, 0.4);
                color: #38BDF8;
                font-size: 11px;
                font-weight: 700;
                border-radius: 999px;
                margin-bottom: 6px;
                letter-spacing: 0.04em;
                text-transform: uppercase;
            }

            .bridgeon-wn-title {
                font-size: 20px;
                font-weight: 800;
                letter-spacing: -0.02em;
                line-height: 1.25;
            }

            .bridgeon-wn-close-btn {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: #94A3B8;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s ease;
                outline: none;
                flex-shrink: 0;
            }

            [data-bridgeon-theme="light"] .bridgeon-wn-close-btn {
                background: rgba(0, 0, 0, 0.05);
                border-color: rgba(0, 0, 0, 0.1);
            }

            .bridgeon-wn-close-btn:hover {
                background: rgba(255, 255, 255, 0.22);
                color: #FFFFFF;
                transform: scale(1.08);
            }

            .bridgeon-wn-features {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin-bottom: 22px;
            }

            .bridgeon-wn-item {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.06);
                padding: 10px 12px;
                border-radius: 14px;
            }

            [data-bridgeon-theme="light"] .bridgeon-wn-item {
                background: rgba(0, 0, 0, 0.03);
                border-color: rgba(0, 0, 0, 0.06);
            }

            .bridgeon-wn-item-icon {
                font-size: 18px;
                width: 32px;
                height: 32px;
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.08);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .bridgeon-wn-item-content {
                display: flex;
                flex-direction: column;
            }

            .bridgeon-wn-item-title {
                font-size: 13px;
                font-weight: 700;
                margin-bottom: 2px;
            }

            .bridgeon-wn-item-desc {
                font-size: 11px;
                color: #94A3B8;
                line-height: 1.4;
            }

            [data-bridgeon-theme="light"] .bridgeon-wn-item-desc {
                color: #64748B;
            }

            .bridgeon-wn-action-btn {
                width: 100%;
                background: linear-gradient(135deg, #10B981, #059669);
                border: none;
                color: #FFFFFF;
                font-size: 13.5px;
                font-weight: 700;
                padding: 12px;
                border-radius: 14px;
                cursor: pointer;
                box-shadow: 0 4px 18px rgba(16, 185, 129, 0.4);
                transition: all 0.2s ease;
                outline: none;
                font-family: inherit;
            }

            .bridgeon-wn-action-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 22px rgba(16, 185, 129, 0.55);
            }
        `;

        document.head.appendChild(style);
        applyThemeAndStyles();
    }

    function applyThemeAndStyles() {
        const root = document.documentElement;
        const badge = document.getElementById('bridgeon-badge');

        const activeTheme = userSettings.theme === 'light' ? 'light' : 'dark';

        if (badge) {
            badge.setAttribute('data-bridgeon-theme', activeTheme);
        }

        const modal = document.getElementById('bridgeon-whats-new-overlay');
        if (modal) {
            modal.setAttribute('data-bridgeon-theme', activeTheme);
        }

        // Apply CSS custom properties
        document.documentElement.style.setProperty('--bridgeon-accent', userSettings.accentColor || '#10B981');
        document.documentElement.style.setProperty('--bridgeon-opacity', (userSettings.cardOpacity / 100).toFixed(2));
    }

    // =========================================================
    // WHAT'S NEW MODAL LOGIC
    // =========================================================

    function createWhatsNewModal() {
        if (document.getElementById('bridgeon-whats-new-overlay')) {
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'bridgeon-whats-new-overlay';

        overlay.innerHTML = `
            <div class="bridgeon-wn-modal">
                <div class="bridgeon-wn-header">
                    <div>
                        <span class="bridgeon-wn-badge-tag">✨ What's New</span>
                        <h2 class="bridgeon-wn-title">Bridgeon Attendance v${CURRENT_VERSION}</h2>
                    </div>
                    <button id="bridgeon-wn-close-btn" class="bridgeon-wn-close-btn" title="Close">✕</button>
                </div>

                <div class="bridgeon-wn-features">
                    <div class="bridgeon-wn-item">
                        <div class="bridgeon-wn-item-icon">💎</div>
                        <div class="bridgeon-wn-item-content">
                            <span class="bridgeon-wn-item-title">Apple Liquid Glass Design</span>
                            <span class="bridgeon-wn-item-desc">Refined floating card with translucent blur, smooth borders, and real-time glowing beacons.</span>
                        </div>
                    </div>

                    <div class="bridgeon-wn-item">
                        <div class="bridgeon-wn-item-icon">🏢</div>
                        <div class="bridgeon-wn-item-content">
                            <span class="bridgeon-wn-item-title">Work Time & Break Time Tiles</span>
                            <span class="bridgeon-wn-item-desc">Side-by-side metric cards for instant, clear visibility into your day.</span>
                        </div>
                    </div>

                    <div class="bridgeon-wn-item">
                        <div class="bridgeon-wn-item-icon">☕</div>
                        <div class="bridgeon-wn-item-content">
                            <span class="bridgeon-wn-item-title">Smart Break Allowance</span>
                            <span class="bridgeon-wn-item-desc">Visual progress bar with color-coded warning alerts before reaching 90 minutes.</span>
                        </div>
                    </div>

                    <div class="bridgeon-wn-item">
                        <div class="bridgeon-wn-item-icon">🎨</div>
                        <div class="bridgeon-wn-item-content">
                            <span class="bridgeon-wn-item-title">Themes, Colors & Opacity</span>
                            <span class="bridgeon-wn-item-desc">Customize Dark/Light modes, 6 vibrant accent colors, and adjust card transparency.</span>
                        </div>
                    </div>

                    <div class="bridgeon-wn-item">
                        <div class="bridgeon-wn-item-icon">💊</div>
                        <div class="bridgeon-wn-item-content">
                            <span class="bridgeon-wn-item-title">Dynamic Island Minimized Pill</span>
                            <span class="bridgeon-wn-item-desc">Click Minimize to shrink into a clean capsule pill that stays out of your way.</span>
                        </div>
                    </div>
                </div>

                <button id="bridgeon-wn-confirm-btn" class="bridgeon-wn-action-btn">
                    Got it, Let's Explore! 🚀
                </button>
            </div>
        `;

        document.body.appendChild(overlay);

        function closeModal() {
            overlay.classList.remove('bridgeon-modal-show');
            markWhatsNewSeen();
        }

        // Close button
        document.getElementById('bridgeon-wn-close-btn').onclick = (e) => {
            e.stopPropagation();
            closeModal();
        };

        // Got it button
        document.getElementById('bridgeon-wn-confirm-btn').onclick = (e) => {
            e.stopPropagation();
            closeModal();
        };

        // Click outside backdrop
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        };

        // Esc key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('bridgeon-modal-show')) {
                closeModal();
            }
        });
    }

    function showWhatsNewModal() {
        createWhatsNewModal();
        const overlay = document.getElementById('bridgeon-whats-new-overlay');
        if (overlay) {
            applyThemeAndStyles();
            overlay.classList.add('bridgeon-modal-show');
        }
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
            <!-- MINIMIZED ISLAND PILL -->
            <div id="bridgeon-island-view">
                <div class="bridgeon-beacon-wrapper">
                    <div id="bridgeon-island-pulse" class="bridgeon-beacon-pulse"></div>
                    <div id="bridgeon-island-pulse-2" class="bridgeon-beacon-pulse bridgeon-beacon-pulse-delayed"></div>
                    <div id="bridgeon-island-dot" class="bridgeon-beacon-dot"></div>
                </div>
                <span id="bridgeon-island-text" class="bridgeon-island-text">☕ --m left</span>
                <div class="bridgeon-island-expand-btn">⌃</div>
            </div>

            <!-- CARDS WRAPPER FOR SEAMLESS VIEW TRANSITIONS -->
            <div id="bridgeon-cards-wrapper" class="bridgeon-show-main">
                <!-- MAIN FULL CARD -->
                <div id="bridgeon-main-view" class="bridgeon-glass-card">
                    <!-- Update Available Notice -->
                    <button id="bridgeon-update-banner">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:700;">Update Available</span>
                            <span>→</span>
                        </div>
                        <div id="bridgeon-update-version-label" style="font-size:9px; opacity:0.85;">Version ...</div>
                    </button>

                    <!-- HEADER -->
                    <div class="bridgeon-header">
                        <div class="bridgeon-status-group">
                            <div class="bridgeon-beacon-wrapper">
                                <div id="bridgeon-main-pulse" class="bridgeon-beacon-pulse"></div>
                                <div id="bridgeon-main-pulse-2" class="bridgeon-beacon-pulse bridgeon-beacon-pulse-delayed"></div>
                                <div id="bridgeon-main-dot" class="bridgeon-beacon-dot"></div>
                            </div>
                            <div class="bridgeon-status-info">
                                <div id="bridgeon-status-title" class="bridgeon-status-title">On Time</div>
                                <div id="bridgeon-status-sub" class="bridgeon-status-sub">IN --:-- --</div>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <button id="bridgeon-settings-btn" class="bridgeon-icon-btn" title="Settings">⚙</button>
                            <button id="bridgeon-minimize-btn" class="bridgeon-icon-btn" title="Minimize">−</button>
                        </div>
                    </div>

                    <!-- DUAL METRIC TILES -->
                    <div class="bridgeon-tiles-grid">
                        <div class="bridgeon-tile bridgeon-tile-work">
                            <div class="bridgeon-tile-icon-box bridgeon-tile-icon-work">🏢</div>
                            <div class="bridgeon-tile-texts">
                                <span class="bridgeon-tile-label">Work Time</span>
                                <span id="bridgeon-work-val" class="bridgeon-tile-val">0m</span>
                            </div>
                        </div>
                        <div class="bridgeon-tile bridgeon-tile-break">
                            <div class="bridgeon-tile-icon-box bridgeon-tile-icon-break">🚶</div>
                            <div class="bridgeon-tile-texts">
                                <span class="bridgeon-tile-label">Break Time</span>
                                <span id="bridgeon-break-val" class="bridgeon-tile-val">0m</span>
                            </div>
                        </div>
                    </div>

                    <!-- PROGRESS SECTION -->
                    <div class="bridgeon-progress-section">
                        <div class="bridgeon-progress-header">
                            <div class="bridgeon-progress-label-group">
                                <span>☕</span>
                                <span>Break Time Left</span>
                            </div>
                            <span id="bridgeon-break-left-val" class="bridgeon-progress-rem-val">1h 30m left</span>
                        </div>
                        <div class="bridgeon-progress-track">
                            <div id="bridgeon-progress-bar" class="bridgeon-progress-fill"></div>
                        </div>
                    </div>

                    <!-- FOOTER -->
                    <div class="bridgeon-footer">
                        <span class="bridgeon-footer-label">Status</span>
                        <span id="bridgeon-footer-status" class="bridgeon-footer-status">IN</span>
                    </div>
                </div>

                <!-- SETTINGS CARD VIEW -->
                <div id="bridgeon-settings-view" class="bridgeon-glass-card">
                    <div class="bridgeon-settings-header">
                        <div class="bridgeon-settings-title">
                            <span>⚙</span>
                            <span>Settings</span>
                        </div>
                        <button id="bridgeon-settings-close-btn" class="bridgeon-icon-btn" title="Close">✕</button>
                    </div>

                    <!-- THEME PICKER -->
                    <div class="bridgeon-setting-row">
                        <span class="bridgeon-setting-label">Theme</span>
                        <div class="bridgeon-theme-picker">
                            <button class="bridgeon-theme-btn ${userSettings.theme === 'dark' ? 'active' : ''}" data-theme="dark">
                                <span>🌙</span> Dark
                            </button>
                            <button class="bridgeon-theme-btn ${userSettings.theme === 'light' ? 'active' : ''}" data-theme="light">
                                <span>☀️</span> Light
                            </button>
                        </div>
                    </div>

                    <!-- ACCENT COLOR -->
                    <div class="bridgeon-setting-row">
                        <span class="bridgeon-setting-label">Accent Color</span>
                        <div class="bridgeon-colors-row">
                            <button class="bridgeon-color-dot ${userSettings.accentColor === '#10B981' ? 'active' : ''}" style="background:#10B981;" data-color="#10B981" title="Green"></button>
                            <button class="bridgeon-color-dot ${userSettings.accentColor === '#3B82F6' ? 'active' : ''}" style="background:#3B82F6;" data-color="#3B82F6" title="Blue"></button>
                            <button class="bridgeon-color-dot ${userSettings.accentColor === '#8B5CF6' ? 'active' : ''}" style="background:#8B5CF6;" data-color="#8B5CF6" title="Purple"></button>
                            <button class="bridgeon-color-dot ${userSettings.accentColor === '#F59E0B' ? 'active' : ''}" style="background:#F59E0B;" data-color="#F59E0B" title="Orange"></button>
                            <button class="bridgeon-color-dot ${userSettings.accentColor === '#EC4899' ? 'active' : ''}" style="background:#EC4899;" data-color="#EC4899" title="Pink"></button>
                            <button class="bridgeon-color-dot ${userSettings.accentColor === '#EF4444' ? 'active' : ''}" style="background:#EF4444;" data-color="#EF4444" title="Red"></button>
                        </div>
                    </div>

                    <!-- CARD OPACITY -->
                    <div class="bridgeon-setting-row">
                        <div class="bridgeon-slider-header">
                            <span class="bridgeon-setting-label" style="margin-bottom:0;">Card Opacity</span>
                            <span id="bridgeon-opacity-readout" style="font-size:11.5px; font-weight:600; color:var(--bridgeon-text-secondary);">${userSettings.cardOpacity}%</span>
                        </div>
                        <input id="bridgeon-opacity-slider" class="bridgeon-range-slider" type="range" min="50" max="100" value="${userSettings.cardOpacity}">
                    </div>

                    <!-- COMPACT MODE -->
                    <div class="bridgeon-setting-row" style="margin-bottom:12px;">
                        <div class="bridgeon-toggle-row">
                            <div>
                                <div style="font-size:12px; font-weight:600; color:var(--bridgeon-text-primary);">Compact Mode</div>
                                <div style="font-size:10.5px; color:var(--bridgeon-text-secondary);">Show minimized pill</div>
                            </div>
                            <label class="bridgeon-switch">
                                <input id="bridgeon-compact-switch" type="checkbox" ${userSettings.compactMode ? 'checked' : ''}>
                                <span class="bridgeon-switch-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- COMMUNITY & FEEDBACK -->
                    <div class="bridgeon-setting-row" style="margin-top:14px; margin-bottom:10px;">
                        <span class="bridgeon-setting-label">Community & Feedback</span>
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            <a
                                id="bridgeon-discussions-btn"
                                class="bridgeon-action-link-btn"
                                href="https://github.com/A-Rafeef/bridgeon-timer/discussions"
                                target="_blank"
                                rel="noopener noreferrer"
                                onclick="event.stopPropagation();"
                                style="text-decoration:none; margin-top:0;"
                            >
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span>💬</span>
                                    <div>
                                        <div style="font-size:11.5px; font-weight:600;">Discussions</div>
                                        <div style="font-size:9.5px; color:var(--bridgeon-text-secondary); font-weight:400;">Chat & connect with users</div>
                                    </div>
                                </div>
                                <span style="font-size:12px; color:var(--bridgeon-text-secondary);">↗</span>
                            </a>

                            <a
                                id="bridgeon-suggest-idea-btn"
                                class="bridgeon-action-link-btn"
                                href="https://github.com/A-Rafeef/bridgeon-timer/discussions/new?category=ideas"
                                target="_blank"
                                rel="noopener noreferrer"
                                onclick="event.stopPropagation();"
                                style="text-decoration:none; margin-top:0;"
                            >
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span>💡</span>
                                    <div>
                                        <div style="font-size:11.5px; font-weight:600;">Suggest an Idea</div>
                                        <div style="font-size:9.5px; color:var(--bridgeon-text-secondary); font-weight:400;">Request features or give feedback</div>
                                    </div>
                                </div>
                                <span style="font-size:12px; color:var(--bridgeon-text-secondary);">↗</span>
                            </a>
                        </div>
                    </div>

                    <!-- VIEW WHAT'S NEW BUTTON -->
                    <button id="bridgeon-view-whats-new-btn" class="bridgeon-action-link-btn" style="margin-top:4px;">
                        <span>✨ What's New in v${CURRENT_VERSION}</span>
                        <span style="font-size:13px;">→</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(badge);

        // =====================================================
        // EVENT HANDLERS & NAVIGATION
        // =====================================================

        const cardsWrapper = document.getElementById('bridgeon-cards-wrapper');
        const islandView = document.getElementById('bridgeon-island-view');

        function updateViewStates() {
            if (isMinimized) {
                badge.classList.add('bridgeon-is-minimized');
                badge.style.width = 'auto';
            } else {
                badge.classList.remove('bridgeon-is-minimized');
                badge.style.width = '275px';

                if (isSettingsOpen) {
                    cardsWrapper.classList.remove('bridgeon-show-main');
                    cardsWrapper.classList.add('bridgeon-show-settings');
                } else {
                    cardsWrapper.classList.remove('bridgeon-show-settings');
                    cardsWrapper.classList.add('bridgeon-show-main');
                }
            }
        }

        // Minimize Button
        document.getElementById('bridgeon-minimize-btn').onclick = (e) => {
            e.stopPropagation();
            isMinimized = true;
            isSettingsOpen = false;
            updateViewStates();
        };

        // Island Click -> Expand
        islandView.onclick = () => {
            isMinimized = false;
            isSettingsOpen = false;
            updateViewStates();
        };

        // Settings Button -> Open Settings
        document.getElementById('bridgeon-settings-btn').onclick = (e) => {
            e.stopPropagation();
            isSettingsOpen = true;
            updateViewStates();
        };

        // Close Settings Button
        document.getElementById('bridgeon-settings-close-btn').onclick = (e) => {
            e.stopPropagation();
            isSettingsOpen = false;
            updateViewStates();
        };

        // What's New button in settings
        document.getElementById('bridgeon-view-whats-new-btn').onclick = (e) => {
            e.stopPropagation();
            showWhatsNewModal();
        };

        // Theme Buttons
        const themeBtns = badge.querySelectorAll('.bridgeon-theme-btn');
        themeBtns.forEach(btn => {
            btn.onclick = () => {
                themeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                saveSettings({ theme: btn.getAttribute('data-theme') });
            };
        });

        // Color Swatches
        const colorDots = badge.querySelectorAll('.bridgeon-color-dot');
        colorDots.forEach(dot => {
            dot.onclick = () => {
                colorDots.forEach(d => d.classList.remove('active'));
                dot.classList.add('active');
                const color = dot.getAttribute('data-color');
                saveSettings({ accentColor: color });
                updateBadge();
            };
        });

        // Opacity Slider
        const opacitySlider = document.getElementById('bridgeon-opacity-slider');
        const opacityReadout = document.getElementById('bridgeon-opacity-readout');
        opacitySlider.oninput = (e) => {
            const val = Number(e.target.value);
            opacityReadout.textContent = `${val}%`;
            saveSettings({ cardOpacity: val });
        };

        // Compact Switch
        const compactSwitch = document.getElementById('bridgeon-compact-switch');
        compactSwitch.onchange = (e) => {
            const checked = e.target.checked;
            saveSettings({ compactMode: checked });
            isMinimized = checked;
            updateViewStates();
        };

        // Update banner button
        const updateBanner = document.getElementById('bridgeon-update-banner');
        if (updateBanner) {
            updateBanner.onclick = installUpdate;
        }

        updateViewStates(true);
        applyThemeAndStyles();
    }

    // =========================================================
    // SHOW / HIDE BADGE
    // =========================================================

    function showBadge() {
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
    // UPDATE CONTENT IN-PLACE
    // =========================================================

    function updateBadge() {
        if (!isAttendancePage()) {
            hideBadge();
            return;
        }

        createBadge();

        // Update notification banner
        const banner = document.getElementById('bridgeon-update-banner');
        const verLabel = document.getElementById('bridgeon-update-version-label');
        if (banner) {
            if (updateAvailable) {
                banner.style.display = 'block';
                if (verLabel) verLabel.textContent = `Version ${latestVersion}`;
            } else {
                banner.style.display = 'none';
            }
        }

        const data = calculateData();
        if (!data) return;

        const isInside = data.currentStatus === 'IN';

        // Elements
        const mainDot = document.getElementById('bridgeon-main-dot');
        const mainPulse = document.getElementById('bridgeon-main-pulse');
        const mainPulse2 = document.getElementById('bridgeon-main-pulse-2');
        const statusTitle = document.getElementById('bridgeon-status-title');
        const statusSub = document.getElementById('bridgeon-status-sub');

        const workVal = document.getElementById('bridgeon-work-val');
        const breakVal = document.getElementById('bridgeon-break-val');
        const breakLeftVal = document.getElementById('bridgeon-break-left-val');
        const progressBar = document.getElementById('bridgeon-progress-bar');
        const footerStatus = document.getElementById('bridgeon-footer-status');

        const islandDot = document.getElementById('bridgeon-island-dot');
        const islandPulse = document.getElementById('bridgeon-island-pulse');
        const islandPulse2 = document.getElementById('bridgeon-island-pulse-2');
        const islandText = document.getElementById('bridgeon-island-text');

        // Status header
        if (mainDot) mainDot.style.background = data.statusColor;
        if (mainPulse) mainPulse.style.background = data.statusColor;
        if (mainPulse2) mainPulse2.style.background = data.statusColor;
        if (statusTitle) {
            statusTitle.textContent = data.statusText;
            statusTitle.style.color = data.statusColor;
        }
        if (statusSub) statusSub.textContent = data.lastAction;

        // Metric values
        if (workVal) workVal.textContent = formatMinutes(data.officeMinutes);
        if (breakVal) breakVal.textContent = formatMinutes(data.outsideMinutes);

        // Progress bar & time left
        if (breakLeftVal) breakLeftVal.textContent = `${formatMinutes(data.remainingOutside)} left`;
        if (progressBar) {
            progressBar.style.width = `${data.usagePercent}%`;
            // Adaptive glowing color for outside time
            if (data.outsideMinutes >= 90) {
                progressBar.style.background = 'linear-gradient(90deg, #EF4444, #F87171)';
                progressBar.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.5)';
            } else if (data.outsideMinutes >= 60) {
                progressBar.style.background = 'linear-gradient(90deg, #F59E0B, #FBBF24)';
                progressBar.style.boxShadow = '0 0 10px rgba(245, 158, 11, 0.5)';
            } else {
                progressBar.style.background = 'linear-gradient(90deg, #10B981, #34D399)';
                progressBar.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.5)';
            }
        }

        // Footer status
        if (footerStatus) {
            footerStatus.textContent = data.currentStatus;
            footerStatus.style.color = isInside ? (userSettings.accentColor || '#10B981') : '#EF4444';
            footerStatus.style.textShadow = isInside
                ? `0 0 10px ${userSettings.accentColor || '#10B981'}`
                : '0 0 10px #EF4444';
        }

        // Minimized Island
        const islandColor = isInside
            ? (userSettings.accentColor || '#10B981')
            : (data.outsideColor || '#F59E0B');

        if (islandDot) islandDot.style.background = islandColor;
        if (islandPulse) {
            islandPulse.style.background = islandColor;
            islandPulse.style.animationName = 'bridgeon-radiate';
        }
        if (islandPulse2) {
            islandPulse2.style.background = islandColor;
            islandPulse2.style.animationName = 'bridgeon-radiate';
        }

        const islandViewEl = document.getElementById('bridgeon-island-view');
        if (islandText) {
            islandText.textContent = `☕ ${formatMinutes(data.remainingOutside)} left`;
        }
        if (islandViewEl) {
            islandViewEl.title = `Bridgeon Attendance: ${data.currentStatus} (${data.lastAction}) • Break Left: ${formatMinutes(data.remainingOutside)}`;
        }
    }

    // =========================================================
    // VISIBILITY HANDLING
    // =========================================================

    function handleVisibility() {
        if (!isAttendancePage()) {
            hideBadge();
            return;
        }

        const expandedIcon = document.querySelector('[data-testid="ExpandLessIcon"]');
        if (expandedIcon) {
            showBadge();
        } else {
            hideBadge();
        }
    }

    window.addEventListener('popstate', handleVisibility);
    window.addEventListener('hashchange', handleVisibility);

    // =========================================================
    // INITIALIZATION & REAL-TIME TICKER
    // =========================================================

    if (isAttendancePage()) {
        createBadge();
        updateBadge();
        handleVisibility();

        // Check if user has seen "What's New in this version"
        if (!hasSeenWhatsNew()) {
            setTimeout(() => {
                showWhatsNewModal();
            }, 500);
        }
    }

    setInterval(() => {
        if (!isAttendancePage()) {
            hideBadge();
            return;
        }
        updateBadge();
        handleVisibility();
    }, 1000);

})();
