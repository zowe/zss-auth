/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/
const Promise = require('bluebird');
const ipaddr = require('ipaddr.js');
const url = require('url');
const makeProfileNameForRequest = require('./safprofile').makeProfileNameForRequest;

const log = global.COM_RS_COMMON_LOGGER.makeComponentLogger("_unp.auth.zss");

const DEFAULT_CLASS = "ZOWE";

const DEFAULT_EXPIRATION_MS = 3600000 //hour;

const HTTP_STATUS_PRECONDITION_REQUIRED = 428

function ZssAuthenticator(pluginDef, pluginConf, serverConf) {
  this.authPluginID = pluginDef.identifier;
  this.resourceClass = DEFAULT_CLASS;
  this.sessionExpirationMS = DEFAULT_EXPIRATION_MS; //ahead of time assumption of unconfigurable zss session length
  this.instanceID = serverConf.instanceID;
  this.capabilities = {
    "canGetStatus": true,
    "canRefresh": true,
    "canAuthenticate": true,
    "canAuthorize": true,
    "canLogout": true,
    "proxyAuthorizations": true,
    "processesProxyHeaders": true,
    "canResetPassword": true
  };
}

ZssAuthenticator.prototype = {

  getCapabilities(){
    return this.capabilities;
  },

  getStatus(sessionState) {
    const expms = sessionState.sessionExpTime - Date.now();
    if (expms <= 0 || sessionState.sessionExpTime === undefined) {
      sessionState.authenticated = false;
      delete sessionState.zssUsername;
      delete sessionState.zssCookies;
      return { authenticated: false };
    }
    return {  
      authenticated: !!sessionState.authenticated, 
      username: sessionState.zssUsername,
      expms: sessionState.sessionExpTime ? expms : undefined
    };
  },

  _authenticateOrRefresh(request, sessionState, isRefresh) {
    return new Promise((resolve, reject) => {
      if (isRefresh && !sessionState.zssCookies) {
        reject(new Error('No cookie given for refresh or check, skipping zss request'));
        return;
      }
      let options = isRefresh ? {
        method: 'GET',
        headers: {'cookie': sessionState.zssCookies}
      } : {
        method: 'POST',
        body: request.body
      };
      request.zluxData.webApp.callRootService("login", options).then((response) => {
        if (response.statusCode == HTTP_STATUS_PRECONDITION_REQUIRED) {
          sessionState.authenticated = false;
          delete sessionState.zssUsername;
          delete sessionState.zssCookies;
          resolve({ success: false, reason: 'Expired Password', canChangePassword: true});
        }
        let zssCookie;
        if (typeof response.headers['set-cookie'] === 'object') {
          for (const cookie of response.headers['set-cookie']) {
            const content = cookie.split(';')[0];
            //TODO proper manage cookie expiration
            if (content.indexOf('jedHTTPSession') >= 0) {
              zssCookie = content;
            }
          }
        }
        if (zssCookie) {
          if (!isRefresh) {
            sessionState.zssUsername = request.body.username.toUpperCase();
          }
          sessionState.authenticated = true;
          sessionState.sessionExpTime = Date.now() + DEFAULT_EXPIRATION_MS;
          //intended to be known as result of network call
          sessionState.zssCookies = zssCookie;
          resolve({ success: true, username: sessionState.zssUsername, expms: DEFAULT_EXPIRATION_MS, canChangePassword: true })
        } else {
          sessionState.authenticated = false;
          delete sessionState.zssUsername;
          delete sessionState.zssCookies;
          if (response.statusCode === 500) {
            resolve({ success: false, reason: 'ConnectionError'});
          } else {
            resolve({ success: false});
          }
        }
      }).catch((e) =>  {
        reject(e);
      });
    });
  },

  refreshStatus(request, sessionState) {
      return this._authenticateOrRefresh(request, sessionState, true).catch ((e)=> {
        console.log(e);
        //dont un-auth or delete cookie... perhaps this was a network error. Let session expire naturally if no success
        return { success: false };
      });
  },

  passwordReset(request, sessionState) {
    return new Promise((resolve, reject) => {
      let options = {
        method: 'POST',
        body: request.body
      };
      request.zluxData.webApp.callRootService("password", options).then((response) => {
        if (response.statusCode === 200) {
          resolve({ success: true , response: JSON.parse(response.body)['status'] });
        } else {
          resolve({ success: false, responseCode: response.statusCode, response: JSON.parse(response.body)['status'] });
        }
      }).catch((e) =>  {
        reject(e);
      });
    });
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
    return this._authenticateOrRefresh(request, sessionState, false).catch ((e)=> {
      console.log(e);
      sessionState.authenticated = false;
      delete sessionState.zssUsername;
      delete sessionState.zssCookies;
      return { success: false };
    });
  },

  logout(request, sessionState) {
    return new Promise((resolve, reject) => {
      sessionState.authenticated = false;
      delete sessionState.zssUsername;
      let options = {
        method: 'GET',
        headers: {'cookie': sessionState.zssCookies+''}
      };
      delete sessionState.zssCookies;
      request.zluxData.webApp.callRootService("logout", options).then((response) => {
        //did logout or already logged out
        if (response.statusCode === 200 || response.statusCode === 401) {
          resolve({ success: true });
        } else {
          resolve({ success: false, reason: response.statusCode });
        }
      }).catch((e) =>  {
        reject(e);
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
  authorized: Promise.coroutine(function *authorized(request, sessionState, 
      options) {
    const result = { authenticated: false, authorized: false };
    options = options || {};
    try {
      const { syncOnly } = options;
      let bypassUrls = [
        '/login',
        '/unixfile',
        '/datasetContents',
        '/VSAMdatasetContents',
        '/datasetMetadata',
        '/omvs',
        '/security-mgmt'
      ]
      for(let i = 0; i < bypassUrls.length; i++){
        if(request.originalUrl.startsWith(bypassUrls[i])){
          result.authorized = true;
          return result;
        }
      }
      if (!sessionState.authenticated) {
        return result;
      }
      result.authenticated = true;
      request.username = sessionState.zssUsername;
      if (options.bypassAuthorizatonCheck) {
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
        this._allowIfLoopback(request, result);
        return result;
      }
      const resourceName = this._makeProfileName(request.originalUrl, 
          request.method);
      if (syncOnly) {
        // can't do anything further: the user is authenticated but we can't 
        // make an actual RBAC check
        log.info(`Can't make a call to the OS agent for access check. ` +
            `Allowing ${sessionState.zssUsername} access to ${resourceName} ` +
            'unconditinally');
        result.authorized = true;
        return result;
      }
      //log.info(`saf-auth: username:${sessionState.zssUsername}, resource:${resourceName}`);
      const httpResponse = yield this._callAgent(request.zluxData, 
          sessionState.zssUsername,  resourceName);
      this._processAgentResponse(httpResponse, result, sessionState.zssUsername);
      //log.info(`saf-auth: result:${JSON.stringify(result)}, statusCode:${httpResponse.statusCode} response:${JSON.stringify(httpResponse.body)}}`);
      //console.log("returning result", result)
      return result;
    } catch (e) {
      log.warn(`User ${sessionState.zssUsername}, `
        + `authorization problem: ${e.message}`, e);
      result.authorized = false;
      result.message = "Problem checking auth permissions";
      return result;
    }
  }), 
  
  addProxyAuthorizations(req1, req2Options, sessionState) {
    if (req1.cookies) {
      delete req1.cookies['jedHTTPSession'];
    }
    if (!sessionState.zssCookies) {
      return;
    }
    req2Options.headers['cookie'] = sessionState.zssCookies;
  },

  processProxiedHeaders(req, headers, sessionState) {
    let cookies = headers['set-cookie'];
    if (cookies) {
      let modifiedCookies = [];
      for (let i = 0; i < cookies.length; i++) {
        if (cookies[i].startsWith('jedHTTPSession')) {
          let zssCookie = cookies[i];
          let semiIndex = zssCookie.indexOf(';');
          sessionState.zssCookies = semiIndex != -1 ? zssCookie.substring(0,semiIndex) : zssCookie;
          
        } else {
          modifiedCookies.push(cookies[i]);
        }
      }
      headers['set-cookie']=modifiedCookies;
    }
    return headers;
  },
  
  _allowIfLoopback(request, result) {
    const requestIP = ipaddr.process(request.ip);
    if (requestIP.range() == "loopback") {
      result.authorized = true;
    } else {
      log.warn(`Access to /saf-auth blocked, caller:  ${request.ip}`)
      result.authorized = false;
    }
  },
  
  _makeProfileName(reqUrl, method) {
    //console.log("request.originalUrl", request.originalUrl)
    const path = url.parse(reqUrl).pathname;
    //console.log("originalPath", originalPath)
    const resourceName = makeProfileNameForRequest(path, method, this.instanceID);
    //console.log("resourceName", resourceName)
    return resourceName;
  },
  
  _callAgent(zluxData, userName, resourceName) {
    //console.log("resourceName", resourceName)
    userName = encodeURIComponent(userName);
    resourceName = encodeURI(resourceName);
    resourceName = resourceName.replace(/%/g,':');
    const path = `${resourceName}/READ`;
    //console.log('trying path ', path);
    //console.log(new Error("stack trace before calling root serivce"))
    //log.info("path:", path);
    return zluxData.webApp.callRootService("saf-auth", path);
  },
  
  _processAgentResponse(httpResponse, result, username) {
    if (!(200 <= httpResponse.statusCode && httpResponse.statusCode < 299)) {
      result.authorized = false;
      result.message = httpResponse.body;
    } else {
      //console.log("httpResponse.body", httpResponse.body)
      const responseBody = JSON.parse(httpResponse.body);
      if (responseBody.authorized === true) {
        result.authorized = true;
      } else if (responseBody.authorized === false) {
        result.authorized = false;
        result.message = responseBody.message;
      } else {
        result.authorized = false;
        result.message = "Problem checking access permissions";
        log.warn(`User ${username}, `
            + `authorization problem: ${responseBody.message}`);
      }
    }
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
