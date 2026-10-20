(function () {
  var vsBase = new URL("vs/", document.baseURI).href;
  var base = new URL("..", vsBase).href;
  var workerMain = vsBase + "base/worker/workerMain.js";

  window.MonacoEnvironment = {
    getWorkerUrl: function () {
      return "data:text/javascript;charset=utf-8," + encodeURIComponent(
        "self.MonacoEnvironment={baseUrl:'" + base + "'};" +
        "importScripts('" + workerMain + "');"
      );
    }
  };
})();
