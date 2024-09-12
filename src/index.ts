import { createInterface } from "node:readline";
import { addRemote, getRemotes, getStatus } from "./git";

type State = {
	globalVariables: Record<string, string>;
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

const uri = await question("Enter template uri: ");

const [remote, branch] = uri.split("#");

if (!remote || !branch) {
	throw new Error("Invalid uri, please provide format <remote>#<branch>");
}

const remotes = await getRemotes();

if (!remotes.find((r) => r.url === remote)) {
	const shortname = await question("Enter shortname for remote: ");
	addRemote(shortname, remote);
}

rl.close();
