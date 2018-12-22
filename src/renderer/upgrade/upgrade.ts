import * as fs from 'fs';
import * as path from 'path';
import { tryParseJSON } from '../../shared/Util';
import { doAsyncParallel } from '../util/async';

const upgradeFilePath: string = './upgrade.json';
const upgradeFileEncoding: string = 'utf8';

export interface IUpgradeData {
  tech: IUpgradeStage;
  screenshots: IUpgradeStage;
}

export interface IUpgradeStage {
  /** Paths of files that should exist if the stage is "installed" (paths are relative to the flashpoint root) */
  checks: string[];
  /** URLs from where the stage can be downloaded (only one will be downloaded, the other are "backups") */
  sources: string[];
}

/** Check if all the "checks" of a stage are present */
export async function performUpgradeStageChecks(stage: IUpgradeStage, flashpointFolder: string): Promise<boolean[]> {
  const success: boolean[] = [];
  await doAsyncParallel(stage.checks.map((check, index) => (
    (done: () => void) => {
      fs.exists(path.join(flashpointFolder, check), (exists) => {
        success[index] = exists;
        done();
      });
    }
  )));
  return success;
}

/** Read and parse the file asynchronously */
export function readUpgradeFile(flashpointFolder: string): Promise<IUpgradeData> {
  return new Promise((resolve, reject) => {
    fs.readFile(path.join(flashpointFolder, upgradeFilePath), 
                upgradeFileEncoding, (error, data) => {
      // Check if reading file failed
      if (error) { return reject(error); }
      // Try to parse json (and callback error if it fails)
      const jsonOrError: string|Error = tryParseJSON(data as string);
      if (jsonOrError instanceof Error) { return reject(jsonOrError); }
      // Parse the JSON object
      const parsed = parseUpgradeFile(jsonOrError);
      // Success!
      return resolve(parsed);
    });
  });
}

function parseUpgradeFile(data: any): IUpgradeData {
  let parsed = createDefaultUpgradeData();
  if (data) {
    if (data.tech)        { parseUpgradeFileStage(parsed.tech,        data.tech);        }
    if (data.screenshots) { parseUpgradeFileStage(parsed.screenshots, data.screenshots); }
  }
  return parsed;
}

function parseUpgradeFileStage(dest: IUpgradeStage, source: IUpgradeStage): void {
  if (source.checks)  { stringArray(dest.checks,  source.checks);  }
  if (source.sources) { stringArray(dest.sources, source.sources); }
}

function stringArray(dest: string[], source: string[]): void {
  for (let i = source.length - 1; i >= 0; i--) {
    dest[i] = source[i]+'';
  }
}

/** Create a new object with the default upgrade data */
function createDefaultUpgradeData(): IUpgradeData {
  return Object.assign({}, defaultUpgradeData);
}

const defaultUpgradeData: Readonly<IUpgradeData> = Object.freeze({
  tech: {
    checks:  [ '' ],
    sources: [ '' ],
  },
  screenshots: {
    checks:  [ '' ],
    sources: [''],
  }
});