import path from 'path';
import fs from 'fs';
import mkdirp from 'mkdirp';
import build from '../../lib/index';
import Wrapper from '../../lib/Wrapper';
import utils from './utils';

let assert = utils.assert;
let CACHE_DIR = path.join(utils.TEST_OUTPUT_DIR, 'cache_dir');

// Ensure we have a clean slate before and after each test
beforeEach(() => {
  build.wrappers.clear();
  build.caches.clear();
  utils.cleanTestOutputDir();
});
afterEach(() => {
  build.wrappers.clear();
  build.caches.clear();
  utils.cleanTestOutputDir();
});

describe('build', () => {
  it('should be a function', () => {
    assert.isFunction(build);
  });
  it('should accept options and callback arguments', () => {
    let opts = {
      config: path.join(__dirname, 'test_bundles', 'basic_bundle', 'webpack.config'),
      logger: null,
      cacheDir: CACHE_DIR
    };
    build(opts, () => {});
  });
  it('should populate the bundle list', () => {
    let pathToConfig = path.join(__dirname, 'test_bundles', 'basic_bundle', 'webpack.config');
    let opts1 = {
      config: pathToConfig,
      watch: true,
      logger: null,
      cacheDir: CACHE_DIR
    };
    assert.equal(Object.keys(build.wrappers.wrappers).length, 0);

    let wrapper1 = build(opts1, () => {});
    assert.equal(Object.keys(build.wrappers.wrappers).length, 1);
    assert.strictEqual(build.wrappers.wrappers[opts1.buildHash], wrapper1);
    assert.strictEqual(build.wrappers.wrappers[opts1.buildHash].opts, opts1);

    let opts2 = {
      config: pathToConfig,
      watch: true,
      logger: null,
      cacheDir: CACHE_DIR
    };
    let wrapper2 = build(opts2, () => {});
    assert.strictEqual(wrapper2, wrapper1);
    assert.equal(Object.keys(build.wrappers.wrappers).length, 1);
    assert.strictEqual(build.wrappers.wrappers[opts2.buildHash], wrapper2);
    assert.strictEqual(build.wrappers.wrappers[opts2.buildHash].opts, opts1);

    let opts3 = {
      config: pathToConfig,
      watch: false,
      logger: null,
      cacheDir: CACHE_DIR
    };
    let wrapper3 = build(opts3, () => {});
    assert.equal(Object.keys(build.wrappers.wrappers).length, 2);
    assert.strictEqual(build.wrappers.wrappers[opts3.buildHash], wrapper3);
    assert.strictEqual(build.wrappers.wrappers[opts3.buildHash].opts, opts3);

    let opts4 = {
      config: pathToConfig + 'test',
      watch: false,
      logger: null,
      cacheDir: CACHE_DIR
    };
    let wrapper4 = build(opts4, () => {});
    assert.equal(Object.keys(build.wrappers.wrappers).length, 3);
    assert.strictEqual(build.wrappers.wrappers[opts4.buildHash], wrapper4);
    assert.strictEqual(build.wrappers.wrappers[opts4.buildHash].opts, opts4);

    let opts5 = {
      config: pathToConfig + 'test',
      watch: false,
      logger: null,
      cacheDir: CACHE_DIR
    };
    build(opts5, () => {});
    assert.equal(Object.keys(build.wrappers.wrappers).length, 3);

    let opts6 = {
      config: pathToConfig,
      watch: true,
      logger: null,
      cacheDir: CACHE_DIR
    };
    build(opts6, () => {});
    assert.equal(Object.keys(build.wrappers.wrappers).length, 3);
  });
  it('should be able to generate a bundle', (done) => {
    build({
      config: path.join(__dirname, 'test_bundles', 'basic_bundle', 'webpack.config'),
      logger: null,
      cacheDir: CACHE_DIR
    }, (err, data) => {
      assert.isNull(err);
      assert.isObject(data);

      assert.isObject(data.pathsToAssets);
      assert.isObject(data.webpackConfig);

      let existsAt = data.pathsToAssets['output.js'];
      assert.isString(existsAt);

      fs.readFile(existsAt, (err, contents) => {
        assert.isNull(err);
        let compiledBundle = contents.toString();
        assert.include(compiledBundle, '__BASIC_BUNDLE_ENTRY_TEST__');
        assert.include(compiledBundle, '__BASIC_BUNDLE_REQUIRE_TEST__');
        done();
      });
    });
  });
  describe('file cache', () => {
    it('should respect the cacheDir and cacheFile options', (done) => {
      let cacheFile = path.join(CACHE_DIR, 'test_cacheFile.json');
      let configFile = path.join(__dirname, 'test_bundles', 'basic_bundle', 'webpack.config.js');

      mkdirp.sync(path.dirname(cacheFile));

      fs.writeFileSync(cacheFile, JSON.stringify({
        startTime: +new Date() + 2000,
        fileDependencies: [],
        dependencies: [],
        stats: {
          test: {foo: 'bar'}
        },
        config: configFile,
        buildHash: 'foo'
      }));

      build({
        config: configFile,
        cacheFile: cacheFile,
        logger: null,
        buildHash: 'foo'
      }, (err, data) => {
        assert.isNull(err);
        assert.isObject(data);

        assert.deepEqual(data.stats, {test: {foo: 'bar'}});
        done();
      });
    });
    it('should generate a cache file in the cache dir', (done) => {
      let configFile = path.join(__dirname, 'test_bundles', 'basic_bundle', 'webpack.config.js');

      let opts = {
        config: configFile,
        cacheDir: CACHE_DIR,
        logger: null
      };

      build(opts, (err, data) => {
        assert.isNull(err);
        assert.isObject(data);

        assert.isString(opts.cacheFile);
        assert.include(opts.cacheFile, opts.cacheDir);

        done();
      });
    });
    it('should generate a cache file from the config file and options hash', (done) => {
      let configFile = path.join(__dirname, 'test_bundles', 'basic_bundle', 'webpack.config.js');

      let opts = {
        config: configFile,
        cacheDir: CACHE_DIR,
        logger: null
      };

      let wrapper = build(opts, (err, data) => {
        assert.isNull(err);
        assert.isObject(data);

        assert.strictEqual(wrapper.opts, opts);

        let cache = build.caches.get(opts);

        assert.isString(opts.config);
        assert.isString(opts.buildHash);
        assert.equal(opts.cacheFile, path.join(CACHE_DIR, opts.buildHash + '.json'));

        assert.equal(cache.filename, opts.cacheFile);

        done();
      });
    });
    it('should stop serving cached data once a watcher has completed', (done) => {
      let cacheFile = path.join(CACHE_DIR, 'test_cache_stops_once_watcher_done.json');
      let configFile = path.join(__dirname, 'test_bundles', 'basic_bundle', 'webpack.config.js');

      mkdirp.sync(path.dirname(cacheFile));

      fs.writeFileSync(cacheFile, JSON.stringify({
        startTime: +new Date() + 2000,
        fileDependencies: [],
        dependencies: [],
        stats: {
          test: {foo: 'bar'}
        },
        config: configFile,
        buildHash: 'foo'
      }));

      let opts = {
        config: configFile,
        cacheFile: cacheFile,
        watch: true,
        logger: null,
        buildHash: 'foo'
      };

      let wrapper = build(opts, (err, data1) => {
        assert.isNull(err);
        assert.isObject(data1);
        assert.deepEqual(data1.stats, {test: {foo: 'bar'}});

        assert.strictEqual(wrapper.opts.cacheFile, cacheFile);

        let cache = build.caches.get(opts);
        assert.strictEqual(wrapper.cache, cache);
        assert.strictEqual(data1.stats, cache.data.stats);
        assert.isFalse(cache.delegate);

        build(opts, (err, data2) => {
          assert.isNull(err);
          assert.isObject(data2);

          assert.strictEqual(data2, data1);
          assert.deepEqual(data2.stats, {test: {foo: 'bar'}});
          assert.isFalse(cache.delegate);

          setTimeout(() => {
            wrapper.onceDone((err, data3) => {
              assert.isNull(err);
              assert.isObject(data3);
              assert.notStrictEqual(data3, data2);

              assert.isString(cache.data.buildHash);
              assert.equal(cache.data.buildHash, opts.buildHash);
              assert.equal(cache.data.buildHash, wrapper.opts.buildHash);

              assert.isTrue(cache.delegate);

              build(opts, (err, data4) => {
                assert.isNull(err);
                assert.isObject(data4);
                assert.deepEqual(data4.stats, data3.stats);

                done();
              });
            });
          }, 50);
        });
      });
    });
  });
});