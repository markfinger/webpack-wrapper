var fs = require('fs');
var path = require('path');
var async = require('async');
var mkdirp = require('mkdirp');
var _ = require('lodash');

var Cache = function Cache(filename, ttl, logger) {
  this.filename = filename;
  this.ttl = ttl;
  this.updated = Object.create(null);
  this.logger = logger;

  try {
    var data = fs.readFileSync(filename);
    this.data = JSON.parse(data.toString());
  } catch(err) {}

  if (this.data) {
    if (this.ttl) {
      var expiry = +new Date - ttl;
      this.data = _.transform(this.data, function(result, value, key) {
        if (value.startTime > expiry) {
          result[key] = value;
        }
      }, Object.create(null));
    }
  } else {
    this.data = Object.create(null);
  }

  if (this.logger && Object.keys(this.data)) {
    this.logger.info('Webpack: loaded cache file ' + this.filename);
  }

  // Update the file with the current state
  this.write();
};

Cache.prototype.get = function get(configFile, cb) {
  var entry = this.data[configFile];

  // Ensure that there is both an entry and that it is in
  // the expected form
  if (
    !entry ||
    !(entry && entry.startTime && entry.fileDependencies && entry.stats)
  ) {
    return cb(null, null);
  }

  // Check the modified times on the config file and all dependencies
  fs.stat(configFile, function(err, stats) {
    if (err) return cb(err);

    if (+stats.mtime > entry.startTime) {
      var message = 'Stale config file: ' + configFile + '. Compile start time: ' + entry.startTime + '. File mtime: ' + +stats.mtime;
      return cb(new Error(message));
    }

    async.each(entry.fileDependencies,
      function(filename, cb) {
        fs.stat(filename, function(err, stats) {
          if (err) return cb(err);

          if (+stats.mtime > entry.startTime) {
            var message = 'Stale file dependency: ' + filename + '. Compile start time: ' + entry.startTime + '. File mtime: ' + +stats.mtime;
            return cb(new Error(message));
          }

          cb(null, true);
        });
      },
      function(err) {
        if (err) return cb(err);
        cb(null, entry);
      }
    );
  });
};

Cache.prototype.set = function set(filename, entry, indicateChange) {
  this.data[filename] = entry;

  if (indicateChange) {
    // Indicate that the we should no longer rely on the cache's store.
    // This enables the watcher's internal cache to take over the service
    // of cached output
    this.updated[filename] = true;
  }

  this.write();
};

Cache.prototype.write = function write() {
  var json = JSON.stringify(this.data);

  try {
    mkdirp.sync(path.dirname(this.filename));
  } catch(err) {
    throw new Error('Failed to create path to webpack cache file: ' + this.filename);
  }

  try {
    fs.writeFileSync(this.filename, json);
  } catch(err) {
    throw new Error('Failed to write webpack cache file: ' + this.filename);
  }

  if (this.logger) {
    this.logger.info('Webpack: updated cache file ' + this.filename);
  }
};

module.exports = Cache;