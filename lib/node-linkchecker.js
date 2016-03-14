
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
    chalk = require("chalk"),
    Promise = require('promise'),
    options = JSON.parse(JSON.stringify(DEFAULT_OPTIONS)),
    list,
    result;

var linksAttr = {
  background: ['body'],
  cite: ['blockquote', 'del', 'ins', 'q'],
  data: ['object'],
  href: ['a', 'area', 'embed', 'link'],
  icon: ['command'],
  longdesc: ['frame', 'iframe'],
  manifest: ['html'],
  poster: ['video'],
  pluginspage: ['embed'],
  pluginurl: ['embed'],
  src: ['audio', 'embed', 'frame', 'iframe', 'img', 'input', 'script', 'source', 'track', 'video'],
};

function isSchemeAllowed(url) {
  for (var i = 0 ; i < options.schemes.length; i++) {
    var scheme = options.schemes[i];
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

// sort array of URL and remove duplicates
function sortUniq(arr) {
  return arr.sort(sortURLs).filter(function(item, pos, a) {
    return !pos || item.href != a[pos - 1].href;
  });
}

function extract(baseURL, $) {
  for (var attr in linksAttr) {
    var elements = linksAttr[attr].map(function(tag) {return tag+'['+attr+']';}).join(',');
    $(elements).each(function() {
      if ($(this) !== undefined) {
        var resolvedUrl = url.parse(url.resolve(baseURL, $(this).attr(attr)));
        if (isSchemeAllowed(resolvedUrl)) {
          if (resolvedUrl.hash === null) {
            list.links.push(resolvedUrl);
          } else {
            list.fragments.push(resolvedUrl);
          }
        }
      }
    });
  }
}

function checkLink(link, method) {
  var req = (method==='get') ? ua.get(link.href) : ua.head(link.href);
  return new Promise(function(resolve, reject) {
    req.set("User-Agent", options.userAgent)
      .on('error', function(err) {
        reject(err);
      })
      .end(function(err, res) {
        if (!res) {
          result.brokenLinks.push({link: link.href, status: 'unknown'});
        }
        else {
          if (res.headers.location) { // redirect
            // superagent doesn't follow the redirect when it's doing a HEAD
            // https://github.com/visionmedia/superagent/issues/669
           checkLink(link, 'get');
          }
          else if (res.status !== 200) {
            result.brokenLinks.push({link: link.href, status: res.status});
          }
        }
        resolve();
      });
    });
  }

function hashEscaper(hash) {
  // escape the decoded hash as well as `url.resolve` encode special chars
  return [hash, decodeURIComponent(hash)].map(function(h) {
    return h.replace(/(\!|\"|\$|\%|\&|\'|\(|\)|\*|\+|\,|\.|\/|\:|\;|\<|\=|\>|\?|\@|\[|\\|\]|\^|\`|\{|\||\}|\~)/g, "\\$1");
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
  return new Promise(function(resolve, reject) {
    var processLink = function(index) {
      if (index !== keys.length) {
        ua.get(keys[index])
          .set("User-Agent", options.userAgent)
          .on('error', function(err) {
            reject(err);
          })
          .end(function(err, res) {
            var $ = whacko.load(res.text);
            fragmentsList[keys[index]].forEach(function(hash) {
              var $el = $(hashEscaper(hash).join(",")).first();
              if (!$el.length) {
                result.brokenFragments.push({link: keys[index] + hash, status: res.status});
              }
            });
            processLink(index + 1);
          });
      } else {
        resolve();
      }
    }
    processLink(0);
  });
}



exports.check = function(url, opts) {
  options = JSON.parse(JSON.stringify(DEFAULT_OPTIONS));
  if (opts) {
    if (opts.hasOwnProperty("userAgent")) options.userAgent = opts.userAgent;
    if (opts.hasOwnProperty("schemes")) options.schemes = opts.schemes;
    if (opts.hasOwnProperty("robotExclusion")) options.robotExclusion = opts.robotExclusion;
    if (opts.hasOwnProperty("fragments")) options.fragments = opts.fragments;
  }
  list = {
    links : [],
    fragments: []
  },
  result = {
    brokenLinks : [],
    brokenFragments: []
  };

  return new Promise(function(resolve, reject) {
    ua.get(url)
      .set("User-Agent", options.userAgent)
      .on('error', function(err) {
        reject(err);
      })
      .end(function(err, res) {
        var $ = whacko.load(res.text),
            baseURL = (res.redirects.length > 0) ? res.redirects[res.redirects.length - 1] : url;
        extract(baseURL, $);
        var p = [];
        // links
        sortUniq(list.links).forEach(function(link) {
          p.push(checkLink(link));
        });

        // fragments
        if (options.fragments) {
          p.push(checkFragmentsList(sortUniq(list.fragments)));
        }
        Promise.all(p).then(function() {
          resolve(result);
        });
      });
    });
}
