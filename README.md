# Linkchecker

Detect broken links and broken fragments

## Installation

```
npm install node-linkchecker
```

## Usage

### `.check(url[, options[, callback]])`

Find broken links and optionally broken fragments on a given url.
Parameters:
* `url`: the url you want to check
* `options`: provide that parameter if you want to override the default options. See [below](#options) for more details
* `callback`: you can provide a callback to process the results. By default, it's calling `console.log`

Example:

```js
var nlc = require('./lib/node-linkchecker');
nlc.check("http://www.w3.org/");

###
var nlc = require('./lib/node-linkchecker')
,   options = {
      schemes: ["https:"],
      userAgent: "W3C node linkchecker",
      fragments: false
    }
,   result = []
,   dumpResult = function(uri) {
      result.push(uri);
    };

nlc.check("https://www.w3.org/", options, dumpResult)
   .then(function(res) {
     // do something with result
   }, function(err) {
     console.log('rejection');
   });
```

### Options

| option        | description                                 | default               |
| ------------- | ------------------------------------------- | --------------------- |
| schemes       | an array of schemes you want to check       | `["http:", "https:"]` |
| userAgent     | the user agent to be used for each request  | `node-linchecker`     |
| fragments     | whether to look for broken fragments or not | `true`                |

### TODO list

* add support for robot exclusions
* improve result feedback and format
* add tests
