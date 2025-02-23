import kleur from "kleur";
import path from "path";
import yargs from "yargs";
import { PLACEFILE_NAME } from "../constants";
import { getCommandName } from "../util/getCommandName";
import { getSettings } from "../util/getSettings";
import { getWindowsPath } from "../util/getWindowsPath";
import { identity } from "../util/identity";
import { run } from "../util/run";
import { runPlatform } from "../util/runPlatform";

const command = "open [place]";

async function handler(args: yargs.Arguments) {
	const projectPath = process.cwd();
	const settings = await getSettings(projectPath);

	const place = (args.place as string) ?? "main";
	const { placesDir } = settings;

	if (placesDir === undefined && place) {
		console.log(kleur.yellow("warning:"), `placesDir is not specified, to enable multiplace set placesDir first.`);
	}

	await runPlatform({
		darwin: () => run("open", [placesDir ? `${placesDir}/${place}/${PLACEFILE_NAME}` : PLACEFILE_NAME]),
		linux: async () => {
			const fsPath = await getWindowsPath(
				path.join(projectPath, placesDir ? `${placesDir}/${place}/${PLACEFILE_NAME}` : PLACEFILE_NAME),
			);
			return run("powershell.exe", ["/c", `start ${fsPath}`]);
		},
		win32: () => run("start", [placesDir ? `${placesDir}/${place}/${PLACEFILE_NAME}` : PLACEFILE_NAME]),
	});

	if (settings.watchOnOpen !== false) {
		await run("npm", ["run", getCommandName(settings, "watch"), placesDir ? place : "", "--silent"]);
	}
}

const builder: yargs.CommandBuilder = yargs =>
	yargs.positional("place", {
		describe: "Place name, only if placesDir is specified.",
		type: "string",
		demandOption: false,
	});

export = identity<yargs.CommandModule>({ command, handler, builder });
