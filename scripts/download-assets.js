const https = require("https");
const fs = require("fs");
const path = require("path");

const assets = {
  // Switched to a cleaner dark tile and confirmed CDN availability
  "ground.png": "https://raw.githubusercontent.com/phaserjs/phaser3-examples/master/public/assets/textures/metal.png",
  "player.png": "https://raw.githubusercontent.com/phaserjs/phaser3-examples/master/public/assets/sprites/brawler48x48.png",
  "monster.png": "https://raw.githubusercontent.com/phaserjs/phaser3-examples/master/public/assets/sprites/slime.png"
};

const assetsDir = path.join(process.cwd(), "client", "public", "assets");

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

async function download(name, url) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(path.join(assetsDir, name));
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${name}: ${response.statusCode}`));
          return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        console.log(`Downloaded ${name}`);
        resolve(null);
      });
    }).on("error", (err) => {
      fs.unlink(path.join(assetsDir, name), () => {});
      reject(err);
    });
  });
}

async function run() {
  for (const [name, url] of Object.entries(assets)) {
    try {
        await download(name, url);
    } catch (e) {
        console.error(e);
    }
  }
}

run().catch(console.error);
