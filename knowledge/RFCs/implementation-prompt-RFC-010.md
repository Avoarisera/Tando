# Implementation Prompt — RFC-010: Calendar

## Context

You are implementing **RFC-010** of the WakaBods POC — the `/calendar` page with monthly grid view for all three roles, including the manager's "Absents aujourd'hui" panel and the admin's team filter.

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French**.

## What has already been implemented

RFC-001 through RFC-009 are complete:
- All leave request data and status transitions are working
- All composables, components, layout exist
- Stub `app/pages/calendar.vue` exists

## Your task

Implement everything defined in `RFCs/RFC-010-Calendar.md`:

1. **`app/composables/useCalendar.ts`** — fetches leave requests with joins, maps to `CalendarEvent[]` (id, userId, employeeName, leaveTypeName, leaveTypeColor, startDate, endDate, status, isOwn, teamName, teamId). Client-side filter: own events = all statuses; others' events = `approved` only.

2. **`app/components/calendar/CalendarEvent.vue`** — colored band with `backgroundColor: color + '33'` (20% opacity), left border in full color, employee first name shown only on event start day

3. **`app/components/calendar/CalendarGrid.vue`** — monthly grid: 7-column CSS `grid-cols-7`, day headers Lun–Dim (ISO week Monday first), today highlighted, month title + prev/next navigation, `eventsForDay(day)` finds overlapping events per cell, legend of leave types below

4. **`app/pages/calendar.vue`** — replaces stub, role-based rendering:
   - Employee: own events (all statuses) + team's approved events
   - Manager: same + "Absents aujourd'hui" panel (computed from loaded events, no extra query)
   - Admin: all approved events + team filter select

5. **"Absents aujourd'hui" panel** — computed: `events.filter(e => e.status === 'approved' && e.startDate <= today && e.endDate >= today)`

6. **Admin team filter** — fetch `teams` separately, `selectedTeamId ref<string | 'all'>`, filter `events` client-side by `teamId`

## Non-negotiable rules

1. **No calendar library unless truly necessary** — implement with CSS grid first (Tailwind `grid-cols-7`)
2. **RLS handles data scoping** — no manual team filtering in the Supabase query for employee/manager
3. **Client-side role filter**: own=all statuses, others=approved only — applied after fetch
4. **"Absents aujourd'hui"** computed from loaded data, no extra query
5. **Month navigation** recalculates the grid — the underlying events data is fetched once and stays in memory
6. **4 UI states** on the calendar section (loading skeleton / error / empty / grid)

## Checklist before declaring done

- [ ] `yarn nuxt typecheck` passes with zero errors
- [ ] Login as employee1 → April 2026 grid shows Emma's approved leave (Apr 14–18) as a green band
- [ ] Emma's pending request (May 12–16) shows with reduced opacity in May
- [ ] Other team members' pending requests NOT visible (only their approved ones)
- [ ] Prev/next month navigation works; month title updates in French
- [ ] Login as manager → "Absents aujourd'hui" panel visible
- [ ] Login as admin → team filter select available, filtering works
- [ ] Leave type legend shown below grid
- [ ] Skeleton shown during initial fetch
- [ ] Responsive at 375px (no horizontal scroll — use list view or compact grid)
