'use strict';

const { URL } = require('url');
const Fuse = require('fuse.js');
const randomColor = require('randomcolor');
const dashboard = require('node-meraki-dashboard')(process.env.MERAKI_API_KEY);
const spark = require('ciscospark/env');
const quiche = require('quiche');
const roundTo = require('round-to');
const secConverter = require("seconds-converter");
const bytes = require('bytes');
const dns = require('dns-then');
const pThrottle = require('p-throttle');

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
  "block website": "It will block a website or list of websites by resolving their IP addresses and blocking them via the layer 3 firewall. If an IP address cannot be resolved, it will be ignored."
};

function calcTotalSeconds(timeDuration) {
  return timeDuration.amount * type2mult[timeDuration.unit];
}

function displayableTimeDuration(timeDuration) {
  return timeDuration.amount + " " + timeUnitExtender[timeDuration.unit];
}

function getBaseUrl(url) {
  url = url.startsWith('http://') ? url : 'http://' + url; // only needed for no type errors
  return new URL(url).hostname;
}

async function lookupAddress(url) {
  try {
    return await dns.lookup(getBaseUrl(url));
  } catch (error) {
    return null;
  }
}

async function retrieveMerakiDashboardCache(fbApp) {
  return (await fbApp.database().ref().once('value')).val();
}

function generateIdNameLookup(object, field) {
  return Object.keys(object).map(id => ({ id: id, name: object[id][field] }));
}

async function defaultErrorResponse(msg, basicInfo) {
  return await handleBotResponse({
    text: msg,
    speech: msg,
    info: basicInfo
  });
}

async function resourceNotFoundResponse(entity, basicInfo) {
  return await defaultErrorResponse(`The specified ${entity} could not be found!`, basicInfo);
}

function defaultBotResponse(string) {
  let finalString;
  if (typeof string == "object")
    finalString = JSON.stringify(string)
  else
    finalString = string;
  return { speech: finalString, displayText: finalString };
}

function normalizeSeconds(seconds) {
  let convertedTime = secConverter(seconds, "sec");
  let precision = 1;
  let result;

  if (convertedTime.days)
    result = roundTo(convertedTime.days + convertedTime.hours / 24, precision) + ' days';
  else if (convertedTime.hours)
    result = roundTo(convertedTime.hours + convertedTime.minutes / 60, precision) + ' hours';
  else if (convertedTime.minutes)
    result = roundTo(convertedTime.minutes + convertedTime.seconds / 60, precision) + ' minutes';
  else
    result = convertedTime.seconds + ' seconds';

  return result;
}

function fuseSearch(list, keyValue, options) {
  let fuse_options = {
    shouldSort: true,
    threshold: 0.6,
    distance: 100,
    maxPatternLength: 64,
    minMatchCharLength: 1,
    location: 0,
    keys: options.keys,
    id: options.id
  };

  let fuse = new Fuse(list, fuse_options);
  return fuse.search(keyValue)[0];
}

function fuzzySearchOrgs(targetOrg, orgsCache) {
  let orgLookup = generateIdNameLookup(orgsCache, 'name');
  return fuseSearch(orgLookup, targetOrg.trim(), { keys: ['name'] });
}

function fuzzySearchNetworks(targetNet, netsCache) {
  let netLookup = generateIdNameLookup(netsCache, 'name');
  return fuseSearch(netLookup, targetNet.trim(), { keys: ['name'] });
}

function handleNonSparkResponse(params) {
  let base_json = {
    platform: params.source,
    data: {
      google: {
        richResponse: {
          items: []
        },
      },
      facebook: {},
      slack: {}
    }
  };

  if (params.contextOut)
    base_json.contextOut = params.contextOut;

  // google
  base_json.data.google.richResponse.items.push({
    simpleResponse: {
      textToSpeech: params.speech || "",
    }
  });

  let basicCard = {};
  if (params.text)
    basicCard.formattedText = params.text.replace(/<bold>/g, '**');
  if (params.imageUrl) {
    basicCard.image = {
      url: params.imageUrl,
      accessibilityText: 'random chart'
    }
  }

  base_json.data.google.richResponse.items.push({
    basicCard: basicCard
  });

  // facebook
  if (params.text)
    base_json.data.facebook.text = params.text.replace(/<bold>/g, '*');

  // facebook seems to have a limit on how much text is sent in one message
  // and dialogflow doesn't allow sending images and formatted text at the same time, directly speaking
  /*if (params.imageUrl) {
    if (base_json.data.facebook.text)
      base_json.data.facebook.text += "\n" + params.imageUrl;
    else
      base_json.data.facebook.text = params.imageUrl;
  }*/

  // slack
  if (params.text)
    base_json.data.slack.text = params.text.replace(/<bold>/g, '*');
  if (params.imageUrl) {
    base_json.data.slack.attachments = [
      {
        'text': '',
        'image_url': params.imageUrl
      }
    ];
  }

  return base_json;
}

