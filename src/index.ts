import { createInterface } from "node:readline";
import {
	addRemote,
	getRemotes,
	getStatus,
	fetchAndMergeBranch,
	commitChanges,
	getRepoRoot,
	createNewBranch,
	getChangedFiles,
} from "./git";
import { checkForPathVariables, createReplacer, replacementRegex, replaceVariables } from "./templating";
import { determineVariable, generateRandomSequence, State } from "./helpers";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";

const state: State = {
	globalVariables: {},
};


const rl = createInterface({
	input: process.stdin,
	output: process.stdout,
});
const question = (questionText: string) =>
	new Promise<string>((resolve) => rl.question(questionText, resolve));

const { untracked, modified } = await getStatus();

if (modified) {
	console.log(
		"You have modified files, please commit or stash them before continuing.",
	);
	rl.close();
	process.exit(0);
}

if (untracked) {
	const answer = await question(
		"You have untracked files, it is recommended commit or stash them before continuing. Do you want to progress anyway? (y/n)",
	);
	if (answer !== "y") {
		rl.close();
		process.exit(0);
	}
}

let branchName = `templit/new-${generateRandomSequence(6)}`;
const selectedName = await question(`Enter branch name for new template: [${branchName}] `);

branchName = selectedName || branchName;

await createNewBranch(branchName);

const shortname = await question("Enter template repository name (if it's already between remotes) name: ");

const remotes = await getRemotes();
let url = remotes.find((r) => r.name === shortname)?.url;

if (!url) {
	url = await question("Enter url for remote: ");
	addRemote(shortname, url);
}

const branch = await question("Enter name of branch containing template: ");

try {
	await fetchAndMergeBranch(shortname, branch);
} catch (error) {
	console.log(
		"The merge was not successful, please resolve the conflicts (& make commit), before continuing.",
	);
	console.log(error.message);
	await question("Press any key to continue...");
}

console.log("Template successfully merged!");

const repoRoot = await getRepoRoot();

const { contentVariables } = await replaceVariables({
	contentVariablesMap: {},
	isDryRun: true,
	repoRoot
});

const filesChanges = await getChangedFiles();
const pathVariables = checkForPathVariables(filesChanges);

const variablesMap: Record<string, string> = {};
const allVariables = new Set([...contentVariables, ...pathVariables]);
for (const name of allVariables) {
	variablesMap[name] = await determineVariable(
		name,
		pathVariables.has(name),
		question,
		state
	);
}

if (contentVariables.size > 0) {
	await replaceVariables({
		contentVariablesMap: variablesMap,
		isDryRun: false,
		repoRoot
	});
}

const replacer = createReplacer(pathVariables, variablesMap, false);
for (const file of filesChanges.split("\n")) {	
	const replaced = file.replace(
		replacementRegex,
		replacer,
	);

	if (file !== replaced) {
		const oldPath = resolve(repoRoot, file);
		const newPath = resolve(repoRoot, replaced);
		if ('y' === await question(`Do you want to rename/move file '${oldPath}' to '${newPath}' [y/N]': `))
		{				
			if (existsSync(newPath)) {
				throw new Error(`Can not rename/move file "${oldPath}" to "${newPath}", new path already exists!`);
			}
			
			await rename(oldPath, newPath);
		}
	}
}

if (contentVariables.size > 0 || pathVariables.size > 0) {
	
	await commitChanges("Replaced variables in template");
}

	// TODO sync state to fs & commit
rl.close();
