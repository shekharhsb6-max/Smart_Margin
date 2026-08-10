/**************************************************************************************
 * API ROUTER
 * Turns this Apps Script project into a JSON API that the standalone PWA
 * frontend (hosted on GitHub Pages) calls over fetch(). Add this as a NEW
 * script file in the same Apps Script project as Code.gs / CorporateActions.gs
 * / Index.html — nothing in those files needs to change.
 *
 * WHY text/plain instead of application/json:
 * Apps Script web apps cannot respond to CORS "preflight" (OPTIONS) requests.
 * A POST with Content-Type: application/json is a "non-simple" request, so
 * the browser sends a preflight first, which Apps Script can't answer, and
 * the whole call fails. Content-Type: text/plain is a "simple" request, so
 * the browser skips preflight entirely and the POST just goes through. This
 * is the exact same trick you already used for the Colab -> Apps Script
 * scanner POSTs. The body is still JSON text — we're just lying about the
 * Content-Type header to keep the browser happy. doPost() below parses it
 * as JSON regardless of what header it arrived with.
 *
 * ACCESS CONTROL (PIN gate):
 * The real API_TOKEN is no longer shipped in config.js on the public repo.
 * Instead, the frontend shows a 4-digit PIN screen on every app open. The
 * PIN is submitted via a special "login" action (below) which does NOT
 * require a token - it's the one action anyone can call without
 * credentials, by design, since its whole job is to check the PIN and
 * hand back the real token if it's correct. Every OTHER action still goes
 * through apiCheckToken_ exactly as before. Failed PIN attempts are rate-
 * limited server-side (5 tries, then a 15-minute lockout) so a 4-digit PIN
 * can't be brute-forced by hammering the endpoint.
 **************************************************************************************/

// Whitelisted actions -> underlying functions. Nothing outside this list is callable,
// no matter what a request asks for.
var API_ACTIONS = {
  addPosition: addPosition,
  closePosition: closePosition,
  getPositionsList: getPositionsList,
  getOpenPositionOptions: getOpenPositionOptions,
  addCharge: addCharge,
  editCharge: editCharge,
  deleteCharge: deleteCharge,
  editPosition: editPosition,
  deletePosition: deletePosition,
  archiveClosedPositionsBefore: archiveClosedPositionsBefore,
  getPortfolioSummary: getPortfolioSummary,
  getRiskSettings: getRiskSettings,
  saveRiskSettings: saveRiskSettings,
  calculatePositionSize: calculatePositionSize,
  getCapacityStatus: getCapacityStatus,
  getTrailingSettings: getTrailingSettings,
  addLoanRepayment: addLoanRepayment,
  deleteLoanRepayment: deleteLoanRepayment,
  getLoanRepayments: getLoanRepayments,
  getFYSummary: getFYSummary,
  getFYHistory: getFYHistory,
  saveTrailingSettings: saveTrailingSettings,
  updateTrailingLevels: updateTrailingLevels,
  installAutoRefreshTrigger: installAutoRefreshTrigger,
  removeAutoRefreshTrigger: removeAutoRefreshTrigger,
  getAutoRefreshStatus: getAutoRefreshStatus,
  addCapitalEntry: addCapitalEntry,
  deleteCapitalEntry: deleteCapitalEntry,
  editCapitalEntry: editCapitalEntry,
  getLedgerEntries: getLedgerEntries,
  getCapitalEntries: getCapitalEntries,
  getCashPosition: getCashPosition,
  getProfitDistributionPlan: getProfitDistributionPlan,
  saveTaxAndWithdrawalSettings: saveTaxAndWithdrawalSettings,
  getSettingsValues: getSettingsValues,
  saveDefaults: saveDefaults,
  getXirr: getXirr,
  getFundPositionAsOf: getFundPositionAsOf,
  getCorporateActionData: getCorporateActionData,
  refreshCorporateActionData: refreshCorporateActionData,
  addManualCorporateAction: addManualCorporateAction
};

function apiJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function apiCheckToken_(token) {
  var real = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!real) throw new Error('No API_TOKEN set yet. Open this project in the Apps Script editor, select setupApiToken from the function dropdown, and Run it once.');
  if (!token || token !== real) throw new Error('Invalid or missing API token.');
}

/* ---------- PIN gate: rate-limited login ---------- */

var PIN_MAX_ATTEMPTS = 5;
var PIN_LOCKOUT_MINUTES = 15;

