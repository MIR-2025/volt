// PM2 process config. Start under pm2 with `npm run pm2` (pm2 is fetched via npx
// if you don't have it installed); reload cleanly with `npm run pm2:restart` (no
// port clash), tail logs with `npm run pm2:logs`, remove with `npm run pm2:stop`.
const { name } = require("./package.json");
module.exports = { apps: [{ name, script: "server.js" }] };
