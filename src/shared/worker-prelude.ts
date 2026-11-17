import { appVersionForProfile, navigatorPlatformForProfile, userAgentForProfile, userAgentMetadataForProfile, webgpuAdapterInfoForProfile } from "./profiles";
import type { Profile } from "./types";

declare const __GHOST_WORKER_TIME_PATCH__: string;

export interface WorkerIdentityOptions {
  profile: Profile;
  /** The browser's real User-Agent, used to derive the Chromium version. */
  baseUserAgent: string;
  globalPrivacyControlEnabled: boolean;
  uaSpoofingEnabled: boolean;
  webglInfoSpoofingEnabled: boolean;
}

// Script source that gives a worker global the same identity as the page. It
// is prefixed to tracked Blob workers by the page.
export function workerIdentityPrelude(options: WorkerIdentityOptions): string {
  const { profile, baseUserAgent } = options;
  // Values are resolved here so the worker reports exactly what the page's
  // navigator getters report, without shipping the profile logic into it.
  const identity = {
    intlLocale: profile.intlLocale,
    timezoneId: profile.timezoneId,
    language: profile.locale,
    languages: profile.languages,
    deviceMemory: profile.deviceMemory,
    globalPrivacyControl: options.globalPrivacyControlEnabled,
    userAgent: options.uaSpoofingEnabled
      ? {
        platform: navigatorPlatformForProfile(profile, baseUserAgent),
        userAgent: userAgentForProfile(profile, baseUserAgent),
        appVersion: appVersionForProfile(profile, baseUserAgent),
        metadata: userAgentMetadataForProfile(profile, baseUserAgent) ?? null
      }
      : null
  };
  const webgpu = options.webglInfoSpoofingEnabled ? webgpuAdapterInfoForProfile(profile) : null;
  return [
    "(function(){",
    "var sources=new WeakMap(),nativeToString=Function.prototype.toString;",
    "function mask(wrapper,native){sources.set(wrapper,native);return wrapper;}",
    "try{Object.defineProperty(Function.prototype,\"toString\",{configurable:true,writable:true,value:mask(function toString(){var native=sources.get(this);return nativeToString.call(native||this);},nativeToString)});}catch(error){}",
    workerNavigatorPrelude(identity),
    // Same Date/Intl rewriting as the page; reads `identity` and `mask` above.
    `try{${__GHOST_WORKER_TIME_PATCH__}}catch(error){}`,
    options.webglInfoSpoofingEnabled ? workerWebGLPrelude(profile) : "",
    webgpu
      ? `var info=${JSON.stringify(webgpu)},gpuProto=self.GPUAdapterInfo&&self.GPUAdapterInfo.prototype;if(gpuProto){["vendor","architecture","device","description"].forEach(function(key){var descriptor=Object.getOwnPropertyDescriptor(gpuProto,key);if(!descriptor||!descriptor.get)return;var nativeGetter=descriptor.get;try{Object.defineProperty(gpuProto,key,{configurable:true,enumerable:descriptor.enumerable,get:mask(function(){nativeGetter.call(this);return info[key];},nativeGetter)});}catch(error){}});}`
      : "",
    "})();"
  ].join("");
}

// Mirrors patchNavigator/patchGlobalPrivacyControl on WorkerNavigator, which
// has no `vendor`.
function workerNavigatorPrelude(identity: object): string {
  return [
    `var identity=${JSON.stringify(identity)},nav=self.navigator,navProto=nav&&Object.getPrototypeOf(nav);`,
    "if(navProto){",
    "var defineNav=function(key,read){var descriptor=Object.getOwnPropertyDescriptor(navProto,key),nativeGetter=descriptor&&descriptor.get;try{",
    "Object.defineProperty(navProto,key,{configurable:true,enumerable:descriptor?descriptor.enumerable:true,get:nativeGetter?mask(new Proxy(nativeGetter,{apply:function(target,receiver,args){Reflect.apply(target,receiver,args);return read();}}),nativeGetter):read});",
    "}catch(error){}};",
    "var languages=Object.freeze(identity.languages),nativeGpc=!!nav.globalPrivacyControl;",
    "defineNav(\"language\",function(){return identity.language;});",
    "defineNav(\"languages\",function(){return languages;});",
    "defineNav(\"deviceMemory\",function(){return identity.deviceMemory;});",
    "defineNav(\"globalPrivacyControl\",function(){return identity.globalPrivacyControl||nativeGpc;});",
    "var ua=identity.userAgent;if(ua){",
    "defineNav(\"platform\",function(){return ua.platform;});",
    "defineNav(\"userAgent\",function(){return ua.userAgent;});",
    "defineNav(\"appVersion\",function(){return ua.appVersion;});",
    "var metadata=ua.metadata;",
    "if(!metadata){var removed=false;try{removed=delete navProto.userAgentData;}catch(error){}if(!removed)defineNav(\"userAgentData\",function(){return undefined;});}else{",
    "var uaProto=self.NavigatorUAData&&self.NavigatorUAData.prototype,clone=function(value){return JSON.parse(JSON.stringify(value));},",
    "lowEntropy=function(){return{brands:clone(metadata.brands),mobile:metadata.mobile,platform:metadata.platform};},uaData=Object.create(uaProto||Object.prototype);",
    "Object.defineProperties(uaData,{",
    "brands:{value:Object.freeze(metadata.brands.map(function(brand){return Object.freeze(clone(brand));})),enumerable:true},",
    "mobile:{value:metadata.mobile,enumerable:true},",
    "platform:{value:metadata.platform,enumerable:true},",
    "getHighEntropyValues:{value:mask(async function getHighEntropyValues(hints){var values=lowEntropy();for(var hint of hints){if(hint in metadata)values[hint]=clone(metadata[hint]);}return values;},uaProto&&uaProto.getHighEntropyValues)},",
    "toJSON:{value:mask(function toJSON(){return lowEntropy();},uaProto&&uaProto.toJSON)}",
    "});Object.freeze(uaData);defineNav(\"userAgentData\",function(){return uaData;});",
    "}}}"
  ].join("");
}

function workerWebGLPrelude(profile: Profile): string {
  return [
    `var vendor=${JSON.stringify(profile.webglVendor)},renderer=${JSON.stringify(profile.webglRenderer)};`,
    "function patchWebGL(proto){if(!proto)return;var nativeGetParameter=proto.getParameter;try{",
    "Object.defineProperty(proto,\"getParameter\",{configurable:true,writable:true,value:mask(new Proxy(nativeGetParameter,{apply:function(target,receiver,args){",
    "var parameter=args[0];if(parameter!==null&&(typeof parameter===\"object\"||typeof parameter===\"function\")){var originalParameter=parameter;args[0]=new Proxy({},{get:function(_,key){var method=Reflect.get(originalParameter,key);return typeof method===\"function\"?function(){return parameter=Reflect.apply(method,originalParameter,arguments);}:method;}});}",
    "var value=Reflect.apply(target,receiver,args);if(typeof value===\"string\"){parameter=+parameter>>>0;if(parameter===37445)return vendor;if(parameter===37446)return renderer;}return value;}}),nativeGetParameter)});",
    "}catch(error){}}",
    "patchWebGL(self.WebGLRenderingContext&&self.WebGLRenderingContext.prototype);",
    "patchWebGL(self.WebGL2RenderingContext&&self.WebGL2RenderingContext.prototype);"
  ].join("");
}
