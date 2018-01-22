
'use strict';

// Pseudo-constants:
const DEFAULT_OPTIONS = {
   schemes:   ["http:", "https:"],
   userAgent: "node-linchecker",
   robotExclusion: true,
   fragments: true
};

const pendingFetches = {};

const ua = require("superagent"),
    contentType = require('content-type'),
    {JSDOM} = require('jsdom'),
    urllib = require("url"),
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

function extract(baseURL, dom, options) {
  const list = {
    links : new Set(),
    fragments: new Set()
  };
  if (!dom) {
    return list;
  }
  for (let attr in linksAttr) {
    const elementSel = linksAttr[attr].map(tag => `${tag}[${attr}]`).join(',');
    for (let el of dom.window.document.querySelectorAll(elementSel)) {
      const resolvedUrl = urllib.parse(urllib.resolve(baseURL, el.getAttribute(attr)));
      if (options.schemes.includes(resolvedUrl.protocol)) {
        const fragmentLessUrl = urllib.parse(urllib.resolve(resolvedUrl, ""));
        fragmentLessUrl.hash = "";
        list.links.add(fragmentLessUrl);
        if (resolvedUrl.hash !== null) {
          list.fragments.add(resolvedUrl);
        }
      }
    }
  }
  return list;
}

function checkLink(link, method, options) {
  const req = (method==='get') ? ua.get(link.href) : ua.head(link.href);
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

function checkDOMForFragments(dom, url, fragments, status) {
  if (!dom) {
    return fragments.map({link: h => url + h, status: 'Not HTML'});
  }
  const brokenFragments = [];
  for (let hash of fragments) {
    var el = dom.window.document.querySelector(hashEscaper(hash).join(","));
    if (!el) {
      brokenFragments.push({link: url + hash, status: status});
    }
  }
  return brokenFragments;
}

function extractFragmentTargets(dom) {
  if (!dom) {
    return new Set();
  }
  const fragments = new Set(
    [...dom.window.document.querySelectorAll("body a[name]")].map(a => a.getAttribute("name")).concat(
      [...dom.window.document.querySelectorAll("body *[id]")].map(el => el.getAttribute("id"))
    )
  );
  return fragments;
}

function removeFragment(url) {
  return url.protocol + '//' + url.host + url.pathname;
}

function checkFragmentsList(list, options) {
  const fragmentsList = {};
  const result = {
    brokenFragments: []
  };

  for (const link of list)  {
    const fragmentLessURL = removeFragment(link);
    if (!fragmentsList[fragmentLessURL])
      fragmentsList[fragmentLessURL] = [];
    fragmentsList[fragmentLessURL].push(link.hash);
  }

  var urls = Object.keys(fragmentsList);
  return new Promise(function(resolve, reject) {
    var processLink = function(index) {
      if (index !== urls.length) {
        queueFetch(urls[index], options).then(({dom, status}) => {
          result.brokenFragments = [...result.brokenFragments,
                                    ...checkDOMForFragments(dom, urls[index],  fragmentsList[urls[index]], status)];
          processLink(index + 1);
        });
      } else {
        resolve(result);
      }
    };
    processLink(0);
  });
}

function getMediaType(res) {
  let mediaType = 'text/html';
  if (res.headers && res.headers['content-type']) {
    mediaType = contentType.parse(res.headers['content-type']).type;
  }
  return mediaType;
}

function queueFetch(url, opts) {
  if (!pendingFetches[url]) {
    pendingFetches[url] = new Promise(function(resolve, reject) {
      pendingFetches[url] = ua.get(url)
        .set("User-Agent", opts.userAgent)
        .on('error', function(err) {
          reject(err);
        })
        .end(function(err, res) {
          if (err) return reject(err);
          const baseURL = (res.redirects.length > 0) ? res.redirects[res.redirects.length - 1] : url;
          const mediaType = getMediaType(res);
          let dom = null;
          if (mediaType === 'text/html') {
            dom = new JSDOM(res.text);
          }
          return resolve({baseURL, dom, status: res.status, mediaType});
        });
    });
  }
  return pendingFetches[url];
}

function killDOM(url) {
  pendingFetches[url].then(({dom}) => dom.window.close());
  delete pendingFetches[url];
}

exports.extract = function(url, opts) {
  const options = {...DEFAULT_OPTIONS, ...opts};
  return queueFetch(url, options).then(({baseURL, dom}) => extract(baseURL, dom, options));
};

function pagemap(url, opts) {
  return queueFetch(url,opts).then(({baseURL, dom}) => {
    const fragments = [...extractFragmentTargets(dom)];
    killDOM(url);
    return {url: baseURL, fragments};
  });
}

exports.linkmap = function(url, opts) {
  const options = {...DEFAULT_OPTIONS, ...opts};
  const mappedURLs = new Set();
  const map = {};
  return exports.extract(url, options).then(list => {
    return pagemap(url,options).then(pm => {
      return {links: list.links, ...pm};
    });
  }).then(({url: baseURL, links, fragments}) => {
    mappedURLs.add(baseURL);
    const parentURL = urllib.resolve(urllib.parse(baseURL),"./");
    const relativeURL = baseURL.slice(parentURL.length);
    map[relativeURL] = fragments;
    const subpages = [...links].map(u => u.href)
            .filter(u => u.startsWith(parentURL))
            .filter(u => !mappedURLs.has(u));
    return Promise.all(
      subpages.map(
        u => pagemap(u, options).catch(err =>
                                    { if (err.name !== 'notHTML') throw err ;})
          .then(pm => {
            if (pm) {
              const relativeURL = pm.url.slice(parentURL.length);
              return {url: relativeURL, fragments: pm.fragments};
            }
          })
      )
    );
  }).then(results => {
    return results.reduce((a,b) => {if (!b) return a;  a[b.url] = b.fragments; return a;}, map);
  });
};

exports.check = function(url, opts) {
  const options = {...DEFAULT_OPTIONS, ...opts};
  return exports.extract(url, opts).then(list => {
        var p = [];
        // links
        for (const link of list.links) {
          p.push(checkLink(link, 'head', options));
        }

        // fragments
        if (options.fragments) {
          p.push(checkFragmentsList(list.fragments, options));
        }
        return Promise.all(p);
  }).then(function(results) {
      const flatResults = results.reduce(
          (a,b) =>
              { return {
                  brokenLinks: [...a.brokenLinks, ...(b.brokenLinks || [])],
                  brokenFragments: [...a.brokenFragments, ...(b.brokenFragments || [])]
              };
              },
        {brokenLinks:[], brokenFragments: []});
      return flatResults;
  });
};