async function handleSparkResponse(params) {
  let base_json = {
    roomId: params.info.originalReq.data.data.roomId
  };

  if (params.text)
    base_json.markdown = params.text.replace(/<bold>/g, '**');
  if (params.imageUrl)
    base_json.files = [ params.imageUrl ];

  await spark.messages.create(base_json);

  let fake_json = { speech: "" };

  if (params.contextOut)
    fake_json.contextOut = params.contextOut;

  return fake_json;
}

async function handleBotResponse(params) {
  if (params.info.source === 'spark') {
    return await handleSparkResponse({
      text: params.text,
      imageUrl: params.imageUrl,
      contextOut: params.contextOut,
      info: params.info
    });
  } else {
    return handleNonSparkResponse({
      speech: params.speech,
      text: params.text,
      imageUrl: params.imageUrl,
      contextOut: params.contextOut,
      source: params.info.source
    });
  }
}

async function listOrganizations(basicInfo, merakiCache) {
  let textMsg = "You are in the following <bold>organizations<bold>:\n";
  let voiceMsg = "You are in the following organizations: ";

  let orgNames = Object.keys(merakiCache.orgs).map(id => merakiCache.orgs[id].name)

  textMsg += orgNames.map((name, index) => `${index + 1}. ` + name).join('\n').trim();
  voiceMsg += orgNames.join(', ').trim();

  return await handleBotResponse({
    text: textMsg,
    speech: voiceMsg,
    info: basicInfo
  });
}

async function listNetworks(basicInfo, merakiCache) {
  let inputOrgName = basicInfo.parameters.org || basicInfo.contexts.org || undefined;

  if (!inputOrgName)
    return await resourceNotFoundResponse('organization', basicInfo);

  let org = fuzzySearchOrgs(inputOrgName, merakiCache.orgs);

  if (!org)
    return await resourceNotFoundResponse('organization', basicInfo);

  let orgName = org.name.trim();
  let networkIds = merakiCache.orgs[org.id].networks;
  let networkNames = networkIds.map(id => merakiCache.networks[id].name.trim());

  let textMsg = `Your organization, <bold>${orgName}<bold>, has the following networks:\n`;
  let voiceMsg = `Your organization, ${orgName}, has the following networks: `;

  textMsg += networkNames.map((name, index) => `${index + 1}. ` + name).join('\n').trim();
  voiceMsg += networkNames.join(', ').trim();

  return await handleBotResponse({
    text: textMsg,
    speech: voiceMsg,
    contextOut: [
      {
        name: "organization",
        lifespan: 5,
        parameters: {
          "org": orgName
        }
      }
    ],
    info: basicInfo
  });
}

async function listDevices(basicInfo, merakiCache) {
  let inputNetName = basicInfo.parameters.network || basicInfo.contexts.network || undefined;

  if (!inputNetName)
    return await resourceNotFoundResponse('network', basicInfo);

  let net = fuzzySearchNetworks(inputNetName, merakiCache.networks);

  if (!net)
    return await resourceNotFoundResponse('network', basicInfo);

  let netName = net.name.trim();
  let deviceIds = merakiCache.networks[net.id].devices;
  let deviceNames = deviceIds.slice(0, 10).map(id => {
    let device = merakiCache.devices[id];
    return device.name || device.model;
  });

  let textMsg = `Your network, <bold>${netName}<bold>, has the following devices:\n`;
  let voiceMsg = `Your network, ${netName}, has the following devices: `;

  textMsg += deviceNames.map((name, index) => `${index + 1}. ` + name).join('\n').trim();
  voiceMsg += deviceNames.join(', ').trim();

  if (deviceIds.length > 10) {
    textMsg += `\n+ ${deviceIds.length - 10} other devices.`;
    voiceMsg += ` and ${deviceNames.length - 10} other devices.`;
  }

  return await handleBotResponse({
    text: textMsg,
    speech: voiceMsg,
    contextOut: [
      {
        name: "network",
        lifespan: 5,
        parameters: {
          "network": netName
        }
      }
    ],
    info: basicInfo
  });
}

