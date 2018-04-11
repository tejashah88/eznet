require('dotenv').config()
const MerakiDashboard = require('node-meraki-dashboard');
const mem = require('mem');
const traverse = require('traverse');

// This will iterate through every function in the dashboard API, find the GET-based ones, and memoize it for caching
function deepMemoize(obj, maxAge) {
  return traverse(obj).map(function(x) {
    if (this.isLeaf && typeof x === "function" && x.toString().includes('rest.get'))
      this.update(mem(x, { maxAge }));
  });
}

module.exports = maxAge => deepMemoize(MerakiDashboard(process.env.MERAKI_API_KEY), maxAge);