'use strict';
var path = require('path');
var fs = require('fs');

var formatUA = require('./formatUA');
var yaml = require('js-yaml');
var indent = require('indent-string');
var printf = require('printf');

var TAPE = function(baseReporterDecorator, formatError, config) {
	var tapfile = config && config.outfile;

	baseReporterDecorator(this);

	if (tapfile) {
		try {
			fs.unlinkSync(tapfile);
		} catch (err) {
			if (err.code !== 'ENOENT')
				throw err;
			mkdirp(path.dirname(tapfile));
		}

		this.adapters[0] = record;
	}

	this.onRunStart = function() {
		this.suites = {};
		this.total = 0;
		this.failures = 0;
		this.skips = 0;
		this.idx = 1;
		this.writeln('TAP version 13');
	};

	this.onBrowserStart = function(browser) {
		this.suites[browser.id] = {
			name: formatUA(browser.fullName),
			specs: []
		};
	};

	this.onBrowserComplete = function(browser) {
		var suite = this.suites[browser.id];

		if (!suite) {
			// Browser timed out during the state phase.
			return;
		}

		this.writeln(printf('# %s', suite.name));

		suite.specs.forEach(function(spec) {
			var properties = {
				status: spec.result,
				index: this.idx++,
				browser: suite.name,
				suites: spec.suite.join(' '),
				description: spec.description
			};

			if (spec.skipped)
				this.writeln(printf('%(status)s %(index)d %(browser)s :: %(suites)s :: %(description)s # SKIP', properties));
			else
				this.writeln(printf('%(status)s %(index)d %(browser)s :: %(suites)s :: %(description)s', properties));

			if (spec.failures && spec.failures.length > 0) {
				this.writeln('  ---');
				this.writeln(indent(yaml.safeDump({
					failures: spec.failures
				}), ' ', 4));
				this.writeln('  ...');
			}
		}, this);

		this.total += suite.specs.length;
	};

	this.specSuccess = function(browser, result) {
		var suite = this.suites[browser.id];
		suite.specs.push({
			description: result.description,
			suite: result.suite,
			result: 'ok'
		});
	};

	this.specFailure = function(browser, result) {
		var suite = this.suites[browser.id];
		var spec = {
			description: result.description,
			suite: result.suite,
			failures: [],
			result: 'not ok'
		};

		result.log.forEach(function(err) {
			spec.failures.push(formatError(err, ''));
		});

		suite.specs.push(spec);
		this.failures++;
	};

	this.specSkipped = function(browser, result) {
		var suite = this.suites[browser.id];
		suite.specs.push({
			description: result.description,
			suite: result.suite,
			result: 'ok',
			skipped: true
		});
		this.skips++;
	};

	this.onRunComplete = function() {
		this.writeln(printf('\n1..%d', this.total));
		this.writeln(printf('# tests %d', this.total));
		this.writeln(printf('# pass %d', this.total - this.failures));
		if (this.skips) {
			this.writeln(printf('# skip %d', this.skips));
		}
		this.writeln(printf('# fail %d', this.failures));

		if (!this.failures) {
			this.writeln('# ok');
		}
	};

	this.writeln = function(str) {
		return this.write(str + '\n');
	};

	function record(msg) {
		fs.appendFileSync(tapfile, msg, 'utf8');
	}
};

TAPE.$inject = ['baseReporterDecorator', 'formatError', 'config.tape'];

function mkdirp(dir) {
	try {
		fs.mkdirSync(dir);
	} catch (err) {
		if (err.code === 'EEXIST')
			return;

		// If cwd is removed and dir is a relative path, we can get stuck trying to create the current
		// directory.
		if (err.code !== 'ENOENT' || dir === '.')
			throw err;

		mkdirp(path.dirname(dir));
		fs.mkdirSync(dir);
	}
}

module.exports = {
	'reporter:tape': ['type', TAPE]
};
