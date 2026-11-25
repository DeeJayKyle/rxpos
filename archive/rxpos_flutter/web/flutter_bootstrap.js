{{flutter_js}}
{{flutter_build_config}}
// The app's files sit in this script's folder (/app/ on rxposug.com, the root while developing).
const rxBase = new URL('.', document.currentScript.src).pathname;
_flutter.loader.load({
  config: { entrypointBaseUrl: rxBase, assetBase: rxBase, canvasKitBaseUrl: rxBase + 'canvaskit/' },
});
