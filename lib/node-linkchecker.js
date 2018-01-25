
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

function removeFragment(url) {
  // copy of URL object
  const fragmentLess = urllib.parse(url.href);
  fragmentLess.hash = ""
  // to make sure .href is updated,
  // we return the parsing of the formatted result
  return urllib.parse(urllib.format(fragmentLess));
}

function extract(baseURL, dom, options) {
  const links = new Set(),
    fragments =new Set()
  ;
  if (!dom) {
    return {links: [], fragments: []};
  }
  for (let attr in linksAttr) {
    const elementSel = linksAttr[attr].map(tag => `${tag}[${attr}]`).join(',');
    for (let el of dom.window.document.querySelectorAll(elementSel)) {
      const resolvedUrl = urllib.parse(urllib.resolve(baseURL, el.getAttribute(attr)));
      if (options.schemes.includes(resolvedUrl.protocol)) {
        const fragmentLessUrl = removeFragment(resolvedUrl);
        links.add(fragmentLessUrl);
        if (resolvedUrl.hash !== null) {
          fragments.add(resolvedUrl);
        }
      }
    }
  }
  return {links: [...links], fragments: [...fragments]};
}

async function checkLink(link, options) {
  const req = ua.head(link.href);
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
    return fragments.map(h => {return {link: h => url + h, status: 'Not HTML'};});
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

const flatten = (a) => [].concat.apply([], a);

async function checkFragmentsList(list, options) {
  if (!options.fragments) return;
  const fragmentsList = {};

  for (const link of list)  {
    const fragmentLessURL = removeFragment(link).href;
    if (!fragmentsList[fragmentLessURL])
      fragmentsList[fragmentLessURL] = [];
    fragmentsList[fragmentLessURL].push(link.hash);
  }

  var urls = Object.keys(fragmentsList);
  const fetches = await Promise.all(
    urls.map(u => queueFetch(u, options))
  );
  const brokenFragments = flatten(fetches.map(
    ({url, dom, status}) => checkDOMForFragments(dom, url, fragmentsList[url], status)
  ));
  return {brokenFragments};
}

function getMediaType(res) {
  let mediaType = 'text/html';
  if (res.headers && res.headers['content-type']) {
    mediaType = contentType.parse(res.headers['content-type']).type;
  }
  return mediaType;
}

async function queueFetch(url, opts) {
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
          return resolve({url, baseURL, dom, status: res.status, mediaType});
        });
    });
  }
  return pendingFetches[url];
}

function killDOM(url) {
  pendingFetches[url].then(({dom}) => dom.window.close());
  delete pendingFetches[url];
}

exports.extract = async function(url, opts) {
  const options = {...DEFAULT_OPTIONS, ...opts};
  return queueFetch(url, options).then(({baseURL, dom}) => extract(baseURL, dom, options));
};

const parentURL = url => urllib.resolve(urllib.parse(url),"./");

async function pagemap(url, opts, baseURL = "") {
  try {
    const {baseURL:finalURL, dom} = await queueFetch(url,opts);
    if (!baseURL) {
      baseURL = parentURL(finalURL);
    }
    const page = finalURL.slice(baseURL.length);

    const fragments = [...extractFragmentTargets(dom)];
    killDOM(url);
    return {finalURL, page, fragments};
  } catch (e) {
    // failed to load page, no fragment
    return {page: url.slice(baseURL.length), fragments: []};
  };
}

// from https://www.ryan-tate.com/js/partition-array-javascript/
function partition(a, size){
  return Array(Math.ceil(a.length / size))
    .fill(0).map((_,i) => a.slice(i * size, (i+1) * size));
}

exports.linkmap = async function(url, opts) {
  const options = {...DEFAULT_OPTIONS, ...opts};
  const mappedURLs = new Set();
  const map = {};
  const {links} = await exports.extract(url, options);
  const {finalURL, page , fragments} = await pagemap(url,options);
  const parent = parentURL(finalURL);
  mappedURLs.add(page);
  map[page] = fragments;

  const subpages = new Set([...links].map(u => u.href)
                           .filter(u => u.startsWith(parent))
                           .filter(u => !mappedURLs.has(u)));
  // Split the work in batches to avoid OOM
  const batches = partition([...subpages], 5);
  const processBatch = batch => Promise.all(
    batch.map(u => pagemap(u, options, parent))
  );
  for (let batch of batches) {
    try {
      const subpagesmap = await processBatch(batch);
      // Combine the array of maps into a single map
      subpagesmap.reduce((map, {page, fragments}) => { map[page] = fragments; return map;}, map);
    } catch (e) {
      console.error(e);
    }
  }
  return map;
};

exports.check = async function(url, opts) {
  const options = {...DEFAULT_OPTIONS, ...opts};
  const {links, fragments} = await exports.extract(url, opts);
  const results = await Promise.all([...links.map(l => checkLink(l, options)),
                                   checkFragmentsList(fragments, options)
                                  ]);
  const flatResults = results.reduce(
    (acc, {brokenLinks, brokenFragments}) =>
      { return {
        brokenLinks: [...acc.brokenLinks, ...(brokenLinks || [])],
        brokenFragments: [...acc.brokenFragments, ...(brokenFragments || [])]
      };
      },
    {brokenLinks:[], brokenFragments: []});
  return flatResults;
};
