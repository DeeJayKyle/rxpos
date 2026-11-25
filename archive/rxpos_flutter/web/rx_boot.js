// Runs before the app (a file, not inline: the site's security policy allows no inline scripts).
// links from the classic app (rxposug.com/#/inventory): the same page here; its owner console and password
// reset pages stay in the classic app
(function () {
  var h = location.hash;
  if (!h || h.indexOf('#/') !== 0) return;
  if (/owner|password|reset|google|pharmacy/i.test(h)) { location.replace('/classic/' + h); return; }
  history.replaceState(null, '', h.slice(1) || '/');
})();
window.addEventListener('flutter-first-frame', function () {
  var l = document.getElementById('rx-loading');
  if (!l) return;
  l.style.opacity = '0';
  setTimeout(function () { l.remove(); }, 300);
});
