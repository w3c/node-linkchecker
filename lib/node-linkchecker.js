
'use strict';

// Pseudo-constants:
var DEFAULT_OPTIONS = {
   schemes:   ["http:", "https:"],
   userAgent: "node-linchecker",
   robotExclusion: true,
   fragments: true
};

var ua = require("superagent"),
    whacko = require("whacko"),
    url = require("url"),
    userAgent,
    schemes;

function isSchemeAllowed(url) {
  for (var i = 0 ; i < schemes.length; i++) {
    var scheme = schemes[i];
    if (url.protocol === scheme) {
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
    var resolvedUrl = url.parse(url.resolve(baseURL, $(this).attr(attr)));
    if (isSchemeAllowed(resolvedUrl)) {
      if (resolvedUrl.hash === null) {
        list.links.push(resolvedUrl);
      } else {
        list.fragments.push(resolvedUrl);
      }
    }
  });
}

function checkLink(link) {
  ua.head(link.href)
    .set("User-Agent", userAgent)
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

  var keys = Object.keys(fragmentsList);
  var processLink = function(index) {
    if (index !== keys.length) {
      ua.get(keys[index])
        .set("User-Agent", userAgent)
        .on('error', function(err) {
          console.log(err);
        })
        .end(function(err, res) {
          var $ = whacko.load(res.text);
          fragmentsList[keys[index]].forEach(function(id) {
            var escapedId = id.replace( /(\!|\"|\$|\%|\&|\'|\(|\)|\*|\+|\,|\.|\/|\:|\;|\<|\=|\>|\?|\@|\[|\\|\]|\^|\`|\{|\||\}|\~)/g, "\\$1");
            var $tmp = $(escapedId).first();
            if (!$tmp.length) {
              console.log('broken fragment: ' + keys[index] + id);
            }
          });
          processLink(index + 1);
        });
    }
  }
  processLink(0);
}

exports.check = function(url, options) {
  options = options || {};
  userAgent = options.userAgent || DEFAULT_OPTIONS.userAgent;
  schemes = options.schemes || DEFAULT_OPTIONS.schemes;
  ua.get(url)
    .set("User-Agent", userAgent)
    .end(function(err, res) {
      var $ = whacko.load(res.text),
          baseURL = (res.redirects.length > 0) ? res.redirects[res.redirects.length - 1] : url;
      extract("a[href], link[href]", "href", baseURL, $);
      extract("script[src], img[src], iframe[src]", "src", baseURL, $);

      // links
      sortUniq(list.links).forEach(function(link) {
        checkLink(link);
      });
      // fragments
      checkFragmentsList(sortUniq(list.fragments));
    });
}
