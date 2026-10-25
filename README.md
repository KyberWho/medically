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

From the project root, run `npm start` to start both servers. The app and its
patient/referral APIs are available at `http://localhost:3000`; the
`POST /api/process-file` endpoint is available at `http://localhost:3030`.
Use `npm stop` to stop both servers. To run them separately, use
`npm run start:web` and `npm run start:process`.

## Shared deployment for multiple devices

This project is designed so the AI model runs in one shared backend, not on every
user's laptop. The backend reads the model endpoint from `OLLAMA_HOST`.

1. Copy `/tests/.env.example` to your `.env` (create your own if you haven't done so already).
2. Set the model host to your shared machine, for example:

   ```env
   DEV_MODE=false
   API_PORT=3030
   WEB_PORT=3000
   NHS_SERVER_URL=http://10.0.0.12:3000
   OLLAMA_HOST=http://10.0.0.12:11434
   ```

3. Install and run Ollama on the shared server, then pull the models:

   ```sh
   ollama pull d3:latest
   ollama pull qwen3:1.7b
   ```

4. Start the API on that server:

   ```sh
   npm start
   ```

   This starts two servers: the Imaging Desk/CRIS website and its data APIs
   on port `3000`, and the referral processing API on port `3030`. The
   process API forwards verified referrals to the NHS server's
   `POST /api/referrals/receive` endpoint, where they are saved to the
   database and CRIS worklist. Set `WEB_PORT` or `API_PORT` to change the
   ports.

5. Everyone else should open the app through the web server, for example:

   ```text
   http://10.0.0.12:3000/imaging-desk?apiBaseUrl=http://10.0.0.12:3030
   ```

This means one AI service handles all referrals, so no one has to install Ollama on their own device.
For a non-local deployment, set `WEB_ORIGIN` in `.env` to the web server
origin (for example, `http://10.0.0.12:3000`) so the process API permits
requests from the app.

To run only one server, use `npm run start:web` for the app and its patient /
referral APIs and the receiving endpoint, or `npm run start:process` for
`POST /api/process-file`.
Run `npm stop` to stop both servers.

## API reference

### POST /api/process-file

The only endpoint needed to integrate existing systems with the medically 
validation checker is the /api/process-file POST request.

Processes a referral payload, validates that the referral is clinically
consistent with the booking and consultation notes, then forwards the 
request .

This endpoint accepts either:

- a multipart upload with a form field named `file` that contains JSON, or
- a raw JSON request body sent with `Content-Type: application/json`.

The JSON payload is expected to include the same structure used by the Imaging
Desk front end, typically with these top-level sections:

```json
{
  "referralId": "IMG-123",
  "exportedAt": "2026-10-25T09:00:00.000Z",
  "patient": {
    "name": "Jane Doe",
    "nhsNumber": "1234567890",
    "dob": "1984-06-15",
    "address": "12 Example Street",
    "gender": "Female",
    "mobilePhone": "07700 900123"
  },
  "referrer": {
    "user": "Dr Smith",
    "contactNo": "020 7946 0958",
    "requestingClinician": "Dr Smith",
    "location": "Hillview Surgery",
    "category": "General practice"
  },
  "referral": {
    "hospitalDepartment": "Orthopaedics",
    "modality": "X-ray",
    "area": "Left wrist",
    "clinicalDetails": "Pain and swelling after a fall on outstretched hand.",
    "severity": "Urgent"
  },
  "booking": {
    "appointmentDate": "2026-10-29",
    "appointmentTime": "09:15",
    "appointmentType": "Face-to-face",
    "location": "Main clinic",
    "clinician": "Dr Jones",
    "status": "Booked",
    "reason": "Left wrist pain and swelling after FOOSH"
  },
  "consultation": {
    "presentingComplaint": "Left wrist pain",
    "history": "Patient fell while walking and landed on the left hand.",
    "examination": "Swollen left wrist with reduced range of movement.",
    "assessment": "Probable wrist sprain",
    "plan": "Arrange wrist X-ray",
    "additionalNotes": "Pain is worse with movement."
  }
}
```

Mandatory clinical checks performed by this endpoint:

- `referral.area` and `referral.clinicalDetails` are compared with the booking
  reason and consultation notes.
- If the model decides the referral is clinically inconsistent, the request is
  rejected with a `406` response rather than saved to the database.

Required fields for a valid submission:

- `referral.area`
- `referral.clinicalDetails`
- `booking.reason`
- `consultation.presentingComplaint`

#### Example cURL

Upload a JSON file:

```sh
curl -X POST http://localhost:3030/api/process-file \
  -F "file=@referral.json"
```

Send raw JSON directly:

```sh
curl -X POST http://localhost:3030/api/process-file \
  -H "Content-Type: application/json" \
  --data @referral.json
```

#### Success response

```json
{
  "success": true,
  "message": "Referral added to the CRIS worklist.",
  "referralId": "IMG-123",
  "referralRecordId": 42,
  "request": {
    "id": "IMG-123",
    "status": "New",
    "receivedAt": "2026-10-25T09:00:00.000Z",
    "patient": { "name": "Jane Doe" },
    "referrer": { "user": "Dr Smith" },
    "referral": {
      "hospitalDepartment": "Orthopaedics",
      "modality": "X-ray",
      "area": "Left wrist",
      "clinicalDetails": "Pain and swelling after a fall on outstretched hand.",
      "severity": "Urgent"
    }
  }
}
```

#### Error responses

- `400 Bad Request` when the upload is missing, empty, or not valid JSON.
- `406 Not Acceptable` when the referral fails the clinical verification step.
- `500 Internal Server Error` for other server-side storage or processing errors.

Example validation rejection:

```json
{
  "success": false,
  "error": "Referral notes are not suitable.",
  "message": "• Left wrist pain does not match the booking reason for chest pain."
}
```