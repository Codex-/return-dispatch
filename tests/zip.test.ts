import * as fs from "fs";
import * as path from "path";
import type { JSZipObject } from "jszip";

import { LogZip } from "../src/zip";

describe("Zip", () => {
  let zipRawData: Buffer;

  beforeAll(() => {
    const zipPath = path.join(__dirname, "static", "logs.zip");
    zipRawData = fs.readFileSync(zipPath);
  });

  describe("init", () => {
    it("should successfully load a raw data Buffer", async () => {
      const zip = new LogZip();
      await zip.init(zipRawData);
    });
  });

  describe("getFiles", () => {
    const zip = new LogZip();

    beforeAll(async () => {
      await zip.init(zipRawData);
    });

    it("should return a list of files in a zip", () => {
      const filenames = zip.getFiles();
      expect(filenames).toHaveLength(25);
    });
  });

  describe("fileContainsStr", () => {
    const zip = new LogZip();

    let file: JSZipObject;

    beforeAll(async () => {
      await zip.init(zipRawData);
      file = zip.getFiles()[0];
    });

    it("should return false for an absent string", async () => {
      expect(await zip.fileContainsStr(file, "Missing String")).toStrictEqual(
        false
      );
    });

    it("should return true for a present string", async () => {
      expect(await zip.fileContainsStr(file, "npm run lint")).toStrictEqual(
        true
      );
    });
  });
});
