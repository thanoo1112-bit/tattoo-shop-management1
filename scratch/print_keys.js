const fs = require("fs");
const envFile = fs.readFileSync(".env.local", "utf8");
console.log("File length:", envFile.length);
envFile.split(/\r?\n/).forEach((line, idx) => {
  const parts = line.split("=");
  console.log(`Line ${idx}: key = "${parts[0]}", value length = ${parts.slice(1).join("=").trim().length}`);
});
