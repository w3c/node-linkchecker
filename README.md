[![Build Status](https://travis-ci.org/w3c/node-linkchecker.svg?branch=master)](https://travis-ci.org/w3c/node-linkchecker)
[![Dependency Status](https://david-dm.org/w3c/insafe.svg)](https://david-dm.org/w3c/insafe)
[![devDependency Status](https://david-dm.org/w3c/insafe/dev-status.svg)](https://david-dm.org/w3c/insafe#info=devDependencies)

# Linkchecker

Detect broken links and broken fragments

## Installation

```
npm install node-linkchecker
```

## Usage

### `.check(url[, options])`

Find broken links and optionally broken fragments on a given url.
Parameters:
* `url`: the url you want to check
* `options`: provide that parameter if you want to override the default options. See [below](#options) for more details

Example:

```js
var nlc = require('./lib/node-linkchecker');
nlc.check("http://www.example.org/").then(function(result) {
  if(result.brokenLinks.length > 0) {
    console.log('the document contains broken links');
  }
  if(result.brokenFragments.length > 0) {
    console.log('the document contains broken fragments');
  }
});

###
var nlc = require('./lib/node-linkchecker')
,   options = {
      schemes: ["https:"],
      userAgent: "W3C node linkchecker",
      fragments: false
    };

nlc.check("https://www.example.org/", options)
   .then(function(result) {
     // { brokenLinks: [], brokenFragments: [] }
   }, function(err) {
     console.log('rejection');
   });
```

### Options

| option        | description                                 | default               |
| ------------- | ------------------------------------------- | --------------------- |
| schemes       | an array of schemes you want to check       | `["http:", "https:"]` |
| userAgent     | the user agent to be used for each request  | `node-linkchecker`    |
| fragments     | whether to look for broken fragments or not | `true`                |

### TODO list

* add support for robot exclusions
* handle base `href`
* improve result feedback and format
* add tests
