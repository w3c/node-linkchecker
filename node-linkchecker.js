
'use strict';

// Pseudo-constants:
var DEFAULT_OPTIONS = {
   "schemes":   ["http", "https"],
   "robotExclusion": true,
   "userAgent": "node-linchecker"
};

var ua = require("superagent"),
    whacko = require("whacko"),
    url = require("url");

var uri = "https://www.w3.org/People/Antonio/spec/dummy-spec.html";

function checkScheme(uri) {
  for (var i = 0 ; i < DEFAULT_OPTIONS.schemes.length; i++) {
    var scheme = DEFAULT_OPTIONS.schemes[i];
    if (uri.substring(0, scheme.length) === scheme) {
      return true;
    }
  }
  return false;
}

// sort array and remove duplicates
function sortUniq(arr) {
  return arr.sort().filter(function(item, pos, a) {
    return !pos || item != a[pos - 1];
  })
}

function extract(err, res) {
  var $ = whacko.load(res.text),
      links = [],
      finalUrl = (res.redirects.length > 0) ? res.redirects[res.redirects.length - 1] : uri;
  $("a[href], link[href]").each(function() {
    var resolvedUrl = url.resolve(finalUrl, $(this).attr("href"));
    if (checkScheme(resolvedUrl))
      links.push(url.parse(resolvedUrl));
  });
  $("script[src], img[src], iframe[src]").each(function() {
    var resolvedUrl = url.resolve(finalUrl, $(this).attr("src"));
    if (checkScheme(resolvedUrl));
      links.push(url.parse(resolvedUrl));
  });

  sortUniq(links).forEach(function(link) {
    checkLink(link.href);
  });
}

function checkLink(href) {
  ua.head(href)
    .set("User-Agent", DEFAULT_OPTIONS.userAgent)
    .on('error', function(err) {
      console.log(err);
    })
    .end(function(err, res) {
       if (res.headers.location) {
         checkLink(res.headers.location);
       }
       else if (res.status !== 200) {
         console.log(href);
         console.log(res.status);
       }
    });
  }

  function checkFragment() {

  }



ua.get(uri)
  .set("User-Agent", DEFAULT_OPTIONS.userAgent)
  .end(extract);
