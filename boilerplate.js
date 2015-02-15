const fs    = require('fs')
    , path  = require('path')
    , after = require('after')
    , cpr   = require('cpr')


// find a destination for this file, if it already exists then add a number to
// the end of the filename (before extension) and keep incrementing that number
// until we find a free filename

function findDestination (file, contents, callback) {
  function statCompare (f, callback) {
    fs.stat(f, function (err) {
      if (err)
        return callback(null, f, false)

      if (!contents)
        callback(new Error('File / directory exists'))

      // else we have file contents to compare with, we can reuse a file if it's
      // the same as original
      fs.readFile(f, 'utf8', function (err, cmpContents) {
        if (err)
          return callback(err)

        if (cmpContents == contents) // identical, good to use!
          return callback(null, f, true)

        callback(new Error('File / directory exists'))
      })
    })
  }

  file = path.basename(file)

  var f   = path.join(process.cwd(), file)
    , ext = path.extname(file)
    , pfx = file.substring(0, file.length - ext.length)
    , i   = 0

  statCompare(f, next)

  function next (err, f, exists) {
    if (f) // found a new file to use
      return callback(null, f, exists)

    if (i == 100) // arbitrary limit, got to set it somewhere ...
      return callback(new Error('Considered 100 filenames to use for boilerplate but could not find an unused one'))

    f = path.join(process.cwd(), pfx + i + ext)
    i++

    statCompare(f, next)
  }
}


// copy the boilerplate files to CWD with names that aren't going to
// overwrite existing files

function prepare (callback) {
  if (!this._boilerplate.length)
    return process.nextTick(callback)

  var done = after(this._boilerplate.length, callback)
    , map  = this.boilerplateOut = {}

  this._boilerplate.forEach(function (src) {
    copyItem(src, map, done)
  })
}


function copyItem (src, map, callback) {
  function process (contents) {
    findDestination(src.file, contents, function (err, dst, write) {
      if (err)
        return callback(err)

      map[src.file] = map[path.basename(src.file)] = path.basename(dst)

      if (write === false)
        return callback()

      copy(src.file, dst, callback)
    })
  }

  function checkAndRead () {
    fs.stat(src.file, function (err, stat) {
      if (err)
        return callback(err)

      if (stat.isDirectory())
        process()

      if (!stat.isFile())
        return callback(new Error('Cannot handle non-file and non-directory boilerplate source'))

      fs.readFile(src.file, 'utf8', function (err, contents) {
        if (err)
          return callback(err)

        process(contents)
      })
    })
  }

  if (typeof src.contentFn != 'function')
    return checkAndRead()

  src.contentFn(function (err, contents) {
    if (err)
      return callback(err)

    process(contents)
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

  exercise.addBoilerplate = function (file, contentFn) {
    if (Array.isArray(file)) {
      return file.forEach(function (f) {
        exercise.addBoilerplate(f)
      })
    }

    if (typeof file != 'string')
      throw new TypeError('addBoilerplate must be provided with a path to a file or an array of paths')

    exercise._boilerplate.push({ file: file, contentFn: contentFn })
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
