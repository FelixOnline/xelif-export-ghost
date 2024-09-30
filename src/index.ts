import { XelifExporter } from "./lib/process.js";
import * as fs from "fs";

async function main() {
  let exporter = new XelifExporter();
  return await exporter.processAll();
}

fs.writeFile(
  "ghost-export.json",
  JSON.stringify(await main(), undefined, 2),
  function (err) {
    if (err) throw err;
    console.log("File is created successfully.");
  },
);
