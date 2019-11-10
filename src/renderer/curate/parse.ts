import * as YAML from 'yaml';
import { Coerce } from '../../shared/utils/Coerce';
import { IObjectParserProp, ObjectParser } from '../../shared/utils/ObjectParser';
import { EditAddAppCurationMeta, EditCurationMeta } from '../context/CurationContext';
import { CurationFormatObject, parseCurationFormat } from './format/parser';
import { CFTokenizer, tokenizeCurationFormat } from './format/tokenizer';

const { str } = Coerce;

/** Return value type of the parseCurationMeta function. */
export type ParsedCurationMeta = {
  /** Meta data of the game. */
  game: EditCurationMeta;
  /** Meta data of the additional applications. */
  addApps: EditAddAppCurationMeta[];
};

/**
 * Parse a string containing meta for an old style curation
 * @param text A string of curation meta.
 */
export function parseCurationMetaOld(text: string): ParsedCurationMeta {
  // Try parsing the meta text
  let tokens: CFTokenizer.AnyToken[] | undefined = undefined;
  let rawMeta: CurationFormatObject | undefined = undefined;
  tokens = tokenizeCurationFormat(text);
  rawMeta = parseCurationFormat(tokens);
  // Convert the raw meta to a programmer friendly object
  return convertMeta(rawMeta);
}

/**
 * Parse a string containing meta for an new style (YAML) curation
 * @param text A string of curation meta.
 */
export function parseCurationMetaNew(text: string): ParsedCurationMeta {
  // Try parsing yaml file
  const rawMeta = YAML.parse(text);
  // Convert raw meta into a ParsedCurationMeta object
  return convertMeta(rawMeta);
}

/**
 * Convert a "raw" curation meta object into a more programmer friendly object.
 * @param data "Raw" meta object to convert.
 * @param onError Called whenever an error occurs.
 */
function convertMeta(data: any, onError?: (error: string) => void): ParsedCurationMeta {
  // Default parsed data
  const parsed: ParsedCurationMeta = {
    game: {},
    addApps: [],
  };
  // Make sure it exists before calling Object.keys
  if (!data) {
    console.log('Meta empty');
    return parsed;
  }
  // Treat field names case-insensitively
  const lowerCaseData: any = {};
  for (let key of Object.keys(data)) {
    if (data[key]) {
      lowerCaseData[key.toLowerCase()] = data[key];
    }
  }
  const parser = new ObjectParser({
    input: lowerCaseData,
    onError: onError && (e => onError(`Error while converting Curation Meta: ${e.toString()}`))
  });
  // -- Old curation format --
  parser.prop('author notes',         v => parsed.game.authorNotes         = str(v));
  parser.prop('genre',                v => parsed.game.tags               = str(v));
  parser.prop('notes',                v => parsed.game.notes               = str(v));
  // -- New curation format --
  // Single value properties
  parser.prop('application path',     v => parsed.game.applicationPath     = str(v));
  parser.prop('curation notes',       v => parsed.game.authorNotes         = str(v));
  parser.prop('developer',            v => parsed.game.developer           = str(v));
  parser.prop('extreme',              v => parsed.game.extreme             = str(v));
  parser.prop('game notes',           v => parsed.game.notes               = str(v));
  parser.prop('genres',               v => parsed.game.tags               = str(v));
  parser.prop('languages',            v => parsed.game.language            = str(v));
  parser.prop('launch command',       v => parsed.game.launchCommand       = str(v));
  parser.prop('original description', v => parsed.game.originalDescription = str(v));
  parser.prop('play mode',            v => parsed.game.playMode            = str(v));
  parser.prop('platform',             v => parsed.game.platform            = str(v));
  parser.prop('publisher',            v => parsed.game.publisher           = str(v));
  parser.prop('release date',         v => parsed.game.releaseDate         = str(v));
  parser.prop('series',               v => parsed.game.series              = str(v));
  parser.prop('source',               v => parsed.game.source              = str(v));
  parser.prop('status',               v => parsed.game.status              = str(v));
  parser.prop('tags',                 v => parsed.game.tags               = str(v));
  parser.prop('title',                v => parsed.game.title               = str(v));
  parser.prop('version',              v => parsed.game.version             = str(v));
  parser.prop('library',              v => parsed.game.library             = str(v).toLowerCase()); // must be lower case
  // property aliases
  parser.prop('animation notes',      v => parsed.game.notes               = str(v));
  // Add-apps
  parser.prop('additional applications').map((item, label, map) => {
    parsed.addApps.push(convertAddApp(item, label, map[label]));
  });
  // Return
  return parsed;
}

/**
 * Convert a "raw" curation additional application meta object into a more programmer friendly object.
 * @param item Object parser, wrapped around the "raw" add-app meta object to convert.
 * @param label Label of the object.
 */
function convertAddApp(item: IObjectParserProp<any>, label: string | number | symbol, rawValue: any): EditAddAppCurationMeta {
  const addApp: EditAddAppCurationMeta = {};
  const labelStr = str(label);
  switch (labelStr.toLowerCase()) {
    case 'extras': // (Extras add-app)
      addApp.heading = 'Extras';
      addApp.applicationPath = ':extras:';
      addApp.launchCommand = str(rawValue);
      break;
    case 'message': // (Message add-app)
      addApp.heading = 'Message';
      addApp.applicationPath = ':message:';
      addApp.launchCommand = str(rawValue);
      break;
    default: // (Normal add-app)
      addApp.heading = labelStr;
      item.prop('Heading',          v => addApp.heading         = str(v), true);
      item.prop('Application Path', v => addApp.applicationPath = str(v));
      item.prop('Launch Command',   v => addApp.launchCommand   = str(v));
      break;
  }
  return addApp;
}
