import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


OLLAMA_INSTALL_SCRIPT = "https://ollama.com/install.ps1"
OLLAMA_LINUX_INSTALL_SCRIPT = "https://ollama.com/install.sh"
MODEL_NAME = "qwen3:1.7b"


def find_ollama():
	executable = shutil.which("ollama")
	if executable:
		return Path(executable)

	if sys.platform != "win32":
		return None

	local_app_data = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
	install_locations = (
		local_app_data / "Programs" / "Ollama" / "ollama.exe",
		Path(os.environ.get("ProgramFiles", "C:\\Program Files")) / "Ollama" / "ollama.exe",
	)
	return next((path for path in install_locations if path.is_file()), None)


def install_ollama_linux():
	print("Installing Ollama using its official Linux installer...")
	with urlopen(OLLAMA_LINUX_INSTALL_SCRIPT, timeout=30) as response:
		install_script = response.read().decode("utf-8")
	subprocess.run(["sh"], input=install_script, text=True, check=True)

	if find_ollama() is None:
		raise RuntimeError(
			"Ollama's installer finished, but the ollama executable was not found. "
			"Restart the terminal and run this script again."
		)


def install_ollama():
	if find_ollama() is not None:
		print("Ollama is already installed.")
		return

	if sys.platform.startswith("linux"):
		install_ollama_linux()
		return
	if sys.platform != "win32":
		raise SystemExit("Ollama setup currently supports Windows and Linux.")

	print("Installing Ollama using its official Windows installer...")
	subprocess.run(
		[
			"powershell.exe",
			"-NoProfile",
			"-ExecutionPolicy",
			"Bypass",
			"-Command",
			f"$ErrorActionPreference = 'Stop'; irm {OLLAMA_INSTALL_SCRIPT} | iex",
		],
		check=True,
	)

	if find_ollama() is None:
		raise RuntimeError(
			"Ollama's installer finished, but the ollama executable was not found. "
			"Restart the terminal and run this script again."
		)


def pull_model(model_name = MODEL_NAME):
	ollama = find_ollama()
	if ollama is None:
		raise RuntimeError("Ollama is not installed.")

	print(f"Downloading Ollama model {model_name}...")
	result = subprocess.run([str(ollama), "pull", model_name], check=False)
	if result.returncode != 0:
		raise SystemExit(
			f"Could not pull {model_name} (ollama exited with "
			f"code {result.returncode}). Ensure the Ollama app is running and try again."
		)

	print(f"Model {model_name} is ready.")


def pull_and_install_ollama():
    try:
        install_ollama()
        pull_model("qwen3:1.7b")
        pull_model("d3:2b")
        print("Ollama's local API is available at http://localhost:11434.")
    except subprocess.CalledProcessError as error:
        raise SystemExit(
            f"Ollama installation failed with exit code {error.returncode}."
        ) from error
    except URLError as error:
        raise SystemExit(f"Could not download the Ollama installer: {error}") from error
    except OSError as error:
        raise SystemExit(f"Ollama setup failed: {error}") from error
    except RuntimeError as error:
        raise SystemExit(f"Ollama setup failed: {error}") from error


if __name__ == "__main__":
	pull_and_install_ollama()