function apiCheckPinRateLimit_() {
  var props = PropertiesService.getScriptProperties();
  var lockUntil = Number(props.getProperty('PIN_LOCK_UNTIL') || 0);
  if (Date.now() < lockUntil) {
    var remainingMin = Math.ceil((lockUntil - Date.now()) / 60000);
    throw new Error('Too many incorrect PIN attempts. Try again in ' + remainingMin + ' minute(s).');
  }
}

function apiRegisterFailedPin_() {
  var props = PropertiesService.getScriptProperties();
  var attempts = Number(props.getProperty('PIN_FAIL_COUNT') || 0) + 1;
  if (attempts >= PIN_MAX_ATTEMPTS) {
    props.setProperty('PIN_LOCK_UNTIL', String(Date.now() + PIN_LOCKOUT_MINUTES * 60 * 1000));
    props.setProperty('PIN_FAIL_COUNT', '0');
  } else {
    props.setProperty('PIN_FAIL_COUNT', String(attempts));
  }
}

function apiResetFailedPin_() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('PIN_FAIL_COUNT', '0');
  props.deleteProperty('PIN_LOCK_UNTIL');
}

/**
 * Checks a submitted PIN against the stored PIN (set via setupAppPin below).
 * On success, hands back the real API_TOKEN so the frontend can use it for
 * the rest of that app session (held in memory only, never persisted, per
 * your requirement that the PIN is asked again on every app open).
 */
function apiLogin_(submittedPin) {
  apiCheckPinRateLimit_();

  var realPin = PropertiesService.getScriptProperties().getProperty('APP_PIN');
  if (!realPin) throw new Error('No APP_PIN set yet. Open this project in the Apps Script editor, select setupAppPin from the function dropdown, edit the PIN value inside it, and Run it once.');

  if (String(submittedPin || '') !== realPin) {
    apiRegisterFailedPin_();
    throw new Error('Incorrect PIN.');
  }
  apiResetFailedPin_();

  var token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!token) throw new Error('No API_TOKEN set yet. Open this project in the Apps Script editor, select setupApiToken from the function dropdown, and Run it once.');

  return { token: token };
}

/**
 * Handles every call from the PWA frontend. Body (sent as text/plain, but
 * JSON-formatted) looks like:
 *   { "action": "login", "pin": "1234" }                          <- no token needed
 *   { "token": "...", "action": "getPortfolioSummary", "args": [] } <- token required
 * args is always an array, matching the positional arguments the underlying
 * function expects (most take one object, a couple take two plain values).
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    // Special case: logging in is the ONE action that doesn't need a token,
    // since its entire job is to exchange a correct PIN for the real token.
    if (action === 'login') {
      var result = apiLogin_(body.pin);
      return apiJson_({ ok: true, result: result });
    }

    apiCheckToken_(body.token);
    var args = body.args || [];
    var fn = API_ACTIONS[action];
    if (!fn) throw new Error('Unknown action: ' + action);
    var fnResult = fn.apply(null, args);
    return apiJson_({ ok: true, result: fnResult });
  } catch (err) {
    return apiJson_({ ok: false, error: err.message });
  }
}

/**
 * ONE-TIME SETUP. In the Apps Script editor, pick "setupApiToken" from the
 * function dropdown at the top and click Run (you'll be asked to authorize
 * — that's normal). Then View > Logs (or Executions) to see the generated
 * token. Copy it into config.js on the frontend (API_TOKEN). Re-run any
 * time to rotate the token — you'll need to update config.js again after.
 */
function setupApiToken() {
  var token = Utilities.getUuid() + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);
  Logger.log('API TOKEN (copy this into your frontend config.js):');
  Logger.log(token);
  return token;
}

/**
 * ONE-TIME (or anytime-you-want) SETUP for the PIN gate. In the Apps Script
 * editor, EDIT the pin value below to whatever 4 digits you want, then pick
 * "setupAppPin" from the function dropdown at the top and click Run. Re-run
 * any time to change the PIN — the new one takes effect immediately, and
 * any lockout/attempt counter is cleared at the same time.
 */
function setupAppPin() {
  var pin = '1234'; // <-- CHANGE THIS to your chosen 4-digit PIN before running

  if (!/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits (0-9 only). Edit the pin value in this function and run again.');
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty('APP_PIN', pin);
  props.setProperty('PIN_FAIL_COUNT', '0');
  props.deleteProperty('PIN_LOCK_UNTIL');

  Logger.log('App PIN saved successfully.');
}
