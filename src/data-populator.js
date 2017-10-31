const dashboard = require('node-meraki-dashboard')(process.env.MERAKI_API_KEY);

function arrayToObject(array, field) {
  let obj = {};
  let fieldResultArray = array.map(item => item[field]);
  for (let index in array) {
    delete array[index][field];
    obj[fieldResultArray[index]] = array[index];
  }
  return obj;
}

let mdr = {};

mdr.getOrgs = async function getOrgs() {
  let orgs = await dashboard.organizations.list();
  let filteredOrgs = orgs.filter(org => org.name != "OctaBytes");
  return filteredOrgs.map(
    org => ({
      id: org.id,
      name: org.name.trim(),
      networks: [],
      admins: [],
      devices: [],
    })
  );
};

mdr.getNetworks = async function getNetworks(orgId) {
  let networks = await dashboard.networks.list(orgId);
  return networks.map(
    net => ({
      id: net.id,
      name: net.name,
      timezone: net.timeZone,
      type: net.type,
      devices: [],
    })
  );
};

mdr.getAdmins = async function getAdmins(orgId) {
  let admins = await dashboard.admins.list(orgId);
  return admins.map(
    admin => ({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      orgAccess: admin.orgAccess
    })
  );
};


mdr.getDevices = async function getDevices(netId) {
  return await dashboard.devices.list(netId);
};

async function populateData(fbApp) {
  let orgs = await mdr.getOrgs();

  let devices = [];
  let networks = [];
  let admins = [];

  for (let org of orgs) {
    let networksInOrg = await mdr.getNetworks(org.id);
    networks.push(...networksInOrg);
    org.networks = networks.map(net => net.id);

    for (let net of networks) {
      let devicesInNet = await mdr.getDevices(net.id);
      let deviceSerials = devicesInNet.map(device => device.serial);
      net.devices = deviceSerials;
      devices.push(...devicesInNet);
      org.devices.push(...deviceSerials);
    }

    let adminsInOrg = await mdr.getAdmins(org.id);
    admins.push(...adminsInOrg)
    org.admins = admins.map(admin => admin.id);
  }

  let rootTree = {
    orgs: arrayToObject(orgs, 'id'),
    networks: arrayToObject(networks, 'id'),
    admins: arrayToObject(admins, 'id'),
    devices: arrayToObject(devices, 'serial'),
  };

  await fbApp.database().ref().set(rootTree);
}

module.exports = populateData;