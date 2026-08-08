/**************************************************************************************
 * CONFIG — the only file you should need to edit.
 *
 * API_URL: Deploy > Manage deployments in your Apps Script project, copy the
 *          URL ending in /exec (NOT /dev, NOT the editor URL).
 * API_TOKEN: Run setupApiToken() once from the Apps Script editor (see
 *            ApiRouter.gs), then check View > Executions / Logs for the
 *            printed token and paste it below.
 *
 * Heads up: this token sits in plain text in a file served publicly on
 * GitHub Pages. That's fine for "not-guessable, not indexed anywhere"
 * privacy, but it is NOT real security — anyone who finds this exact URL
 * could read/write your sheet. Keep the repo unlisted if you want, and
 * rotate the token (re-run setupApiToken) if you ever suspect it leaked.
 **************************************************************************************/
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwMIdOZCx8wpKFdrvc9SrZZIZZVGgJLdAYK7RFqAaAMng_Ot-CN1OU2ujo-b006o01r/exec',
  API_TOKEN: 'a8bdad34-ce41-4fdf-ad98-c6c680dd95ecd0da457a-b7b6-4417-abda-5e54e8de3643'
};
