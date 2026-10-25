# Medically

# What is it?

This is a prototype of a medical API designed to aid GPs when referring their patient's data to the hospital database for evaluation, reducing the chance of human error and the possibility of delays in hospital appointments. Using Ollama, it performs a client-side verification of the referral request with the booking & appointment information, sending the data back to the referrer for further evaluation if it seems like the referrer made a mistake in their referral.

To demonstrate the API, we have provided a mockup interactive version of both an example GP interface (Imaging-Desk) and an example hospital interface (CRIS-Radiography-Worklist), which you can use to see how the code affects the typical process of referring a patient. Our API is designed to be easy to integrate within large-scale systems, requiring little effort on both the input/output ends to implement it. 

# Installation/Setup of the Demo

## Local Installation

### Ubuntu and Debian

The Linux setup installs MariaDB and its Python connector build dependencies
through `apt`, installs Ollama with Ollama's official Linux installer, and
creates a project-local Python virtual environment.

Install Python 3 and the venv module first:

```sh
sudo apt-get update
sudo apt-get install -y python3 python3-venv
```

Then run the setup script from the repository:

```sh
bash Scripts/setup.sh
```

The setup prompts before installing MariaDB. Configure the database values in
the root `.env` file before running setup; the Python setup script uses those
values to create the application database and tables. The `ollama` command
downloads the configured models, so ensure the machine has enough disk space.
Verified referrals submitted through Imaging Desk are stored in the MariaDB
`referrals` table. Each row keeps the referral ID, export timestamp, complete
JSON submission (including patient, referrer, referral, booking, and
consultation details), and submission timestamp.
Rerun the setup script on an existing installation to create the table.
The CRIS worklist loads these rows from `GET /api/referrals`; submitting the
same referral ID again updates its stored data after it is forwarded to the
receiving application.
Imaging Desk loads patient records from the MariaDB `patients` table through
`GET /api/patients`; patients added in the desk are stored through
`POST /api/patients`.
The setup script inserts the six synthetic Imaging Desk demo patients if their
NHS numbers are not already present; rerunning setup does not overwrite
existing patient records.

### Windows

Run `Scripts/setup.bat` from the `Scripts` directory to use the existing
Windows setup flow.

## Decoupled frontend and API deployment

The API and the demo websites can be run as separate services. The API exposes
JSON endpoints such as `/api/patients`, `/api/referrals`, and
`/api/process-file`, while the browser UI can live on a different origin.

To disable the built-in static site hosting and run only the API:

```env
SERVE_FRONTEND=false
PORT=3000
CORS_ALLOWED_ORIGINS=https://app.example.com,https://imaging.example.com
```

Then start the API server with:

```sh
node api/server.js
```

On the frontend, point the browser at the API origin explicitly:

```html
<script>
  window.API_BASE_URL = "https://api.example.com";
</script>
```

The demo JavaScript already reads `window.API_BASE_URL`, a query param such as
`?apiBaseUrl=https://api.example.com`, or falls back to the current origin when
running locally.

For a full split deployment, host:

- `https://app.example.com` -> the website frontend
- `https://api.example.com` -> the Medically API

The frontend calls the API over HTTP, while the API does the AI verification and
database work. This keeps the AI logic in one backend and lets multiple websites,
apps, or devices consume the same service.

## Shared deployment for multiple devices

This project is designed so the AI model runs in one shared backend, not on every
user's laptop. The backend reads the model endpoint from `OLLAMA_HOST`.

1. Copy `/tests/.env.example` to your `.env` (create your own if you haven't done so already).
2. Set the model host to your shared machine, for example:

   ```env
   DEV_MODE=false
   PORT=3000
   OLLAMA_HOST=http://10.0.0.12:11434
   ```

3. Install and run Ollama on the shared server, then pull the model used by the API:

   ```sh
   ollama pull qwen3:1.7b
   ```

   The older `d3:*` model names were a legacy configuration and are no longer required for the verification flow.

4. Start the API on that server:

   ```sh
   node api/server.js
   ```

5. Everyone else should open the app through that server URL, for example:

   ```text
   http://10.0.0.12:3000/imaging-desk
   ```

This means one AI service handles all referrals, so no one has to install Ollama on their own device.