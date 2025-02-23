import kleur from "kleur";
import yargs from "yargs";
import { getCommandName } from "../util/getCommandName";
import { getSettings } from "../util/getSettings";
import { identity } from "../util/identity";
import { run } from "../util/run";

const command = "start [place]";

async function handler(args: yargs.Arguments) {
	const projectPath = process.cwd();
	const settings = await getSettings(projectPath);

	const place = (args.place as string) ?? "main";
	const { placesDir } = settings;

	if (placesDir === undefined && place) {
		console.log(kleur.yellow("warning:"), `placesDir is not specified, to enable multiplace set placesDir first.`);
	}

	await run("npm", ["run", getCommandName(settings, "compile"), placesDir ? place : "", "--silent"]);
	await run("npm", ["run", getCommandName(settings, "build"), placesDir ? place : "", "--silent"]);
	await run("npm", ["run", getCommandName(settings, "open"), placesDir ? place : "", "--silent"]);
}

const builder: yargs.CommandBuilder = yargs =>
	yargs.positional("place", {
		describe: "Place name, only if placesDir is specified.",
		type: "string",
		demandOption: false,
	});

export = identity<yargs.CommandModule>({ command, handler, builder });
