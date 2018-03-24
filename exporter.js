"use strict";

const index = 'https://wiki.example.com/wiki:navigation?do=export_xhtmlbody';
const host = 'https://wiki.example.com';
const opts = {
    "output": "./output",
    "mediapath": "/uploads/images/migrated",
    "interlink": "/books/%s1/page/%s2", // %s1 = book, %s2 = page title, not implemented yet.
    "sleep": 100 // sleep 100ms before next request, poor performance dokuwiki.
};

var request = require('request');
var cheerio = require('cheerio');
var sanitizeHtml = require('sanitize-html');
var sleep = require('sleep');

var fs = require('fs-extra');
var path = require('path');
var urlparser = require('url');

var localmediapath = path.resolve(opts.output + opts.mediapath);
fs.ensureDir(localmediapath, function(err) {
    if (err) return console.log(err);
    request(index, function (error, response, body) {
        if (error) return console.log(error);
        var $ = cheerio.load(body);
        $('a').each(function(i, elem) {
            var url = $(this).attr('href');
            var xhtml = host + $(this).attr('href') + '?do=export_xhtmlbody';
            // avoid request loop
            if (url.indexOf('?') === -1 && url.startsWith('/') && !url.startsWith('//') && xhtml !== index) {
                exporter(xhtml, opts);
                sleep.msleep(opts.sleep);
            }
        });
    });
});

function exporter (url, opts) {
    request(url, function (error, response, body) {
        if (error) return console.log(error);
        console.log('[REQUEST]', url);
        downloadImage(body, opts);
        var htmlFile = path.resolve(opts.output, getFilename(url) + '.html');
        console.log('[FILE] writes to', htmlFile);
        fs.writeFileSync(htmlFile, sanitize(body, opts), 'utf8');
    });
}

function sanitize (body, opts) {
    console.log('[SANITIZE]...');
    return sanitizeHtml(body, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([ 'img' ]),
        transformTags: {
            // process interwiki links
            'a': function (tagName, attribs) {
                if (attribs && attribs.href) {
                    if (attribs.href.startsWith('#')) {
                        return {
                            tagName: tagName,
                            attribs: {
                                href: attribs.href
                            }
                        }
                    } else if (attribs.href.startsWith('/') && !attribs.href.startsWith('//')) {
                        return {
                            tagName: tagName,
                            attribs: {
                                href: convertNamespace(attribs.href)
                            }
                        }
                    } else if  (urlparser.host(imgsrc) === urlparser.host(host)) {
                        return {
                            tagName: tagName,
                            attribs: {
                                href: convertNamespace(urlparser.pathname(attribs.href))
                            }
                        }
                    }
                }
                return {
                    tagName: tagName,
                    attribs: attribs
                };
            },
            // process media images
            'img': function (tagName, attribs) {
                var imgsrc = parseImgSrc(attribs.src);
                if (imgsrc.startsWith('/') && !imgsrc.startsWith('//')) {
                    return {
                        tagName: tagName,
                        attribs: {
                            src: opts.mediapath + '/' + getFilename(imgsrc)
                        }
                    };
                }  else if (imgsrc.startsWith('http')) {
                    return {
                        tagName: tagName,
                        attribs: {
                            src: imgsrc
                        }
                    };
                } else {
                    // What else it will be?
                    return {
                        tagName: tagName,
                        attribs: attribs
                    };
                }
            }
        }
    });
}

function convertNamespace (p) {
    // match old wiki namespace to new one
    var namespace = getFilename(p).split(':');
    if (!namespace[1]) return namespace[0]; // root document
    var newpath = opts.interlink;
    // only root namespace (book) and last filename (page) are reserved, sub namespaces act as chapter is ignored here.
    return newpath.replace('%s1', namespace[0]).replace('%s2', namespace[namespace.length - 1]);
}

function getFilename (url) {
    return decodeURI(path.basename(urlparser.parse(url).pathname));
}

function downloadImage (body, opts) {
    var $ = cheerio.load(body);
    var img = [];
    $('img').each(function (i, elem) {
        var url = $(this).attr('src');
        if (url.startsWith('/') && !url.startsWith('//')) {
            url = host + url;
            img[i] = url;
        }
    });
    img.forEach(function(i) {
        i = parseImgSrc(i);
        var filename = getFilename(i);
        var localpath = path.resolve(
            localmediapath,
            filename
        );
        console.log('[DOWNLOAD IMG]', i, '->', localpath);
        request
            .get(i)
            .on('error', function(err) {
                console.log('[DOWNLOAD IMG ERR]', err)
            })
            .pipe(fs.createWriteStream(localpath));
        sleep.msleep(opts.sleep);
    });
}

function parseImgSrc (url) {
    // check if external url
    return urlparser.parse(url).path.startsWith('/lib/exe/fetch.php') ? decodeURIComponent(url.split('media=')[1]) : url
}
