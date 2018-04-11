'use strict';

const randomColor = require('randomcolor');
const spark = require('ciscospark/env');
const quiche = require('quiche');
const bytes = require('bytes');
const pThrottle = require('p-throttle');

const dashboard = require('./memoized-dashboard')(1000 * 60 * 5); // memoizing for 5 minutes
const { normalizeSeconds, fuseSearch } = require('./utils');
const { noClientsList, type2mult, timeUnitExtender, commandExplanations } = require('./constants');

function calcTotalSeconds(timeDur) {
  return timeDur.amount * type2mult[timeDur.unit];
}

function displayableTimeDuration(timeDur) {
  return timeDur.amount + " " + timeUnitExtender[timeDur.unit];
}

async function defaultErrorResponse(msg, basicInfo) {
  return await handleBotResponse({
    text: msg,
    speech: msg,
    info: basicInfo
  });
}

async function resourceNotFoundResponse(entity, basicInfo) {
  return await defaultErrorResponse(`Unable to find the specified ${entity}!`, basicInfo);
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

async function listOrganizations(basicInfo) {
  let textMsg = "You are in the following <bold>organizations<bold>:\n";
  let voiceMsg = "You are in the following organizations: ";

  let orgsList = await dashboard.organizations.list();
  let orgNames = orgsList.map(org => org.name);

  textMsg += orgNames.map((name, index) => `${index + 1}. ` + name).join('\n').trim();
  voiceMsg += orgNames.join(', ').trim();

  return await handleBotResponse({
    text: textMsg,
    speech: voiceMsg,
    info: basicInfo
  });
}

async function listNetworks(basicInfo) {
  let inputOrgName = basicInfo.parameters.org || basicInfo.contexts.org || undefined;

  let orgsList = await dashboard.organizations.list();
  let org = fuseSearch(orgsList, inputOrgName, ['name']);

  if (!org)
    return await resourceNotFoundResponse('organization', basicInfo);

  let orgName = org.name.trim();
  let networks = await dashboard.networks.list(org.id);
  let networkNames = networks.map(network => network.name.trim());

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
        parameters: { "org": orgName }
      }
    ],
    info: basicInfo
  });
}

async function listDevices(basicInfo) {
  let inputNetName = basicInfo.parameters.network || basicInfo.contexts.network || undefined;

  let orgs = await dashboard.organizations.list();
  let totalNetworks = [];
  for (let org of orgs) {
    let nets = await dashboard.networks.list(org.id);
    totalNetworks.push(...nets);
  }

  let network = fuseSearch(totalNetworks, inputNetName, ['name']);

  if (!network)
    return await resourceNotFoundResponse('network', basicInfo);

  let netName = network.name.trim();
  let devices = await dashboard.devices.list(network.id);
  let deviceNames = devices.slice(0, 10).map(device => device.name || device.model);

  let textMsg = `Your network, <bold>${netName}<bold>, has the following devices:\n`;
  let voiceMsg = `Your network, ${netName}, has the following devices: `;

  textMsg += deviceNames.map((name, index) => `${index + 1}. ` + name).join('\n').trim();
  voiceMsg += deviceNames.join(', ').trim();

  if (devices.length > 10) {
    textMsg += `\n\n and ${devices.length - 10} other devices.`;
    voiceMsg += ` and ${devices.length - 10} other devices.`;
  }

  return await handleBotResponse({
    text: textMsg,
    speech: voiceMsg,
    contextOut: [
      {
        name: "network",
        lifespan: 5,
        parameters: { "network": netName }
      }
    ],
    info: basicInfo
  });
}

async function listAdmins(basicInfo) {
  let inputOrgName = basicInfo.parameters.org || basicInfo.contexts.org || undefined;

  let orgsList = await dashboard.organizations.list();
  let org = fuseSearch(orgsList, inputOrgName, ['name']);

  if (!org)
    return await resourceNotFoundResponse('organization', basicInfo);

  let orgName = org.name.trim();
  let admins = await dashboard.admins.list(org.id);
  let adminsShortList = admins.slice(0, 10);
  let adminNames = adminsShortList.map(admin => admin.name);
  let adminInfos = adminsShortList.map(admin => admin.name + " - " + admin.email);

  let textMsg = `Your organization, <bold>${orgName}<bold>, has the following administrators:\n`;
  let voiceMsg = `Your organization, ${orgName}, has the following administrators: `;

  textMsg += adminInfos.map((info, index) => `${index + 1}. ` + info).join('\n').trim();
  voiceMsg += adminNames.join(', ').trim();

  if (admins.length > 10) {
    textMsg += `\n\n and ${admins.length - 10} other administrators.`;
    voiceMsg += ` and ${admins.length - 10} other administrators.`;
  }

  return await handleBotResponse({
    text: textMsg,
    speech: voiceMsg,
    contextOut: [
      {
        name: "organization",
        lifespan: 5,
        parameters: { "org": orgName }
      }
    ],
    info: basicInfo
  });
}

