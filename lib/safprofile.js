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

function serviceProfileName(parms, type) {
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
  const sType = (type <= 1)? "SVC" : "SVC2";
  return `${parms.productCode}.${parms.instanceID}.${sType}.${parms.pluginID}`
      + `.${parms.serviceName}.${parms.method}`;
}

function configProfileName(parms, type) {
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
  const sType = (type <= 1)? "CFG" : "CFG2";
  return `${parms.productCode}.${parms.instanceID}.${sType}.${parms.pluginID}.`
      + `${parms.method}.${parms.scope}`;
}

function makeProfileName(type, parms) {
  const makeProfileName = (type == "service")? serviceProfileName : configProfileName;
  let type1Name = makeProfileName(parms, 1);
  if (parms.subUrl.length > 0) {
    type1Name += '.' + parms.subUrl.join('.');
  }
  if (type1Name.length <= ZOWE_PROFILE_NAME_LEN) {
    return type1Name;
  }
  
  let type2Name = makeProfileName(parms, 2);
  if (type2Name.length > ZOWE_PROFILE_NAME_LEN) {
    throw new Error("SAF resource name too long");
  }
  if (parms.subUrl.length > 0) {
    const usableParts = partsUpToTotalLength(parms.subUrl,
          ZOWE_PROFILE_NAME_LEN - type2Name.length);
    if (usableParts.length > 0) {
      type2Name += '.' + usableParts.join('.');
    }
  }
  return type2Name;
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
