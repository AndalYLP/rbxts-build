import fs from "fs/promises";
import path from "path";
import yargs from "yargs";
import { LOCKFILE_NAME } from "../constants";
import { identity } from "../util/identity";
import { run } from "../util/run";
import { runPlatform } from "../util/runPlatform";

const command = "stop";

async function handler() {
	const projectPath = process.cwd();

	try {
		const lockFilePath = path.join(projectPath, LOCKFILE_NAME);
		await fs.access(lockFilePath);
		const lockFileContents = (await fs.readFile(lockFilePath)).toString();
		const processIdStr = lockFileContents.split("\n")[0];
		const processId = Number.parseInt(processIdStr);

		await runPlatform({
			linux: () => run("taskkill.exe", ["/f", "/pid", String(processId)]),
			win32: () => run("taskkill", ["/f", "/pid", String(processId)]),
		});

		await fs.rm(lockFilePath);
	} catch {}
}

export = identity<yargs.CommandModule>({ command, handler });
