import fs from "fs/promises";
import kleur from "kleur";
import path from "path";
import yargs from "yargs";
import { LOCKFILE_NAME } from "../constants";
import { getSettings } from "../util/getSettings";
import { identity } from "../util/identity";
import { run } from "../util/run";
import { runPlatform } from "../util/runPlatform";

const command = "stop [place]";

async function handler(args: yargs.Arguments) {
	const projectPath = process.cwd();

	const place = args.place ?? "main";
	const { placesDir } = await getSettings(projectPath);

	if (placesDir === undefined && place) {
		console.log(kleur.yellow("warning:"), `placesDir is not specified, to enable multiplace set placesDir first.`);
	}

	const lockFilePath = path.join(projectPath, placesDir ? `${placesDir}/${place}/${LOCKFILE_NAME}` : LOCKFILE_NAME);

	try {
		const lockFileContents = (await fs.readFile(lockFilePath)).toString();
		const processId = lockFileContents.split("\n")[0];

		await runPlatform({
			darwin: () => run("kill", ["-9", processId]),
			linux: () => run("taskkill.exe", ["/f", "/pid", processId]),
			win32: () => run("taskkill", ["/f", "/pid", processId]),
		});
	} catch {}

	try {
		await fs.rm(lockFilePath);
	} catch {}
}

const builder: yargs.CommandBuilder = yargs =>
	yargs.positional("place", {
		describe: "Place name, only if placesDir is specified.",
		type: "string",
		demandOption: false,
	});

export = identity<yargs.CommandModule>({ command, handler, builder });
