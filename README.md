# Mining Simulator: classroom game for the blockchain demo

Students scan a QR code, try nonces on their phones, see the hash and whether it meets the mining rule, and submit.
You see every submission live on the big screen.

The rule is the same as slides 19 and 20:

> **hash = last two digits of ( 11 × nonce + block data )**, with block data = 68
> Round 1: the hash starts with 0 (00 to 09), answer: nonce **3**
> Round 2: the hash is exactly 00, answer: nonce **12**
> Bonus (after the tamper, block data = 80): hash starts with 0, answer: nonce **2**

## What is in this folder

| File | What it does |
|---|---|
| `index.html`, `student.js` | The student page (opened by the QR code) |
| `host.html`, `host.js` | Your teacher dashboard: QR code, round controls, live results |
| `logic.js` | The hash rule and answer checking |
| `backend.js`, `firebase-config.js`, `firestore.rules` | Live storage (Firebase free tier) |
| `qr.js`, `style.css` | QR generator (bundled, no internet needed) and styling |

## Try it in 2 minutes with no setup (demo mode)

Browsers block modules from `file://`, so run a tiny local server first:

```
cd mining-game
python3 -m http.server 8000
```

1. Open `http://localhost:8000/host.html?demo=1` (your dashboard).
2. Open `http://localhost:8000/?s=test&demo=1` in 1 or 2 other tabs of the **same browser** (use the code shown on the dashboard) and join with a nickname.
3. On the dashboard click **Start Round 1**, then submit from the student tabs. Use **Add 10 pretend students** to fill the table.

Demo mode only works between tabs of one browser. For real phones, follow the steps below.

## Put it online (about 20 minutes, one time)

### 1. Create the free Firebase database
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

1. Before the activity, open `host.html` and keep the **QR code** on screen (or screenshot it into slide 19). Tell students to scan and join while you are on slide 17 or 18.
2. Slide 19: click **Start Round 1** (75 sec timer). Then **Start Round 2** (60 sec).
3. Slide 20: switch to the dashboard. Use the **Round 1 / Round 2 results** tabs for the report-back. The table shows who found it first, which nonces were found, and (Round 2) the odd versus even split.
4. Optional bonus: **Start Bonus** runs the tamper test live. Students whose old nonce 3 stopped working must re-mine.
5. **Show answer key** is for you only. Click **Close mining** when you finish.

To start a fresh class, open `host.html` without `?s=...`. You get a new code, and old results stay separate.

## Good to know

- **No student accounts.** Students only type a nickname. Nothing else is collected.
- **Cheating is visible.** The dashboard recomputes every hash, so a made-up result shows red as "does not check out". One submission per student per round.
- **Security.** The Firebase `apiKey` in the page is not a secret; the rules protect the data. Anyone with a class code can read and submit to that class, which is fine for a lesson. After the lesson you can set the rules to `allow read, write: if false;` or delete the project.
- **Free limits.** The Firebase free plan is far above one classroom. Check current limits on the Firebase pricing page.
- **Backup plan.** If Wi-Fi fails, run the paper version of the activity from the slides.

Third-party code: `qr.js` bundles "QRCode for JavaScript" by Kazuhiko Arase (MIT license).
