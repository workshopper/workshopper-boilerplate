const fs    = require('fs')
    , path  = require('path')
    , after = require('after')
    , cpr   = require('cpr')

function adjustForLang (orig, lang, callback) {
  if (!lang) {
    process.nextTick(function () { cb(orig); })
    return
  }

  var extName = path.extname(orig)
    , langAware = orig.slice(0, -extName.length) + '.' + lang + extName

  fs.open(langAware, 'r', function (err, fd) {
    if (!err && fd)
      fs.close(fd)

    callback(null, err ? orig : langAware)
  });
}

// find a destination for this file, if it already exists then add a number to
// the end of the filename (before extension) and keep incrementing that number
// until we find a free filename

function findDestination (file, lang, callback) {
  if (lang)
    file = file.replace('.' + lang, '')

  file = path.basename(file)

  var f = path.join(process.cwd(), file)

  fs.exists(f, function (exists) {
    if (!exists)
      return callback(null, f)

    var ext = path.extname(file)
      , pfx = file.substring(0, file.length - ext.length)

    ;(function next (i) {
      f = path.join(process.cwd(), pfx + i + ext)

      fs.exists(f, function (exists) {
        if (!exists)
          return callback(null, f)

        next(i + 1)
      })
    }(1))
  })
}


// copy the boilerplate files to CWD with names that aren't going to
// overwrite existing files

function prepare (callback) {
  if (!this._boilerplate.length)
    return process.nextTick(callback)

  var done = after(this._boilerplate.length, callback)
    , out  = this.boilerplateOut = {}
    , self = this;

  this._boilerplate.forEach(function (src, index) {
    adjustForLang(src, self.lang, function(err, src) {
      // This will never happen, actually, but I wouldn't
      // want you to fear it might :-)
      if (err)
        return callback(err)

      self._boilerplate[index] = src
      var callback = done
      findDestination(src, self.lang, function (err, dst) {
        if (err)
          return callback(err)

        out[src] = out[path.basename(src)] = path.basename(dst)

        copy(src, dst, callback)
      })
    });
  })
}


function copy (src, dst, callback) {
  function copyFile () {
    fs.createReadStream(src)
      .on('error', function (err) {
        callback && callback(err)
      })
      .pipe(fs.createWriteStream(dst))
      .on('error', function (err) {
        callback && callback(err)
      })
      .on('close', function () {
        callback && callback()
      })
  }

  fs.stat(src, function (err, stat) {
    if (err)
      return callback(err)

    if (stat.isFile())
      return copyFile()

    if (stat.isDirectory())
      return cpr(src, dst, callback)

    return callback(new Error('Boilerplate source must be a regular file or directory'))
  })
}


function fix (exercise) {
  exercise._boilerplate = []

  exercise.addPrepare(prepare)

  exercise.addBoilerplate = function (file) {
    if (Array.isArray(file)) {
      return file.forEach(function (f) {
        exercise.addBoilerplate(f)
      })
    }

    if (typeof file != 'string')
      throw new TypeError('addBoilerplate must be provided with a path to a file or an array of paths')

    exercise._boilerplate.push(file)
  }


  // augment getExerciseText() such that the string {boilerplate:filename} will be replaced
  // in the problem.md with the name of the copy of that file written to CWD

  var getExerciseText = exercise.getExerciseText
  exercise.getExerciseText = function (callback) {
    var boilerplateOut = this.boilerplateOut

    getExerciseText.call(this, function (err, type, contents) {
      if (err)
        return callback(err)

      // proper path resolution
      contents = contents.replace(
          /\{boilerplate:([^}]+)\}/gi
        , function (match, boilerplateFile) {
            return boilerplateOut[boilerplateFile] || '(ERROR: Unknown boilerplate file)'
          }
      )

      callback(null, type, contents)
    })
  }
}


function boilerplate (exercise) {
  if (typeof exercise.addBoilerplate != 'function')
    fix(exercise)
  return exercise
}


module.exports = boilerplate
