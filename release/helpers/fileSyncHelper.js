"use strict";
var sprequest = require('sp-request');
var Promise = require('bluebird');
var gutil = require('gulp-util');
var defer_1 = require('./defer');
var FolderCreator_1 = require('./FolderCreator');
var fileHelper = require('./fileHelper');
var fileHlp = new fileHelper.FileHelper();
var FileSync = (function () {
    function FileSync(options) {
        this.digest = null;
        this.config = options;
        this.spr = sprequest.create({ username: options.username, password: options.password });
    }
    /*
     * Initialize file upload
     */
    FileSync.prototype.init = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (_this.digest === null) {
                _this.spr.requestDigest(_this.config.site).then(function (result) {
                    _this.digest = result;
                    _this.start().then(function () {
                        resolve(null);
                    });
                });
            }
            else {
                _this.start().then(function () {
                    resolve(null);
                });
            }
        });
    };
    /*
     * Start uploading a file
     */
    FileSync.prototype.start = function () {
        var _this = this;
        // Get the file info
        this.fileInfo = fileHlp.getFileContext(this.config);
        this.folderCreator = new FolderCreator_1.FolderCreator(this.config, this.spr, this.digest, this.fileInfo);
        return new Promise(function (resolve, reject) {
            // Create the required folders
            _this.folderCreator.checkFoldersAndCreateIfNotExist()
                .then(function () {
                // Ready to upload file
                return _this.upload();
            })
                .then(function () {
                // Ready to set metadata to file
                return _this.updateFileMetadata();
            })
                .then(function () {
                // Ready to publish file
                return _this.publishFile();
            })
                .then(function () {
                // Everything done
                resolve(null);
            })
                .catch(function (err) {
                reject(err);
            });
        });
    };
    /*
     * Upload file
     */
    FileSync.prototype.upload = function () {
        var _this = this;
        var headers = {
            "headers": {
                "X-RequestDigest": this.digest
            },
            "body": this.config.content,
            "json": false
        };
        return new Promise(function (resolve, reject) {
            _this.spr.post(_this.config.site + "/_api/web/GetFolderByServerRelativeUrl('" + _this.fileInfo.library + "')/Files/add(url='" + _this.fileInfo.filename + "',overwrite=true)", headers)
                .then(function (success) {
                gutil.log(gutil.colors.green('Upload successful'));
                resolve(success);
            })
                .catch(function (err) {
                gutil.log(gutil.colors.red("Unable to upload file, it might be checked out to someone"));
                reject(err);
            });
        });
    };
    /*
     * Update file metadata
     */
    FileSync.prototype.updateFileMetadata = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            // Check if the file metadata has to be updated
            if (_this.config.update_metadata) {
                // Check if the config consists file metadata
                if (_this.config.files_metadata.length <= 0) {
                    resolve(null);
                }
                // Check if file metadata exists for the current file
                var fileMetadata = _this.config.files_metadata.filter(function (fm) {
                    if (fm.name.toLowerCase() === _this.fileInfo.filename.toLowerCase()) {
                        return fm;
                    }
                });
                if (fileMetadata.length > 0) {
                    // Get the first metadata config for of the current file
                    var metadata = fileMetadata[0].metadata;
                    var header = {
                        headers: {
                            "content-type": "application/json;odata=verbose",
                            "Accept": "application/json;odata=verbose",
                            "X-HTTP-Method": "MERGE",
                            "If-Match": "*",
                            "X-RequestDigest": _this.digest
                        },
                        body: metadata
                    };
                    _this.spr.post(_this.config.site + "/_api/web/GetFolderByServerRelativeUrl('" + _this.fileInfo.library + "')/Files('" + _this.fileInfo.filename + "')/listitemallfields", header).then(function (postData) {
                        gutil.log(gutil.colors.green('Metadata updated successfully'));
                        resolve(postData);
                    }).catch(function (err) {
                        gutil.log(gutil.colors.red("Unable to update metadata of the file"));
                        reject(err);
                    });
                }
                else {
                    // Nothing to do, no metadata for the file
                    resolve(null);
                }
            }
            else {
                // Metadata must not be set
                resolve(null);
            }
        });
    };
    /*
     * Publish the file
     */
    FileSync.prototype.publishFile = function () {
        var _this = this;
        var deferred = defer_1.defer();
        // Check if the file needs to be published
        if (this.config.publish) {
            // First check out the file
            return this.checkout().then(function () {
                // Major checkin file
                return _this.checkin(deferred, 1);
            }).catch(function (err) {
                gutil.log(gutil.colors.red("Unable to publish file"));
                deferred.reject(err);
            });
        }
        else {
            // File must not be published
            deferred.resolve(null);
        }
        return deferred.promise;
    };
    /*
     * Check out file
     */
    FileSync.prototype.checkout = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var header = {
                "headers": {
                    "content-type": "application/json;odata=verbose",
                    "X-RequestDigest": _this.digest
                }
            };
            _this.spr.post(_this.config.site + "/_api/web/GetFolderByServerRelativeUrl('" + _this.fileInfo.library + "')/Files('" + _this.fileInfo.filename + "')/CheckOut()", header)
                .then(function (success) {
                resolve(success);
            })
                .catch(function (err) {
                reject(err);
            });
        });
    };
    /*
     * Check in file - Minor: 0 - Major: 1 - Overwrite: 2
     */
    FileSync.prototype.checkin = function (deferred, type) {
        // Check if there was a checkin type specified
        if (!type) {
            // MinorCheckIn = 0
            type = 0;
        }
        var header = {
            "headers": {
                "content-type": "application/json;odata=verbose",
                "X-RequestDigest": this.digest
            }
        };
        this.spr.post(this.config.site + "/_api/web/GetFolderByServerRelativeUrl('" + this.fileInfo.library + "')/Files('" + this.fileInfo.filename + "')/CheckIn(comment='Checked in via GULP', checkintype=" + type + ")", header).then(function (result) {
            gutil.log(gutil.colors.green('Published file'));
            deferred.resolve(result);
        });
        return deferred.promise;
    };
    return FileSync;
}());
exports.FileSync = FileSync;