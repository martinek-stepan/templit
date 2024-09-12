import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as cases from '@luca/cases';
import { globIterate } from 'glob';

export const replaceTokens = async (
  tokensMap: Record<string, string>,
  isDryRun: boolean,
  includedExtension: string[] = ['ts', 'json', 'yaml', 'yml', 'md'],
  includedFiles: string[] = ['Dockerfile'],
  ignoredPaths: string[] = ['**/dist/**', '**/bin/**', '**/node_modules/**'],
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
  const pattern = resolve(`./**/*.{${includedExtension.join(',')}}`);
  const patternDocker = resolve(`./**/{${includedFiles.join(',')}}`);

  // Use the glob function to get all matching files
  const asyncIterator = globIterate([pattern, patternDocker], {
    ignore: ignoredPaths,
  });

  const errors: string[] = [];

  for await (const file of asyncIterator) {
    try {
      const content = await readFile(file, 'utf8');
      const replaced = content.replace(/{{(?<token>[\w\- \\\/]+)(?::(?<case>[a-zA-Z]+))?}}/g, replacer);

      if (!isDryRun) {
        await writeFile(file, replaced, 'utf8');
      }
    } catch (error) {
      errors.push(`${file}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Errors occurred while processing the following files:
${errors.join('\n')}`);
  }

  return tokens;
};
