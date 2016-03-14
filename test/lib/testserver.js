'use strict';

var fs = require('fs');
var express = require('express');
var app = express();
var port = 4242;

var TestServer = function () {};

app.use('/fixtures', express.static(__dirname + '/../fixtures'));

var server;

TestServer.start = function () {
  server = app.listen(port).on('error', function (err) {
    if ('EADDRINUSE' !== err.code) {
      throw new Error('Error while trying to launch the test server: ' + err);
    }
  });
};

TestServer.location = function () {
  if (server && server.address()) {
    return 'http://localhost:' + server.address().port;
  }
};

TestServer.fixtures = function () {
  return TestServer.location() + '/fixtures/';
};

TestServer.start();

module.exports = TestServer;
