# AI workflow

This project was built with an AI assistant (Claude) working as the developer, with a human acting as product owner and QA tester.

## Roles

- **Human (QA / product owner):** supplied the requirements document, decided scope, ran the application, reported defects.
- **AI (developer):** read the requirements, designed the architecture, wrote code, migrations, tests, Docker setup and documentation, and verified its own work in a real browser.

## Process

1. **Requirements analysis.** The AI extracted every "must" from the requirements document (auth, verification, teams, epics, tickets, comments, board, API rules, Docker) into a checklist.
2. **Design decisions.** PostgreSQL constraints carry business rules wherever possible (case-insensitive unique names, composite foreign key so an epic must belong to the ticket's team, `RESTRICT` deletes). The API repeats the checks to return clear 4xx/409 errors.
3. **Backend first, with tests.** The API was implemented together with automated tests against a real database before any UI existed.
4. **Frontend.** React SPA, native drag-and-drop with optimistic update and rollback on failure.
5. **Verification by AI.** A scripted real-browser run (Chrome) walked through sign-up, email verification, login, teams, epics, tickets, comments, drag-and-drop persistence after reload, failed-move rollback and filters.
6. **Human QA.** The human tests the running system against the requirements and reports defects, which the AI fixes.

## What was checked by a human vs. by AI

AI-generated code is not trusted by default: behaviour is confirmed by running automated tests and the browser script, and the final acceptance is performed by the human tester using the requirements document as the checklist.

## Limits and honesty notes

- The AI environment had no access to Docker Hub, so `docker compose up --build` itself was verified by the human tester, not by the AI; each Dockerfile step was checked natively.
- Stretch goals (password reset, comment editing, activity history) were intentionally not implemented.
