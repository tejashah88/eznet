// Certain devices cause a 400 error when retrieving its clients, since no clients are connected to phones or security
// cameras, and the Meraki Dashboard API doesn't send the device types with its list
const noClientsList = [ "MC74", "MV21", "MV71" ];

const type2mult = {
  s: 1,
  m: 60,
  h: 60 * 60,
  day: 24 * 60 * 60,
  wk: 7 * 24 * 60 * 60,
  mo: 30 * 24 * 60 * 60,
  yr: 12 * 30 * 24 * 60 * 60
};

const timeUnitExtender = {
  s: "seconds",
  m: "minutes",
  h: "hours",
  day: "days",
  wk: "weeks",
  mo: "months",
  yr: "years"
};

const commandExplanations = {
  "list organizations": "It shows the organizations that you are a part of.",
  "list networks": "It show the networks in an organization.",
  "list admins": "It lists the admins that are registered in an organization. If there are more than 10 admins, then it will list only the first 10.",
  "list devices": "It list the devices currently connected in a network. If there are more than 10 devices, then it will list only the first 10.",
  "data usage": "It visualizes and presents some statistics of the total data usage over a given timeframe in a network. Note that 'Traffic Analysis with Hostname Visibility' must be enabled on the specified network. The given timeframe cannot be less than 2 hours or more than 1 month.",
  "top app/website usage": "It visualizes and lists the top 10 app or websites used in a given timeframe. This is specific to networks only. The given timeframe cannot be less than 2 hours or more than 1 month.",
  //"block website": "It will block a website or list of websites by resolving their IP addresses and blocking them via the layer 3 firewall. If an IP address cannot be resolved, it will be ignored."
};

module.exports = { noClientsList, type2mult, timeUnitExtender, commandExplanations };