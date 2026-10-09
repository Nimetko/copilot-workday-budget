// ==UserScript==
// @name         GitHub Copilot - Workday Credit Budget
// @namespace    https://github.com/settings/copilot/features
// @version      1.5.1
// @description  Track remaining Copilot credits per workday, with vacation days and an Include today toggle.
// @author       Nimetko
// @license      MIT
// @homepageURL  https://github.com/Nimetko/copilot-workday-budget
// @supportURL   https://github.com/Nimetko/copilot-workday-budget/issues
// @updateURL    https://raw.githubusercontent.com/Nimetko/copilot-workday-budget/main/copilot-workday-budget.user.js
// @downloadURL  https://raw.githubusercontent.com/Nimetko/copilot-workday-budget/main/copilot-workday-budget.user.js
// @match        https://github.com/settings/copilot/features*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  'use strict';

  const WIDGET_ID = 'tm-copilot-workday-budget';
  const TODAY_KEY = 'copilotIncludeTodayByDate';
  const VACATION_PREFIX = 'copilotRemainingVacationDays:';
  const OLD_VACATION_KEY = 'copilotVacationDates'; // migrate from v1.4
  const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const C = {
    green: '#3fb950', orange: '#d29922', red: '#f85149',
    muted: 'var(--fgColor-muted, #9198a1)',
    normal: 'var(--fgColor-default, #f0f6fc)',
    border: 'var(--borderColor-default, #3d444d)'
  };

  function iso(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')].join('-');
  }

  function isWeekday(dateISO) {
    const day = new Date(dateISO + 'T00:00:00Z').getUTCDay();
    return day !== 0 && day !== 6;
  }

  // Dates are counted in [start, end); UTC avoids DST boundary issues.
  function workdays(start, end) {
    const date = new Date(start + 'T00:00:00Z');
    const stop = Date.parse(end + 'T00:00:00Z');
    let count = 0;
    while (date.getTime() < stop) {
      if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) count++;
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return count;
  }

  function currentVacationDays(today) {
    const key = VACATION_PREFIX + today.slice(0, 7);
    const saved = GM_getValue(key, null);
    if (saved !== null) return Math.max(0, Math.floor(Number(saved) || 0));

    // Existing v1.4 vacation dates become a number of upcoming days.
    const old = GM_getValue(OLD_VACATION_KEY, []);
    const migrated = Array.isArray(old)
      ? new Set(old.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
        && d >= today && d.slice(0, 7) === today.slice(0, 7) && isWeekday(d))).size
      : 0;
    GM_setValue(key, migrated);
    return migrated;
  }

  function saveVacationDays(today, days) {
    const count = Math.max(0, Math.min(31, Math.floor(Number(days) || 0)));
    GM_setValue(VACATION_PREFIX + today.slice(0, 7), count);
  }

  function includeToday(today) {
    const stored = GM_getValue(TODAY_KEY, null);
    return !stored || stored.date !== today || stored.include !== false;
  }

  function findUsageCard() {
    if (!document.body) return null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.trim() !== 'Usage this cycle') continue;
      let el = node.parentElement;
      for (let depth = 0; el && el !== document.body && depth < 12;
        depth++, el = el.parentElement) {
        const text = el.textContent || '';
        if (/AI\s+credits/i.test(text) && /Resets?\s+in\b/i.test(text)) return el;
      }
    }
    return null;
  }

  function calculate(now, used, limit, vacationDays, include) {
    const today = iso(now);
    const monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1));
    const nextMonth = iso(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    const monthWeekdays = workdays(monthStart, nextMonth);
    const remainingWeekdays = workdays(today, nextMonth);
    const todayWorking = isWeekday(today);
    const availableWeekdays = remainingWeekdays - (todayWorking && !include ? 1 : 0);
    const effectiveVacation = Math.min(vacationDays, availableWeekdays);
    const plannedWorkdays = Math.max(0, monthWeekdays - vacationDays);
    const remainingWorkdays = availableWeekdays - effectiveVacation;
    const left = Math.max(0, limit - used);
    const plannedDaily = plannedWorkdays > 0 ? limit / plannedWorkdays : null;
    const availableDaily = remainingWorkdays > 0 ? left / remainingWorkdays : null;
    const delta = plannedDaily !== null && availableDaily !== null
      ? availableDaily - plannedDaily : null;
    const ratio = plannedDaily && availableDaily !== null ? availableDaily / plannedDaily : 0;
    return { today, monthWeekdays, todayWorking, availableWeekdays, effectiveVacation,
      plannedWorkdays, remainingWorkdays, left, plannedDaily, availableDaily, delta, ratio };
  }

  function statusFor(used, limit, data) {
    if (used >= limit) return { label: 'Budget exhausted', color: C.red };
    if (!data.remainingWorkdays) return { label: 'No remaining workdays', color: C.muted };
    if (data.ratio >= 1.05) return { label: 'Ahead of budget', color: C.green };
    if (data.ratio >= 1) return { label: 'On track', color: C.green };
    if (data.ratio >= 0.95) return { label: 'Slightly over pace', color: C.orange };
    return { label: 'Over pace', color: C.red };
  }

  function update() {
    if (location.pathname !== '/settings/copilot/features') return;
    const card = findUsageCard();
    if (!card) return;
    const match = (card.textContent || '').match(
      /(\d[\d,.\s]*)\/\s*(\d[\d,.\s]*)AI\s+credits\b/i
    );
    if (!match) return;
    const used = Number(match[1].replace(/\D/g, ''));
    const limit = Number(match[2].replace(/\D/g, ''));
    if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return;

    const today = iso(new Date());
    const vacation = currentVacationDays(today);
    const checked = includeToday(today);
    const d = calculate(new Date(), used, limit, vacation, checked);
    const status = statusFor(used, limit, d);
    const fmtNum = n => n === null ? '—' : fmt.format(n);
    const deltaText = d.delta === null ? '—'
      : `${d.delta >= 0 ? '+' : '−'}${fmt.format(Math.abs(d.delta))}`;
    const maxDaily = Math.max(d.plannedDaily || 0, d.availableDaily || 0, 1);
    const plannedPct = (d.plannedDaily || 0) / maxDaily * 100;
    const availablePct = (d.availableDaily || 0) / maxDaily * 100;

    let widget = document.getElementById(WIDGET_ID);
    if (!widget) {
      widget = document.createElement('div');
      widget.id = WIDGET_ID;
      widget.style.cssText = `margin-top:16px;padding-top:16px;border-top:1px solid ${C.border};
        color:${C.normal};font-size:13px;line-height:1.5`;

      widget.addEventListener('change', event => {
        const date = iso(new Date());
        if (event.target.matches('[data-budget-today]')) {
          GM_setValue(TODAY_KEY, { date, include: event.target.checked });
          update();
        }
        if (event.target.matches('[data-budget-vacation]')) {
          saveVacationDays(date, event.target.value);
          update();
        }
      });
      widget.addEventListener('click', event => {
        const button = event.target.closest('[data-budget-step]');
        if (!button) return;
        const date = iso(new Date());
        saveVacationDays(date, currentVacationDays(date) + Number(button.dataset.budgetStep));
        update();
      });
      card.appendChild(widget);
    } else if (widget.parentElement !== card) {
      card.appendChild(widget);
    }

    const signature = [today, used, limit, checked, vacation].join('|');
    if (widget.dataset.signature === signature) return;
    widget.dataset.signature = signature;

    const btn = `padding:5px 10px;border:1px solid ${C.border};border-radius:6px;
      background:var(--button-default-bgColor-rest,#21262d);color:${C.normal};cursor:pointer;font:inherit;`;

    widget.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <strong style="font-size:16px">Workday budget</strong>
        <span style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;
          border:1px solid ${status.color}70;background:${status.color}16;
          color:${status.color};font-weight:600">
          <span style="width:8px;height:8px;border-radius:50%;background:${status.color}"></span>
          ${status.label}
        </span>
      </div>
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:14px 26px;
        margin:14px 0 18px;padding:12px;border:1px solid ${C.border};border-radius:8px">
        <label style="display:flex;align-items:center;gap:8px;cursor:${d.todayWorking ? 'pointer' : 'default'}">
          <input type="checkbox" data-budget-today ${checked ? 'checked' : ''}
            ${d.todayWorking ? '' : 'disabled'}
            style="accent-color:#2f81f7;width:15px;height:15px" />
          Include today
        </label>
        <label style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
          <span>Vacation days left</span>
          <span style="display:inline-flex;align-items:center;gap:5px">
            <button type="button" data-budget-step="-1" aria-label="Remove one vacation day" style="${btn}">−</button>
            <input type="number" data-budget-vacation value="${vacation}" min="0" max="31" step="1"
              aria-label="Vacation days remaining this month"
              style="width:58px;text-align:center;padding:5px 4px;border-radius:6px;
              border:1px solid ${C.border};background:var(--bgColor-default,#0d1117);
              color:${C.normal};font:inherit;box-sizing:border-box;color-scheme:inherit" />
            <button type="button" data-budget-step="1" aria-label="Add one vacation day" style="${btn}">+</button>
          </span>
        </label>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:18px">
        <div><div style="color:${C.muted}">Planned / workday</div>
          <strong style="font-size:23px">${fmtNum(d.plannedDaily)}</strong>
          <span style="font-size:12px;color:${C.muted}"> credits</span></div>
        <div><div style="color:${C.muted}">Available / workday</div>
          <strong style="font-size:23px;color:${status.color}">${fmtNum(d.availableDaily)}</strong>
          <span style="font-size:12px;color:${C.muted}"> credits</span></div>
        <div><div style="color:${C.muted}">Difference / workday</div>
          <strong style="font-size:23px;color:${status.color}">${deltaText}</strong>
          <span style="font-size:12px;color:${C.muted}"> credits</span></div>
      </div>
      <div style="margin-top:18px;padding:14px;border:1px solid ${C.border};
        border-radius:10px;background:rgba(128,128,128,.035)">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <strong>Daily budget comparison</strong>
          <strong style="color:${status.color}">${d.delta === null ? 'No remaining workdays' : deltaText + ' credits / workday'}</strong>
        </div>
        <div style="font-size:12px;color:${C.muted};margin-bottom:5px">Planned daily budget</div>
        <div style="height:10px;background:#30363d;border-radius:999px;overflow:hidden">
          <div style="height:100%;width:${plannedPct}%;background:#8b949e;border-radius:999px"></div>
        </div>
        <div style="font-size:12px;color:${C.muted};margin:12px 0 5px">Available daily budget</div>
        <div style="height:10px;background:#30363d;border-radius:999px;overflow:hidden">
          <div style="height:100%;width:${availablePct}%;background:${status.color};border-radius:999px"></div>
        </div>
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;
          margin-top:12px;font-size:12px;color:${C.muted}">
          <span>Planned: <b style="color:${C.normal}">${fmtNum(d.plannedDaily)}</b></span>
          <span>Available: <b style="color:${status.color}">${fmtNum(d.availableDaily)}</b></span>
          <span>${d.remainingWorkdays} remaining workdays</span>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:12px;
        color:${C.muted};font-size:12px">
        <span>${d.monthWeekdays} weekdays this month</span>
        <span>${d.plannedWorkdays} planned workdays</span>
        <span>${d.effectiveVacation} vacation days remaining</span>
        <span>${fmt.format(d.left)} credits left</span>
      </div>
      <div style="margin-top:7px;font-size:11px;color:${C.muted}">
        Enter vacation workdays still ahead this month (not today if you unchecked Include today).
        Update this number after taking a vacation day. Saved locally per month in Tampermonkey.
      </div>
      ${vacation > d.effectiveVacation ? `<div style="margin-top:5px;color:${C.orange};font-size:12px">
        Only ${d.effectiveVacation} of ${vacation} vacation days fit in the remaining weekdays.
      </div>` : ''}
    `;
  }

  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; update(); }, 200);
  });
  observer.observe(document.documentElement, {
    childList: true, characterData: true, subtree: true
  });
  update();
  setInterval(update, 60000);
})();
