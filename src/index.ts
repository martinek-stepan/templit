import { createInterface } from "node:readline";

const rl = createInterface({
	input: process.stdin,
	output: process.stdout,
});

const question = (questionText: string) =>
	new Promise<string>((resolve) => rl.question(questionText, resolve));

const a = await question("Test:");
const b = await question("Test2:");

console.log(a, b);
