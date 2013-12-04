/*global describe:true, it: true */
var path = require('path'),
    colour = require('../../lib/utils/colour'),
    appjs = path.resolve(__dirname, '..', 'fixtures', 'app.js'),
    appcoffee = path.resolve(__dirname, '..', 'fixtures', 'app.coffee'),
    childProcess = require('child_process'),
    touch = require('touch'),
    fork = childProcess.fork,
    assert = require('assert'),
    lastChild = null,
    pids = [];

function asCLI(cmd) {
  return {
    exec: 'bin/nodemon.js',
    // make nodemon verbose so we can check the filters being applied
    args: ('-V ' + cmd).trim().split(' ')
  };
}

function match(str, key) {
  return str.indexOf(key) !== -1;
}

function run(cmd, callbacks) {
  var cli = asCLI(cmd);
  var proc = fork(cli.exec, cli.args, {
    env: process.env,
    cwd: process.cwd(),
    encoding: 'utf8',
    silent: true,
  });

  lastChild = proc;

  pids.push(proc.pid);

  proc.stderr.setEncoding('utf8');
  proc.stdout.setEncoding('utf8');

  // proc.on('close', function (code) {
  //   console.log('child process exited with code ' + code);
  // });
  proc.stdout.on('data', function (data) {
    if (match(data, 'pid: ')) {
      pids.push(colour.strip(data).trim().replace(/.*pid:\s/, '') * 1);
    }
  });
  if (callbacks.output) {
    proc.stdout.on('data', callbacks.output);
  }
  if (callbacks.restart) {
    proc.stdout.on('data', function (data) {
      if (match(data, 'restarting due to changes')) {
        callbacks.restart(null, data);
      }
    });
  }
  if (callbacks.error) {
    proc.stderr.on('data', callbacks.error);
  }

  return proc;
}

function cleanup(done, err) {
  if (lastChild) {
    lastChild.on('exit', function () {
      lastChild = null;
      done(err);
    });
    lastChild.send('quit');
  } else {
    done(err);
  }
}

describe('nodemon simply running', function () {
  it('should start', function (done) {
    run(appjs, {
      output: function (data) {
        if (match(data, appjs)) {
          assert(true, 'nodemon started');
          cleanup(done);
        }
      },
      error: function (data) {
        assert(false, 'nodemon failed with ' + data);
        cleanup(done, new Error(data));
      }
    });
  });

});

describe('nodemon monitor', function () {
  var complete = function (p, done, err) {
    p.once('exit', function () {
      done(err);
    });
    p.send('quit');
  };

  it('should restart on .js file changes with no arguments', function (done) {
    var p = run(appjs, {
      output: function (data) {
        if (match(data, 'changes after filters')) {
          var changes = colour.strip(data.trim()).slice(-5).split('/');
          var restartedOn = changes.pop();
          assert(restartedOn === '1');
        }
      },
      error: function (data) {
        complete(p, done, new Error(data));
      }
    });

    p.on('message', function (event) {
      if (event.type === 'restart') {
        complete(p, done);
      } else if (event.type === 'start') {
        setTimeout(function () {
          touch.sync(appjs);
        }, 1000);
      }
    });
  });

  it('should NOT restart on non-.js file changes with no arguments', function (done) {
    var p = run(appjs, {
      output: function (data) {
        if (match(data, 'changes after filters')) {
          var changes = colour.strip(data.trim()).slice(-5).split('/');
          var restartedOn = changes.pop();

          assert(restartedOn === '0', 'expects to not have restarted');
          complete(p, done);
        }
      },
      error: function (data) {
        complete(p, done, new Error(data));
      }
    });

    p.on('message', function (event) {
      if (event.type === 'start') {
        setTimeout(function () {
          // touch a different file, but in the same directory
          touch.sync(appcoffee);
        }, 1000);
      } else if (event.type === 'restart') {
        complete(p, done, new Error("nodemon restarted"));
      }
    });
  });
});













