import { readFile, writeFile, rename } from "node:fs/promises";
import * as path from "node:path";
import * as cases from "@luca/cases";
import { globIterate } from "glob";
import { existsSync } from "node:fs";

type ReplacerFn = (match: string, ...groups: string[]) => string;

export const replacementRegex =
	/{{(?<variable>[\w\- \\\/]+)(?::(?<case>[a-zA-Z]+))?}}/g;

type ReplaceVariablesRequiredArgs = {
	variablesMap: Record<string, string>;
	isDryRun: boolean;
	repoRoot: string;
};

type ReplaceContentVariablesRequiredArgs = {
	contentVariablesMap: Record<string, string>;
	isDryRun: boolean;
};

type ReplaceVariablesDefaultArgs = {
	includedExtension: string[];
	includedFiles: string[];
	ignoredPaths: string[];
};

type ReplaceVariablesArgs = ReplaceVariablesRequiredArgs &
	Partial<ReplaceVariablesDefaultArgs>;

export const createReplacer = (
	variables: Set<string>,
	variablesMap: Record<string, string>,
	isDryRun: boolean,
): ReplacerFn => {
	return (match: string, ...groups: string[]): string => {
		const [variable, caseType] = groups;

		let replacement = variablesMap[variable];

		if (!replacement) {
			variables.add(variable);
			if (!isDryRun) {
				throw new Error(`Variable ${variable} not found in config`);
			}
		}

		if (caseType) {
			const replacementFn = cases[caseType];

			if (!replacementFn) {
				if (isDryRun) {
					console.error(`Case type ${caseType} in ${match} not supported!`);
					return match;
				}

				throw new Error(
					`Case type ${caseType} not supported. Supported cases: ${Object.keys(
						cases,
					).join(", ")}`,
				);
			}

			if (!isDryRun) {
				replacement = replacementFn(replacement);
			}
		}

		return isDryRun ? match : replacement;
	};
};

const replaceInContent = async ({
	variablesMap,
	isDryRun,
	includedExtension,
	includedFiles,
	ignoredPaths,
	repoRoot,
}: ReplaceVariablesRequiredArgs & ReplaceVariablesDefaultArgs): Promise<
	Set<string>
> => {
	const contentVariables = new Set<string>();

	// Define the glob pattern
	const patternExtensions = `${repoRoot}/**/*.{${includedExtension.join(",")}}`;
	const patternFiles = `${repoRoot}/**/{${includedFiles.join(",")}}`;

	// Use the glob function to get all matching files
	const asyncIterator = globIterate([patternExtensions, patternFiles], {
		ignore: ignoredPaths,
		nodir: true,
	});

	const errors: string[] = [];

	const replacer = createReplacer(contentVariables, variablesMap, isDryRun);

	for await (const file of asyncIterator) {
		try {
			const content = await readFile(file, "utf8");
			const replaced = content.replace(
				replacementRegex,
				replacer,
			);

			if (!isDryRun) {
				await writeFile(file, replaced, "utf8");
			}
		} catch (error) {
			errors.push(`${file}: ${error.message}`);
		}
	}

	if (errors.length > 0) {
		throw new Error(`Errors occurred while replacing variables in content of the following files:
${errors.join("\n")}`);
	}

	return contentVariables;
};

export const checkForPathVariables = (changes: string): Set<string> => {
	
	const variables = new Set<string>();
	const replacer = createReplacer(variables, {}, true);
	changes.replace(
		replacementRegex,
		replacer,
	);
	
	return variables;

}

const replaceInPaths = async ({
	variablesMap,
	isDryRun,
	ignoredPaths,
	repoRoot,
}: Pick<
	ReplaceVariablesRequiredArgs & ReplaceVariablesDefaultArgs,
	"variablesMap" | "isDryRun" | "ignoredPaths" | "repoRoot"
>): Promise<Set<string>> => {
	const pathVariables = new Set<string>();

	const patternDirs = `${repoRoot}/**/*{{*}}*/`;
	const asyncDirIterator = globIterate(patternDirs, {
		ignore: ignoredPaths,
		nobrace: true,
	});

	const errors: string[] = [];

	const paths: string[][] = [];
	for await (const file of asyncDirIterator) {
		paths.push(file.split(path.sep));
	}

	paths.sort((a, b) => b.length - a.length);
	for (const segments of paths) {
		const last = segments.pop() as string;
		const templated = last.replace(
			replacementRegex,
			createReplacer(pathVariables, variablesMap, isDryRun),
		);
		const oldPath = path.resolve(...segments, last);
		const newPath = path.resolve(...segments, templated);
		try {
			if (!isDryRun) {
				if (existsSync(newPath)) {
					throw new Error(`Can not rename path "${oldPath}" to "${newPath}", new path already exists!`);
				}
				await rename(oldPath, newPath);
			}
		} catch (error) {
			errors.push(`${oldPath} -> ${newPath}: ${error.message}`);
		}
	}

	if (errors.length > 0) {
		throw new Error(`Errors occurred while replacing variables in name of the following files:
${errors.join("\n")}`);
	}

	return pathVariables;
};

export const replaceVariables = async ({
	contentVariablesMap,
	//pathVariablesMap,
	isDryRun,
	repoRoot,
	includedExtension = ["ts", "json", "yaml", "yml", "md"],
	includedFiles = ["Dockerfile"],
	ignoredPaths = ["**/dist/**", "**/bin/**", "**/node_modules/**"],
}: ReplaceContentVariablesRequiredArgs &
	Omit<ReplaceVariablesArgs,"variablesMap">): Promise<{
	contentVariables: Set<string>;
}> => {
	// Add templit readmes & config to ignored paths
	ignoredPaths.push("**/**.templit.md");
	ignoredPaths.push("**/templit.json");

	const contentVariables = await replaceInContent({
		variablesMap: contentVariablesMap,
		isDryRun,
		repoRoot,
		includedExtension,
		includedFiles,
		ignoredPaths,
	});
	return { contentVariables };
};
