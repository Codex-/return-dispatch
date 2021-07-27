import JSZip from "jszip";
import type { JSZipObject } from "jszip";

export class LogZip {
  private zip!: JSZip;

  public async init(data: Buffer) {
    const zip = new JSZip();
    this.zip = await zip.loadAsync(data);
  }

  public getFiles(): JSZipObject[] {
    return Object.keys(this.zip.files).map((key) => this.zip.files[key]);
  }

  public async fileContainsStr(
    file: JSZipObject,
    str: string
  ): Promise<boolean> {
    const content = await file.async("string");

    if (content.length === 0) {
      return false;
    }

    return new RegExp(str).test(content);
  }
}
