/**************************************************************************************
 * google.script.run SHIM
 * Your existing sidebar script (copied verbatim from Index.html below) calls
 * google.script.run.withSuccessHandler(fn).withFailureHandler(fn).someFunction(data)
 * That API only exists inside real Apps Script HtmlService pages. This shim
 * recreates the same chainable interface, but instead of running inside
 * Google's sandbox, it sends a POST to your deployed Apps Script Web App
 * (config.js) and calls your success/failure handler with the result.
 * Nothing in the big <script> block further down needed to change.
 **************************************************************************************/

function apiCall(action, args) {
  if (!window.APP_CONFIG || !APP_CONFIG.API_URL || APP_CONFIG.API_URL.indexOf('PASTE_') !== -1) {
    return Promise.reject(new Error('config.js is not set up yet — paste your /exec URL and API token in there first.'));
  }
  return fetch(APP_CONFIG.API_URL, {
    method: 'POST',
    // text/plain (not application/json) deliberately — see ApiRouter.gs for why.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: APP_CONFIG.API_TOKEN, action: action, args: args })
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
