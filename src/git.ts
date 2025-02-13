import { exec } from "node:child_process";
import { promisify } from "node:util";

const execPromise = promisify(exec);

export const execCommand = async (command: string): Promise<string> => {
	try {
		const { stdout, stderr } = await execPromise(command);
		if (stderr.length > 0) {
			console.error(stderr);
		}
		return stdout;
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
}  catch (error: any) {
		throw new Error(`Error running command '${command}': ${error.stderr}`);
	}
};

export const isGitRepository = async (): Promise<boolean> => {

  try {
    await execCommand("git rev-parse --is-inside-work-tree");
    return true;
  } catch (error) {
    return false;
  }

};

export type Remote = {
	name: string;
	url: string;
};

export const getRemotes = async (): Promise<Remote[]> => {
	const res = await execCommand("git remote -v");
	const regex = /(?<name>\S+)\s+(?<url>\S+)\s+\((?<type>fetch|push)\)/;
	const remotes = res
		.split("\n")
		.map((line) => {
			const match = line.match(regex);
			if (match?.groups) {
				const { name, url, type } = match.groups;
				if (type === "fetch" && name && url) {
					return { name, url };
				}
			}
			return null;
		})
		.filter((remote) => remote !== null);

	return remotes;
};

export const addRemote = async (name: string, url: string): Promise<void> => {
	await execCommand(`git remote add ${name} ${url}`);
};

export const getStatus = async (): Promise<{
	modified: boolean;
	untracked: boolean;
}> => {
	const res = await execCommand("git status --porcelain");
	const regex = /(?<status>\S+)\s+(?<file>.+)/;

	let modified = false;
	let untracked = false;

	for (const line of res.split("\n")) {
		const match = line.match(regex);
		if (match?.groups) {
			const { status } = match.groups;
			if (status === "??") {
				untracked = true;
			} else {
				modified = true;
			}
		}

		if (untracked && modified) {
			break;
		}
	}

	return { modified, untracked };
};

export const cherryPickBranch = async (
	originalBranch: string|undefined,
	branch: string|undefined,
): Promise<void> => {
  if (!branch || !originalBranch) {
    throw new Error("All parameters are required!");
  }
  
  await execCommand(`git checkout ${originalBranch}`);
	await execCommand(`git cherry-pick -m 1 ${branch}`);
  await execCommand(`git branch -D ${branch}`);
};

export const mergeBranch = async (
	remote?: string,
	branch?: string,
): Promise<void> => {
	if (!remote || !branch) {
		throw new Error("Remote and branch must be provided");
	}
	await execCommand(`git merge --allow-unrelated-histories ${remote}/${branch}`);
};

export const commitChanges = async (message: string): Promise<void> => {
	await execCommand("git add -- . :!**/.templit.state.json");
	await execCommand(`git commit -m "${message}"`);
};

export const getRepoRoot = async (): Promise<string> => {
	const res = await execCommand("git rev-parse --show-toplevel");
	return res.trim();
}

export const createNewBranch = async (branchName: string): Promise<void> => {
	await execCommand(`git checkout -b ${branchName}`);
}

export const getChangedFiles = async (): Promise<string> => {
	return await execCommand("git diff --name-only HEAD HEAD~1");
}

export const getCurrentBranchName = async (): Promise<string> => {
  const res = await execCommand("git rev-parse --abbrev-ref HEAD");
  return res.trim();
};

export const mergeBack = async (currentBranch: string|undefined, targetBranch: string|undefined): Promise<void> => {
  if (!currentBranch || !targetBranch) {
    throw new Error('currentBranch and targetBranch must be provided');
  }
  
  await execCommand(`git checkout ${targetBranch}`);
  await execCommand(`git merge ${currentBranch}`);
};