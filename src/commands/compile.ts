import kleur from "kleur";
import yargs from "yargs";
import { getSettings } from "../util/getSettings";
import { identity } from "../util/identity";
import { run } from "../util/run";

const command = "compile [place]";

async function handler(args: yargs.Arguments) {
	const projectPath = process.cwd();
	const settings = await getSettings(projectPath);

	const rbxtsc = settings.dev ? "rbxtsc-dev" : "rbxtsc";

	const place = args.place ?? "main";
	const { placesDir } = settings;

	if (placesDir === undefined && place) {
		console.log(kleur.yellow("warning:"), `placesDir is not specified, to enable multiplace set placesDir first.`);
	}

	await run(rbxtsc, (settings.rbxtscArgs ?? ["--verbose"]).concat(placesDir ? ["-p", `${placesDir}/${place}`] : []));
}

const builder: yargs.CommandBuilder = yargs =>
	yargs.positional("place", {
		describe: "Place name, only if placesDir is specified.",
		type: "string",
		demandOption: false,
	});

export = identity<yargs.CommandModule>({ command, handler, builder });