async function listAdmins(basicInfo, merakiCache) {
  let inputOrgName = basicInfo.parameters.org || basicInfo.contexts.org || undefined;

  if (!inputOrgName)
    return await resourceNotFoundResponse('organization', basicInfo);

  let org = fuzzySearchOrgs(inputOrgName, merakiCache.orgs);

  if (!org)
    return await resourceNotFoundResponse('organization', basicInfo);

  let orgName = org.name.trim();
  let adminIds = merakiCache.orgs[org.id].admins;
  let adminsIdsShort = adminIds.slice(0, 10);
  let adminNames = adminsIdsShort.map(id => merakiCache.admins[id].name);
  let adminInfos = adminsIdsShort.map(id => {
    let admin = merakiCache.admins[id];
    return admin.name + " - " + admin.email;
  });

  let textMsg = `Your organization, <bold>${orgName}<bold>, has the following administrators:\n`;
  let voiceMsg = `Your organization, ${orgName}, has the following administrators: `;

  textMsg += adminInfos.map((info, index) => `${index + 1}. ` + info).join('\n').trim();
  voiceMsg += adminNames.join(', ').trim();

  if (adminIds.length > 10) {
    textMsg += `\n+ ${adminIds.length - 10} other administrators.`;
    voiceMsg += ` and ${adminIds.length - 10} other administrators.`;
  }

  return await handleBotResponse({
    text: textMsg,
    speech: voiceMsg,
    contextOut: [
      {
        name: "organization",
        lifespan: 5,
        parameters: {
          "org": orgName
        }
      }
    ],
    info: basicInfo
  });
}

async function topTraffic(basicInfo, merakiCache) {
  let inputNetName = basicInfo.parameters.network || basicInfo.contexts.network || undefined;
  let inputTimeDuration = basicInfo.parameters['time-duration'] || basicInfo.contexts['time-duration'] || undefined;

  if (!inputNetName)
    return await resourceNotFoundResponse('network', basicInfo);

  if (!inputTimeDuration)
    return await resourceNotFoundResponse('time duration', basicInfo);

  let net = fuzzySearchNetworks(inputNetName, merakiCache.networks);

  if (!net)
    return await resourceNotFoundResponse('network', basicInfo);

  let netName = net.name.trim();

  let totalSeconds = calcTotalSeconds(inputTimeDuration);
  if (totalSeconds < 2 * type2mult['hour'] || totalSeconds > type2mult['month'])
    return await defaultErrorResponse("Sorry, but you can only get traffic data between 2 hours and 1 month.", basicInfo);

  let trafficData;
  try {
    trafficData = await dashboard.networks.getTrafficData(net.id, { timespan : totalSeconds });
  } catch (error) {
    console.log("Top Traffic Error:", error);
    return await defaultErrorResponse("An internal error occured while accessing the top traffic statistics. Please try again later.");
  }

  if (trafficData.length === 0)
    return await defaultErrorResponse("No top traffic data has been found!", basicInfo);

  let textMsg = `Your network, <bold>${netName}<bold>, has the following top 10 sites/apps for traffic:\n`;
  let voiceMsg = `Your network, ${netName}, has the following top 10 sites/apps for traffic: `;

  let top_traffic = trafficData.slice(0, 10).map(
    t_data => ({
      app: t_data.application,
      source: t_data.destination,
      time: t_data.activeTime,
      numClients: t_data.numClients
    })
  ).sort((a, b) => b.time - a.time);

  textMsg += top_traffic.map((tt, index) => `${index + 1}. ${tt.app + (tt.source ? `@${tt.source}` : "")}: ${normalizeSeconds(tt.time)}`).join('\n');
  voiceMsg += top_traffic.map((tt, index) => `${tt.app + (tt.source ? ` from ${tt.source}` : "")} used for ${normalizeSeconds(tt.time)}`).join(', ');

  let pie = new quiche('pie');
  pie.setHostname('image-charts.com');
  pie.setWidth(700);
  pie.setHeight(700);
  for (let tt of top_traffic)
    pie.addData(tt.time, tt.app + (tt.source ? `@${tt.source}` : ""), randomColor().slice(1))
  let imageUrl = pie.getUrl(true).replace(/(chd=t%3A(\d+(\.\d+)?))&/g,'$1%2C0&'); // handling edge case where having only one data point breaks chart

  return await handleBotResponse({
    text: textMsg,
    speech: voiceMsg,
    imageUrl: imageUrl,
    contextOut: [
      {
        name: "network",
        lifespan: 5,
        parameters: {
          "network": netName
        }
      }
    ],
    info: basicInfo
  });
}

