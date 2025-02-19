import { existsSync } from "node:fs";
import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { resolve } from "node:path";
import { getRepoRoot } from "./git.js";

const getIllegalFilenameCharsRegex = (): RegExp => {
	const plat = platform();
	if (plat === "win32") {
		// Windows illegal characters: \ / : * ? " < > | and reserved names . and .. and names ending with space or .
		return /[\\/:*?"<>|]|^\.\.?$|[ ]$|[.]$/;
	}
	if (plat === "darwin") {
		// macOS illegal characters: : / and reserved names . and ..
		return /[:\/]|^\.\.?$/;
	}

	// Linux illegal characters: / and reserved names . and ..
	return /[\/]|^\.\.?$/;
};

const illegalCharsRegex = getIllegalFilenameCharsRegex();

export type Config = {
  globalVariables: Record<string, string>;
  autoAcceptPathChanges: boolean;
  autoAcceptGlobalVariables: boolean;
  dontAskToSaveGlobalVariables: boolean;
  noUntrackedFiles: boolean;
  defaultTemplateRepository: {
    url: string;
    name: string
  };
  includedExtension: string[];
	includedFiles: string[];
	ignoredPaths: string[];
};


export type Steps = 'init' |
    'branchCreated' |
    'remoteAdded' |
    'branchMerged' |
    'branchMergeResolved' |
    'branchCherryPicked'|
    'contentVariablesGathered' |
    'pathVariablesGathered' |
    'variablesDetermined' |
    'contentVariablesReplaced'|
    'pathVariablesReplaced'|
    'changesCommited' |
    'branchMerged';

export type State = {
  originalBranch?: string;
  newBranch?: string;
  templateRepository?: {
    url: string;
    name: string;
  };
  templateBranch?: string;
  pathVariables: string[];
  contentVariables: string[];
  variables: Record<string, string>;
  step: Steps;
};


export const determineVariable = async (
	name: string,
  isPathVariable: boolean,
  question: (question: string) => Promise<string>,
  config: Config,
): Promise<string> => {
	let value: string | undefined;

	if (config.globalVariables[name]) {
		const response = config.autoAcceptGlobalVariables  ? 'y' : await question(
			`Global variable is defined for token ${name} with value '${config.globalVariables[name]}' do you want to use it? [Y/n]: `,
		);
		if (!['n','N'].includes(response)) {
			value = config.globalVariables[name];
		}
	}

	do {
		if (!value) {
			value = await question(`Enter value for variable '${name}': `);
		}
		if (isPathVariable && illegalCharsRegex.test(value)) {
			const response = await question(
				`The value '${value}' that is used in path variable contains possible illegal characters (${illegalCharsRegex}) on current platform. Do you want keep it? [y/N]: `,
			);

			if (response !== "y") {
				value = undefined;
			}
		}
	} while (!value);

	if (!config.dontAskToSaveGlobalVariables && config.globalVariables[name] !== value) {
		if ('y' === await question(`Save as global varianble [yN]': `)) {
			await updateConfig({globalVariables: {...config.globalVariables, [name]: value}});
		}
	}
	return value;
};

export const generateRandomSequence = (length: number): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        result += chars[randomIndex];
    }
    return result;
}

let state: State = {
  step: 'init',
  pathVariables: [],
  contentVariables: [],
  variables: {},
  templateRepository: {
    name: '',
    url: ''
  }
};


export const loadState = async (): Promise<Readonly<State>> => {
  const repoRoot = await getRepoRoot();
  const statePath = resolve(repoRoot,'.templit.state.json');

  if (existsSync(statePath)) {
    const file = await readFile(statePath, 'utf-8');
    state = JSON.parse(file) as State;
  }

  return state;
}

export const updateState = async (stateUpdate: Partial<State>): Promise<Readonly<State>> => {

  const repoRoot = await getRepoRoot();
  const statePath = resolve(repoRoot,'.templit.state.json');

  state = {...state, ...stateUpdate};

  await writeFile(statePath, JSON.stringify(state, null, 2));
  return state;
}

export const removeStateFile = async (): Promise<void> => {
  await unlink(resolve(await getRepoRoot(), '.templit.state.json'));
}

let config: Config = {
  autoAcceptGlobalVariables: false,
  autoAcceptPathChanges: false,
  dontAskToSaveGlobalVariables: false,
  globalVariables: {},
  noUntrackedFiles: false,
  defaultTemplateRepository: {
    name: '',
    url: ''
  },
	includedExtension: ["ts", "json", "yaml", "yml", "md"],
	includedFiles: ["Dockerfile"],
	ignoredPaths: ["**/dist/**", "**/bin/**", "**/node_modules/**"],
}

export const loadConfig = async (): Promise<Readonly<Config>> => {

  const repoRoot = await getRepoRoot();
  const path = resolve(repoRoot,'.templit.config.json');

  if (existsSync(path)) {

    const file = await readFile(path, 'utf-8');
    config = JSON.parse(file) as Config;
  }

  return config;
}

export const updateConfig = async (configUpdate: Partial<Config>): Promise<Readonly<Config>> => {

  const repoRoot = await getRepoRoot();
  const path = resolve(repoRoot,'.templit.config.json');

  config = {...config, ...configUpdate};

  await writeFile(path, JSON.stringify(config, null, 2));
  return config;
}

export const isDirectoryEmpty = async (path: string): Promise<boolean> => {
    const files = await readdir(path);
    return files.length === 0;
};