async function topTraffic(basicInfo) {
  let inputNetName = basicInfo.parameters.network || basicInfo.contexts.network || undefined;
  let inputTimeDuration = basicInfo.parameters['time-duration'] || basicInfo.contexts['time-duration'] || undefined;

  let orgs = await dashboard.organizations.list();
  let totalNetworks = [];
  for (let org of orgs) {
    let nets = await dashboard.networks.list(org.id);
    totalNetworks.push(...nets);
  }

  let network = fuseSearch(totalNetworks, inputNetName, ['name']);

  if (!network)
    return await resourceNotFoundResponse('network', basicInfo);

  let netName = network.name.trim();

  let totalSeconds = calcTotalSeconds(inputTimeDuration);
  if (totalSeconds < 2 * type2mult['hour'] || totalSeconds > type2mult['month'])
    return await defaultErrorResponse("Sorry, but you can only get traffic data between 2 hours and 1 month.", basicInfo);

  let trafficData;
  try {
    trafficData = await dashboard.networks.getTrafficData(network.id, { timespan : totalSeconds });
  } catch (error) {
    console.log("Top Traffic Error:", error);
    return await defaultErrorResponse("An error occured while accessing the top traffic statistics. Please try again later.");
  }

  if (trafficData.length === 0)
    return await defaultErrorResponse("No top traffic data has been found!", basicInfo);

  let textMsg = `Your network, <bold>${netName}<bold>, has the following top 10 sites/apps for traffic:\n`;
  let voiceMsg = `Your network, ${netName}, has the following top 10 sites/apps for traffic: `;

  let topTraffic = trafficData.slice(0, 10).map(
    dataPiece => ({
      app: dataPiece.application,
      source: dataPiece.destination,
      time: dataPiece.activeTime,
      numClients: dataPiece.numClients
    })
  ).sort((a, b) => b.time - a.time);

  textMsg += topTraffic.map((tt, index) => {
    let totalTime = normalizeSeconds(tt.time);
    let dataSource = tt.app + (tt.source ? ` @ ${tt.source}` : "");
    return `${index + 1}. ${dataSource}: ${totalTime}`;
  }).join('\n');

  voiceMsg += topTraffic.map(tt => {
    let totalTime = normalizeSeconds(tt.time);
    let dataSource = tt.app + (tt.source ? ` from ${tt.source}` : "");
    return `${dataSource} used for ${totalTime}`;
  }).join(', ');

  let pie = new quiche('pie');
  pie.setHostname('image-charts.com');
  pie.setWidth(700);
  pie.setHeight(700);

  for (let tt of topTraffic) {
    let dataSource = tt.app + (tt.source ? ` @ ${tt.source}` : "");
    pie.addData(tt.time, dataSource, randomColor().slice(1));
  }

  let imageUrl = pie.getUrl(true).replace(/(chd=t%3A(\d+(\.\d+)?))&/g,'$1%2C0&'); // handling edge case where having only one data point breaks chart

  return await handleBotResponse({
    text: textMsg,
    speech: voiceMsg,
    imageUrl: imageUrl,
    contextOut: [
      {
        name: "network",
        lifespan: 5,
        parameters: { "network": netName }
      }
    ],
    info: basicInfo
  });
}

async function dataUsage(basicInfo) {
  let inputNetName = basicInfo.parameters.network || basicInfo.contexts.network || undefined;
  let inputTimeDuration = basicInfo.parameters['time-duration'] || basicInfo.contexts['time-duration'] || undefined;

  let orgs = await dashboard.organizations.list();
  let totalNetworks = [];
  for (let org of orgs) {
    let nets = await dashboard.networks.list(org.id);
    totalNetworks.push(...nets);
  }

  let network = fuseSearch(totalNetworks, inputNetName, ['name']);

  if (!network)
    return await resourceNotFoundResponse('network', basicInfo);

  let netName = network.name.trim();

  let totalSeconds = calcTotalSeconds(inputTimeDuration);
  if (totalSeconds < 2 * type2mult['hour'] || totalSeconds > type2mult['month'])
    return await defaultErrorResponse("Sorry, but you can only get data usage statistics between 2 hours and 1 month.", basicInfo);

  let devices = await dashboard.devices.list(network.id);
  let finalDeviceSerials = devices.filter(device => !noClientsList.includes(device.model)).map(device => device.serial);

  let pie = new quiche('pie');
  pie.setHostname('image-charts.com');
  pie.setWidth(700);
  pie.setHeight(700);

  // technically, a maximum of 5 requests per second are allowed, but better safe than sorry
  const listClientsThrottled = pThrottle(serial => dashboard.clients.list(serial, totalSeconds), 5, 1500);
  const timeDurText = displayableTimeDuration(inputTimeDuration);

  let rawClientsArray = await Promise.all(finalDeviceSerials.map(serial => listClientsThrottled(serial)));
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
        parameters: { "network": netName }
      }
    ],
    info: basicInfo
  });
}

