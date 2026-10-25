import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const servers = [
    { name: 'legacy process API', pidFile: path.join(projectRoot, '.medically-api.pid') },
    { name: 'process API', pidFile: path.join(projectRoot, '.medically-process-api.pid') },
    { name: 'web/API server', pidFile: path.join(projectRoot, '.medically-web.pid') },
];

async function stopServer({ name, pidFile }) {
    if (!existsSync(pidFile)) {
        console.log(`The ${name} is not running (no PID file found).`);
        return;
    }

    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    if (!Number.isSafeInteger(pid) || pid <= 0) {
        throw new Error(`Invalid PID in ${pidFile}. Remove the file after confirming the server is stopped.`);
    }

    try {
        process.kill(pid, 0);
    } catch (error) {
        if (error.code !== 'ESRCH') {
            throw error;
        }

        if (existsSync(pidFile) && Number(readFileSync(pidFile, 'utf8').trim()) === pid) {
            rmSync(pidFile);
        }
        console.log(`Removed a stale ${name} PID file; the server is not running.`);
        return;
    }

    process.kill(pid, 'SIGTERM');
    console.log(`Sent shutdown signal to the ${name} (PID ${pid}).`);

    const timeout = Date.now() + 10000;
    while (Date.now() < timeout) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        try {
            process.kill(pid, 0);
        } catch (error) {
            if (error.code !== 'ESRCH') throw error;
            if (existsSync(pidFile) && Number(readFileSync(pidFile, 'utf8').trim()) === pid) {
                rmSync(pidFile);
            }
            console.log(`The ${name} stopped.`);
            return;
        }
    }

    console.error(`The ${name} (PID ${pid}) did not stop within 10 seconds.`);
    process.exitCode = 1;
}

await Promise.all(servers.map(stopServer));
