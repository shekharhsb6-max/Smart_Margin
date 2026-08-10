/**************************************************************************************
 * CONFIG — the only file you should need to edit.
 *
 * API_URL: Deploy > Manage deployments in your Apps Script project, copy the
 *          URL ending in /exec (NOT /dev, NOT the editor URL).
 *
 * There is deliberately no API_TOKEN here anymore. The app now shows a PIN
 * screen on every open (see shim.js + index.html); entering the correct PIN
 * asks the Apps Script backend for a one-time session token, which is held
 * in memory only for that page load and never written to any file. That
 * means this repo — even though it's public — no longer ships a working
 * credential to anyone who views the source. The PIN itself lives only in
 * your Apps Script project's Script Properties (set via setupAppPin() in
 * Api.gs), never in git.
 **************************************************************************************/
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwMIdOZCx8wpKFdrvc9SrZZIZZVGgJLdAYK7RFqAaAMng_Ot-CN1OU2ujo-b006o01r/exec'
};
