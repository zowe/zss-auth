/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/
const Promise = require('bluebird');
const ipaddr = require('ipaddr.js');
const AuthManager = require("auth-manager");
const log = global.COM_RS_COMMON_LOGGER.makeComponentLogger("_unp.auth.zss");

function ZssAuthenticator(pluginDef, pluginConf, serverConf) {
  this.authPluginID = pluginDef.identifier;
}

const bypassSAFCheck = false;

ZssAuthenticator.prototype = {

  getStatus(sessionState) {
    return {  
      authenticated: !!sessionState.authenticated, 
      username: sessionState.zssUsername
    };
  },
  
  /**
   * Should be called e.g. when the users enters credentials
   * 
   * Supposed to change the state of the client-server session. NOP for 
   * stateless authentication (e.g. HTTP basic). 
   * 
   * `request` must be treated as read-only by the code. `sessionState` is this
   * plugin's private storage within the session (if stateful)
   * 
   * If auth doesn't fail, should return an object containing at least 
   * { success: true }. Should not reject the promise.
   */ 
  authenticate(request, sessionState) {
    return new Promise((resolve, reject) => {
    request.zluxData.webApp.callRootService("login", { 
      method: "POST",
      body: request.body
    }).then((response) => {
        let zssCookie;
        for (const cookie of response.headers['set-cookie']) {
          const content = cookie.split(';')[0];
          //TODO proper manage cookie expiration
          if (content.indexOf('jedHTTPSession') >= 0) {
            zssCookie = content;
          }
        }
        if (zssCookie) {
          sessionState.zssUsername = request.body.username.toUpperCase();
          sessionState.authenticated = true;
          sessionState.zssCookies = zssCookie;
          resolve({ success: true })
        } else {
          sessionState.authenticated = false;
          delete sessionState.zssUsername;
          delete sessionState.zssCookies;
          resolve({ success: false })
        }
      }).catch((e) =>  { 
        console.log(e);
        sessionState.authenticated = false;
        delete sessionState.zssUsername;
        delete sessionState.zssCookies;
        resolve({ success: false }) 
      });
    });
  },

  /**
   * Invoked for every service call by the middleware.
   * 
   * Checks if the session is valid in a stateful scheme, or authenticates the
   * request in a stateless scheme. Then checks if the user can access the
   * resource.  Modifies the request if necessary.
   * 
   * `sessionState` is this plugin's private storage within the session (if 
   * stateful)
   * 
   * The promise should resolve to an object containing, at least, 
   * { authorized: true } if everything is fine. Should not reject the promise.
   */
  authorized: Promise.coroutine(function *(request, sessionState) {
    const result = { authenticated: false, authorized: false };
    //console.log('request.originalUrl', request.originalUrl)
    try {
      if (request.url === "/login") {
        result.authorized = true;
        return result;
      }
      if (!sessionState.authenticated) {
        return result;
      }
      result.authenticated = true;
      request.username = sessionState.zssUsername;
      if (bypassSAFCheck) {
        result.authorized = true;
        return result;
      }
      if (request.originalUrl.startsWith("/saf-auth")) {
        //The '/saf-auth' service must not be available to external callers.
        //Note that this potentially allows someone running the browser on
        //the same host to still access the service. However:
        // 1. That shouldn't be allowed
        // 2. They can run the request agains the ZSS host itself. The firewall
        //    would allow that. So, simply go back to item 1
        const requestIP = ipaddr.process(request.ip);
        if (requestIP.range() == "loopback") {
          result.authorized = true;
        } else {
          log.warn(`Access to /saf-auth blocked, caller:  ${request.ip}`)
          result.authorized = false;
        }
        return result;
      }
      const resourceName = AuthManager.getResourceName(request.originalUrl, 
          request.method);
      //console.log("resourceName", resourceName)
      //TODO better utilize UACC:
      const path = `${sessionState.zssUsername}/XFACILIT/${resourceName}/`
        + 'READ';
      //console.log('trying path ', path);
      const httpResponse = yield request.zluxData.webApp.callRootService(
          "saf-auth", path);
      const responseBody = JSON.parse(httpResponse.body);
      if ((httpResponse.statusCode == 200) 
          && (responseBody.authorized === true)) {
        result.authorized = true;
      } else if (responseBody.authorized === false) {
        result.authorized = false;
        result.message = responseBody.message;
      } else {
        result.authorized = false;
        result.message = "Problem checking access permissions";
        log.warn(`User ${sessionState.zssUsername}, `
            + `authorization problem: ${responseBody.message}`);
      }
      return result;
    } catch (e) {
      log.warn(`User ${sessionState.zssUsername}, `
        + `authorization problem: ${e.message}`);
      console.log(e);
      return { authenticated: false, authorized: false, 
        message: "Problem checking auth permissions"};
    }
  }), 
  
  addProxyAuthorizations(req1, req2Options, sessionState) {
    if (!sessionState.zssCookies) {
      return;
    }
    req2Options.headers['cookie'] = sessionState.zssCookies;
  }
};

module.exports = function(pluginDef, pluginConf, serverConf) {
  return Promise.resolve(new ZssAuthenticator(pluginDef, pluginConf, 
      serverConf));
}


/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/