async function dataUsage(basicInfo, merakiCache) {
  let inputNetName = basicInfo.parameters.network || basicInfo.contexts.network || undefined;
  let inputTimeDuration = basicInfo.parameters['time-duration'] || basicInfo.contexts['time-duration'] || undefined;

  if (!inputNetName)
    return await resourceNotFoundResponse('network', basicInfo);

  if (!inputTimeDuration)
    return await resourceNotFoundResponse('time duration', basicInfo);

  let net = fuzzySearchNetworks(inputNetName, merakiCache.networks);

  if (!net)
    return await resourceNotFoundResponse('network', basicInfo);

  let netName = net.name.trim();

  let totalSeconds = calcTotalSeconds(inputTimeDuration);
  if (totalSeconds < 2 * type2mult['hour'] || totalSeconds > type2mult['month'])
    return await defaultErrorResponse("Sorry, but you can only get data usage statistics between 2 hours and 1 month.", basicInfo);

  let deviceSerials = merakiCache.networks[net.id].devices.filter(serial => !noClientsList.includes(merakiCache.devices[serial].model.trim()));

  let pie = new quiche('pie');
  pie.setHostname('image-charts.com');
  pie.setWidth(700);
  pie.setHeight(700);

  // technically, a maximum of 5 requests per second are allowed, but better safe than sorry
  const listClientsThrottled = pThrottle(serial => dashboard.clients.list(serial, totalSeconds), 5, 1200);
  const timeDurText = displayableTimeDuration(inputTimeDuration);

  let rawClientsArray = await Promise.all(deviceSerials.map(serial => listClientsThrottled(serial)));
  let clients = [].concat(...rawClientsArray);
  let clientCount = clients.length;

  if (clientCount == 0)
    return await defaultErrorResponse(`No data usage in the past ${timeDurText}!`, basicInfo);

  let totalSent = 0, totalReceived = 0;
  for (let client of clients) {
    pie.addData(client.usage.sent + client.usage.recv, client.description, randomColor().slice(1));
    totalSent += client.usage.sent;
    totalReceived += client.usage.recv;
  }

  let imageUrl = pie.getUrl(true).replace(/(chd=t%3A(\d+(\.\d+)?))&/g,'$1%2C0&'); // handling edge case where having only one data point breaks chart
  let total = totalSent + totalReceived;

  let bytesOpts = { unitSeparator: ' ' };
  let bytesTotal = bytes(total, bytesOpts);
  let avgByteTotalClient = bytes(total / clientCount, bytesOpts);
  let bytesSent = bytes(totalSent, bytesOpts);
  let bytesReceived = bytes(totalReceived, bytesOpts);

  let addLineSpark = basicInfo.source === 'spark' ? '\n' : '';
  let textMsg = `* Total data usage with ${clientCount} clients over ${timeDurText}: ${bytesTotal}\n${addLineSpark}` +
                `* Average data usage over ${timeDurText}: ${avgByteTotalClient} per client\n${addLineSpark}` +
                `* Total data sent over ${timeDurText}: ${bytesSent}\n${addLineSpark}` +
                `* Total data received over ${timeDurText}: ${bytesReceived}`;
  let voiceMsg = `The total data usage with ${clientCount} clients over ${timeDurText} was ${bytesTotal}. On average, most clients used about ${avgByteTotalClient}. The total data sent over the same time period was ${bytesSent} and the total data received was ${bytesReceived}.`;

  return await handleBotResponse({
    text: textMsg,
    speech: voiceMsg,
    imageUrl: imageUrl,
    contextOut: [
      {
        name: "network",
        lifespan: 5,
        parameters: {
          "network": netName
        }
      }
    ],
    info: basicInfo
  });
}

async function blockSite(basicInfo, merakiCache) {
  let inputNetName = basicInfo.parameters.network || basicInfo.contexts.network || undefined;
  let urls = basicInfo.parameters.urls || [];

  if (!urls.length)
    return await defaultErrorResponse("No websites were specified for blocking!", basicInfo);

  if (!inputNetName)
    return await resourceNotFoundResponse('network', basicInfo);

  let net = fuzzySearchNetworks(inputNetName, merakiCache.networks);

  if (!net)
    return await resourceNotFoundResponse('network', basicInfo);

  let netName = net.name.trim();
  let lookupResults = await Promise.all(urls.map(url => lookupAddress(url)));
  let ipAddresses = lookupResults.filter(result => !!result);
  let goodCount = ipAddresses.length;
  let badCount = lookupResults.length - goodCount;

  let rules = ipAddresses.map((ip, index) => ({
    comment: 'Rule for blocking ' + urls[index],
    policy: 'deny',
    protocol: 'any',
    destPort: 'Any',
    destCidr: ip + '/32'
  }));

  let ssidsRaw = await dashboard.ssids.list(net.id);
  let ssids = ssidsRaw.filter(ssidRaw => ssidRaw.enabled).map(ssidRaw => ssidRaw.number);

  // technically, a maximum of 5 requests per second are allowed, but better safe than sorry
  const updateRulesThrottled = pThrottle(ssid => dashboard.mr_l3_firewall.updateRules(net.id, ssid, { rules: rules }), 5, 1200);
  await Promise.all(ssids.map(ssid => updateRulesThrottled(ssid)));

  let msg;
  if (goodCount > 0 && badCount > 0) {
    msg = `Successfully blocked ${goodCount} websites and failed to block ${badCount} websites.`;
  } else if (goodCount > 0) {
    msg = `Successfully blocked ${goodCount} websites.`;
  } else if (badCount > 0) {
    msg = `Failed to block ${badCount} websites.`;
  }

  return await handleBotResponse({
    text: msg,
    speech: msg,
    contextOut: [
      {
        name: "network",
        lifespan: 5,
        parameters: {
          "network": netName
        }
      }
    ],
    info: basicInfo
  });
}

