var expect = require('chai').expect;
var nlc = require('../lib/node-linkchecker');
var server = require('./lib/testserver');

var tests = [
  {
    url: server.fixtures() + 'brokenLinksValid.html',
    expected: {
      brokenLinks: [],
      brokenFragments: []
    }
  },
  {
    url: server.fixtures() + 'brokenFragmentsValid.html',
    expected: {
      brokenLinks: [],
      brokenFragments: []
    }
  },
  {
    url: server.fixtures() + 'brokenLinksInvalid.html',
    expected: {
      brokenLinks: [
        { link: server.fixtures() + 'assets/i-do-not-exist.css',status: 404 },
        { link: server.fixtures() + 'assets/i-do-not-exist.jpg',status: 404 },
        { link: server.fixtures() + 'script.js',status: 404 }
      ],
      brokenFragments: []
    }
  },
  {
    url: server.fixtures() + 'brokenFragmentsInvalid.html',
    expected: {
      brokenLinks: [],
      brokenFragments: [
        { link: server.fixtures() + 'brokenFragmentsInvalid.html#foobar',status:200 }
      ]
    }
  },
  {
    url: server.fixtures() + 'broken.html',
    expected: {
      brokenLinks: [
        { link: server.fixtures() + 'assets/i-do-not-exist.css',status: 404 },
        { link: server.fixtures() + 'assets/i-do-not-exist.jpg',status: 404 },
        { link: server.fixtures() + 'script.js',status: 404 }
      ],
      brokenFragments: [
        { link: server.fixtures() + 'broken.html#foobar',status:200 }
      ]
    }
  }
];

describe('node-linkchecker', function() {
  describe('check()', function () {
    it('should be a function', function () {
      expect(nlc.check).to.be.a('function');
    })
    tests.forEach(function(test) {
      it('check(' + test.url + ')', function() {
        return nlc.check(test.url, test.options).then(function(res) {
          expect(res).to.deep.equal(test.expected);
        });
      });
    });
  });
});
