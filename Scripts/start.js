import { spawn } from "node:child_process";

const servers = [
	["process API", "api/server.js"],
	["web/API server", "nhs-server/server.js"],
].map(([name, script]) => ({
	name,
	child: spawn(process.execPath, [script], {
		env: process.env,
		stdio: "inherit",
	}),
}));

let stopping = false;
let shutdownTimeout;

function stopServers(exitCode = 0) {
	if (stopping) return;
	stopping = true;
	clearTimeout(shutdownTimeout);
	process.exitCode = exitCode;

	for (const { child } of servers) {
		if (child.exitCode === null) child.kill("SIGTERM");
	}
}

for (const { name, child } of servers) {
child.once("error", (error) => {
	console.error(`Could not start the ${name}:`, error);
	stopServers(1);
});
child.once("exit", (code, signal) => {
	if (!stopping) {
		if (servers.every(({ child: server }) => server.exitCode !== null)) {
			stopServers(0);
			return;
		}

		shutdownTimeout = setTimeout(() => {
			console.error(
				`The ${name} exited${signal ? ` after ${signal}` : ` with code ${code}`}; stopping the remaining server.`,
			);
			stopServers(code || 1);
		}, 500);
	}
});
}

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.once(signal, () => stopServers(0));
}