/*async function blockSite(basicInfo) {
  let inputNetName = basicInfo.parameters.network || basicInfo.contexts.network || undefined;
  let urls = basicInfo.parameters.urls || [];

  if (!urls.length)
    return await defaultErrorResponse("No websites were specified for blocking!", basicInfo);

  let networksList = await dashboard.networks.list();
  let network = fuseSearch(networksList, inputNetName, ['name']);

  if (!network)
    return await resourceNotFoundResponse('network', basicInfo);

  let netName = network.name.trim();
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

  let ssidsRaw = await dashboard.ssids.list(network.id);
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
        parameters: { "network": netName }
      }
    ],
    info: basicInfo
  });
}*/

async function introToMe(basicInfo) {
  let msg = `I am a chatbot that can manage, visualize and administer your Meraki Dashboard for you. Just type or say a command for various lists and statistics conveniently available on demand. If you'd like to know the different commands that I can do, just ask me "What can you do?"`;

  return await handleBotResponse({
    text: msg,
    speech: msg,
    info: basicInfo
  });
}

async function helpMe(basicInfo) {
  let msg = `Welcome to EZNet! If you need a beginner's introduction on how to use this bot, ask me "Who are you?". If you want a list of commands that I can execute for you, ask me "What can you do?"`;

  return await handleBotResponse({
    text: msg,
    speech: msg,
    info: basicInfo
  });
}

async function listMyFunctions(basicInfo) {
  let textMsg = `Here's a list of the possible commands. If you would like me to clarify any of these commands, "What does this command do?"
  * List organizations - Shows the organizations that you are a part of
  * List networks - Show the networks in an organization
  * List admins - Lists the admins that are registered in an organization
  * List devices - Shows the currently connected devices in a network
  * Data usage - Visualizes and presents some statistics of total data usage over a specified timeframe
  * Top app/website usage - Visualizes and lists the top 10 app/websites used in a specified timeframe`;
  //* Block website - Blocks a website or list of websites in a network`;

  let voiceMsg = `Here's a list of the possible commands: list organizations, list networks, list admins, list devices, data usage and top app or website usage. If you would like me to clarify any of these commands, just ask me "What does this command do?"`;

  return await handleBotResponse({
    text: textMsg,
    speech: voiceMsg,
    info: basicInfo
  });
}

async function explainFunction(basicInfo) {
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
  topTraffic, dataUsage,
  helpMe, introToMe, listMyFunctions, explainFunction
};

// used to prevent use on untested sources
let supportedSources = [ 'google', 'facebook', 'slack', 'slack_testbot', 'spark' ];

// parses req for basic info, for sake of shorter json paths and re-usability
function retrieveBasicInfo(body) {
  let results = body.result;
  let ogReq = body.originalRequest || null;

  let rawParams = results.contexts.map(ctx => Object.entries(ctx.parameters));
  let finalParams = [].concat(...rawParams).filter(param => !param[0].endsWith('.original'));
  let contextObj = {};
  finalParams.forEach(param => contextObj[param[0]] = param[1]);

  return {
    source: ogReq ? ogReq.source || null : 'test_dialogflow',
    action: results.action,
    parameters: results.parameters,
    contexts: contextObj,
    originalReq: ogReq
  };
}

async function processAction(body) {
  let basicInfo = retrieveBasicInfo(body);
  try {
    if (basicInfo.source === 'test_dialogflow') {
      // testing from the dialogflow console isn't supported
      return await defaultErrorResponse(`Sorry, but testing from the Dialogflow console isn't supported at this time!`, basicInfo);
    } else if (supportedSources.includes(basicInfo.source)) {
      if (basicInfo.action) {
        // process action via action map
        console.log(`Executing action ${basicInfo.action} from source ${basicInfo.source}...`);
        return await action_map[basicInfo.action](basicInfo);
      } else {
        // this probably occurred when the user wanted to cancel during the slot-filling process
        return await defaultErrorResponse('', basicInfo);
      }
    } else {
      // source is not supported
      return await defaultErrorResponse(`Sorry, but the ${basicInfo.source} platform is not supported!`, basicInfo);
    }
  } catch (error) {
    console.error(error);
    return await defaultErrorResponse("Oh no! An internal error has occurred. Please check the console logs.", basicInfo);
  }
}

module.exports = processAction;