import { readFile, writeFile, rename } from "node:fs/promises";
import * as path from "node:path";
import * as cases from "@luca/cases";
import { globIterate } from "glob";

export const replaceTokens = async (
	tokensMap: Record<string, string>,
	isDryRun: boolean,
	includedExtension: string[] = ["ts", "json", "yaml", "yml", "md"],
	includedFiles: string[] = ["Dockerfile"],
	ignoredPaths: string[] = ["**/dist/**", "**/bin/**", "**/node_modules/**"],
): Promise<Set<string>> => {
	const tokens = new Set<string>();

	const replacer = (match: string, ...groups: string[]): string => {
		const [token, caseType] = groups;

		let replacement = tokensMap[token];

		if (!replacement) {
			tokens.add(token);
			if (!isDryRun) {
				throw new Error(`Token ${token} not found in config`);
			}
		}

		if (caseType) {
			const replacementFn = cases[caseType];

			if (!replacementFn) {
				if (isDryRun) {
					console.error(`Case type ${caseType} in ${match} not supported!`);
					return match;
				}

				throw new Error(`Case type ${caseType} not supported`);
			}

			if (!isDryRun) {
				replacement = replacementFn(replacement);
			}
		}

		return isDryRun ? match : replacement;
	};

	// Define the glob pattern
	const pattern = `./**/*.{${includedExtension.join(",")}}`;
	const patternDocker = `./**/{${includedFiles.join(",")}}`;

	// Use the glob function to get all matching files
	const asyncIterator = globIterate([pattern, patternDocker], {
		ignore: ignoredPaths,
		nodir: true,
	});

	const errors: string[] = [];

	for await (const file of asyncIterator) {
		try {
			const content = await readFile(file, "utf8");
			const replaced = content.replace(
				/{{(?<token>[\w\- \\\/]+)(?::(?<case>[a-zA-Z]+))?}}/g,
				replacer,
			);

			if (!isDryRun) {
				await writeFile(file, replaced, "utf8");
			}
		} catch (error) {
			errors.push(`${file}: ${error.message}`);
		}
	}

	const patternDirs = "./**/*{{*}}*/";
	const asyncDirIterator = globIterate(patternDirs, {
		ignore: ["**/dist/**", "**/bin/**", "**/node_modules/**"],
		nobrace: true,
	});

	const paths: string[][] = [];
	for await (const file of asyncDirIterator) {
		paths.push(file.split(path.sep));
	}

	paths.sort((a, b) => b.length - a.length);
	for (const segments of paths) {
		const last = segments.pop() as string;
		const templated = last.replace(
			/{{(?<token>[\w\- \\\/]+)(?::(?<case>[a-zA-Z]+))?}}/g,
			replacer,
		);
		const oldPath = path.resolve(...segments, last);
		const newPath = path.resolve(...segments, templated);
		try {
			if (!isDryRun) {
				await rename(oldPath, newPath);
			}
		} catch (error) {
			errors.push(`${oldPath} -> ${newPath}: ${error.message}`);
		}
	}

	if (errors.length > 0) {
		throw new Error(`Errors occurred while processing the following files:
${errors.join("\n")}`);
	}

	return tokens;
};
