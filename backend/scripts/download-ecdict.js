const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const url = 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv';
const targetDir = path.resolve(__dirname, '..', 'data');
const targetPath = path.join(targetDir, 'ecdict.csv');

/**
 * 下载失败时明确退出，避免开发时误以为词库已经可用。
 */
function downloadEcdict() {
  fs.mkdirSync(targetDir, { recursive: true });

  const file = fs.createWriteStream(targetPath);

  https
    .get(url, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        fs.rmSync(targetPath, { force: true });
        console.error(`ECDICT 下载失败：HTTP ${response.statusCode}`);
        process.exit(1);
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`ECDICT 已下载到 ${targetPath}`);
      });
    })
    .on('error', (error) => {
      file.close();
      fs.rmSync(targetPath, { force: true });
      console.error(`ECDICT 下载失败：${error.message}`);
      process.exit(1);
    });
}

downloadEcdict();
