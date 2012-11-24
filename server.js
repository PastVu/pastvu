#!/usr/bin/env node
/*
 * jQuery File Upload Plugin Node.js Example 1.0.4
 * https://github.com/blueimp/jQuery-File-Upload
 *
 * Copyright 2012, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * http://www.opensource.org/licenses/MIT
 */

/*jslint nomen: true, regexp: true, unparam: true, stupid: true */
/*global require, __dirname, unescape, console */

(function (port) {
    'use strict';

    var path = require('path'),
        fs = require('fs'),
        _existsSync = fs.existsSync || path.existsSync,  // Since Node 0.8, .existsSync() moved from path to fs
        async = require('async'),
        formidable = require('formidable'),
        nodeStatic = require('node-static'),
        imageMagick = require('imagemagick'),
        Utils = require('./commons/Utils.js'),
        options = {
            tmpDir: __dirname + '/publicContent/incoming',
            publicDir: __dirname + '/publicContent/photos',
            uploadDir: __dirname + '/publicContent/photos',
            uploadUrl: '/',
            maxPostSize: 11000000000, // 11 GB
            minFileSize: 1,
            maxFileSize: 10000000000, // 10 GB
            acceptFileTypes: /.+/i,
            // Files not matched by this regular expression force a download dialog,
            // to prevent executing any scripts in the context of the service domain:
            safeFileTypes: /\.(gif|jpe?g|png)$/i,
            imageTypes: /\.(gif|jpe?g|png)$/i,
            imageSequence: [
                {
                    version: 'standard',
                    width: 1050,
                    height: 700,
                    filter: 'Sinc',
                    postfix: '>'
                },
                {
                    version: 'thumb',
                    width: 246,
                    height: 164,
                    filter: 'Sinc',
                    gravity: 'center',
                    postfix: '^'
                },
                {
                    version: 'micro',
                    width: 60,
                    height: 40,
                    filter: 'Sinc',
                    gravity: 'center',
                    postfix: '^'
                }
            ],
            accessControl: {
                allowOrigin: '*',
                allowMethods: 'OPTIONS, HEAD, GET, POST, PUT, DELETE'
            },
            /* Uncomment and edit this section to provide the service via HTTPS:
             ssl: {
             key: fs.readFileSync('/Applications/XAMPP/etc/ssl.key/server.key'),
             cert: fs.readFileSync('/Applications/XAMPP/etc/ssl.crt/server.crt')
             },
             */
            nodeStatic: {
                cache: 3600 // seconds to cache served files
            }
        },
        utf8encode = function (str) {
            return unescape(encodeURIComponent(str));
        },
        fileServer = new nodeStatic.Server(options.publicDir, options.nodeStatic),
        nameCountRegexp = /(?:(?: \(([\d]+)\))?(\.[^.]+))?$/,
        nameCountFunc = function (s, index, ext) {
            return ' (' + ((parseInt(index, 10) || 0) + 1) + ')' + (ext || '');
        },
        FileInfo = function (file) {
            this.name = Utils.randomString(36) + file.name.substr(file.name.lastIndexOf('.'));
            this.size = file.size;
            this.type = file.type;
            this.delete_type = 'DELETE';
        },
        UploadHandler = function (req, res, callback) {
            this.req = req;
            this.res = res;
            this.callback = callback;
        },
        serve = function (req, res) {
            res.setHeader(
                'Access-Control-Allow-Origin',
                options.accessControl.allowOrigin
            );
            res.setHeader(
                'Access-Control-Allow-Methods',
                options.accessControl.allowMethods
            );
            var handleResult = function (result, redirect) {
                    if (redirect) {
                        res.writeHead(302, {
                            'Location': redirect.replace(
                                /%s/,
                                encodeURIComponent(JSON.stringify(result))
                            )
                        });
                        res.end();
                    } else {
                        res.writeHead(200, {
                            'Content-Type': req.headers.accept
                                                .indexOf('application/json') !== -1 ?
                                            'application/json' : 'text/plain'
                        });
                        res.end(JSON.stringify(result));
                    }
                },
                setNoCacheHeaders = function () {
                    res.setHeader('Pragma', 'no-cache');
                    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                    res.setHeader('Content-Disposition', 'inline; filename="files.json"');
                },
                handler = new UploadHandler(req, res, handleResult);
            switch (req.method) {
            case 'OPTIONS':
                res.end();
                break;
            case 'HEAD':
            case 'GET':
                if (req.url === '/') {
                    setNoCacheHeaders();
                    if (req.method === 'GET') {
                        handler.get();
                    } else {
                        res.end();
                    }
                } else {
                    fileServer.serve(req, res);
                }
                break;
            case 'POST':
                setNoCacheHeaders();
                handler.post();
                break;
            case 'DELETE':
                handler.destroy();
                break;
            default:
                res.statusCode = 405;
                res.end();
            }
        };
    fileServer.respond = function (pathname, status, _headers, files, stat, req, res, finish) {
        if (!options.safeFileTypes.test(files[0])) {
            // Force a download dialog for unsafe file extensions:
            res.setHeader(
                'Content-Disposition',
                'attachment; filename="' + utf8encode(path.basename(files[0])) + '"'
            );
        } else {
            // Prevent Internet Explorer from MIME-sniffing the content-type:
            res.setHeader('X-Content-Type-Options', 'nosniff');
        }
        nodeStatic.Server.prototype.respond
            .call(this, pathname, status, _headers, files, stat, req, res, finish);
    };
    FileInfo.prototype.validate = function () {
        if (options.minFileSize && options.minFileSize > this.size) {
            this.error = 'File is too small';
        } else if (options.maxFileSize && options.maxFileSize < this.size) {
            this.error = 'File is too big';
        } else if (!options.acceptFileTypes.test(this.name)) {
            this.error = 'Filetype not allowed';
        }
        return !this.error;
    };
    FileInfo.prototype.safeName = function () {
        // Prevent directory traversal and creating hidden system files:
        this.name = path.basename(this.name).replace(/^\.+/, '');
        // Prevent overwriting existing files:
        while (_existsSync(options.uploadDir + '/origin/' + this.name)) {
            this.name = this.name.replace(nameCountRegexp, nameCountFunc);
        }
    };
    FileInfo.prototype.initUrls = function (req) {
        if (!this.error) {
            var that = this,
                baseUrl = (options.ssl ? 'https:' : 'http:') +
                    '//' + req.headers.host + options.uploadUrl;
            this.url = baseUrl + 'origin/' + encodeURIComponent(this.name);
            this.delete_url = baseUrl + encodeURIComponent(this.name);
            options.imageSequence.forEach(function (item, index) {
                if (_existsSync(options.uploadDir + '/' + item.version + '/' + that.name)) {
                    that[item.version + '_url'] = baseUrl + item.version + '/' + encodeURIComponent(that.name);
                }
            });
        }
    };
    UploadHandler.prototype.get = function () {
        var handler = this,
            files = [];
        fs.readdir(options.uploadDir + '/origin', function (err, list) {
            list.forEach(function (name) {
                var stats = fs.statSync(options.uploadDir + '/origin/' + name),
                    fileInfo;
                if (stats.isFile()) {
                    fileInfo = new FileInfo({
                        name: name,
                        size: stats.size
                    });
                    fileInfo.initUrls(handler.req);
                    files.push(fileInfo);
                }
            });
            handler.callback(files);
        });
    };
    UploadHandler.prototype.post = function () {
        var handler = this,
            form = new formidable.IncomingForm(),
            tmpFiles = [],
            files = [],
            map = {},
            counter = 1,
            redirect,
            finish = function () {
                counter -= 1;
                if (!counter) {
                    files.forEach(function (fileInfo) {
                        fileInfo.initUrls(handler.req);
                    });
                    handler.callback(files, redirect);
                }
            };
        form.uploadDir = options.tmpDir;
        form.on('fileBegin',function (name, file) {
            tmpFiles.push(file.path);
            var fileInfo = new FileInfo(file, handler.req, true);
            fileInfo.safeName();
            map[path.basename(file.path)] = fileInfo;
            files.push(fileInfo);
        }).on('field',function (name, value) {
                if (name === 'redirect') {
                    redirect = value;
                }
            }).on('file',function (name, file) {
                var fileInfo = map[path.basename(file.path)];

                fileInfo.size = file.size;
                if (!fileInfo.validate()) {
                    fs.unlink(file.path);
                    return;
                }
                fs.renameSync(file.path, options.uploadDir + '/origin/' + fileInfo.name);
                if (options.imageTypes.test(fileInfo.name)) {
                    counter += 1;
                    imageMagick.identify(options.uploadDir + '/origin/' + fileInfo.name, function (err, data) {
                        if (err) {
                            console.error(err);
                        } else {
                            if (data.format) {
                                fileInfo.format = data.format;
                            }
                            if (data.width) {
                                fileInfo.w = data.width;
                            }
                            if (data.height) {
                                fileInfo.h = data.height;
                            }
                        }
                        finish();
                    });

                    counter += 1;
                    var sequence = [];
                    options.imageSequence.forEach(function (item, index, array) {
                        var o = {
                            srcPath: options.uploadDir + '/' + (index > 0 ? array[index - 1].version : 'origin') + '/' + fileInfo.name,
                            dstPath: options.uploadDir + '/' + item.version + '/' + fileInfo.name,
                            strip: true,
                            width: item.width,
                            height: item.height + (item.postfix || '') // Only Shrink Larger Images
                        };
                        if (item.filter) {
                            o.filter = item.filter;
                        }
                        if (item.gravity) { // Превью генерируем путем вырезания аспекта из центра
                            // Example http://www.jeff.wilcox.name/2011/10/node-express-imagemagick-square-resizing/
                            o.customArgs = [
                                "-gravity", item.gravity,
                                "-extent", item.width + "x" + item.height
                            ];
                        }

                        sequence.push(function (callback) {
                            imageMagick.resize(o, function () {
                                callback(null);
                            });
                        });

                    });
                    async.waterfall(sequence, function () {finish();});
                }
            }).on('aborted',function () {
                tmpFiles.forEach(function (file) {
                    fs.unlink(file);
                });
            }).on('error',function (e) {
                console.log(e);
            }).on('progress',function (bytesReceived, bytesExpected) {
                if (bytesReceived > options.maxPostSize) {
                    handler.req.connection.destroy();
                }
            }).on('end', finish).parse(handler.req);
    };
    UploadHandler.prototype.destroy = function () {
        var handler = this,
            fileName;
        if (handler.req.url.slice(0, options.uploadUrl.length) === options.uploadUrl) {
            fileName = path.basename(decodeURIComponent(handler.req.url));
            fs.unlink(options.uploadDir + '/origin/' + fileName, function (ex) {
                options.imageSequence.forEach(function (item, index) {
                    fs.unlink(options.uploadDir + '/' + item.version + '/' + fileName);
                });
                handler.callback(!ex);
            });
        } else {
            handler.callback(false);
        }
    };
    if (options.ssl) {
        require('https').createServer(options.ssl, serve).listen(port);
    } else {
        require('http').createServer(serve).listen(port);
    }
}(8888));
