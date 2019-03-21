const assert = require('assert')
const safprofile = require('../lib/safprofile');
const makeProfileNameForRequest = safprofile.makeProfileNameForRequest;
  

const longStr1 = new Array(64).fill('A').join('');
const longStr2 = new Array(64).fill('B').join('');
const longStr3 = new Array(64).fill('C').join('');
const longStr4 = new Array(64).fill('D').join('');

describe('makeProfileNameForRequest', function() {
  
  it('should corectly generate service profiles', function() {
    const url = "/ZLUX/plugins/org.zowe.zossystem.subsystems"
        + "/services/data/_current/zosDiscovery/naive/subsystems";
    
    const profile = "ZLUX.DEFAULT.SVC.ORG_ZOWE_ZOSSYSTEM_SUBSYSTEMS.DATA."
        + "GET.ZOSDISCOVERY.NAIVE.SUBSYSTEMS";
    
    const result = makeProfileNameForRequest(url, "GET", "DEFAULT");
    assert(result === profile);
  });
  
  it('should corectly generate config profiles', function() {
    const url = "/ZLUX/plugins/org.zowe.configjs/services/data/_current/"
        + "org.zowe.zlux.sample.angular/user/requests/app";
    
    const profile = "ZLUX.DEFAULT.CFG.ORG_ZOWE_ZLUX_SAMPLE_ANGULAR.GET.USER.REQUESTS.APP";
    
    const result = makeProfileNameForRequest(url, "GET", "DEFAULT");
    assert(result === profile);
  });
  
  it('should corectly generate service profiles withouth a path', function() {
    const url = "/ZLUX/plugins/org.zowe.zossystem.subsystems"
        + "/services/data/_current/";
    
    const profile = "ZLUX.DEFAULT.SVC.ORG_ZOWE_ZOSSYSTEM_SUBSYSTEMS.DATA.GET";
    
    const result = makeProfileNameForRequest(url, "GET", "DEFAULT");
    assert(result === profile);
  });
  
  it('should corectly generate config profiles withouth a path', function() {
    const url = "/ZLUX/plugins/org.zowe.configjs/services/data/_current/"
      + "org.zowe.zlux.sample.angular/user";
  
    const profile = "ZLUX.DEFAULT.CFG.ORG_ZOWE_ZLUX_SAMPLE_ANGULAR.GET.USER";
    
    const result = makeProfileNameForRequest(url, "GET", "DEFAULT");
    assert(result === profile);
  });
  
  it('should corectly generate service profiles with a long path', function() {
    const url1 = "/ZLUX/plugins/org.zowe.zossystem.subsystems"
        + "/services/data/_current/" + longStr1;
    const url2 = url1 + "/" + longStr2;
    const url3 = url2 + "/" + longStr3;
    const url4 = url3 + "/" + longStr4;
    
    const profile1 = "ZLUX.DEFAULT.SVC.ORG_ZOWE_ZOSSYSTEM_SUBSYSTEMS.DATA.GET."
        + longStr1;
    const profile2 = profile1 + "." + longStr2;
    const profile3 = "ZLUX.DEFAULT.SVC2.ORG_ZOWE_ZOSSYSTEM_SUBSYSTEMS.DATA.GET."
      + longStr1 + "." + longStr2;
    const profile4 = profile3;
    
    const result1 = makeProfileNameForRequest(url1, "GET", "DEFAULT");
    assert(result1 === profile1);
    assert(result1.length <= safprofile.ZOWE_PROFILE_NAME_LEN);
    
    const result2 = makeProfileNameForRequest(url2, "GET", "DEFAULT");
    assert(result2 === profile2)
    assert(result2.length <= safprofile.ZOWE_PROFILE_NAME_LEN);
    
    const result3 = makeProfileNameForRequest(url3, "GET", "DEFAULT");
    assert(result3 === profile3)
    assert(result3.length <= safprofile.ZOWE_PROFILE_NAME_LEN);
    
    const result4 = makeProfileNameForRequest(url4, "GET", "DEFAULT");
    assert(result4 === profile4)
    assert(result4.length <= safprofile.ZOWE_PROFILE_NAME_LEN);
  });
  
  it('should corectly generate config profiles with a long path', function() {
    const url1 = "/ZLUX/plugins/org.zowe.configjs/services/data/_current/"
      + "org.zowe.zlux.sample.angular/user" + longStr1;
    const url2 = url1 + "/" + longStr2;
    const url3 = url2 + "/" + longStr3;
    const url4 = url3 + "/" + longStr4;
    
    const profile1 = "ZLUX.DEFAULT.CFG.ORG_ZOWE_ZLUX_SAMPLE_ANGULAR.GET.USER"
        + longStr1;
    const profile2 = profile1 + "." + longStr2;
    const profile3 = "ZLUX.DEFAULT.CFG2.ORG_ZOWE_ZLUX_SAMPLE_ANGULAR.GET.USER"
      + longStr1 + "." + longStr2;
    const profile4 = profile3;
    
    const result1 = makeProfileNameForRequest(url1, "GET", "DEFAULT");
    assert(result1 === profile1);
    assert(result1.length <= safprofile.ZOWE_PROFILE_NAME_LEN);
    
    const result2 = makeProfileNameForRequest(url2, "GET", "DEFAULT");
    assert(result2 === profile2)
    assert(result2.length <= safprofile.ZOWE_PROFILE_NAME_LEN);
    
    const result3 = makeProfileNameForRequest(url3, "GET", "DEFAULT");
    assert(result3 === profile3)
    assert(result3.length <= safprofile.ZOWE_PROFILE_NAME_LEN);
    
    const result4 = makeProfileNameForRequest(url4, "GET", "DEFAULT");
    assert(result4 === profile4)
    assert(result4.length <= safprofile.ZOWE_PROFILE_NAME_LEN);
  });
  
  
  
});