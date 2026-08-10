/**************************************************************************************
 * google.script.run SHIM
 * Your existing sidebar script (copied verbatim from Index.html below) calls
 * google.script.run.withSuccessHandler(fn).withFailureHandler(fn).someFunction(data)
 * That API only exists inside real Apps Script HtmlService pages. This shim
 * recreates the same chainable interface, but instead of running inside
 * Google's sandbox, it sends a POST to your deployed Apps Script Web App
 * (config.js) and calls your success/failure handler with the result.
 * Nothing in the big <script> block further down needed to change.
 *
 * PIN GATE:
 * There is no API_TOKEN in config.js anymore. Instead, a session token
 * lives only in the API_SESSION_TOKEN variable below, set once per page
 * load by appLogin() after the person enters the correct PIN (see the
 * login gate in index.html). It is never written to localStorage,
 * sessionStorage, or any file — closing or reloading the tab clears it,
 * so the PIN is required again next time, by design. Every action except
 * "login" itself requires this token, exactly as the token requirement
 * worked before.
 **************************************************************************************/

var API_SESSION_TOKEN = null;

function apiCall(action, args) {
  if (!window.APP_CONFIG || !APP_CONFIG.API_URL || APP_CONFIG.API_URL.indexOf('PASTE_') !== -1) {
    return Promise.reject(new Error('config.js is not set up yet — paste your /exec URL in there first.'));
  }
  if (!API_SESSION_TOKEN) {
    return Promise.reject(new Error('Not logged in yet — enter the PIN first.'));
  }
  return fetch(APP_CONFIG.API_URL, {
    method: 'POST',
    // text/plain (not application/json) deliberately — see Api.gs for why.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: API_SESSION_TOKEN, action: action, args: args })
  })
    .then(function (r) {
      if (!r.ok) throw new Error('Network error (HTTP ' + r.status + ')');
      return r.json();
    })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Unknown API error');
      return data.result;
    });
}

/**
 * Called once from the PIN screen in index.html, before the app is shown.
 * Sends the PIN — this is the one call that deliberately needs no token,
 * since its entire job is to exchange a correct PIN for the real session
 * token. On success, stores that token in memory for the rest of this
 * page load only. Returns a Promise that resolves on success and rejects
 * with a readable error message (wrong PIN, locked out, etc.) on failure.
 */
function appLogin(pin) {
  if (!window.APP_CONFIG || !APP_CONFIG.API_URL || APP_CONFIG.API_URL.indexOf('PASTE_') !== -1) {
    return Promise.reject(new Error('config.js is not set up yet — paste your /exec URL in there first.'));
  }
  return fetch(APP_CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'login', pin: pin })
  })
    .then(function (r) {
      if (!r.ok) throw new Error('Network error (HTTP ' + r.status + ')');
      return r.json();
    })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Incorrect PIN.');
      API_SESSION_TOKEN = data.result.token;
      return true;
    });
}
window.appLogin = appLogin;

function makeRunProxy_() {
  var pendingSuccess = null;
  var pendingFailure = null;

  var handler = {
    get: function (target, prop) {
      if (prop === 'withSuccessHandler') {
        return function (fn) { pendingSuccess = fn; return proxy; };
      }
      if (prop === 'withFailureHandler') {
        return function (fn) { pendingFailure = fn; return proxy; };
      }
      // Anything else accessed here is treated as the server-side function name,
      // exactly like real google.script.run does.
      return function () {
        var args = Array.prototype.slice.call(arguments);
        var onSuccess = pendingSuccess, onFailure = pendingFailure;
        pendingSuccess = null; pendingFailure = null;
        apiCall(prop, args)
          .then(function (result) { if (onSuccess) onSuccess(result); })
          .catch(function (err) {
            if (onFailure) onFailure(err);
            else console.error('Unhandled API error:', err);
          });
      };
    }
  };

  var proxy = new Proxy({}, handler);
  return proxy;
}

window.google = { script: { run: makeRunProxy_() } };
