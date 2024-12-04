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
	} catch (error) {
		throw new Error(`Error running command '${command}': ${error.stderr}`);
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
				if (type === "fetch") {
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

export const fetchAndMergeBranch = async (
	remote: string,
	branch: string,
): Promise<void> => {
	await execCommand(`git fetch ${remote} ${branch}`);
	await execCommand(`git merge --allow-unrelated-histories ${remote}/${branch}`);
};

export const commitChanges = async (message: string): Promise<void> => {
	await execCommand("git add .");
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