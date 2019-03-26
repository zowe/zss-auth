const ZOWE_PROFILE_NAME_LEN = 246;
const DEFAULT_INSTANCE_ID = "DEFAULT";

function partsUpToTotalLength(parts, maxLen) {
  let curLen = 0;
  const outParts = [];
  
  for (let p of parts) {
    curLen += p.length;
    if (curLen > maxLen) {
      break;
    }
    curLen++;  //account for the separator
    outParts.push(p);
  }
  return outParts;
}

function serviceProfileName(parms) {
  if (parms.productCode == null) {
    throw new Error("productCode missing");
  }
  if (parms.instanceID == null) {
    throw new Error("instanceID missing");
  }
  if (parms.pluginID == null) {
    throw new Error("pluginID missing");
  }
  if (parms.serviceName == null) {
    throw new Error("serviceName missing");
  }
  if (parms.method == null) {
    throw new Error("method missing");
  }
  return `${parms.productCode}.${parms.instanceID}.SVC.${parms.pluginID}`
      + `.${parms.serviceName}.${parms.method}`;
}

function configProfileName(parms) {
  if (parms.productCode == null) {
    throw new Error("productCode missing");
  }
  if (parms.instanceID == null) {
    throw new Error("instanceID missing");
  }
  if (parms.pluginID == null) {
    throw new Error("pluginID missing");
  }
  if (parms.method == null) {
    throw new Error("method missing");
  }
  if (parms.scope == null) {
    throw new Error("scope missing");
  }
  return `${parms.productCode}.${parms.instanceID}.CFG.${parms.pluginID}.`
      + `${parms.method}.${parms.scope}`;
}

function makeProfileName(type, parms) {
  const makeProfileName = (type == "service")? serviceProfileName : configProfileName;
  let profileName = makeProfileName(parms);
  if (profileName.length > ZOWE_PROFILE_NAME_LEN) {
    throw new Error("SAF resource name too long");
  }
  if (parms.subUrl.length > 0) {
    const usableParts = partsUpToTotalLength(parms.subUrl,
          ZOWE_PROFILE_NAME_LEN - profileName.length);
    if (usableParts.length > 0) {
      profileName += '.' + usableParts.join('.');
    }
  }
  return profileName;
}

function makeProfileNameForRequest(url, method, instanceID) {
  url = url.toUpperCase();
  let [_l, productCode, _p, pluginID, _s, serviceName, _v, ...subUrl] = url.split('/');
  let type;
  let urlData;
  if (!instanceID) {
    instanceID = DEFAULT_INSTANCE_ID;
  }
  subUrl = subUrl.filter(x => x);
  if ((pluginID === "ORG.ZOWE.CONFIGJS") && (serviceName === "DATA")) {
    type = "config";
    pluginID = subUrl[0];
    let scope = subUrl[1];
    subUrl = subUrl.slice(2);
    urlData = { productCode, instanceID, pluginID, method, scope, subUrl };
  } else {
    type = "service";
    urlData = { productCode, instanceID, pluginID, serviceName, method, subUrl };
  }
  urlData.pluginID = urlData.pluginID? urlData.pluginID.replace(/\./g, "_") : null;
  return makeProfileName(type, urlData);
};

exports.makeProfileNameForRequest = makeProfileNameForRequest;
exports.ZOWE_PROFILE_NAME_LEN = ZOWE_PROFILE_NAME_LEN;
