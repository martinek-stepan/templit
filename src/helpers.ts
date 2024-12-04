import { platform } from "node:os";

const getIllegalFilenameCharsRegex = (): RegExp => {
	const plat = platform();
	if (plat === "win32") {
		// Windows illegal characters: \ / : * ? " < > | and reserved names . and .. and names ending with space or .
		return /[\\/:*?"<>|]|^\.\.?$|[ ]$|[.]$/;
	}
	if (plat === "darwin") {
		// macOS illegal characters: : and reserved names . and ..
		return /[:\/]|^\.\.?$/;
	}

	// Linux illegal characters: / and reserved names . and ..
	return /[\/]|^\.\.?$/;
};

const illegalCharsRegex = getIllegalFilenameCharsRegex();

export type State = {
	globalVariables: Record<string, string>;
};


export const determineVariable = async (
	name: string,
  isPathVariable: boolean,
  question: (question: string) => Promise<string>,
  state: State,
): Promise<string> => {
	let value: string | undefined;

	if (state.globalVariables[name]) {
		const response = await question(
			`Global variable is defined for token ${name} with value '${state.globalVariables[name]}' do you want to use it? [y/N]: `,
		);
		if (response === "y") {
			value = state.globalVariables[name];
		}
	}

	do {
		if (!value) {
			value = await question(`Enter value for variable '${name}': `);
		}
		if (isPathVariable && illegalCharsRegex.test(value)) {
			const response = await question(
				`The value '${value}' that is used in path variable contains possible illegal characters (${illegalCharsRegex}) on current platform. Do you want keep it? [y/N]: `,
			);

			if (response !== "y") {
				value = undefined;
			}
		}
	} while (!value);

	if (state.globalVariables[name] !== value) {
		if ('y' === await question(`Save as global varianble [yN]': `)) {
			state.globalVariables[name] = value;
		}
	}
	return value;
};

export const generateRandomSequence = (length: number): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        result += chars[randomIndex];
    }
    return result;
}