# Syncing your study records between PC and phone

Your records (study log, plans, statuses, snapshots, closed discrepancies) are saved **only in the browser you use** — never in this repository and never on a server. Each device keeps its own copy. You move them with a backup file.

**Golden rule: one "current" device at a time.** Restoring *replaces* the data on the receiving device (there is no merge). Always export from the device you last used, then restore on the next one.

## PC → phone (before you travel)
1. On the PC, open the app → **Settings & Backup** → **Export JSON backup**. A file `exam-prep-backup-v2-YYYY-MM-DD.json` downloads.
2. Put it somewhere your phone can reach: OneDrive `Exam Preparation 2026/` folder, or email it to yourself.
3. On the phone, open the app link → **☰ menu** → **Settings & Backup** → **Restore from JSON…** → pick the file (save it from OneDrive/email to the phone's Files/Downloads first).
4. Check the counts table (current vs incoming), then tap **Replace my data**.

## Phone → PC (when you are back)
Same steps the other way: export on the phone, save the file to OneDrive, restore on the PC.

## Tips
- Export after each study day while travelling — it is your safety copy if the phone's browser data is cleared.
- Use one browser on each device (e.g. Chrome on Android, Safari on iPhone). Private/incognito windows do not keep data.
- Backups from the PC's file version (double-clicked `index.html`) and from the web link are the same format and restore into each other.
- The app refuses invalid or corrupted files and changes nothing if a file fails its checks.
