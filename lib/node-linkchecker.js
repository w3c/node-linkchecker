
'use strict';

// Pseudo-constants:
const DEFAULT_OPTIONS = {
   schemes:   ["http:", "https:"],
   userAgent: "node-linchecker",
   robotExclusion: true,
   fragments: true
};

const ua = require("superagent"),
    {JSDOM} = require('jsdom'),
    url = require("url"),
    Promise = require('promise');

const linksAttr = {
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
  src: ['audio', 'embed', 'frame', 'iframe', 'img', 'input', 'script', 'source', 'track', 'video']
};

function extract(baseURL, doc, options) {
  const list = {
    links : new Set(),
    fragments: new Set()
  };
  for (let attr in linksAttr) {
    const elementSel = linksAttr[attr].map(tag => `${tag}[${attr}]`).join(',');
    for (let el of doc.querySelectorAll(elementSel)) {
      const resolvedUrl = url.parse(url.resolve(baseURL, el.getAttribute(attr)));
      if (options.schemes.includes(resolvedUrl.protocol)) {
        if (resolvedUrl.hash === null) {
          list.links.add(resolvedUrl);
        } else {
          list.fragments.add(resolvedUrl);
        }
      }
    }
  }
  return list;
}

function checkLink(link, method, options) {
  var req = (method==='get') ? ua.get(link.href) : ua.head(link.href);
  req.redirects(3);
  const result = {
    brokenLinks : []
  };

  return new Promise(function(resolve, reject) {
    req.set("User-Agent", options.userAgent)
      .on('error', function(err) {
        reject(err);
      })
      .end(function(err, res) {
        const status = res ? res.status : 'unknown';
        if (status !== 200) {
            result.brokenLinks.push({link: link.href, status});
        }
        resolve(result);
      });
    });
  }

function hashEscaper(hash) {
  // escape the decoded hash as well as `url.resolve` encode special chars
  return [hash, decodeURIComponent(hash)].map(function(h) {
    return h.replace(/(\!|\"|\$|\%|\&|\'|\(|\)|\*|\+|\,|\.|\/|\:|\;|\<|\=|\>|\?|\@|\[|\\|\]|\^|\`|\{|\||\}|\~)/g, "\\$1");
  });
}

function checkFragmentsList(list, options) {
  const fragmentsList = {};
  const result = {
    brokenFragments: []
  };

  for (const link of list)  {
    const fragmentLessURL = link.protocol + '//' + link.host + link.pathname;
    if (!fragmentsList[fragmentLessURL])
      fragmentsList[fragmentLessURL] = [];
    fragmentsList[fragmentLessURL].push(link.hash);
  }

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
            const dom = new JSDOM(res.text);
            fragmentsList[keys[index]].forEach(function(hash) {
              var el = dom.window.document.querySelector(hashEscaper(hash).join(","));
              if (!el) {
                result.brokenFragments.push({link: keys[index] + hash, status: res.status});
              }
            });
            processLink(index + 1);
          });
      } else {
        resolve(result);
      }
    };
    processLink(0);
  });
}

exports.check = function(url, opts) {
  const options = {...DEFAULT_OPTIONS, ...opts};

  return new Promise(function(resolve, reject) {
    ua.get(url)
      .set("User-Agent", options.userAgent)
      .on('error', function(err) {
        reject(err);
      })
      .end(function(err, res) {
        const dom = new JSDOM(res.text),
            baseURL = (res.redirects.length > 0) ? res.redirects[res.redirects.length - 1] : url;
        const list = extract(baseURL, dom.window.document, options);
        var p = [];
        // links
        for (const link of list.links) {
          p.push(checkLink(link, 'head', options));
        }

        // fragments
        if (options.fragments) {
          p.push(checkFragmentsList(list.fragments, options));
        }
        Promise.all(p).then(function(results) {
          const flatResults = results.reduce(
            (a,b) =>
              { return {
                  brokenLinks: a.brokenLinks.concat(b.brokenLinks || []),
                  brokenFragments: a.brokenFragments.concat(b.brokenFragments || [])
                };
              },
              {brokenLinks:[], brokenFragments: []});
          resolve(flatResults);
        });
      });
    });
}
