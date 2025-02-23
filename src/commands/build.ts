import kleur from "kleur";
import yargs from "yargs";
import { PLACEFILE_NAME } from "../constants";
import { getSettings } from "../util/getSettings";
import { identity } from "../util/identity";
import { run } from "../util/run";
import { platform } from "../util/runPlatform";

const command = "build [place]";

async function handler(args: yargs.Arguments) {
	const projectPath = process.cwd();
	const settings = await getSettings(projectPath);

	const rojo = platform === "linux" && settings.wslUseExe ? "rojo.exe" : "rojo";

	const place = args.place ?? "main";
	const { placesDir } = settings;

	if (placesDir === undefined && place) {
		console.log(kleur.yellow("warning:"), `placesDir is not specified, to enable multiplace set placesDir first.`);
	}

	await run(rojo, [
		"build",
		place ? `${placesDir}/${place}` : "",
		...(settings.rojoBuildArgs ?? [
			"--output",
			placesDir ? `${placesDir}/${place}/${PLACEFILE_NAME}` : PLACEFILE_NAME,
		]),
	]);
}

const builder: yargs.CommandBuilder = yargs =>
	yargs.positional("place", {
		describe: "Place name, only if placesDir is specified.",
		type: "string",
		demandOption: false,
	});

export = identity<yargs.CommandModule>({ command, handler, builder });
