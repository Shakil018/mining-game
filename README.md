# Mining Simulator: classroom game for the blockchain demo

Students scan a QR code, try nonces on their phones, see the hash and whether it meets the mining rule, and submit.
You see every submission live on the big screen.

The rule is the same as slides 19 and 20:

> **hash = last two digits of ( 11 × nonce + data hash )**, with data hash = 68
> Round 1 (45 seconds): the hash starts with 0 (00 to 09), answer: nonce **3**
> Round 2 (60 seconds): the hash is exactly 00, answer: nonce **12**
> The Bonus round (tamper test, data hash = 80) is built but hidden. To bring it back, add `3` to `ENABLED` at the top of `logic.js`.

**Only one miner is paid per block, like real mining.** The first student to submit a valid nonce wins the block reward
(3.125 BTC subsidy + transaction fees, about 3.27 BTC). Everyone else who also found a valid nonce is marked "too late" and earns nothing.
The "first" is decided by the server, and the security rules re-check the hash, so nobody can fake a win.

## What is in this folder

| File | What it does |
|---|---|
| `index.html`, `student.js` | The student page (opened by the QR code) |
| `host.html`, `host.js` | Your teacher dashboard: QR code, round controls, live results |
| `logic.js`, `blockview.js` | The hash rule, rewards, leaderboard maths, and the example block shown to everyone |
| `backend.js`, `firebase-config.js`, `firestore.rules` | Live storage (Firebase free tier) |
| `qr.js`, `style.css` | QR generator (bundled, no internet needed) and styling |
| `debug.html` | Setup checker: open it if a page is blank. It tells you which file or Firebase step is wrong |

## Try it in 2 minutes with no setup (demo mode)

Browsers block modules from `file://`, so run a tiny local server first:

```
cd mining-game
python3 -m http.server 8000
```

1. Open `http://localhost:8000/host.html?demo=1` (your dashboard).
2. Open `http://localhost:8000/?s=test&demo=1` in 1 or 2 other tabs of the **same browser** (use the code shown on the dashboard) and join with a nickname.
3. On the dashboard click **Round 1** (the question appears for everyone), then **Start** (round 1's own Start button). Submit from the student tabs: the first valid nonce wins the Bitcoin. Use **Add 10 pretend students** to fill the leaderboard.

Demo mode only works between tabs of one browser. For real phones, follow the steps below.

## Put it online (about 20 minutes, one time)

### 1. Create the free Firebase database

> **Updating an existing setup?** Re-publish `firestore.rules` (it changed again: the session and players records have a new `roster` field) (Firestore Database → Rules → paste → Publish) and upload the changed files. Do **not** overwrite your own `firebase-config.js`. Use a **new class code** after updating, because old test sessions don't have a game id.
1. Go to <https://console.firebase.google.com>, click **Add project**, name it (for example `mining-game`). You can turn Google Analytics off.
2. In the project, click the **`</>` (Web)** icon to register a web app. Any nickname. Skip hosting.
3. Copy the `firebaseConfig` values (`apiKey`, `projectId`, `appId`, `authDomain`) into **`firebase-config.js`**, replacing the `PASTE_...` placeholders.
4. Left menu: **Build → Firestore Database → Create database**. Choose a region near you and **production mode**.
5. In Firestore, open the **Rules** tab, delete what is there, paste the contents of **`firestore.rules`**, and click **Publish**.

### 2. Publish the site on GitHub Pages
1. On GitHub, create a **new public repository** (for example `mining-game`).
2. Upload all files from this folder (**Add file → Upload files**, drag everything in, **Commit**).
3. Go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, **Save**.
4. After a minute your site is live at `https://YOUR-USERNAME.github.io/mining-game/`.

### 3. Test with a real phone (do this the day before)
1. Open `https://YOUR-USERNAME.github.io/mining-game/host.html` on your laptop. A new class code and QR code appear.
2. Scan the QR with your phone, join, and click **Start Round 1** on the laptop. Submit nonce 3 from the phone and watch it appear.
3. Try it on the classroom Wi-Fi if you can. Some school networks block Google services.

## Running it in class

1. Before the activity, open `host.html?s=YOURCODE` (pick your own code, up to 12 letters or digits, and use it only in class). The **QR code is shown in the lobby only**, together with a **Joined** list: each student who scans appears as a small name box. **Reset joined list** clears the names and asks everyone on the page to join again, so only students who are really here appear. Keep it on screen while students join, ideally while you are on slide 17 or 18.
2. Slide 19: click **Round 1**. The question and the example block appear on your screen and on every phone, but nobody can mine yet. Click **Start** on the Round 1 row to begin the 45-second timer, and **End** when the round is over. The instruction sits right under the Nonce field. When the timer reaches 0, or when you press **End**, the round locks and the **solution** appears in the block (the correct nonce in the Nonce field and the filled-in equation in the Hash field). The page ends the round for you two seconds after the timer runs out.
3. Do the same for **Round 2** (60 seconds). Each round has its own Round / Start / End buttons.
4. Slide 20: the **leaderboard** in the bottom half shows who earned Bitcoin and who was too late, plus which nonces were found. Use it for the report-back.
5. Optional **Bonus** runs the tamper test live: a transaction is edited, the data hash becomes 80, and everyone's old nonce stops working.
6. **Back to lobby** shows the QR code again. **Show answer key** is for you only.

**Reset leaderboard** (button at the top right of the leaderboard) clears all results and Bitcoin earned, starts a fresh game, and sends everyone back to the lobby. Students who already joined stay in the lobby, so you can re-run the rounds right away. It asks for confirmation first. (Nothing is deleted from the database; old results are simply ignored.)

For a completely new class, click **new class code** or open `host.html` without `?s=...`.

## Good to know

- **No student accounts.** Students only type a nickname. Nothing else is collected.
- **No cheating.** The database rules recompute the hash and only accept valid nonces during a live round, and only the first valid claim can ever create the winner record. One submission per student per round.
- **Security.** The Firebase `apiKey` in the page is not a secret; the rules protect the data. Anyone with a class code can read and submit to that class, which is fine for a lesson. After the lesson you can set the rules to `allow read, write: if false;` or delete the project.
- **Free limits.** The Firebase free plan is far above one classroom. Check current limits on the Firebase pricing page.
- **Backup plan.** If Wi-Fi fails, run the paper version of the activity from the slides.

Third-party code: `qr.js` bundles "QRCode for JavaScript" by Kazuhiko Arase (MIT license).
