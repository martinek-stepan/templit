import { createInterface } from 'node:readline';
import { addRemote, getRemotes, getStatus, fetchAndMergeBranch } from './git';
import { replaceTokens } from './templating';

type State = {
  globalVariables: Record<string, string>;
};

const state: State = {
  globalVariables: {},
};

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (questionText: string) => new Promise<string>((resolve) => rl.question(questionText, resolve));

const { untracked, modified } = await getStatus();

if (modified) {
  console.log('You have modified files, please commit or stash them before continuing.');
  rl.close();
  process.exit(0);
}

if (untracked) {
  const answer = await question('You have untracked files, it is recommended commit or stash them before continuing. Do you want to progress anyway? (y/n)');
  if (answer !== 'y') {
    rl.close();
    process.exit(0);
  }
}

const uri = await question('Enter template uri: ');

const [remote, branch] = uri.split('#');

if (!remote || !branch) {
  throw new Error('Invalid uri, please provide format <remote>#<branch>');
}

const remotes = await getRemotes();

if (!remotes.find((r) => r.url === remote)) {
  const shortname = await question('Enter shortname for remote: ');
  addRemote(shortname, remote);
}

try {
  await fetchAndMergeBranch(remote, branch);
} catch (error) {
  console.log('The merge was not successful, please resolve the conflicts (& make commit), before continuing.');
  console.log(error.message);
  await question('Press any key to continue...');
}

console.log('Template successfully merged!');

const tokens = await replaceTokens(state.globalVariables, true);

const map: Record<string, string> = {};

console.log('Please enter values for missing tokens:');

for (const token of tokens) {
  const value = await question(`Enter value for token ${token}: `);
  const save = await question('Save as global variable? (y/n): ');
  if (save === 'y') {
    state.globalVariables[token] = value;
  } else {
    map[token] = value;
  }
}

await replaceTokens({ ...state.globalVariables, ...map }, false);

rl.close();
