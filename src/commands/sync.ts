import kleur from "kleur";
import yargs from "yargs";
import { PLACEFILE_NAME, SYNC_SCRIPT_PATH } from "../constants";
import { getCommandName } from "../util/getCommandName";
import { getSettings } from "../util/getSettings";
import { getWindowsPath } from "../util/getWindowsPath";
import { identity } from "../util/identity";
import { run } from "../util/run";
import { platform } from "../util/runPlatform";

const command = "sync [place]";

async function handler(args: yargs.Arguments) {
	const projectPath = process.cwd();
	const settings = await getSettings(projectPath);

	const place = (args.place as string) ?? "main";
	const { placesDir } = settings;

	if (placesDir === undefined && place) {
		console.log(kleur.yellow("warning:"), `placesDir is not specified, to enable multiplace set placesDir first.`);
	}

	await run("npm", ["run", getCommandName(settings, "build"), placesDir ? place : "", "--silent"]);

	let outPath = settings.syncLocation ?? "src/services.d.ts";
	outPath = placesDir ? `${placesDir}/${place}/${outPath}` : outPath;

	if (platform === "linux" && settings.wslUseExe) {
		const syncScriptPath = await getWindowsPath(SYNC_SCRIPT_PATH);
		await run("lune.exe", [
			"run",
			syncScriptPath,
			placesDir ? `${placesDir}/${place}/${PLACEFILE_NAME}` : PLACEFILE_NAME,
			outPath,
		]);
	} else {
		await run("lune", [
			"run",
			SYNC_SCRIPT_PATH,
			placesDir ? `${placesDir}/${place}/${PLACEFILE_NAME}` : PLACEFILE_NAME,
			outPath,
		]);
	}
}

const builder: yargs.CommandBuilder = yargs =>
	yargs.positional("place", {
		describe: "Place name, only if placesDir is specified.",
		type: "string",
		demandOption: false,
	});

export = identity<yargs.CommandModule>({ command, handler, builder });
