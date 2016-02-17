
'use strict';

// Pseudo-constants:
var DEFAULT_OPTIONS = {
   "schemes":   ["http", "https"],
   "userAgent": "node-linchecker",
   "robotExclusion": true,
   "fragments": true
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

function sortURLs(a, b) {
  if (a.href < b.href) return -1
  else if (a.href > b.href) return 1
  else return 0;
}

// sort array and remove duplicates
function sortUniq(arr) {
  return arr.sort(sortURLs).filter(function(item, pos, a) {
    return !pos || item.href != a[pos - 1].href;
  })
}

var list = {
  links : [],
  fragments: []
}

function extract(elements, attr, baseURL, $) {
  $(elements).each(function() {
    var resolvedUrl = url.resolve(baseURL, $(this).attr(attr));
    if (checkScheme(resolvedUrl)) {
      var u = url.parse(resolvedUrl);
      if (u.hash === null) {
        list.links.push(u);
      } else {
        list.fragments.push(u);
      }

    }
  });
}

function runChecker(err, res) {
  var $ = whacko.load(res.text),
      baseURL = (res.redirects.length > 0) ? res.redirects[res.redirects.length - 1] : uri;
  extract("a[href], link[href]", "href", baseURL, $);
  extract("script[src], img[src], iframe[src]", "src", baseURL, $);

  // links
  sortUniq(list.links).forEach(function(link) {
    checkLink(link);
  });
  // fragments
  checkFragmentsList(sortUniq(list.fragments));
}

function checkLink(link) {
  ua.head(link.href)
    .set("User-Agent", DEFAULT_OPTIONS.userAgent)
    .on('error', function(err) {
      console.log(err);
    })
    .end(function(err, res) {
       if (res.headers.location) { // redirect
         checkLink(url.parse(res.headers.location));
       }
       else if (res.status !== 200) {
         console.log("broken link: " + res.status + " " + link.href);
       }
    });
  }

function checkFragmentsList(list) {
  var fragmentsList = {};
  list.forEach(function(link) {
    var fragmentLessURL = link.protocol + '//' + link.host + link.pathname;
    if (!fragmentsList[fragmentLessURL])
      fragmentsList[fragmentLessURL] = [];
    fragmentsList[fragmentLessURL].push(link.hash);
  });

  // for (var i in fragmentsList) {
  //   ua.get(i)
  //     .set("User-Agent", DEFAULT_OPTIONS.userAgent)
  //     .on('error', function(err) {
  //       console.log(err);
  //     })
  //     .end(function(err, res) {
        // var $ = whacko.load(res.text);
        // fragmentsList[i].forEach(function(id) {
        //   var escapedId = id.replace( /(\!|\"|\$|\%|\&|\'|\(|\)|\*|\+|\,|\.|\/|\:|\;|\<|\=|\>|\?|\@|\[|\\|\]|\^|\`|\{|\||\}|\~)/g, "\\$1");
        //   var $tmp = $(escapedId).first()
        //   if (!$tmp.length) {
        //     console.log(escapedId + ' doesnt exist in ' + i);
        //   }
        // });
      // });
  // }
}

ua.get(uri)
.set("User-Agent", DEFAULT_OPTIONS.userAgent)
.end(runChecker);
