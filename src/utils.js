'use strict';

//native modules
const { URL } = require('url');
const dns = require('dns');

// remote modules
const Fuse = require('fuse.js');

function websiteExists(url) {
  return new Promise((resolve, reject) => {
    urlExists(url, function(err, exists) {
      if (err)
        return reject(err);
      else
        return resolve(exists);
    });
  });
}

function secConverter(seconds) {
  let minutes = Math.floor(seconds / 60);
  seconds = seconds % 60;
  let hours = Math.floor(minutes / 60);
  minutes = minutes % 60;
  let days = Math.floor(hours / 24);
  hours = hours % 24;

  return { days, hours, minutes, seconds };
}

function roundTo(number, precision) {
  let factor = Math.pow(10, precision);
  return Math.round(number * factor) / factor;
}

function normalizeSeconds(secs) {
  let { days, hours, minutes, seconds } = secConverter(secs);
  let precision = 1;

  if (days)
    return roundTo(days + hours / 24, precision) + ' days';
  else if (hours)
    return roundTo(hours + minutes / 60, precision) + ' hours';
  else if (minutes)
    return roundTo(minutes + seconds / 60, precision) + ' minutes';
  else
    return seconds + ' seconds';
}

function getBaseUrl(url) {
  url = url.startsWith('http://') ? url : 'http://' + url; // only needed for no type errors
  return new URL(url).hostname;
}

function lookupAddress(url) {
  return new Promise(resolve => {
    dns.lookup(getBaseUrl(url), { family: 4 }, (err, address) => resolve(address || null));
  })
}

function fuseSearch(list, target, searchKeys, idExtractKey) {
  let fuseOptions = {
    id: idExtractKey || null,
    shouldSort: true,
    threshold: 0.6,
    distance: 100,
    maxPatternLength: 64,
    minMatchCharLength: 1,
    location: 0,
    keys: searchKeys
  };

  let fuse = new Fuse(list, fuseOptions);
  let results = fuse.search(target);
  return results[0];
}

module.exports = { normalizeSeconds, lookupAddress, fuseSearch };