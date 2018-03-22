"use strict";

const index = 'https://wiki.nyaa.cat/wiki:navigation?do=export_xhtmlbody';
const host = 'https://wiki.nyaa.cat';
const opts = {
    "output": "./output",
    "mediapath": "/uploads/images/migrated",
    "interlink": "/books/%s1/page/%s2" // %s1 = book, %s2 = page title, not implemented yet.
};

var request = require('request');
var cheerio = require('cheerio');
var sanitizeHtml = require('sanitize-html');

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
            if (url.indexOf('?') === -1 && url.startsWith('/') && !url.startsWith('//')) {
                exporter(host + $(this).attr('href') + '?do=export_xhtmlbody', opts);
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
        console.log('writes to', htmlFile);
        fs.writeFileSync(htmlFile, sanitize(body, opts), 'utf8');
    });
}

function sanitize (body, opts) {
    return sanitizeHtml(body, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([ 'img' ]),
        transformTags: {/*
            // process interwiki links
            'a': function (tagName, attribs) {},
            // process media images
            'img': function (tagName, attribs) {}*/
        }
    });
}

function getFilename (url) {
    return decodeURI(path.basename(urlparser.parse(url).pathname));
}

function downloadImage (body, opts) {
    var $ = cheerio.load(body);
    var img = [];
    $('img').each(function (i, elem) {
        var url = $(this).attr('src');
        if (url.indexOf('?') === -1 && url.startsWith('/') && !url.startsWith('//')) {
            url = host + url;
            img[i] = url;
        }
    });
    img.forEach(function(i) {
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
    });
}

function rndStr () {
    return Math.random().toString(36).replace(/[^a-z0-9]+/g, '').substr(0, 24);
}
