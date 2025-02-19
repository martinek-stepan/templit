#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, rename, rmdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import {
	addRemote,
	cherryPickBranch,
	commitChanges,
	createNewBranch,
	getChangedFiles,
	getCurrentBranchName,
	getRemotes,
	getRepoRoot,
	getStatus,
  isGitRepository,
  mergeBranch,
} from "./git.js";
import { type Config, type State, determineVariable, generateRandomSequence, isDirectoryEmpty, loadConfig, loadState, removeStateFile, updateState } from "./helpers.js";
import { checkForPathVariables, createReplacer, replaceVariables, replacementRegex } from "./templating.js";
import { glob } from "glob";

const gitGut = await isGitRepository();
if (!gitGut) {
  console.log("Current directory is not a git repository, initialize your repository first (and make first commit).");
  process.exit(0);
}


const config: Readonly<Config> = await loadConfig();


let state: Readonly<State> = await loadState();

const repoRoot = await getRepoRoot();

const rl = createInterface({
	input: process.stdin,
	output: process.stdout,
});


const question = (questionText: string) =>
	new Promise<string>((resolve) => rl.question(questionText, resolve));


try
  {

  if (state.step === 'init') {
    const { untracked, modified } = await getStatus();

    if (modified) {
      console.log(
        "You have modified files, please commit or stash them before continuing.",
      );
      rl.close();
      process.exit(0);
    }

    if (untracked) {
      if (config.noUntrackedFiles || "y" !== await question(
        "You have untracked files, it is recommended commit or stash them before continuing. Do you want to progress anyway? [y/N]: ",
      )) {
        rl.close();
        process.exit(0);
      }
    }

    state = await updateState({originalBranch: await getCurrentBranchName()});
    let branchName = `templit/new-${generateRandomSequence(6)}`;

    await createNewBranch(branchName);

    state = await updateState({newBranch: branchName, step: 'branchCreated'});
  }

  if (state.step === 'branchCreated') {
    const shortname = config.defaultTemplateRepository.name || await question("Enter remote name for template repository: ");

    const remotes = await getRemotes();
    let url = remotes.find((r) => r.name === shortname)?.url;

    if (!url) {
      url = config.defaultTemplateRepository.name || await question("Enter url for remote: ");
      addRemote(shortname, url);
    }

    state = await updateState({templateRepository: {
      url,
      name: shortname
    }, step: 'remoteAdded'});
  }

  let mergeSuccessful = true;;
  if (state.step === 'remoteAdded') {
    const branch = await question("Enter name of branch containing template: ");

    try {
      await mergeBranch(state.templateRepository?.name, branch);
    }  catch (error: any) {
      console.log(error?.message);
      mergeSuccessful = false;
    }

    console.log("Template successfully merged into new branch");

    state = await updateState({templateBranch: branch, step: 'branchMerged'});
  }

  if (state.step === 'branchMerged') {
    if (!mergeSuccessful) {
      console.log(
        "The merge was not successful, please resolve the conflicts (& make commit), before continuing.",
      );
      await question("Press any key to continue... (or Ctrl+C to exit, state is saved so you can continue on next templit run)");
    }

    state = await updateState({step: 'branchMergeResolved'});
  }

  if (state.step === 'branchMergeResolved') {
    await cherryPickBranch(state.originalBranch, state.newBranch);

    state = await updateState({step: 'branchCherryPicked'});
  }

  if (state.step === 'branchCherryPicked') {

    const { contentVariables } = await replaceVariables({
      contentVariablesMap: {},
      isDryRun: true,
      repoRoot,
      includedExtension: config.includedExtension,
      includedFiles: config.includedFiles,
      ignoredPaths: config.ignoredPaths
    });
    state = await updateState({step: 'contentVariablesGathered', contentVariables: [...contentVariables]});

  }

  if (state.step === 'contentVariablesGathered') {
    const filesChanges = await getChangedFiles();
    const pathVariables = checkForPathVariables(filesChanges);

    state = await updateState({step: 'pathVariablesGathered', pathVariables: [...pathVariables]});

  }

  if (state.step === 'pathVariablesGathered') {
    const variablesMap: Record<string, string> = {};
    const allVariables = new Set([...state.contentVariables, ...state.pathVariables]);
    for (const name of allVariables) {
      variablesMap[name] = await determineVariable(
        name,
        state.pathVariables.includes(name),
        question,
        config
      );
    }
    state = await updateState({step: 'variablesDetermined', variables: variablesMap});

  }

  if (state.step === 'variablesDetermined') {
    if (state.contentVariables.length > 0) {
      await replaceVariables({
        contentVariablesMap: state.variables,
        isDryRun: false,
        repoRoot,
        includedExtension: config.includedExtension,
        includedFiles: config.includedFiles,
        ignoredPaths: config.ignoredPaths
      });
    }
    state = await updateState({step: 'contentVariablesReplaced'});
  }

  if (state.step === 'contentVariablesReplaced') {
    const replacer = createReplacer(new Set(state.pathVariables), state.variables, false);
    const filesChanges = await getChangedFiles();
    for (const file of filesChanges.split("\n")) {	
      const replaced = file.replace(
        replacementRegex,
        replacer,
      );

      if (file !== replaced) {
        const oldPath = resolve(repoRoot, file);
        const newPath = resolve(repoRoot, replaced);
        const answer = config.autoAcceptPathChanges ? 'y' : await question(`Do you want to rename/move file '${oldPath}' to '${newPath}' [Y/n]': `);
        if (!['n','N'].includes(answer))
        {				
          if (existsSync(newPath)) {
            throw new Error(`Can not rename/move file "${oldPath}" to "${newPath}", new path already exists!`);
          }

          const dirName = dirname(newPath);
          if (!existsSync(dirName)) {
            await mkdir(dirname(newPath), { recursive: true });
          }
          
          await rename(oldPath, newPath);

          if (await isDirectoryEmpty(dirName))
          {
            await rmdir(dirName);
          }
        }
      }
    }
    state = await updateState({step: 'pathVariablesReplaced'});
  }

  if (state.step === 'pathVariablesReplaced') {
    if (state.contentVariables.length > 0 || state.pathVariables.length > 0) {
      await commitChanges("Replaced variables in template");
    }
    state = await updateState({step: 'changesCommited'});
  }

  if (state.step === 'changesCommited') {
    if (await question('Done, do you want to remove state file? [Y/n]: ') !== 'n') {
      await removeStateFile();
    }
  }

	// Use the glob function to get all matching files
	const partials = await glob([`${repoRoot}/**/*.partial.*`], {
		ignore: config.ignoredPaths,
		nodir: true,
  });
  
  if (partials.length > 0) {
    console.log('There are partial files you should merge manually:');
    for await (const file of partials) {
      console.log(file);
    }
  }

	// Use the glob function to get all matching files
	const readmes = await glob([`${repoRoot}/**/*.templit.md`], {
		ignore: config.ignoredPaths,
		nodir: true,
  });
  
  if (readmes.length > 0) {
    console.log('There are readme files you should follow:');
    for await (const file of readmes) {
      console.log(file);
    }
  }
}
catch (error) {
  console.error(error);
}
finally {
  rl.close();
}