async function introToMe(basicInfo, merakiCache) {
  let msg = `I am a chatbot that can manage, visualize and administer your Meraki Dashboard for you. Just type or say a command for various lists and statistics conveniently available on demand. If you'd like to know the different commands that I can do, just ask me "What can you do?"`;

  return await handleBotResponse({
    text: msg,
    speech: msg,
    info: basicInfo
  });
}

async function helpMe(basicInfo, merakiCache) {
  let msg = `Welcome to EZNet! If you need a beginner's introduction on how to use this bot, ask me "Who are you?". If you want a list of commands that I can execute for you, ask me "What can you do?"`;

  return await handleBotResponse({
    text: msg,
    speech: msg,
    info: basicInfo
  });
}

async function listMyFunctions(basicInfo, merakiCache) {
  let textMsg = `Here's a list of the possible commands. If you would like me to clarify any of these commands, "What does this command do?"
  * List organizations - Shows the organizations that you are a part of
  * List networks - Show the networks in an organization
  * List admins - Lists the admins that are registered in an organization
  * List devices - Shows the currently connected devices in a network
  * Data usage - Visualizes and presents some statistics of total data usage over a specified timeframe
  * Top app/website usage - Visualizes and lists the top 10 app/websites used in a specified timeframe
  * Block website - Blocks a website or list of websites in a network`;

  let voiceMsg = `Here's a list of the possible commands: list organizations, list networks, list admins, list devices, data usage, top app or website usage, and block website. If you would like me to clarify any of these commands, just ask me "What does this command do?"`;

  return await handleBotResponse({
    text: textMsg,
    speech: voiceMsg,
    info: basicInfo
  });
}

async function explainFunction(basicInfo, merakiCache) {
  let command = basicInfo.parameters.command || null;
  let explanation = commandExplanations[command];

  return await handleBotResponse({
    text: explanation,
    speech: explanation,
    info: basicInfo
  });
}

let action_map = {
  listOrganizations, listNetworks, listDevices, listAdmins,
  topTraffic, dataUsage, blockSite,
  helpMe, introToMe, listMyFunctions, explainFunction
};

// used to prevent use on untested sources
let supportedSources = [ 'google', 'facebook', 'slack', 'slack_testbot', 'spark' ];

// parses req for basic info, for sake of shorter json paths and re-usability
function retrieveBasicInfo(body) {
  let results = body.result;
  let ogReq = body.originalRequest;

  let rawParams = results.contexts.map(ctx => Object.entries(ctx.parameters));
  let finalParams = [].concat(...rawParams).filter(param => !param[0].endsWith('.original'));
  let contextObj = {};
  finalParams.forEach(param => contextObj[param[0]] = param[1]);

  return {
    source: ogReq ? ogReq.source || undefined : undefined,
    action: results.action,
    parameters: results.parameters,
    contexts: contextObj,
    originalReq: ogReq
  }
}

async function processAction(body, fbApp) {
  let basicInfo = retrieveBasicInfo(body);
  try {
    let merakiCache = await retrieveMerakiDashboardCache(fbApp);
    if (supportedSources.includes(basicInfo.source)) {
      // process action via action map
      console.log(`Executing action ${basicInfo.action}...`);
      return await action_map[basicInfo.action](basicInfo, merakiCache);
    } else {
      // source is not supported
      return defaultBotResponse(`Error: source ${basicInfo.source} is not supported!`);
    }
  } catch (error) {
    console.log(error);
    return await defaultErrorResponse("Internal Error: " + error.data.errors[0], basicInfo);
  }
}

module.exports = processAction;